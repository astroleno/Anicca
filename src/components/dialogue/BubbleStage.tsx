"use client";

import { seedColorPolarity } from "./liquid/color";
import { polarityLabel } from "@/features/perspectives/polarity";
import type { ThinkingAxis } from "@/features/perspectives/model";

import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useDialogueUiStore } from "@/features/dialectic/store";
import { findSynthesisGestureCandidate } from "@/features/dialectic/gestures";
import { LIQUID_DWELL_MS, LIQUID_HOLD_MS, liquidHoldRemaining } from "@/features/dialectic/liquidInteraction";
import { placeSeeds } from "@/features/dialectic/seedPlacement";
import { DialogueStageNode, DialogueSynthesisAction } from "@/features/dialectic/viewModel";
import { StagePan, StagePoint } from "@/types/anicca";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import type { DialogueMetaballRendererState } from "./DialogueMetaballLayer";
import styles from "./DialogueShell.module.css";
import type { MetaballRole } from "./metaball/model";
import { layoutSeedLabels } from "./labelLayout";
import type { DialogueTheme } from "./useDialogueTheme";
import { DEFAULT_SEED_ORBIT, orbitSeedSpace, spatialStagePoint, dragSpatialStagePoint, SEED_VIEWS, wrapSeedYaw,
  readSpatialFrame, canCaptureSpatialPair, spatialPairInContact, SEED_CAMERA_DISTANCE, SEED_WORLD_CAMERA_DISTANCE,
  type SeedOrbit, type SeedViewDirection } from "./liquid/space";

const DialogueMetaballLayer = dynamic(() => import("./DialogueMetaballLayer").then(module => module.DialogueMetaballLayer), { ssr: false });

type BubbleStageProps = {
  layoutKey: string;
  nodes: DialogueStageNode[];
  focusNodeId: string | null;
  onSelect: (nodeId: string) => void;
  onPrimaryAction?: (nodeId: string | null) => void;
  convergenceEventId?: string | null;
  eventNodeId?: string | null;
  arrivals?: { sourceId: string; firstId: string; secondId: string } | null;
  pendingPreview?: StagePendingPreview | null;
  synthesisAction?: DialogueSynthesisAction | null;
  onProposeSynthesis?: (action: DialogueSynthesisAction) => void;
  resolveSynthesisAction?: (left: string, right: string) => DialogueSynthesisAction | null;
  onSplit?: (nodeId: string) => void;
  onInteractionStart?: () => void;
  generationBusy?: boolean;
  emptyAction?: {
    label: string;
    onTrigger: () => void;
  } | null;
  atmosphereVisible?: boolean;
  theme?: DialogueTheme;
  cameraView?: { direction: SeedViewDirection; revision: number } | null;
  attentionIds?: readonly string[] | null;
  reading?: boolean;
  suspended?: boolean;
};

type StagePendingPreview =
  | {
      kind: "branches";
      anchorNodeId: string | null;
      prompt: string;
      polarityAxis?: ThinkingAxis;
    }
  | {
      kind: "synthesis";
      thesisId: string;
      antithesisId: string;
      label: string;
    };

type ActiveStageGesture =
  | {
      kind: "node";
      pointerId: number;
      nodeId: string;
      startClientX: number;
      startClientY: number;
      startPosition: StagePoint;
      startScreenPosition?: StagePoint;
      startViewDepth?: number;
    }
  | {
      kind: "orbit";
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startOrbit: SeedOrbit;
      pointerType: string;
    };

const DEFAULT_STAGE_PAN: StagePan = { x: 0, y: 0 };
const NODE_MIN_X_PERCENT = 12;
const NODE_MAX_X_PERCENT = 88;
const NODE_MIN_Y_PERCENT = 12;
const NODE_MAX_Y_PERCENT = 84;
const GROWTH_NODE_MAX_Y_PERCENT = 90;

const RELATION_LABELS: Record<DialogueStageNode["relation"], string> = {
  focus: "当前焦点",
  ancestor: "上游节点",
  child: "下游节点",
  source: "合流来源"
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampNodePosition(position: StagePoint, maxY = NODE_MAX_Y_PERCENT) {
  return {
    x: clamp(position.x, NODE_MIN_X_PERCENT, NODE_MAX_X_PERCENT),
    y: clamp(position.y, NODE_MIN_Y_PERCENT, maxY),
    ...(typeof position.z === "number" && Number.isFinite(position.z) ? { z: clamp(position.z, -.95, .95) } : {})
  };
}

function buildStageNodeAriaLabel(node: DialogueStageNode) {
  const parts = [node.preview || node.label];
  if (node.branchType) {
    parts.push(`${node.branchType}方`);
  }
  const pole = polarityLabel(node.polarity);
  if (pole) parts.push(`沿极性展开，${pole}视角`);
  if (node.instanceNumber !== undefined) parts.push(node.instanceNumber ? `同一概念的分身 ${node.instanceNumber}` : "原种子");
  if (node.sourceRole === "source") parts.push("当前合的来源");
  if (node.sourceRole === "shared") parts.push("共享概念");
  parts.push(RELATION_LABELS[node.relation]);
  if (node.summary && node.summary !== node.preview && node.summary !== node.label) {
    parts.push(node.summary);
  }
  return parts.filter(Boolean).join("，");
}

function getMetaballRole(node: DialogueStageNode): MetaballRole {
  if (node.kind === "user") return "user";
  if (node.branchType === "正") return "thesis";
  if (node.branchType === "反") return "antithesis";
  if (node.branchType === "合" || node.displayRole === "synthesis-record") return "synthesis";
  if (node.isGrowthPerspective) return "growth";
  return "neutral";
}

export function BubbleStage({
  layoutKey,
  nodes,
  focusNodeId,
  onSelect,
  onPrimaryAction,
  convergenceEventId = null,
  eventNodeId = null,
  arrivals = null,
  pendingPreview = null,
  synthesisAction = null,
  onProposeSynthesis,
  resolveSynthesisAction,
  onSplit,
  onInteractionStart,
  generationBusy = false,
  emptyAction = null,
  atmosphereVisible = false,
  theme = "light",
  cameraView = null,
  attentionIds = null,
  reading = false,
  suspended = false
}: BubbleStageProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [controlsHost, setControlsHost] = useState<HTMLElement | null>(null);
  const synthesisLabelRef = useRef<HTMLDivElement | null>(null);
  const synthesisLabelPositionRef = useRef<StagePoint>({ x: 50, y: 42 });
  const synthesisLabelOffsetRef = useRef(100);
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [labelGeometry, setLabelGeometry] = useState({
    width: 0, height: 0, insets: { top: 0, bottom: 0 },
    labels: {} as Record<string, { width: number; height: number; anchorOffsetY: number; surfaceRadius: number }>
  });
  const activePointerTargetRef = useRef<HTMLElement | null>(null);
  const touchHoldRef = useRef<{ timer: number; pointerId: number; x: number; y: number } | null>(null);
  const stageLayout = useDialogueUiStore((state) => state.stagePreview?.layoutKey === layoutKey
    ? state.stagePreview.view : state.stageLayouts[layoutKey] || null);
  const setStageNodePosition = useDialogueUiStore((state) => state.setStageNodePosition);
  const ensurePositions = useDialogueUiStore(state => state.ensureStageNodePositions);
  const [gesture, setGesture] = useState<ActiveStageGesture | null>(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const [metaballRendererState, setMetaballRendererState] =
    useState<DialogueMetaballRendererState>("loading");
  const [synthesisCandidateId, setSynthesisCandidateId] = useState<string | null>(null);
  const [attractionPartnerId, setAttractionPartnerId] = useState<string | null>(null);
  const [holdingTouch, setHoldingTouch] = useState<{ nodeId: string; duration: number } | null>(null);
  const contactRef = useRef<string | null>(null);
  const physicalContactRef = useRef<string | null>(null);
  const dwellProgressRef = useRef<HTMLSpanElement | null>(null);
  const [synthesisArmed, setSynthesisArmed] = useState(false);
  const armRef = useRef<{ key: string; timer: number; ready: boolean } | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const pointerTypeRef = useRef("mouse");
  const actionsRef = useRef({ onProposeSynthesis, onInteractionStart, generationBusy, onSelect, onPrimaryAction });
  actionsRef.current = { onProposeSynthesis, onInteractionStart, generationBusy, onSelect, onPrimaryAction };
  const resetArm = useCallback(() => {
    if (armRef.current) window.clearTimeout(armRef.current.timer);
    armRef.current = null;
    physicalContactRef.current = null;
    if (dwellProgressRef.current) dwellProgressRef.current.dataset.contact="false";
    setSynthesisArmed(false);
  }, []);
  useEffect(() => () => {
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    if (armRef.current) window.clearTimeout(armRef.current.timer);
  }, []);
  useEffect(() => {
    const cancelRead = (event: PointerEvent) => {
      if (!(event.target as HTMLElement)?.closest?.('[data-testid^="dialogue-stage-node-"]') && clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
    };
    window.addEventListener("pointerdown", cancelRead);
    return () => window.removeEventListener("pointerdown", cancelRead);
  }, []);
  const orbitRef = useRef<SeedOrbit>(DEFAULT_SEED_ORBIT);
  const [viewRotated, setViewRotated] = useState(false);
  const orbitAnimationRef = useRef(0);
  const stopOrbitAnimation = useCallback(() => {
    if (orbitAnimationRef.current) { cancelAnimationFrame(orbitAnimationRef.current); setViewRotated(Math.abs(orbitRef.current.yaw) + Math.abs(orbitRef.current.pitch) > .001); }
    orbitAnimationRef.current = 0;
  }, []);
  const cancelTouchHold = useCallback(() => {
    if (touchHoldRef.current) window.clearTimeout(touchHoldRef.current.timer);
    touchHoldRef.current = null;
    setHoldingTouch(null);
  }, []);
  useEffect(() => {
    setControlsHost(trackRef.current?.closest<HTMLElement>('[data-testid="dialogue-shell"]') || null);
  }, []);
  const didDragRef = useRef(false);
  const suppressClickUntilRef = useRef(0);
  const suppressDragClickRef = useRef(false);
  const canPanStage = nodes.length > 0;
  const hasThesis = nodes.some((node) => node.branchType === "正");
  const hasAntithesis = nodes.some((node) => node.branchType === "反");
  const hasGrowthPerspectives = nodes.some((node) => node.isGrowthPerspective);
  const growthChildCount = nodes.filter((node) => node.isGrowthPerspective && node.relation === "child").length;
  const growthCompactRows = Math.ceil(growthChildCount / 2);
  const growthStageMinHeight = growthCompactRows >= 3
    ? `${115 + Math.max(0, growthCompactRows - 3) * 55}vh`
    : "94vh";
  const hasSynthesisRecord = Boolean(convergenceEventId) || nodes.some((node) => node.branchType === "合");
  const relationshipHint = isCoarsePointer
    ? hasThesis && hasAntithesis
      ? hasSynthesisRecord
        ? "点选液滴查看正与反。合流记录已保留。"
        : "点选液滴查看正与反。"
      : hasSynthesisRecord
        ? "合流记录已保留。"
        : null
    : hasSynthesisRecord
      ? "合流记录已保留。"
      : hasThesis && hasAntithesis
        ? "拖动两颗想法靠近，稍停后松手合成；移开可取消。"
        : null;
  const emptyStageHint = "在下方输入一个想法，看它分裂为正与反";
  const usesCompactGrowthLayout = isNarrowViewport;
  const stageLayoutMode = usesCompactGrowthLayout ? "compact" : "wide";
  const stageLayoutViewport = stageLayoutMode === "compact" ? stageLayout?.compact : stageLayout;
  const resolvedPan = stageLayoutViewport?.pan || DEFAULT_STAGE_PAN;
  const placements = useMemo(() => ({
    wide: placeSeeds(nodes, stageLayout?.nodePositions),
    compact: placeSeeds(nodes, stageLayout?.compact?.nodePositions, true)
  }), [nodes, stageLayout]);
  useEffect(() => {
    if (nodes.length) ensurePositions(layoutKey, placements.wide, placements.compact);
  }, [layoutKey, nodes.length, placements, ensurePositions]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const hold = touchHoldRef.current;
      if (hold && event.pointerId === hold.pointerId && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 10) cancelTouchHold();
    };
    const cancelPointer = (event: PointerEvent) => { if (touchHoldRef.current?.pointerId === event.pointerId) cancelTouchHold(); };
    const hidden = () => { if (document.hidden) cancelTouchHold(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", cancelPointer);
    window.addEventListener("pointercancel", cancelPointer);
    window.addEventListener("lostpointercapture", cancelPointer);
    window.addEventListener("blur", cancelTouchHold);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancelTouchHold();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", cancelPointer);
      window.removeEventListener("pointercancel", cancelPointer);
      window.removeEventListener("lostpointercapture", cancelPointer);
      window.removeEventListener("blur", cancelTouchHold);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [layoutKey, cancelTouchHold]);

  useEffect(() => {
    if (suspended) { cancelTouchHold(); stopOrbitAnimation(); }
  }, [suspended, cancelTouchHold, stopOrbitAnimation]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const updatePointerMode = () => {
      setIsCoarsePointer(mediaQuery.matches);
    };

    updatePointerMode();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updatePointerMode);
      return () => mediaQuery.removeEventListener("change", updatePointerMode);
    }

    mediaQuery.addListener(updatePointerMode);
    return () => mediaQuery.removeListener(updatePointerMode);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 980px)");
    const updateViewportMode = () => {
      setIsNarrowViewport(mediaQuery.matches);
    };

    updateViewportMode();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateViewportMode);
      return () => mediaQuery.removeEventListener("change", updateViewportMode);
    }

    mediaQuery.addListener(updateViewportMode);
    return () => mediaQuery.removeListener(updateViewportMode);
  }, []);

  const getNodePosition = (node: DialogueStageNode): StagePoint => {
    const defaultPosition = usesCompactGrowthLayout && node.compactSeedX !== undefined && node.compactSeedY !== undefined
      ? { x: node.compactSeedX, y: node.compactSeedY }
      : { x: node.seedX, y: node.seedY };

    return clampNodePosition(
      { ...(placements[stageLayoutMode][node.id] || defaultPosition), z: placements[stageLayoutMode][node.id]?.z ?? node.seedZ },
      node.isGrowthPerspective ? GROWTH_NODE_MAX_Y_PERCENT : NODE_MAX_Y_PERCENT
    );
  };

  const positionedNodes = useMemo(() => nodes.map((node) => {
    const defaultPosition = usesCompactGrowthLayout && node.compactSeedX !== undefined && node.compactSeedY !== undefined
      ? { x: node.compactSeedX, y: node.compactSeedY }
      : { x: node.seedX, y: node.seedY };
    return {
      node,
      position: clampNodePosition(
        { ...(placements[stageLayoutMode][node.id] || defaultPosition), z: placements[stageLayoutMode][node.id]?.z ?? node.seedZ },
        node.isGrowthPerspective ? GROWTH_NODE_MAX_Y_PERCENT : NODE_MAX_Y_PERCENT
      )
    };
  }), [nodes, placements, stageLayoutMode, usesCompactGrowthLayout]);

  const measureLabels = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const labels: Record<string, { width: number; height: number; anchorOffsetY: number; surfaceRadius: number }> = {};
    for (const [id, button] of Object.entries(nodeRefs.current)) {
      const inner = button?.querySelector("[data-seed-caption]");
      if (inner instanceof HTMLElement) {
        const widths = Array.from(inner.querySelectorAll("strong, small, em")).map(text => {
          const range = document.createRange();
          range.selectNodeContents(text);
          return Math.min((text as HTMLElement).offsetWidth, range.getBoundingClientRect?.().width || 0);
        });
        labels[id] = { width: Math.min(inner.offsetWidth, Math.max(48, widths.reduce((sum,width)=>sum+width,0)) + 16),
          height: inner.offsetHeight, anchorOffsetY: (button?.offsetHeight || 0)/2+10+inner.offsetHeight/2,
          surfaceRadius: Math.max(button?.offsetWidth || 0, button?.offsetHeight || 0) / 2 };
      }
    }
    const bounds = viewport.getBoundingClientRect(), insets = { top: 0, bottom: 0 };
    for (const chrome of viewport.closest('[data-testid="dialogue-shell"]')?.querySelectorAll<HTMLElement>("[data-stage-label-chrome]") || []) {
      const rect = chrome.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (chrome.dataset.stageLabelChrome === "top") insets.top = Math.max(insets.top, rect.bottom - bounds.top);
      if (chrome.dataset.stageLabelChrome === "bottom") insets.bottom = Math.max(insets.bottom, bounds.bottom - rect.top);
    }
    const next = { width: viewport.clientWidth, height: viewport.clientHeight, labels, insets };
    setLabelGeometry(current => current.width === next.width && current.height === next.height &&
      current.insets.top === insets.top && current.insets.bottom === insets.bottom &&
      Object.keys(current.labels).length === Object.keys(labels).length &&
      Object.entries(labels).every(([id, size]) => current.labels[id]?.width === size.width && current.labels[id]?.height === size.height && current.labels[id]?.anchorOffsetY === size.anchorOffsetY && current.labels[id]?.surfaceRadius === size.surfaceRadius)
      ? current : next);
  }, []);

  useEffect(measureLabels, [measureLabels, nodes, stageLayoutMode]);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measureLabels) : null;
    observer?.observe(viewport);
    const shell = viewport.closest('[data-testid="dialogue-shell"]');
    const watched = new Set<Element>();
    const refreshChrome = () => {
      const current = new Set(shell?.querySelectorAll("[data-stage-label-chrome]") || []);
      for (const element of watched) if (!current.has(element)) { observer?.unobserve(element); watched.delete(element); }
      for (const element of current) if (!watched.has(element)) { observer?.observe(element); watched.add(element); }
      measureLabels();
    };
    const mutation = new MutationObserver(records => {
      if (records.some(record => (record.target as Element).closest?.("[data-stage-label-chrome]") ||
        [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element &&
          (node.matches("[data-stage-label-chrome]") || node.querySelector("[data-stage-label-chrome]"))))) refreshChrome();
    });
    if (shell) mutation.observe(shell, { childList: true, subtree: true });
    refreshChrome();
    return () => { observer?.disconnect(); mutation.disconnect(); };
  }, [measureLabels]);

  const labelOffsets = useMemo(() => metaballRendererState === "ready" ? {} : layoutSeedLabels(positionedNodes.flatMap(({ node, position }) => {
    const size = labelGeometry.labels[node.id];
    return size ? [{ id: node.id, ...size,
      x: position.x * labelGeometry.width / 100,
      y: position.y * labelGeometry.height / 100 + size.anchorOffsetY }] : [];
  }), labelGeometry.width, labelGeometry.height, positionedNodes.flatMap(({ node, position }) => {
    const size = labelGeometry.labels[node.id];
    return size ? [{ x: position.x * labelGeometry.width / 100,
      y: position.y * labelGeometry.height / 100, radius: size.surfaceRadius }] : [];
  }), labelGeometry.insets), [positionedNodes, labelGeometry, metaballRendererState]);

  const getGestureGeometry = useCallback((draggedId: string, viewport: { width: number; height: number }) => {
    const frame = trackRef.current && readSpatialFrame(trackRef.current);
    if (frame && frame.height) {
      const radii: Record<string, number> = {};
      const currentNodes = positionedNodes.map(item => {
        const projected = frame.rendered.find(node => node.id === item.node.id);
        if (!projected) return item;
        radii[item.node.id] = projected.radius * frame.height * (item.node.id === draggedId ? .9 : 1);
        return { ...item, position: { x: ((projected.center[0] - frame.pivot[0]) * frame.height / viewport.width + .5) * 100,
          y: (.5 - (projected.center[1] - frame.pivot[1]) * frame.height / viewport.height) * 100 } };
      });
      return { nodes: currentNodes, radii };
    }
    const track = trackRef.current?.getBoundingClientRect();
    const radii: Record<string, number> = {};
    const currentNodes = positionedNodes.map(item => {
      const rect = nodeRefs.current[item.node.id]?.getBoundingClientRect();
      radii[item.node.id] = (rect?.width && rect.height ? Math.max(rect.width,rect.height)/2
        : Math.min(viewport.width,viewport.height)*.1) * (item.node.id === draggedId ? .9 : 1);
      return rect?.width && rect.height && track?.width && track.height && item.node.id !== draggedId
        ? { ...item, position: { x: (rect.left+rect.width/2-track.left)/track.width*100,
          y: (rect.top+rect.height/2-track.top)/track.height*100 } } : item;
    });
    return { nodes: currentNodes, radii };
  }, [positionedNodes]);

  const setOrbitPreview = useCallback((orbit: SeedOrbit) => {
    orbitRef.current = orbit;
    const track = trackRef.current;
    if (!track) return;
    track.dataset.spaceYaw = String(orbit.yaw);
    track.dataset.spacePitch = String(orbit.pitch);
  }, []);

  const resetView = useCallback(() => {
    stopOrbitAnimation();
    setOrbitPreview(DEFAULT_SEED_ORBIT);
    setViewRotated(false);
  }, [setOrbitPreview, stopOrbitAnimation]);

  useEffect(() => {
    if (!cameraView || metaballRendererState === "fallback" || trackRef.current?.dataset.spacePaused === "true") return;
    stopOrbitAnimation();
    const start = { ...orbitRef.current }, target = SEED_VIEWS[cameraView.direction];
    const delta = wrapSeedYaw(target.yaw - start.yaw);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const began = performance.now();
    const step = (now: number) => {
      const t = reduced ? 1 : Math.min(1, (now - began) / 200), eased = 1 - (1 - t) ** 3;
      setOrbitPreview({ yaw: wrapSeedYaw(start.yaw + delta * eased), pitch: start.pitch + (target.pitch - start.pitch) * eased });
      if (t < 1) orbitAnimationRef.current = requestAnimationFrame(step);
      else { orbitAnimationRef.current = 0; setViewRotated(Math.abs(target.yaw) + Math.abs(target.pitch) > .001); }
    };
    orbitAnimationRef.current = requestAnimationFrame(step);
    return stopOrbitAnimation;
  }, [cameraView, metaballRendererState, setOrbitPreview, stopOrbitAnimation]);

  useEffect(() => {
    if (metaballRendererState === "fallback") resetView();
  }, [metaballRendererState, resetView]);

  const getScreenNodePosition = (node: DialogueStageNode): StagePoint => {
    const rect = nodeRefs.current[node.id]?.getBoundingClientRect();
    const track = trackRef.current?.getBoundingClientRect();
    return rect?.width && rect.height && track?.width && track.height
      ? { x: (rect.left+rect.width/2-track.left)/track.width*100,
        y: (rect.top+rect.height/2-track.top)/track.height*100 } : getNodePosition(node);
  };

  const setNodeDragPreview = useCallback((nodeId: string, offsetX: number, offsetY: number, depth?: number) => {
    const node = nodeRefs.current[nodeId];
    if (!node) {
      return;
    }

    node.style.setProperty("--stage-node-drag-x", `${offsetX}px`);
    node.style.setProperty("--stage-node-drag-y", `${offsetY}px`);
    if (depth !== undefined) node.dataset.spaceDepth = String(depth);
  }, []);

  const clearNodeDragPreview = useCallback((nodeId: string) => {
    setNodeDragPreview(nodeId, 0, 0);
  }, [setNodeDragPreview]);

  useEffect(() => {
    Object.keys(nodeRefs.current).forEach(clearNodeDragPreview);
    setGesture(null);
    resetView();
    didDragRef.current = false;
    suppressClickUntilRef.current = 0;
    suppressDragClickRef.current = false;
    activePointerTargetRef.current = null;
    setSynthesisCandidateId(null);
    setAttractionPartnerId(null);
    contactRef.current = null;
    resetArm();
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
  }, [clearNodeDragPreview, layoutKey, resetArm, resetView]);

  useEffect(() => {
    if (!gesture) {
      return;
    }

    let finished = false;
    const gestureRect = viewportRef.current?.getBoundingClientRect();
    const initialFrame = trackRef.current && readSpatialFrame(trackRef.current);
    const renderHeight = initialFrame?.height || viewportRef.current?.parentElement?.getBoundingClientRect().height || gestureRect?.height || 1;
    const sceneScale = initialFrame?.scale || 1;
    const dragPosition = (clientX: number, clientY: number) => {
      if (gesture.kind !== "node" || !gestureRect?.width || !gestureRect.height) return null;
      const start = gesture.startScreenPosition || gesture.startPosition;
      const screen = { x: start.x + (clientX - gesture.startClientX) / gestureRect.width * 100,
        y: start.y + (clientY - gesture.startClientY) / gestureRect.height * 100 };
      const draggedNode = nodes.find(node => node.id === gesture.nodeId);
      const position = clampNodePosition(dragSpatialStagePoint(screen, gesture.startPosition, gesture.nodeId, orbitRef.current,
        gestureRect, renderHeight, gesture.startViewDepth, sceneScale), draggedNode?.isGrowthPerspective ? GROWTH_NODE_MAX_Y_PERCENT : NODE_MAX_Y_PERCENT);
      return { position, screen: spatialStagePoint(position, gesture.nodeId, orbitRef.current, gestureRect, renderHeight, false, sceneScale) };
    };
    const eligibleAt = (screen: StagePoint, counterpartId: string) => {
      if (gesture.kind !== "node" || !trackRef.current || !gestureRect) return true;
      const frame = readSpatialFrame(trackRef.current);
      if (!frame) return true;
      const source = frame.base.find(node => node.id === gesture.nodeId), partner = frame.base.find(node => node.id === counterpartId);
      if (!source || !partner) return false;
      return canCaptureSpatialPair({ ...source, center: [frame.pivot[0] + (screen.x / 100 - .5) * gestureRect.width / frame.height,
        frame.pivot[1] + (.5 - screen.y / 100) * gestureRect.height / frame.height],
        ...(gesture.startViewDepth !== undefined ? { depth: gesture.startViewDepth * SEED_CAMERA_DISTANCE / SEED_WORLD_CAMERA_DISTANCE * frame.scale } : {}) }, partner);
    };
    const contactNow = (counterpartId: string) => {
      if (gesture.kind !== "node" || !trackRef.current) return true;
      const frame = readSpatialFrame(trackRef.current);
      if (!frame) return true;
      const source = frame.rendered.find(node => node.id === gesture.nodeId), partner = frame.rendered.find(node => node.id === counterpartId);
      const touching = !!source && !!partner && spatialPairInContact(source, partner, physicalContactRef.current === counterpartId);
      physicalContactRef.current = touching ? counterpartId : null;
      return touching;
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (finished || event.pointerId !== gesture.pointerId || trackRef.current?.dataset.spacePaused === "true") {
        return;
      }

      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }

      const rect = gestureRect;
      if (!rect?.width || !rect.height) {
        return;
      }

      if (gesture.kind === "node") {
        if (Math.abs(event.clientX - gesture.startClientX) > 4 || Math.abs(event.clientY - gesture.startClientY) > 4) {
          if (!didDragRef.current) {
            actionsRef.current.onInteractionStart?.();
            if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
          }
          didDragRef.current = true;
        }
        const next = dragPosition(event.clientX, event.clientY);
        if (!next) return;
        const nextPosition = next.position;
        setNodeDragPreview(
          gesture.nodeId,
          (nextPosition.x - gesture.startPosition.x) / 100 * rect.width,
          (nextPosition.y - gesture.startPosition.y) / 100 * rect.height,
          nextPosition.z
        );
        const geometry = getGestureGeometry(gesture.nodeId,rect);
        const candidateInput = {
          draggedNodeId: gesture.nodeId,
          draggedPosition: next.screen,
          ...geometry,
          action: synthesisAction,
          resolveAction: resolveSynthesisAction,
          viewport: rect,
          retainedCounterpartId: contactRef.current,
          isEligible: (id: string) => eligibleAt(next.screen, id)
        };
        const candidate = actionsRef.current.generationBusy ? null : findSynthesisGestureCandidate(candidateInput);
        const approach = actionsRef.current.generationBusy ? null : findSynthesisGestureCandidate({ ...candidateInput, phase: "approach", retainedCounterpartId: candidate?.counterpartNodeId });
        setAttractionPartnerId(approach?.counterpartNodeId || null);
        contactRef.current = candidate?.counterpartNodeId || null;
        const counterpart = candidate && geometry.nodes.find(({ node }) => node.id === candidate.counterpartNodeId);
        if (counterpart) {
          const midpoint = {
            x: (next.screen.x + counterpart.position.x) / 2,
            y: (next.screen.y + counterpart.position.y) / 2
          };
          synthesisLabelPositionRef.current = midpoint;
          const size = Math.max(nodeRefs.current[gesture.nodeId]?.offsetHeight || 0,
            nodeRefs.current[counterpart.node.id]?.offsetHeight || 0);
          synthesisLabelOffsetRef.current = size/2+18;
          if (synthesisLabelRef.current) {
            synthesisLabelRef.current.style.left = `${midpoint.x}%`;
            synthesisLabelRef.current.style.top = `${midpoint.y}%`;
            synthesisLabelRef.current.style.setProperty("--pair-caption-offset", `${synthesisLabelOffsetRef.current}px`);
          }
        }
        setSynthesisCandidateId(candidate?.counterpartNodeId || null);
        if (!candidate || !didDragRef.current) resetArm();
        else if (armRef.current?.key !== candidate.action.key) {
          resetArm();
          const arm = { key: candidate.action.key, ready: false, timer: 0 };
          let contactAt: number | null = null;
          const check = () => {
            if (armRef.current !== arm || actionsRef.current.generationBusy) return;
            const now = Date.now();
            if (!contactNow(candidate.counterpartNodeId)) {
              contactAt = null;
              if (arm.ready) { arm.ready = false; setSynthesisArmed(false); }
            }
            else if (contactAt === null) contactAt = now;
            const remaining = contactAt === null ? LIQUID_DWELL_MS : LIQUID_DWELL_MS - (now - contactAt);
            const progress=dwellProgressRef.current,contact=contactAt===null?"false":"true";
            if (progress && progress.dataset.contact!==contact) {
              if (contact==="true") progress.style.setProperty("--liquid-dwell-duration",`${Math.max(1,remaining)}ms`);
              progress.dataset.contact=contact;
            }
            if (remaining <= 0 && !arm.ready) { arm.ready = true; setSynthesisArmed(true); }
            // Keep checking after arming: pulling apart invalidates the dwell,
            // so reconnecting cannot submit using an old completed hold.
            arm.timer = window.setTimeout(check, remaining > 0 ? Math.min(32, remaining) : 32);
          };
          armRef.current = arm;
          check();
        }
        return;
      }

      const dx = event.clientX - gesture.startClientX, dy = event.clientY - gesture.startClientY;
      // Vertical touch gestures remain native page scrolling.
      if (gesture.pointerType === "touch" && !didDragRef.current && (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.15)) return;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        didDragRef.current = true;
      }
      if (didDragRef.current) setOrbitPreview(orbitSeedSpace(gesture.startOrbit, dx, dy));
    };

    const finishPointer = (event: PointerEvent, cancelled: boolean) => {
      if (finished || event.pointerId !== gesture.pointerId) {
        return;
      }
      // Releasing capture can synchronously notify another gesture listener.
      finished = true;
      // A queued release must never submit a fusion underneath the overview.
      if (trackRef.current?.dataset.spacePaused === "true") cancelled = gesture.kind === "node";

      if (gesture.kind === "node") {
        const viewport = viewportRef.current;
        const rect = viewport?.getBoundingClientRect();
        const next = !cancelled ? dragPosition(event.clientX, event.clientY) : null;
        const nextPosition = next?.position || gesture.startPosition;

        if (!cancelled) {
          if (didDragRef.current) setStageNodePosition(layoutKey, gesture.nodeId, nextPosition, stageLayoutMode);
          const candidate = rect?.width && rect.height
            ? findSynthesisGestureCandidate({
                draggedNodeId: gesture.nodeId,
                draggedPosition: next?.screen || nextPosition,
                ...getGestureGeometry(gesture.nodeId,rect),
                action: synthesisAction,
                resolveAction: resolveSynthesisAction,
                viewport: rect,
                retainedCounterpartId: contactRef.current,
                isEligible: (id: string) => eligibleAt(next?.screen || nextPosition, id)
              })
            : null;
          if (didDragRef.current && candidate && armRef.current?.ready &&
            armRef.current.key === candidate.action.key && contactNow(candidate.counterpartNodeId) && !actionsRef.current.generationBusy) {
            actionsRef.current.onProposeSynthesis?.(candidate.action);
          }
        }
        if (cancelled) {
          const element = nodeRefs.current[gesture.nodeId];
          if (element) { if (gesture.startPosition.z !== undefined) element.dataset.spaceDepth = String(gesture.startPosition.z); else delete element.dataset.spaceDepth; }
        }
        clearNodeDragPreview(gesture.nodeId);
      } else {
        if (cancelled) setOrbitPreview(gesture.startOrbit);
        setViewRotated(Math.abs(orbitRef.current.yaw) + Math.abs(orbitRef.current.pitch) > .001);
      }

      if (didDragRef.current) {
        suppressClickUntilRef.current = performance.now() + 180;
        suppressDragClickRef.current = true;
      }

      if (
        activePointerTargetRef.current &&
        typeof activePointerTargetRef.current.releasePointerCapture === "function" &&
        activePointerTargetRef.current.hasPointerCapture?.(gesture.pointerId)
      ) {
        activePointerTargetRef.current.releasePointerCapture(gesture.pointerId);
      }

      activePointerTargetRef.current = null;
      didDragRef.current = false;
      setSynthesisCandidateId(null);
      setAttractionPartnerId(null);
      contactRef.current = null;
      resetArm();
      setGesture(null);
    };

    const handlePointerUp = (event: PointerEvent) => finishPointer(event, false);
    const handlePointerCancel = (event: PointerEvent) => finishPointer(event, true);
    const handleCaptureLoss = (event: PointerEvent) => finishPointer(event, gesture.kind === "node");
    const cancelGesture = () => finishPointer({ pointerId: gesture.pointerId } as PointerEvent, true);
    const suspendGesture = () => finishPointer({ pointerId: gesture.pointerId } as PointerEvent, gesture.kind === "node");
    const hidden = () => { if (document.hidden) suspendGesture(); };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); cancelGesture(); }
    };

    if (suspended) {
      suspendGesture();
      return;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("lostpointercapture", handleCaptureLoss);
    window.addEventListener("blur", suspendGesture);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (gesture.kind === "node") {
        clearNodeDragPreview(gesture.nodeId);
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("lostpointercapture", handleCaptureLoss);
      window.removeEventListener("blur", suspendGesture);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("keydown", handleKeyDown);
      resetArm();
    };
  }, [
    clearNodeDragPreview,
    gesture,
    layoutKey,
    nodes,
    setNodeDragPreview,
    setStageNodePosition,
    setOrbitPreview,
    stageLayoutMode,
    synthesisAction,
    resolveSynthesisAction,
    getGestureGeometry,
    resetArm,
    positionedNodes,
    suspended
  ]);

  const handleStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (suspended || gesture || touchHoldRef.current || !canPanStage || metaballRendererState === "fallback" || event.button !== 0 || event.target !== event.currentTarget) {
      return;
    }
    if (event.pointerType !== "touch") event.preventDefault();
    stopOrbitAnimation();
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    activePointerTargetRef.current = event.currentTarget;
    didDragRef.current = false;
    setGesture({
      kind: "orbit",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOrbit: orbitRef.current,
      pointerType: event.pointerType
    });
  };

  const handleNodePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, node: DialogueStageNode) => {
    if (suspended || gesture || touchHoldRef.current) return;
    suppressDragClickRef.current = false;
    pointerTypeRef.current = event.pointerType;
    if (event.button !== 0) {
      return;
    }
    stopOrbitAnimation();
    const frame = trackRef.current && readSpatialFrame(trackRef.current);
    // Collision avoidance is a temporary visual offset. Using it as the drag
    // plane would permanently move a copy away from its concept's real depth.
    const actualDepth = frame?.base.find(item => item.id === node.id)?.depth;
    const startViewDepth = actualDepth === undefined ? undefined : actualDepth / (frame?.scale || 1) * SEED_WORLD_CAMERA_DISTANCE / SEED_CAMERA_DISTANCE;
    if (event.pointerType === "touch") {
      const target = event.currentTarget;
      const { pointerId, clientX, clientY } = event;
      const remaining = liquidHoldRemaining(event.timeStamp, performance.now());
      setHoldingTouch({ nodeId: node.id, duration: remaining });
      const hold = { pointerId, x: clientX, y: clientY, timer: 0 };
      hold.timer = window.setTimeout(() => {
        if (touchHoldRef.current !== hold) return;
        touchHoldRef.current = null;
        setHoldingTouch(null);
        if (!target.isConnected || trackRef.current?.dataset.spacePaused === "true") return;
        target.setPointerCapture?.(pointerId);
        activePointerTargetRef.current = target;
        didDragRef.current = false;
        setGesture({ kind: "node", pointerId, nodeId: node.id,
          startClientX: clientX, startClientY: clientY, startPosition: getNodePosition(node),
          startScreenPosition: getScreenNodePosition(node), startViewDepth });
      }, remaining);
      touchHoldRef.current = hold;
      return;
    }
    event.preventDefault();
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    activePointerTargetRef.current = event.currentTarget;
    didDragRef.current = false;
    setGesture({
      kind: "node",
      pointerId: event.pointerId,
      nodeId: node.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: getNodePosition(node),
      startScreenPosition: getScreenNodePosition(node), startViewDepth
    });
  };

  const handleNodeClick = (node: DialogueStageNode, detail: number) => {
    if (suppressDragClickRef.current) {
      suppressDragClickRef.current = false;
      return;
    }
    if (performance.now() < suppressClickUntilRef.current) {
      return;
    }

    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    if (detail > 1) return;
    const select = () => { actionsRef.current.onSelect(node.id); actionsRef.current.onPrimaryAction?.(node.id); };
    if (onSplit && detail > 0 && pointerTypeRef.current !== "touch") {
      clickTimerRef.current = window.setTimeout(select, 260);
    } else select();
  };

  const focusStageNode = positionedNodes.find(({ node }) => node.relation === "focus") || null;
  const synthesisLabelNodes = gesture?.kind === "node" && synthesisCandidateId
    ? [nodes.find(node => node.id === gesture.nodeId), nodes.find(node => node.id === synthesisCandidateId)]
      .filter((node): node is DialogueStageNode => Boolean(node))
    : [];
  const pendingAnchor = pendingPreview?.kind === "branches"
    ? positionedNodes.find(({ node }) => node.id === pendingPreview.anchorNodeId) || focusStageNode
    : null;
  const pendingAnchorPosition = pendingAnchor?.position || { x: 50, y: 42 };
  const pendingBranchNodes = pendingPreview?.kind === "branches"
    ? {
        thesis: clampNodePosition(pendingPreview.polarityAxis?.placement === "y" ? { x: 42, y: 72 }
          : pendingPreview.polarityAxis?.placement === "z" ? { x: 42, y: 54, z: -.46 }
            : { x: pendingAnchorPosition.x - 20, y: pendingAnchorPosition.y + 28 }),
        antithesis: clampNodePosition(pendingPreview.polarityAxis?.placement === "y" ? { x: 58, y: 28 }
          : pendingPreview.polarityAxis?.placement === "z" ? { x: 58, y: 46, z: .46 }
            : { x: pendingAnchorPosition.x + 20, y: pendingAnchorPosition.y + 28 }),
        axis: pendingPreview.polarityAxis,
        anchor: pendingAnchorPosition,
        prompt: pendingPreview.prompt.trim() || "新的想法"
      }
    : null;
  const pendingSynthesisSources = pendingPreview?.kind === "synthesis"
    ? {
        thesis: positionedNodes.find(({ node }) => node.id === pendingPreview.thesisId) || null,
        antithesis: positionedNodes.find(({ node }) => node.id === pendingPreview.antithesisId) || null,
        label: pendingPreview.label
      }
    : null;
  const pendingSynthesisMark = pendingSynthesisSources?.thesis && pendingSynthesisSources.antithesis
    ? {
        thesis: pendingSynthesisSources.thesis,
        antithesis: pendingSynthesisSources.antithesis,
        label: pendingSynthesisSources.label,
        center: {
          x: (pendingSynthesisSources.thesis.position.x + pendingSynthesisSources.antithesis.position.x) / 2,
          y: (pendingSynthesisSources.thesis.position.y + pendingSynthesisSources.antithesis.position.y) / 2
        }
      }
    : null;
  const spaceControls = nodes.length > 0 && metaballRendererState !== "fallback" ? (
    <div className={styles.spaceControls}>
      <span>拖动空白，转动视角</span>
      <button type="button" onClick={resetView} disabled={!viewRotated} aria-label="复位三维视角">复位视角</button>
    </div>
  ) : null;
  return (
    <section
      className={styles.stagePanel}
      aria-labelledby="dialogue-stage-heading"
      data-testid="dialogue-stage"
      data-suspended={suspended ? "true" : undefined}
      aria-hidden={suspended || undefined}
      inert={suspended ? true : undefined}
      data-stage-density={nodes.length > 4 ? "dense" : "spacious"}
      data-layout={hasGrowthPerspectives ? "growth" : undefined}
      data-growth-compact-rows={hasGrowthPerspectives ? growthCompactRows : undefined}
      data-growth-density={growthChildCount >= 5 ? "dense" : undefined}
      style={{ "--growth-stage-min-height": growthStageMinHeight } as CSSProperties}
    >
      <div className={styles.stageHeader}>
        <p className={styles.eyebrow}>舞台</p>
        <h2 id="dialogue-stage-heading">当前结构</h2>
      </div>
      <div className={styles.stageCanvas}>
        <DialogueMetaballLayer hostRef={trackRef} onStateChange={setMetaballRendererState} />
        <div className={styles.stageGlow} />
        <div className={styles.stageGlowSecondary} />
        <div
          ref={viewportRef}
          className={[
            styles.stageViewport,
            gesture?.kind === "orbit" ? styles.stageViewportPanning : ""
          ].join(" ")}
          data-testid="dialogue-stage-viewport"
        >
          {relationshipHint ? (
            <p className={styles.stageRelationshipHint} data-testid="dialogue-stage-hint">
              {relationshipHint}
            </p>
          ) : null}
          <div
            ref={trackRef}
            data-space-paused={suspended ? "true" : undefined}
            data-atmosphere={atmosphereVisible ? "true" : "false"}
            data-theme={theme}
            data-space={metaballRendererState === "fallback" ? "flat" : "3d"}
            data-space-yaw="0"
            data-space-pitch="0"
            data-liquid-partner={attractionPartnerId || undefined}
            data-liquid-contact={synthesisCandidateId || undefined}
            data-label-inset-top={labelGeometry.insets.top}
            data-label-inset-bottom={labelGeometry.insets.bottom}
            className={[
              styles.stageTrack,
              canPanStage ? styles.stageTrackInteractive : "",
              gesture?.kind === "orbit" ? styles.stageTrackPanning : ""
            ].join(" ")}
            style={
              {
                "--stage-pan-x": `${resolvedPan.x}px`,
                "--stage-pan-y": `${resolvedPan.y}px`,
                "--liquid-hold-duration": `${LIQUID_HOLD_MS}ms`,
                "--liquid-dwell-duration": `${LIQUID_DWELL_MS}ms`
              } as CSSProperties
            }
            onPointerDown={handleStagePointerDown}
            tabIndex={nodes.length ? 0 : undefined}
            aria-label={nodes.length ? "三维种子舞台：拖动空白或用方向键转动视角，Home 复位" : undefined}
            onKeyDown={event => {
              if (event.key === "Enter" || event.key === " ") suppressDragClickRef.current = false;
              if (event.target !== event.currentTarget || !nodes.length || metaballRendererState === "fallback") return;
              if (gesture && /^(Home|ArrowLeft|ArrowRight|ArrowUp|ArrowDown)$/.test(event.key)) {
                event.preventDefault(); return;
              }
              if (event.key === "Home") { event.preventDefault(); resetView(); return; }
              const shifts: Record<string, [number, number]> = { ArrowLeft: [-24,0], ArrowRight: [24,0], ArrowUp: [0,-24], ArrowDown: [0,24] };
              const shift = shifts[event.key];
              if (!shift) return;
              event.preventDefault();
              stopOrbitAnimation();
              setOrbitPreview(orbitSeedSpace(orbitRef.current, ...shift));
              setViewRotated(true);
            }}
            data-testid="dialogue-stage-track"
            data-metaball-renderer={metaballRendererState}
          >
            {pendingBranchNodes ? (
              <div
                className={styles.stagePendingLayer}
                data-testid="dialogue-stage-pending-branches"
                aria-hidden="true"
              >
                {!nodes.length ? (
                  <div
                    className={[styles.stagePendingGhost, styles.stagePendingRoot].join(" ")}
                    style={{ left: `${pendingBranchNodes.anchor.x}%`, top: `${pendingBranchNodes.anchor.y}%` }}
                    data-testid="dialogue-stage-pending-root"
                    data-metaball-surface="empty-root"
                    data-metaball-role="user"
                    data-metaball-relation="focus"
                    data-liquid-color-key={pendingBranchNodes.prompt}
                    aria-hidden="true"
                  >
                    <strong>{pendingBranchNodes.prompt}</strong>
                    <small>想法</small>
                  </div>
                ) : null}
                <div
                  className={[styles.stagePendingGhost, styles.stagePendingThesis].join(" ")}
                  style={{ left: `${pendingBranchNodes.thesis.x}%`, top: `${pendingBranchNodes.thesis.y}%` }}
                  data-testid="dialogue-stage-pending-thesis"
                  data-metaball-surface="pending-thesis"
                  data-liquid-origins={pendingAnchor?.node.id ? JSON.stringify([pendingAnchor.node.id]) : undefined}
                  data-metaball-role={pendingBranchNodes.axis ? "neutral" : "thesis"}
                  data-space-depth={pendingBranchNodes.thesis.z}
                  data-metaball-relation="child"
                  data-liquid-color-key={pendingBranchNodes.prompt}
                  aria-hidden="true"
                >
                  <strong>{pendingBranchNodes.axis?.negative || "正"}</strong>
                  <small>正在生成</small>
                </div>
                <div
                  className={[styles.stagePendingGhost, styles.stagePendingAntithesis].join(" ")}
                  style={{ left: `${pendingBranchNodes.antithesis.x}%`, top: `${pendingBranchNodes.antithesis.y}%` }}
                  data-testid="dialogue-stage-pending-antithesis"
                  data-metaball-surface="pending-antithesis"
                  data-liquid-origins={pendingAnchor?.node.id ? JSON.stringify([pendingAnchor.node.id]) : undefined}
                  data-metaball-role={pendingBranchNodes.axis ? "neutral" : "antithesis"}
                  data-space-depth={pendingBranchNodes.antithesis.z}
                  data-metaball-relation="child"
                  data-liquid-color-key={pendingBranchNodes.prompt}
                  aria-hidden="true"
                >
                  <strong>{pendingBranchNodes.axis?.positive || "反"}</strong>
                  <small>正在生成</small>
                </div>
                <p className={styles.stagePendingCaption}>{pendingBranchNodes.axis
                  ? `正在沿「${pendingBranchNodes.axis.label}」探索两端。`
                  : "正在深化主张、质疑前提，正与反会在这里落位。"}</p>
              </div>
            ) : null}
            {pendingSynthesisMark ? (
              <div
                className={styles.stagePendingLayer}
                data-testid="dialogue-stage-pending-synthesis"
                aria-hidden="true"
              >
                <div
                  className={[styles.stagePendingGhost, styles.stagePendingSynthesis].join(" ")}
                  style={{ left: `${pendingSynthesisMark.center.x}%`, top: `${pendingSynthesisMark.center.y}%` }}
                  data-testid="dialogue-stage-pending-synthesis-node"
                  data-metaball-surface="pending-synthesis"
                  data-liquid-origins={JSON.stringify([pendingSynthesisMark.thesis.node.id, pendingSynthesisMark.antithesis.node.id])}
                  data-metaball-role="synthesis"
                  data-metaball-relation="decorative"
                  data-liquid-color-key={pendingSynthesisMark.label}
                  aria-hidden="true"
                >
                  <strong>合</strong>
                  <small>合流中</small>
                </div>
                <p className={styles.stagePendingCaption}>正在收束「{pendingSynthesisMark.label}」。</p>
              </div>
            ) : null}
            {synthesisCandidateId ? (
              <>
              <div ref={synthesisLabelRef} className={styles.synthesisPairLabel} aria-hidden="true" data-seed-caption
                data-testid="dialogue-synthesis-pair-label"
                style={{ left: `${synthesisLabelPositionRef.current.x}%`, top: `${synthesisLabelPositionRef.current.y}%`,
                  "--pair-caption-offset": `${synthesisLabelOffsetRef.current}px` } as CSSProperties}>
                {synthesisLabelNodes.map(node => <span key={node.id}>
                  <small>{polarityLabel(node.polarity) || node.branchType || "想法"}</small><strong>{node.label}</strong>
                </span>)}
              </div>
              <p
                className={styles.synthesisBridgePreview}
                role="status"
                aria-live="polite"
                data-testid="dialogue-synthesis-bridge-preview"
                data-stage-label-chrome="bottom"
                data-armed={synthesisArmed ? "true" : "false"}
              >
                <span key={synthesisCandidateId} ref={dwellProgressRef} className={styles.synthesisDwellProgress} data-contact="false" data-testid="dialogue-physical-dwell" aria-hidden="true"><span /></span>
                {synthesisArmed ? "松手合成 · 移开取消" : "稍停，准备合成…"}
              </p>
              </>
            ) : null}
            {!nodes.length && !pendingBranchNodes ? (
              <>
                <button type="button" className={styles.emptyStagePrompt}
                  aria-label="点此输入一个想法" data-testid="dialogue-empty-stage-hint"
                  onClick={() => onPrimaryAction?.(null)}>{emptyStageHint}</button>
                {emptyAction ? (
                  <button
                    type="button"
                    className={styles.emptyStageAction}
                    onClick={emptyAction.onTrigger}
                  >
                    {emptyAction.label}
                  </button>
                ) : null}
              </>
            ) : null}
            {positionedNodes.map(({ node, position }) => {
              const isDragging = gesture?.kind === "node" && gesture.nodeId === node.id;
              const polarity = seedColorPolarity(node.perspective);
              const pole = polarityLabel(node.polarity);
              const attended = node.id === focusNodeId || !attentionIds?.length || attentionIds.includes(node.id) || isDragging ||
                node.id === attractionPartnerId || node.id === synthesisCandidateId;
              const label = node.kind === "user" && node.preview && node.preview.length > node.label.length && node.preview.startsWith(node.label)
                ? `${node.label}…` : node.label;
              const origins = node.id === arrivals?.firstId ? ["pending-thesis", arrivals.sourceId]
                : node.id === arrivals?.secondId ? ["pending-antithesis", arrivals.sourceId]
                  : node.id === eventNodeId ? ["pending-synthesis", ...nodes.filter(source => source.sourceRole === "source").map(source => source.id), ...(node.originNodeIds || [])]
                    : node.originNodeIds;

              return (
                <button
                  key={node.id}
                  type="button"
                  ref={(element) => {
                    nodeRefs.current[node.id] = element;
                  }}
                  className={[
                    styles.stageNode,
                    node.branchType === "正" ? styles.stageNodeThesis : "",
                    node.branchType === "反" ? styles.stageNodeAntithesis : "",
                    node.branchType === "合" ? styles.stageNodeSynthesis : "",
                    node.displayRole === "synthesis-record" ? styles.stageNodeSynthesisRecord : "",
                    node.id === eventNodeId ? styles.stageNodeSynthesisEvent : "",
                    node.kind === "user" ? styles.stageNodeUser : "",
                    node.id === focusNodeId ? styles.stageNodeFocused : "",
                    node.relation === "ancestor" ? styles.stageNodeAncestor : "",
                    node.relation === "source" ? styles.stageNodeSource : "",
                    isDragging ? styles.stageNodeDragging : ""
                  ].join(" ")}
                  data-testid={`dialogue-stage-node-${node.id}`}
                  data-event-state={node.id === eventNodeId ? "synthesis-reveal" : undefined}
                  data-display-role={node.displayRole}
                  data-metaball-surface={node.id}
                  data-liquid-origins={origins?.length ? JSON.stringify([...new Set(origins)]) : undefined}
                  data-seed-concept={node.conceptId || node.id}
                  data-seed-instance={node.instanceNumber}
                  data-source-role={node.sourceRole}
                  data-seed-focus={attended ? "related" : "background"}
                  data-seed-attention={reading ? attended ? .65 : .06 : attended ? 1 : .3}
                  data-expansion-kind={pole ? "polarity" : node.branchType === "正" || node.branchType === "反" ? "dialectic" : undefined}
                  data-metaball-role={getMetaballRole(node)}
                  data-metaball-relation={node.relation}
                  data-space-depth={position.z}
                  data-seed-generation={node.generation || 0}
                  data-seed-hue-shift={polarity?.hueShift}
                  data-seed-polarity-strength={polarity?.strength}
                  data-touch-holding={holdingTouch?.nodeId === node.id ? "true" : undefined}
                  data-liquid-color-key={node.preview || node.label}
                  data-label-handoff={synthesisLabelNodes.some(source => source.id === node.id) ||
                    (pendingPreview?.kind === "synthesis" && (pendingPreview.thesisId === node.id || pendingPreview.antithesisId === node.id)) ? "true" : undefined}
                  aria-label={buildStageNodeAriaLabel(node)}
                  style={
                    {
                      left: `${position.x}%`,
                      top: `${position.y}%`,
                      "--stage-node-drag-x": "0px",
                      "--stage-node-drag-y": "0px",
                      "--liquid-hold-duration": holdingTouch?.nodeId === node.id ? `${holdingTouch.duration}ms` : undefined,
                      "--stage-label-offset-x": `${labelOffsets[node.id]?.x || 0}px`,
                      "--stage-label-offset-y": `${labelOffsets[node.id]?.y || 0}px`
                    } as CSSProperties
                  }
                  onClick={(event) => handleNodeClick(node, event.detail)}
                  onDoubleClick={() => {
                    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
                    if (pointerTypeRef.current === "touch" || generationBusy || performance.now() < suppressClickUntilRef.current) return;
                    onSplit?.(node.id);
                  }}
                  onPointerDown={(event) => handleNodePointerDown(event, node)}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  <span className={styles.seedHitArea} aria-hidden="true" />
                  <span className={styles.seedSourceGlow} aria-hidden="true" />
                  <span className={styles.stageNodeInner} data-seed-caption
                    data-polarity-caption={pole ? "true" : undefined}
                    data-source-caption={node.sourceRole === "source" && node.instanceNumber ? "true" : undefined}>
                    <strong>{label}</strong>
                    {node.sourceRole === "source" ? <small>来源{pole || node.branchType ? ` · ${pole || node.branchType}` : ""}</small>
                      : pole || node.branchType ? <small>{pole || node.branchType}</small> : null}
                    {node.instanceNumber ? <em className={styles.seedInstanceMark}>分身 {node.instanceNumber}</em> : null}
                    <span className={styles.stageHoldProgress} aria-hidden="true"><span /></span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {spaceControls && (controlsHost ? createPortal(spaceControls, controlsHost) : spaceControls)}
    </section>
  );
}
