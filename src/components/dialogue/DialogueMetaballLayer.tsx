"use client";

import { useEffect, useRef, type RefObject } from "react";

import styles from "./DialogueShell.module.css";
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

function readSurfaceRects(host: HTMLDivElement): MetaballSurfaceRect[] {
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
        role,
        relation,
        left: rect.left,
        top: rect.top,
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

    let renderer: DialogueMetaballRenderer | null = null;
    let animationFrame = 0;
    let disposed = false;
    let reportedReady = false;
    const reducedMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
    let prefersReducedMotion = reducedMotionQuery?.matches ?? false;

    const updateMotionPreference = () => {
      prefersReducedMotion = reducedMotionQuery?.matches ?? false;
      canvas.dataset.motion = prefersReducedMotion ? "reduced" : "animated";
    };
    updateMotionPreference();
    reducedMotionQuery?.addEventListener?.("change", updateMotionPreference);

    const enterFallback = () => {
      if (disposed) return;
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
      renderer?.dispose();
      renderer = null;
      onStateChange("fallback");
    };

    const drawFrame = (timestamp: number) => {
      if (disposed || !renderer) return;

      const host = hostRef.current;
      if (host) {
        try {
          const hostRect = host.getBoundingClientRect();
          const surfaces = readSurfaceRects(host);
          const nodes = projectMetaballSurfaces(hostRect, surfaces);
          const pixelRatioCap = hostRect.width <= 640 ? 0.9 : 1.25;
          const pixelRatio = Math.min(window.devicePixelRatio || 1, pixelRatioCap);

          renderer.resize(hostRect.width, hostRect.height, pixelRatio);
          renderer.render(nodes, prefersReducedMotion ? 0 : timestamp / 1000);
          canvas.dataset.fusedPairs = computeFusedPairs(
            nodes,
            DIALOGUE_METABALL_SMOOTHNESS
          ).join(",");

          if (!reportedReady) {
            reportedReady = true;
            onStateChange("ready");
          }
        } catch {
          enterFallback();
          return;
        }
      }

      animationFrame = window.requestAnimationFrame(drawFrame);
    };

    onStateChange("loading");
    try {
      const contextAttributes: WebGLContextAttributes = {
        alpha: true,
        antialias: false,
        premultipliedAlpha: true,
        powerPreference: "high-performance"
      };
      const webglContext =
        canvas.getContext("webgl2", contextAttributes) ||
        canvas.getContext("webgl", contextAttributes);

      if (!webglContext) {
        enterFallback();
      } else {
        renderer = createDialogueMetaballRenderer(canvas, enterFallback);
        animationFrame = window.requestAnimationFrame(drawFrame);
      }
    } catch {
      enterFallback();
    }

    return () => {
      disposed = true;
      reducedMotionQuery?.removeEventListener?.("change", updateMotionPreference);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      renderer?.dispose();
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
