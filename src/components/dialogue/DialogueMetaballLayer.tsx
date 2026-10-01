"use client";

import { useEffect, useRef, type RefObject } from "react";

import styles from "./DialogueShell.module.css";
import { LiquidMotion } from "./liquid/motion";
import {
  computeFusedPairs,
  MAX_DIALOGUE_METABALLS,
  projectMetaballSurfaces,
  type MetaballRelation,
  type MetaballRole,
  type MetaballSurfaceRect
} from "./metaball/model";
import {
  createDialogueMetaballRenderer,
  DIALOGUE_METABALL_SMOOTHNESS,
  type DialogueMetaballRenderer
} from "./metaball/renderer";

export type DialogueMetaballRendererState = "loading" | "ready" | "fallback";

type Props = {
  hostRef: RefObject<HTMLDivElement | null>;
  onStateChange(state: DialogueMetaballRendererState): void;
};

const METABALL_ROLES = new Set<MetaballRole>([
  "user",
  "thesis",
  "antithesis",
  "synthesis",
  "growth",
  "neutral",
  "pending"
]);
const METABALL_RELATIONS: MetaballRelation[] = [
  "focus",
  "source",
  "child",
  "ancestor",
  "decorative"
];

function isMetaballRole(value: string | undefined): value is MetaballRole {
  return Boolean(value && METABALL_ROLES.has(value as MetaballRole));
}

function collectSurfaceElements(host: HTMLDivElement): HTMLElement[] {
  const selected: HTMLElement[] = [];

  for (const relation of METABALL_RELATIONS) {
    const matching = Array.from(
      host.querySelectorAll<HTMLElement>(
        `[data-metaball-surface][data-metaball-relation="${relation}"]`
      )
    );
    matching.sort((left, right) => {
      const leftPending = left.dataset.metaballRole === "pending" ? 1 : 0;
      const rightPending = right.dataset.metaballRole === "pending" ? 1 : 0;
      return leftPending - rightPending;
    });

    for (const element of matching) {
      selected.push(element);
      if (selected.length === MAX_DIALOGUE_METABALLS) return selected;
    }
  }

  return selected;
}

function readSurfaceRects(host: HTMLDivElement, offsets: Map<string, { x: number; y: number }>): MetaballSurfaceRect[] {
  return collectSurfaceElements(host).flatMap((element) => {
    const id = element.dataset.metaballSurface;
    const role = element.dataset.metaballRole;
    const relation = element.dataset.metaballRelation as MetaballRelation | undefined;
    if (!id || !isMetaballRole(role) || !relation || !METABALL_RELATIONS.includes(relation)) {
      return [];
    }

    const rect = element.getBoundingClientRect();
    return [
      {
        id,
        colorKey: element.dataset.liquidColorKey,
        role,
        relation,
        left: rect.left - (offsets.get(id)?.x || 0),
        top: rect.top - (offsets.get(id)?.y || 0),
        width: rect.width,
        height: rect.height
      }
    ];
  });
}

export function DialogueMetaballLayer({ hostRef, onStateChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const host = hostRef.current;
    if (!host) return;
    let renderer: DialogueMetaballRenderer | null = null;
    let animationFrame = 0;
    let idleTimer = 0;
    let disposed = false;
    let reportedReady = false;
    let geometryDirty = true;
    let hostRect: DOMRect | null = null;
    let cachedNodes: ReturnType<typeof projectMetaballSurfaces> = [];
    let activeUntil = 0;
    let pointerDown = false;
    let pressedId: string | null = null;
    let qualityScale = 1;
    let activeFrameCount = 0;
    let activeFrameTime = 0;
    let previousActiveFrame = 0;
    const motion = new LiquidMotion();
    const motionOffsets = new Map<string, { x: number; y: number }>();
    const ownStyles = new WeakMap<HTMLElement, string>();
    let surfaces: HTMLElement[] = [];
    let motionActive = false;
    let renderedNodes = cachedNodes;
    let cursor: { center: [number, number]; active: boolean } = { center: [0, 0], active: false };
    const smoothCursor: [number, number] = [0, 0];
    const reducedMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
    let prefersReducedMotion = reducedMotionQuery?.matches ?? false;

    const cancelScheduledFrame = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (idleTimer) window.clearTimeout(idleTimer);
      animationFrame = 0;
      idleTimer = 0;
    };
    const wake = () => {
      if (disposed || document.hidden || !renderer) return;
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = 0;
      if (!animationFrame) animationFrame = window.requestAnimationFrame(drawFrame);
    };
    const invalidate = () => {
      geometryDirty = true;
      wake();
    };
    const enterFallback = () => {
      if (disposed) return;
      cancelScheduledFrame();
      renderer?.dispose();
      renderer = null;
      for (const element of surfaces) element.style.removeProperty("translate");
      motionOffsets.clear();
      canvas.dataset.rendererState = "fallback";
      onStateChange("fallback");
    };
    const updateMotionPreference = () => {
      prefersReducedMotion = reducedMotionQuery?.matches ?? false;
      canvas.dataset.motion = prefersReducedMotion ? "reduced" : "animated";
      invalidate();
    };

    const drawFrame = (timestamp: number) => {
      animationFrame = 0;
      if (disposed || !renderer || document.hidden) return;
      const active = pointerDown || motionActive || timestamp < activeUntil;
      try {
        // Geometry only changes on resize, scene mutations or pointer movement.
        // Idle material animation reuses the same projected scene.
        if (geometryDirty || !hostRect) {
          hostRect = canvas.getBoundingClientRect();
          surfaces = collectSurfaceElements(host);
          cachedNodes = projectMetaballSurfaces(hostRect, readSurfaceRects(host, motionOffsets));
          motionActive = true;
          geometryDirty = false;
          const fusedPairs = computeFusedPairs(cachedNodes, DIALOGUE_METABALL_SMOOTHNESS).join(",");
          if (canvas.dataset.fusedPairs !== fusedPairs) canvas.dataset.fusedPairs = fusedPairs;
        }
        if (motionActive) {
          const result = motion.step(cachedNodes, timestamp, prefersReducedMotion, pressedId);
          renderedNodes = result.nodes;
          motionActive = result.moving;
          for (const element of surfaces) {
            const id = element.dataset.metaballSurface!;
            const target = cachedNodes.find(node => node.id === id);
            const current = renderedNodes.find(node => node.id === id);
            if (!target || !current) continue;
            const offset = { x: (current.center[0] - target.center[0]) * hostRect.height,
              y: (target.center[1] - current.center[1]) * hostRect.height };
            motionOffsets.set(id, offset);
            element.style.translate = `${offset.x.toFixed(3)}px ${offset.y.toFixed(3)}px`;
            ownStyles.set(element, element.getAttribute("style") || "");
          }
        }
        smoothCursor[0] += (cursor.center[0] - smoothCursor[0]) * .18;
        smoothCursor[1] += (cursor.center[1] - smoothCursor[1]) * .18;
        const cap = hostRect.width <= 640 ? 0.62 : 0.8;
        renderer.resize(hostRect.width, hostRect.height, Math.min(window.devicePixelRatio || 1, cap) * qualityScale);
        renderer.render(renderedNodes, prefersReducedMotion ? 0 : timestamp / 1000,
          { center: smoothCursor, active: cursor.active && !prefersReducedMotion,
            draggedId: pointerDown ? pressedId : null });
        if (!reportedReady) {
          reportedReady = true;
          canvas.dataset.rendererState = "ready";
          onStateChange("ready");
        }
        // Only interaction frames inform quality. Intentional idle throttling
        // must not be mistaken for a slow GPU.
        if (active && previousActiveFrame) {
          activeFrameCount += 1;
          activeFrameTime += timestamp - previousActiveFrame;
          if (activeFrameTime >= 1200) {
            const fps = activeFrameCount * 1000 / activeFrameTime;
            if (fps < 45) qualityScale = Math.max(0.5, qualityScale - 0.15);
            else if (fps > 57) qualityScale = Math.min(1, qualityScale + 0.05);
            activeFrameCount = 0;
            activeFrameTime = 0;
          }
        }
        previousActiveFrame = active ? timestamp : 0;
      } catch {
        enterFallback();
        return;
      }
      if (prefersReducedMotion) return; // Wake only on scene/input changes.
      if (active || motionActive) animationFrame = window.requestAnimationFrame(drawFrame);
      else idleTimer = window.setTimeout(wake, 1000 / 30);
    };

    const handlePointerDown = (event: PointerEvent) => {
      pointerDown = true;
      pressedId = (event.target as HTMLElement)?.closest<HTMLElement>("[data-metaball-surface]")?.dataset.metaballSurface || null;
      activeUntil = performance.now() + 350;
      invalidate();
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (hostRect) cursor = { center: [(event.clientX - hostRect.left - hostRect.width / 2) / hostRect.height,
        (hostRect.height / 2 - event.clientY + hostRect.top) / hostRect.height],
        active: event.pointerType !== "touch" && event.clientX >= hostRect.left && event.clientX <= hostRect.right && event.clientY >= hostRect.top && event.clientY <= hostRect.bottom };
      activeUntil = performance.now() + 350;
      if (pointerDown) invalidate(); else wake();
    };
    const handlePointerUp = () => {
      pointerDown = false;
      pressedId = null;
      cursor.active = false;
      activeUntil = performance.now() + 350;
      invalidate();
    };
    const handleBlur = () => {
      pointerDown = false;
      pressedId = null;
      activeUntil = 0;
      invalidate();
    };
    const handleVisibilityChange = () => {
      cancelScheduledFrame();
      pointerDown = false;
      pressedId = null;
      previousActiveFrame = 0;
      if (!document.hidden) invalidate();
    };
    const mutationObserver = new MutationObserver((records) => {
      if (!records.some((record) => record.target !== canvas && !(record.type === "attributes" && record.attributeName === "style" && ownStyles.get(record.target as HTMLElement) === (record.target as HTMLElement).getAttribute("style")))) return;
      if (records.some((record) => record.type === "childList")) activeUntil = performance.now() + 500;
      invalidate();
    });
    mutationObserver.observe(host, { subtree: true, childList: true, attributes: true,
      attributeFilter: ["style", "class", "data-metaball-role", "data-metaball-relation", "data-liquid-color-key"] });
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(invalidate) : null;
    resizeObserver?.observe(host);
    host.addEventListener("pointerdown", handlePointerDown, { passive: true });
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    window.addEventListener("pointercancel", handlePointerUp, { passive: true });
    window.addEventListener("blur", handleBlur);
    window.addEventListener("resize", invalidate, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    reducedMotionQuery?.addEventListener?.("change", updateMotionPreference);
    canvas.dataset.motion = prefersReducedMotion ? "reduced" : "animated";
    canvas.dataset.rendererState = "loading";

    onStateChange("loading");
    try {
      if (!canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "high-performance" })) {
        throw new Error("liquid_webgl2_unavailable");
      }
      renderer = createDialogueMetaballRenderer(canvas, enterFallback);
      wake();
    } catch {
      enterFallback();
    }

    return () => {
      disposed = true;
      cancelScheduledFrame();
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      reducedMotionQuery?.removeEventListener?.("change", updateMotionPreference);
      host.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("resize", invalidate);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      renderer?.dispose();
      for (const element of surfaces) element.style.removeProperty("translate");
      renderer = null;
    };
  }, [hostRef, onStateChange]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.stageMetaballCanvas}
      data-testid="dialogue-metaball-canvas"
      aria-hidden="true"
    />
  );
}
