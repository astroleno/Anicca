"use client";

import { useEffect, useRef, type RefObject } from "react";

import styles from "./DialogueShell.module.css";
import { LiquidMotion } from "./liquid/motion";
import { LiquidDepthMotion } from "./liquid/depth";
import { captionInk } from "./liquid/color";
import { AsyncPixelReadback, type PixelReadback } from "./liquid/pixelReadback";
import type { LiquidRendererMode, LiquidRendererStatus } from "./liquid/preference";
import { LiquidQuality } from "./liquid/quality";
import { LiquidSceneClock } from "./liquid/clock";
import { DEFAULT_SEED_ORBIT, projectSpatialSeed, readSeedOrbit, readSeedZoom, publishSpatialFrame, clearSpatialFrame, fitSpatialSeed, fitSeedScene } from "./liquid/space";
import { layoutSeedLabels } from "./labelLayout";
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
  rendererMode?: LiquidRendererMode;
  onRendererStatus?(status: LiquidRendererStatus): void;
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

type SurfaceProjection = { x: number; y: number; scale: number };

function readSurfaceRects(host: HTMLDivElement, offsets: Map<string, SurfaceProjection>): MetaballSurfaceRect[] {
  return collectSurfaceElements(host).flatMap((element) => {
    const id = element.dataset.metaballSurface;
    const role = element.dataset.metaballRole;
    const relation = element.dataset.metaballRelation as MetaballRelation | undefined;
    if (!id || !isMetaballRole(role) || !relation || !METABALL_RELATIONS.includes(relation)) {
      return [];
    }

    const rect = element.getBoundingClientRect();
    const offset = offsets.get(id) || { x: 0, y: 0, scale: 1 };
    const width = rect.width / offset.scale, height = rect.height / offset.scale;
    let emergeFrom: string[] = [];
    try {
      const origins: unknown = JSON.parse(element.dataset.liquidOrigins || "[]");
      if (Array.isArray(origins)) emergeFrom = origins.filter((id: unknown): id is string => typeof id === "string").slice(0, MAX_DIALOGUE_METABALLS);
    } catch { /* Optional motion hints do not affect a seed's identity. */ }
    return [
      {
        id,
        colorKey: element.dataset.liquidColorKey,
        role,
        relation,
        generation: Number(element.dataset.seedGeneration) || 0,
        ...(element.dataset.seedAttention !== undefined && Number.isFinite(Number(element.dataset.seedAttention))
          ? { attention: Math.max(0, Math.min(1, Number(element.dataset.seedAttention))) } : {}),
        ...(element.dataset.seedHueShift !== undefined && Number.isFinite(Number(element.dataset.seedHueShift)) && Number.isFinite(Number(element.dataset.seedPolarityStrength))
          ? { polarity: { hueShift: Number(element.dataset.seedHueShift), strength: Number(element.dataset.seedPolarityStrength) } } : {}),
        ...(element.dataset.spaceDepth !== undefined && Number.isFinite(Number(element.dataset.spaceDepth)) ? { spaceDepth: Number(element.dataset.spaceDepth) } : {}),
        left: rect.left + rect.width / 2 - offset.x - width / 2,
        top: rect.top + rect.height / 2 - offset.y - height / 2,
        width,
        height,
        ...(emergeFrom.length ? { emergeFrom } : {})
      }
    ];
  });
}

export function DialogueMetaballLayer({ hostRef, onStateChange, rendererMode = "original", onRendererStatus }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const makeCanvas = () => {
      const element = document.createElement("canvas");
      element.className = styles.stageMetaballCanvas;
      element.dataset.testid = "dialogue-metaball-canvas";
      element.dataset.rendererRequested = rendererMode;
      element.setAttribute("aria-hidden", "true");
      mount.replaceChildren(element);
      return element;
    };
    let canvas = makeCanvas();

    const host = hostRef.current;
    if (!host) return;
    let renderer: DialogueMetaballRenderer | null = null;
    const initialization = new AbortController();
    let initializationTimer = 0;
    let usingTsl = rendererMode !== "original";
    let lastInkUpdate = -Infinity;
    let inkTheme = "";
    type InkToken = { signature: string; ground: number[]; captions: Array<{ element: HTMLElement; offset: number }> };
    let inkReadback: PixelReadback<InkToken> | null = null;
    let animationFrame = 0;
    let idleTimer = 0;
    let disposed = false;
    let reportedReady = false;
    let geometryDirty = true;
    let labelsDirty = true;
    let measuredCaptions: Array<{ id: string; width: number; height: number; inset: number; element: HTMLElement; caption: HTMLElement }> = [];
    let measuredPair: { element: HTMLElement; width: number; height: number } | null = null;
    let hostRect: DOMRect | null = null;
    let cachedNodes: ReturnType<typeof projectMetaballSurfaces> = [];
    let activeUntil = 0;
    let pointerDown = false;
    let activePointerId: number | null = null;
    let pressedId: string | null = null;
    let qualityScale = 1;
    const quality = new LiquidQuality();
    const sceneClock = new LiquidSceneClock();
    const motion = new LiquidMotion();
    const depthMotion = new LiquidDepthMotion();
    const motionOffsets = new Map<string, SurfaceProjection>();
    const ownStyles = new WeakMap<HTMLElement, string>();
    const measuredInputs = new WeakMap<HTMLElement, string>();
    const inputStyle = (element: HTMLElement) => [element.style.left, element.style.top,
      element.style.getPropertyValue("--stage-node-drag-x"), element.style.getPropertyValue("--stage-node-drag-y")].join(";");
    let surfaces: HTMLElement[] = [];
    let motionActive = false;
    let depthActive = false;
    let fitActive = false;
    let renderedNodes = cachedNodes;
    let framingSource: typeof cachedNodes | null = null;
    let framingNodes = cachedNodes;
    let spatialNodes = cachedNodes;
    let unfittedNodes = cachedNodes;
    let displayNodes = cachedNodes;
    let lastLayoutBase: typeof cachedNodes | null = null;
    let lastLayoutDepth: typeof cachedNodes | null = null;
    let viewFit = 1, fitGoal = 1, lastLayoutFit = 1, lastFitTime: number | null = null;
    let sizingDirty = false;
    let trackRect: DOMRect | null = null;
    let spatialLayoutDirty = true;
    let spatialPivot: [number, number] = [0, 0];
    let previousSpaceNodes: typeof spatialNodes | null = null;
    let ground: [number,number,number] = [248,247,249];
    const reducedMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
    let prefersReducedMotion = reducedMotionQuery?.matches ?? false;

    const cancelScheduledFrame = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (idleTimer) window.clearTimeout(idleTimer);
      animationFrame = 0;
      idleTimer = 0;
    };
    const wake = () => {
      if (disposed || document.hidden || host.dataset.spacePaused === "true" || !renderer) return;
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = 0;
      if (!animationFrame) animationFrame = window.requestAnimationFrame(drawFrame);
    };
    const invalidate = () => {
      geometryDirty = true;
      spatialLayoutDirty = true;
      wake();
    };
    const remeasure = () => { labelsDirty = true; sizingDirty = true; invalidate(); };
    const clearProjection = () => {
      for (const element of surfaces) {
        for (const key of ["translate", "transform", "width", "height", "z-index", "--stage-projection-scale", "--stage-projection-inset"]) element.style.removeProperty(key);
      }
      for (const caption of host.querySelectorAll<HTMLElement>("[data-seed-caption]")) {
        caption.style.removeProperty("transform");
        caption.style.removeProperty("--stage-label-offset-x");
        caption.style.removeProperty("--stage-label-offset-y");
      }
      motionOffsets.clear();
    };
    const enterFallback = (error?: unknown) => {
      if (disposed) return;
      window.clearTimeout(initializationTimer);
      initialization.abort();
      cancelScheduledFrame();
      inkReadback?.dispose();
      inkReadback = null;
      renderer?.dispose();
      renderer = null;
      if (usingTsl) {
        usingTsl = false;
        // A canvas that has claimed WebGPU cannot subsequently claim WebGL2.
        // The effect owns this child, so React keeps the stable mount only.
        canvas = makeCanvas();
        canvas.dataset.motion = prefersReducedMotion ? "reduced" : "animated";
        canvas.dataset.rendererState = "loading";
        canvas.dataset.rendererFallback = "true";
        canvas.dataset.rendererFailure = error instanceof Error ? error.message.slice(0, 240) : "graphics_context_lost";
        reportedReady = false;
        geometryDirty = true;
        lastInkUpdate = -Infinity;
        onStateChange("loading");
        startOriginal();
        return;
      }
      clearSpatialFrame(host);
      clearProjection();
      for (const caption of host.querySelectorAll<HTMLElement>("[data-seed-caption]")) caption.style.removeProperty("--seed-caption-ink");
      canvas.dataset.rendererState = "fallback";
      canvas.dataset.rendererBackend = "unavailable";
      onRendererStatus?.({ requested: rendererMode, backend: "unavailable", fallback: true });
      onStateChange("fallback");
    };
    const updateMotionPreference = () => {
      prefersReducedMotion = reducedMotionQuery?.matches ?? false;
      canvas.dataset.motion = prefersReducedMotion ? "reduced" : "animated";
      invalidate();
    };

    const drawFrame = (timestamp: number) => {
      animationFrame = 0;
      if (disposed || !renderer || document.hidden || host.dataset.spacePaused === "true") return;
      const active = pointerDown || motionActive || depthActive || fitActive || timestamp < activeUntil;
      try {
        const sceneTime = sceneClock.step(timestamp);
        // Geometry only changes on resize, scene mutations or pointer movement.
        // Idle material animation reuses the same projected scene.
        if (geometryDirty || !hostRect) {
          if (sizingDirty) {
            for (const element of surfaces) {
              element.style.removeProperty("width"); element.style.removeProperty("height");
              element.style.removeProperty("transform"); element.style.removeProperty("--stage-projection-scale");
              const offset = motionOffsets.get(element.dataset.metaballSurface!);
              if (offset) motionOffsets.set(element.dataset.metaballSurface!, { ...offset, scale: 1 });
            }
            sizingDirty = false;
          }
          hostRect = canvas.getBoundingClientRect();
          trackRect = host.getBoundingClientRect();
          surfaces = collectSurfaceElements(host);
          cachedNodes = projectMetaballSurfaces(hostRect, readSurfaceRects(host, motionOffsets));
          for (const element of surfaces) measuredInputs.set(element, inputStyle(element));
          const channels = getComputedStyle(host).getPropertyValue("--stage-ground-rgb").split(",").map(Number);
          ground = channels.length === 3 && channels.every(Number.isFinite) ? channels as [number,number,number]
            : host.dataset.theme === "dark" ? [25,22,32] : [248,247,249];
          motionActive = true;
          geometryDirty = false;
          const fusedPairs = computeFusedPairs(cachedNodes, DIALOGUE_METABALL_SMOOTHNESS).join(",");
          if (canvas.dataset.fusedPairs !== fusedPairs) canvas.dataset.fusedPairs = fusedPairs;
        }
        // Read caption dimensions before any per-frame layout writes.
        if (labelsDirty) {
          measuredCaptions = surfaces.flatMap(element => {
            const caption = element.querySelector<HTMLElement>("[data-seed-caption]");
            if (!caption) return [];
            const width = Array.from(caption.querySelectorAll<HTMLElement>("strong,small,em")).reduce((sum, text) => {
              const range = document.createRange(); range.selectNodeContents(text);
              return sum + Math.min(text.offsetWidth, range.getBoundingClientRect().width);
            }, 24);
            return [{ id: element.dataset.metaballSurface!, width: Math.min(caption.offsetWidth, width), height: caption.offsetHeight, inset: element.clientTop, element, caption }];
          });
          const pair = host.querySelector<HTMLElement>('[data-testid="dialogue-synthesis-pair-label"]');
          measuredPair = pair ? { element: pair, width: pair.offsetWidth, height: pair.offsetHeight } : null;
          labelsDirty = false;
        }
        if (motionActive) {
          const result = motion.step(cachedNodes, sceneTime, prefersReducedMotion, host.dataset.spaceNavigating === "true" ? null : pressedId,
            pointerDown ? host.dataset.liquidPartner || null : null,12/hostRect.height);
          renderedNodes = result.nodes;
          motionActive = result.moving;
          spatialLayoutDirty = true;
        }
        const orbit = readSeedOrbit(host);
        if (spatialLayoutDirty && trackRect && hostRect.height) {
          const pivot: [number, number] = [(trackRect.left + trackRect.width/2 - hostRect.left - hostRect.width/2)/hostRect.height,
            (hostRect.top + hostRect.height/2 - trackRect.top - trackRect.height/2)/hostRect.height];
          spatialPivot = pivot;
          unfittedNodes = renderedNodes.map(node => projectSpatialSeed(node, pivot, orbit));
          spatialLayoutDirty = false;
        }
        const manipulatingSeed = pointerDown && host.dataset.spaceNavigating !== "true";
        const depth = depthMotion.step(unfittedNodes, sceneTime, prefersReducedMotion,
          manipulatingSeed ? pressedId : null, manipulatingSeed ? host.dataset.liquidPartner || null : null);
        depthActive = depth.moving;
        const rawChanged = lastLayoutBase !== unfittedNodes || lastLayoutDepth !== depth.nodes;
        const dragging = manipulatingSeed && Boolean(pressedId);
        if (rawChanged && trackRect && !dragging) {
          // Automatic framing belongs to the scene layout. Reframing the rotated
          // projection changes camera distance during a rotation, even at fixed zoom.
          if (framingSource !== renderedNodes) {
            framingSource = renderedNodes;
            framingNodes = renderedNodes.map(node => projectSpatialSeed(node, spatialPivot, DEFAULT_SEED_ORBIT));
          }
          fitGoal = fitSeedScene(framingNodes, spatialPivot, trackRect, hostRect.height);
        }
        const fitElapsed = lastFitTime === null ? 1 : Math.max(0, (sceneTime - lastFitTime) / 1000);
        const fitDt = lastFitTime === null || fitActive ? fitElapsed : Math.min(1 / 60, fitElapsed);
        lastFitTime = sceneTime;
        if (!dragging) viewFit = prefersReducedMotion || fitGoal < viewFit || Math.abs(fitGoal - viewFit) < .0001 ? fitGoal : viewFit + (fitGoal - viewFit) * (1 - Math.exp(-12 * fitDt));
        fitActive = !dragging && Math.abs(fitGoal - viewFit) >= .0001;
        const sceneFit = viewFit * readSeedZoom(host);
        if ((rawChanged || sceneFit !== lastLayoutFit) && trackRect) {
          lastLayoutBase = unfittedNodes; lastLayoutDepth = depth.nodes; lastLayoutFit = sceneFit;
          spatialNodes = sceneFit === 1 ? unfittedNodes : unfittedNodes.map(node => fitSpatialSeed(node, spatialPivot, sceneFit));
          displayNodes = sceneFit === 1 ? depth.nodes : depth.nodes.map(node => fitSpatialSeed(node, spatialPivot, sceneFit));
          for (const element of surfaces) {
            const id = element.dataset.metaballSurface!;
            const target = cachedNodes.find(node => node.id === id);
            const current = displayNodes.find(node => node.id === id);
            if (!target || !current) continue;
            const offset = { x: (current.center[0] - target.center[0]) * hostRect.height,
              y: (target.center[1] - current.center[1]) * hostRect.height,
              scale: current.radius / target.radius };
            motionOffsets.set(id, offset);
            const translate = `${offset.x.toFixed(3)}px ${offset.y.toFixed(3)}px`;
            // Keep the logical box stable. Resizing it on every orbit frame
            // forces layout and Chromium's synthetic hover update before rAF.
            // The caption counter-scales so its text and spacing stay in pixels.
            const scale = String(offset.scale);
            const transform = `translate(calc(-50% + var(--stage-node-drag-x, 0px)), calc(-50% + var(--stage-node-drag-y, 0px))) scale(${scale})`;
            if (element.style.translate !== translate) element.style.translate = translate;
            if (element.style.transform !== transform) element.style.transform = transform;
          }
          const localNodes = displayNodes.map(node => ({ ...node,
            x: hostRect!.left + hostRect!.width/2 + node.center[0]*hostRect!.height - trackRect!.left,
            y: hostRect!.top + hostRect!.height/2 - node.center[1]*hostRect!.height - trackRect!.top,
            radiusPx: node.radius * hostRect!.height }));
          const captions = measuredCaptions.flatMap(measured => {
            const node = localNodes.find(item => item.id === measured.id);
            if (!node || measured.element.dataset.labelHandoff === "true") return [];
            return [{ ...measured, x: node.x, y: node.y + node.radiusPx + 10 + measured.height/2 }];
          });
          const pairCaption = measuredPair?.element;
          const source = localNodes.find(node => node.id === pressedId);
          const partner = localNodes.find(node => node.id === host.dataset.liquidContact);
          const pairBox = pairCaption && source && partner ? [{ id: "__pair", x: (source.x+partner.x)/2,
            y: (source.y+partner.y)/2 + Math.max(source.radiusPx, partner.radiusPx) + 18 + (measuredPair?.height || 0)/2,
            width: measuredPair!.width, height: measuredPair!.height }] : [];
          const offsets = layoutSeedLabels([...captions, ...pairBox], trackRect.width, trackRect.height,
            localNodes.map(node => ({ x: node.x, y: node.y, radius: node.radiusPx * 1.08 })),
            { top: Number(host.dataset.labelInsetTop) || 0, bottom: Number(host.dataset.labelInsetBottom) || 0 });
          for (const caption of captions) {
            const scale = motionOffsets.get(caption.id)?.scale || 1;
            const x = (offsets[caption.id]?.x || 0) / scale;
            const y = (10 + (offsets[caption.id]?.y || 0)) / scale - 10 + caption.inset;
            // Counter-scale the caption directly. Inherited custom properties
            // made every orbit sample recalculate the seed's whole text subtree.
            // React's flat fallback stays on the button and resumes on GL loss.
            const transform = `translate(calc(-50% + ${x}px), ${y}px) scale(${1 / scale})`;
            if (caption.caption.style.transform !== transform) caption.caption.style.transform = transform;
            ownStyles.set(caption.caption, caption.caption.getAttribute("style") || "");
          }
          if (pairCaption && pairBox[0]) {
            pairCaption.style.left = `${pairBox[0].x + (offsets.__pair?.x || 0)}px`;
            pairCaption.style.top = `${pairBox[0].y - pairBox[0].height/2 + (offsets.__pair?.y || 0)}px`;
            pairCaption.style.setProperty("--pair-caption-offset", "0px");
            ownStyles.set(pairCaption, pairCaption.getAttribute("style") || "");
          }
          for (const element of surfaces) ownStyles.set(element, element.getAttribute("style") || "");
        }
        publishSpatialFrame(host, { base: spatialNodes, rendered: displayNodes, pivot: spatialPivot, height: hostRect.height, scale: sceneFit });
        for (const element of surfaces) {
          const node=displayNodes.find(item=>item.id===element.dataset.metaballSurface);
          if (!node) continue;
          const order=String(3+displayNodes.filter(other=>(other.depth || 0)>(node.depth || 0)).length);
          if (element.style.zIndex!==order) {
            element.style.zIndex=order;
            ownStyles.set(element,element.getAttribute("style") || "");
          }
        }
        if (previousSpaceNodes !== displayNodes) {
          previousSpaceNodes = displayNodes;
          canvas.dataset.spaceNodes = JSON.stringify(displayNodes.map(node => ({ id: node.id, center: node.center, depth: node.depth, radius: node.radius })));
        }
        const atmosphere = host.dataset.atmosphere === "true";
        const theme = host.dataset.theme || "light";
        if (theme !== inkTheme) {
          inkTheme = theme;
          inkReadback?.cancel();
          lastInkUpdate = -Infinity;
          for (const caption of host.querySelectorAll<HTMLElement>("[data-seed-caption]")) {
            caption.style.removeProperty("--seed-caption-ink");
            ownStyles.set(caption,caption.getAttribute("style") || "");
          }
        }
        const inkSignature = `${host.dataset.theme}:${canvas.width}:${canvas.height}`;
        if (!atmosphere) inkReadback?.cancel();
        else {
          // Consume an already completed batch before queuing the next draw.
          const completed = inkReadback?.poll(timestamp);
          if (completed?.token.signature === inkSignature) for (const {element,offset} of completed.token.captions) {
            if (!element.isConnected || !host.contains(element)) continue;
            const samples = [0,4,8].map(index => Array.from(completed.pixels.subarray(offset+index,offset+index+4)));
            const ink = captionInk(samples,completed.token.ground);
            if (element.style.getPropertyValue("--seed-caption-ink") !== ink) {
              element.style.setProperty("--seed-caption-ink",ink);
              ownStyles.set(element,element.getAttribute("style") || "");
            }
          }
        }
        const cap = hostRect.width <= 640 ? 0.62 : 0.8;
        renderer.resize(hostRect.width, hostRect.height, Math.min(window.devicePixelRatio || 1, cap) * qualityScale);
        renderer.render(displayNodes, prefersReducedMotion ? 0 : sceneTime / 1000,
          { draggedId: manipulatingSeed ? pressedId : null, partnerId: manipulatingSeed ? host.dataset.liquidPartner || null : null,
            atmosphere: host.dataset.atmosphere === "true", dark: host.dataset.theme === "dark", ground, orbit });
        // Tiny, throttled GPU batches adapt ink without blocking a gesture.
        if (!atmosphere) {
          // With the field hidden, captions sit on the known paper/dark ground.
          // Stable theme ink avoids a synchronous GPU readback during a drag.
          if (lastInkUpdate !== -Infinity) {
            for (const caption of host.querySelectorAll<HTMLElement>("[data-seed-caption]")) {
              if (caption.style.getPropertyValue("--seed-caption-ink")) {
                caption.style.removeProperty("--seed-caption-ink");
                ownStyles.set(caption, caption.getAttribute("style") || "");
              }
            }
            lastInkUpdate = -Infinity;
          }
        } else if (inkReadback && !inkReadback.pending && timestamp-lastInkUpdate > (active ? 250 : 800)) {
          lastInkUpdate = timestamp;
          const points: Array<{x: number; y: number}> = [];
          const captions: Array<{element: HTMLElement; offset: number}> = [];
          for (const caption of host.querySelectorAll<HTMLElement>("[data-seed-caption]")) {
            const rect = caption.getBoundingClientRect();
            if (!rect.width || !rect.height || rect.bottom<hostRect.top || rect.top>hostRect.bottom) continue;
            captions.push({ element: caption, offset: points.length*4 });
            for (const fraction of [.3,.5,.7]) {
              const x = Math.max(0,Math.min(canvas.width-1,Math.round((rect.left+rect.width*fraction-hostRect.left)/hostRect.width*canvas.width)));
              const y = Math.max(0,Math.min(canvas.height-1,Math.round((1-(rect.top+rect.height/2-hostRect.top)/hostRect.height)*canvas.height)));
              points.push({x,y});
            }
          }
          inkReadback.submit(points,{signature:`${host.dataset.theme}:${canvas.width}:${canvas.height}`,ground:[...ground],captions},timestamp);
        }
        if (!reportedReady) {
          reportedReady = true;
          canvas.dataset.rendererState = "ready";
          onStateChange("ready");
        }
        // Only interaction frames inform quality. Intentional idle throttling
        // must not be mistaken for a slow GPU.
        qualityScale = quality.step(timestamp,active,pointerDown);
      } catch {
        enterFallback();
        return;
      }
      if (prefersReducedMotion && !inkReadback?.pending) return; // Finish a pending read without animating the material.
      if (active || motionActive || depthActive || fitActive || inkReadback?.pending) animationFrame = window.requestAnimationFrame(drawFrame);
      else {
        const quiet = document.activeElement?.id === "dialogue-input" || host.closest<HTMLElement>('[data-testid="dialogue-shell"]')?.dataset.reading === "true";
        idleTimer = window.setTimeout(wake, 1000 / (quiet ? 12 : 30));
      }
    };

    let lastIntentAt = -Infinity;
    const prepareInteraction = () => {
      if (prefersReducedMotion) return;
      const now = performance.now();
      if (now - lastIntentAt < 100) return;
      lastIntentAt = now;
      activeUntil = Math.max(activeUntil, now + 200);
      wake();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (host.dataset.spacePaused === "true" || (activePointerId !== null && activePointerId !== event.pointerId)) return;
      activePointerId = event.pointerId;
      pointerDown = true;
      pressedId = (event.target as HTMLElement)?.closest<HTMLElement>("[data-metaball-surface]")?.dataset.metaballSurface || null;
      activeUntil = performance.now() + 350;
      if (pressedId) invalidate(); else wake();
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerDown) {
        if (host.contains(event.target as Node)) prepareInteraction();
        return;
      }
      if (event.pointerId !== activePointerId) return;
      activeUntil = performance.now() + 350;
      if (pressedId) invalidate(); else wake();
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) return;
      const wasDragging = Boolean(pressedId);
      activePointerId = null;
      pointerDown = false;
      pressedId = null;
      activeUntil = performance.now() + 350;
      if (wasDragging) invalidate(); else wake();
    };
    const handleBlur = () => {
      activePointerId = null;
      pointerDown = false;
      pressedId = null;
      activeUntil = 0;
      invalidate();
    };
    const handleVisibilityChange = () => {
      cancelScheduledFrame();
      sceneClock.pause();
      activePointerId = null;
      pointerDown = false;
      pressedId = null;
      quality.resetTiming();
      if (!document.hidden) invalidate();
    };
    const mutationObserver = new MutationObserver((records) => {
      if (records.some(record => record.target === host && record.attributeName === "data-space-paused")) {
        cancelScheduledFrame(); quality.resetTiming(); sceneClock.pause();
        if (host.dataset.spacePaused !== "true") invalidate();
        else { activePointerId = null; pointerDown = false; pressedId = null; }
      }
      const changed = records.filter(record => record.target !== canvas &&
        !(record.target === host && record.attributeName === "class") &&
        !(record.type === "attributes" && record.attributeName === "style" && ownStyles.get(record.target as HTMLElement) === (record.target as HTMLElement).getAttribute("style") &&
          (!(record.target as HTMLElement).dataset.metaballSurface || measuredInputs.get(record.target as HTMLElement) === inputStyle(record.target as HTMLElement))));
      if (!changed.length) return;
      if (changed.every(record => ["data-space-yaw", "data-space-pitch", "data-space-zoom", "data-space-navigating"].includes(record.attributeName || ""))) {
        spatialLayoutDirty = true; activeUntil = performance.now() + 250; wake(); return;
      }
      if (changed.some(record => record.type === "childList" || record.type === "characterData" || record.attributeName === "class")) { labelsDirty = true; activeUntil = performance.now() + 500; }
      if (changed.some(record => record.attributeName === "data-seed-attention")) activeUntil = performance.now() + 650;
      invalidate();
    });
    mutationObserver.observe(host, { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ["style", "class", "data-space-paused", "data-label-inset-top", "data-label-inset-bottom", "data-metaball-role", "data-metaball-relation", "data-liquid-origins", "data-liquid-color-key", "data-atmosphere", "data-theme", "data-liquid-partner", "data-liquid-contact", "data-label-handoff", "data-space-yaw", "data-space-pitch", "data-space-zoom", "data-space-navigating", "data-space-depth", "data-seed-generation", "data-seed-hue-shift", "data-seed-polarity-strength", "data-seed-attention"] });
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(remeasure) : null;
    resizeObserver?.observe(host);
    host.addEventListener("pointerdown", handlePointerDown, { passive: true });
    host.addEventListener("pointerenter", prepareInteraction, { passive: true });
    host.addEventListener("focusin", prepareInteraction, { passive: true });
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    window.addEventListener("pointercancel", handlePointerUp, { passive: true });
    window.addEventListener("lostpointercapture", handlePointerUp, { passive: true });
    window.addEventListener("blur", handleBlur);
    window.addEventListener("resize", remeasure, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    reducedMotionQuery?.addEventListener?.("change", updateMotionPreference);
    document.fonts?.ready.then(() => { if (!disposed) remeasure(); });
    document.fonts?.addEventListener("loadingdone", remeasure);
    canvas.dataset.motion = prefersReducedMotion ? "reduced" : "animated";
    canvas.dataset.rendererState = "loading";

    onStateChange("loading");
    function startOriginal() {
      try {
        const context = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "high-performance" });
        if (!context) throw new Error("liquid_webgl2_unavailable");
        renderer = createDialogueMetaballRenderer(canvas, enterFallback);
        inkReadback = new AsyncPixelReadback(context);
        canvas.dataset.rendererBackend = "original";
        onRendererStatus?.({ requested: rendererMode, backend: "original", fallback: rendererMode !== "original" });
        wake();
      } catch (error) { enterFallback(error); }
    }
    if (!usingTsl) startOriginal();
    else {
      initializationTimer = window.setTimeout(() => enterFallback(new Error("liquid_initialization_timeout")), 20000);
      void import("./liquid/tslRenderer").then(module => {
        if (initialization.signal.aborted) return null;
        return module.createTslMetaballRenderer(canvas, rendererMode === "tsl-webgl", enterFallback, initialization.signal);
      }).then(session => {
        if (!session) return;
        if (disposed || initialization.signal.aborted) { session.renderer.dispose(); return; }
        window.clearTimeout(initializationTimer);
        renderer = session.renderer;
        inkReadback = session.createReadback<InkToken>();
        canvas.dataset.rendererBackend = session.backend;
        onRendererStatus?.({ requested: rendererMode, backend: session.backend, fallback: false });
        wake();
      }).catch(error => {
        if (!disposed && !initialization.signal.aborted) enterFallback(error);
      });
    }

    return () => {
      disposed = true;
      initialization.abort();
      window.clearTimeout(initializationTimer);
      cancelScheduledFrame();
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      reducedMotionQuery?.removeEventListener?.("change", updateMotionPreference);
      document.fonts?.removeEventListener("loadingdone", remeasure);
      host.removeEventListener("pointerdown", handlePointerDown);
      host.removeEventListener("pointerenter", prepareInteraction);
      host.removeEventListener("focusin", prepareInteraction);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("lostpointercapture", handlePointerUp);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("resize", remeasure);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      renderer?.dispose();
      inkReadback?.dispose();
      clearSpatialFrame(host);
      clearProjection();
      for (const caption of host.querySelectorAll<HTMLElement>("[data-seed-caption]")) caption.style.removeProperty("--seed-caption-ink");
      renderer = null;
      mount.replaceChildren();
    };
  }, [hostRef, onStateChange, rendererMode, onRendererStatus]);

  return (
    <div
      ref={mountRef}
      className={styles.stageMetaballMount}
      aria-hidden="true"
    />
  );
}
