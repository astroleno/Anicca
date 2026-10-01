"use client";

import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useDialogueUiStore } from "@/features/dialectic/store";
import { findSynthesisGestureCandidate } from "@/features/dialectic/gestures";
import { placeSeeds } from "@/features/dialectic/seedPlacement";
import { DialogueStageNode, DialogueSynthesisAction } from "@/features/dialectic/viewModel";
import { StagePan, StagePoint } from "@/types/anicca";
import dynamic from "next/dynamic";
import type { DialogueMetaballRendererState } from "./DialogueMetaballLayer";
import styles from "./DialogueShell.module.css";
import type { MetaballRole } from "./metaball/model";

const DialogueMetaballLayer = dynamic(() => import("./DialogueMetaballLayer").then(module => module.DialogueMetaballLayer), { ssr: false });

type BubbleStageProps = {
  layoutKey: string;
  nodes: DialogueStageNode[];
  focusNodeId: string | null;
  onSelect: (nodeId: string) => void;
  onPrimaryAction?: (nodeId: string | null) => void;
  convergenceEventId?: string | null;
  eventNodeId?: string | null;
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
};

type StagePendingPreview =
  | {
      kind: "branches";
      anchorNodeId: string | null;
      prompt: string;
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
    }
  | {
      kind: "pan";
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startPan: StagePan;
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
    y: clamp(position.y, NODE_MIN_Y_PERCENT, maxY)
  };
}

function buildStageNodeAriaLabel(node: DialogueStageNode) {
  const parts = [node.preview || node.label];
  if (node.branchType) {
    parts.push(`${node.branchType}方`);
  }
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
  pendingPreview = null,
  synthesisAction = null,
  onProposeSynthesis,
  resolveSynthesisAction,
  onSplit,
  onInteractionStart,
  generationBusy = false,
  emptyAction = null
}: BubbleStageProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activePointerTargetRef = useRef<HTMLElement | null>(null);
  const touchHoldRef = useRef<{ timer: number; pointerId: number; x: number; y: number } | null>(null);
  const stageLayout = useDialogueUiStore((state) => state.stageLayouts[layoutKey] || null);
  const setStageNodePosition = useDialogueUiStore((state) => state.setStageNodePosition);
  const setStagePan = useDialogueUiStore((state) => state.setStagePan);
  const ensurePositions = useDialogueUiStore(state => state.ensureStageNodePositions);
  const [gesture, setGesture] = useState<ActiveStageGesture | null>(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const [metaballRendererState, setMetaballRendererState] =
    useState<DialogueMetaballRendererState>("loading");
  const [synthesisCandidateId, setSynthesisCandidateId] = useState<string | null>(null);
  const [synthesisArmed, setSynthesisArmed] = useState(false);
  const armRef = useRef<{ key: string; timer: number; ready: boolean } | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const pointerTypeRef = useRef("mouse");
  const actionsRef = useRef({ onProposeSynthesis, onInteractionStart, generationBusy, onSelect, onPrimaryAction });
  actionsRef.current = { onProposeSynthesis, onInteractionStart, generationBusy, onSelect, onPrimaryAction };
  const resetArm = useCallback(() => {
    if (armRef.current) window.clearTimeout(armRef.current.timer);
    armRef.current = null;
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
  const livePanRef = useRef<StagePan | null>(null);
  const didDragRef = useRef(false);
  const suppressClickUntilRef = useRef(0);
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
  const emptyStageHint = isCoarsePointer
    ? "写下母题，点选节点查看谱系。"
    : "写下母题，让正反开始生成。";
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
    const cancel = () => { if (touchHoldRef.current) window.clearTimeout(touchHoldRef.current.timer); touchHoldRef.current = null; };
    const move = (event: PointerEvent) => {
      const hold = touchHoldRef.current;
      if (hold && event.pointerId === hold.pointerId && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 10) cancel();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", cancel);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    return () => {
      cancel();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", cancel);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
    };
  }, [layoutKey]);

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
      placements[stageLayoutMode][node.id] || defaultPosition,
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
        placements[stageLayoutMode][node.id] || defaultPosition,
        node.isGrowthPerspective ? GROWTH_NODE_MAX_Y_PERCENT : NODE_MAX_Y_PERCENT
      )
    };
  }), [nodes, placements, stageLayoutMode, usesCompactGrowthLayout]);

  const setTrackPanPreview = useCallback((pan: StagePan) => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    track.style.setProperty("--stage-pan-x", `${pan.x}px`);
    track.style.setProperty("--stage-pan-y", `${pan.y}px`);
  }, []);

  const setNodeDragPreview = useCallback((nodeId: string, offsetX: number, offsetY: number) => {
    const node = nodeRefs.current[nodeId];
    if (!node) {
      return;
    }

    node.style.setProperty("--stage-node-drag-x", `${offsetX}px`);
    node.style.setProperty("--stage-node-drag-y", `${offsetY}px`);
  }, []);

  const clearNodeDragPreview = useCallback((nodeId: string) => {
    setNodeDragPreview(nodeId, 0, 0);
  }, [setNodeDragPreview]);

  useEffect(() => {
    Object.keys(nodeRefs.current).forEach(clearNodeDragPreview);
    setGesture(null);
    livePanRef.current = null;
    didDragRef.current = false;
    suppressClickUntilRef.current = 0;
    activePointerTargetRef.current = null;
    setSynthesisCandidateId(null);
    resetArm();
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
  }, [clearNodeDragPreview, layoutKey, resetArm]);

  useEffect(() => {
    if (!gesture) {
      return;
    }

    const gestureRect = viewportRef.current?.getBoundingClientRect();
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== gesture.pointerId) {
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
        const offsetX = event.clientX - gesture.startClientX;
        const offsetY = event.clientY - gesture.startClientY;
        setNodeDragPreview(
          gesture.nodeId,
          offsetX,
          offsetY
        );
        const draggedNode = nodes.find((node) => node.id === gesture.nodeId);
        const nextPosition = clampNodePosition({
          x: gesture.startPosition.x + (offsetX / rect.width) * 100,
          y: gesture.startPosition.y + (offsetY / rect.height) * 100
        }, draggedNode?.isGrowthPerspective ? GROWTH_NODE_MAX_Y_PERCENT : NODE_MAX_Y_PERCENT);
        const candidate = actionsRef.current.generationBusy ? null : findSynthesisGestureCandidate({
          draggedNodeId: gesture.nodeId,
          draggedPosition: nextPosition,
          nodes: positionedNodes,
          action: synthesisAction,
          resolveAction: resolveSynthesisAction,
          viewport: rect
        });
        setSynthesisCandidateId(candidate?.counterpartNodeId || null);
        if (!candidate || !didDragRef.current) resetArm();
        else if (armRef.current?.key !== candidate.action.key) {
          resetArm();
          const arm = { key: candidate.action.key, ready: false, timer: 0 };
          arm.timer = window.setTimeout(() => {
            if (armRef.current !== arm || actionsRef.current.generationBusy) return;
            arm.ready = true;
            setSynthesisArmed(true);
          }, 320);
          armRef.current = arm;
        }
        return;
      }

      if (Math.abs(event.clientX - gesture.startClientX) > 4 || Math.abs(event.clientY - gesture.startClientY) > 4) {
        didDragRef.current = true;
      }
      const maxPanX = rect.width * 0.18;
      const maxPanY = rect.height * 0.18;
      const nextPan = {
        x: clamp(gesture.startPan.x + (event.clientX - gesture.startClientX), -maxPanX, maxPanX),
        y: clamp(gesture.startPan.y + (event.clientY - gesture.startClientY), -maxPanY, maxPanY)
      };
      livePanRef.current = nextPan;
      setTrackPanPreview(nextPan);
    };

    const finishPointer = (event: PointerEvent, cancelled: boolean) => {
      if (event.pointerId !== gesture.pointerId) {
        return;
      }

      if (gesture.kind === "node") {
        clearNodeDragPreview(gesture.nodeId);
        const viewport = viewportRef.current;
        const rect = viewport?.getBoundingClientRect();
        const draggedNode = nodes.find((node) => node.id === gesture.nodeId);
        const nextPosition = rect?.width && rect.height
          ? clampNodePosition({
              x: gesture.startPosition.x + ((event.clientX - gesture.startClientX) / rect.width) * 100,
              y: gesture.startPosition.y + ((event.clientY - gesture.startClientY) / rect.height) * 100
            }, draggedNode?.isGrowthPerspective ? GROWTH_NODE_MAX_Y_PERCENT : NODE_MAX_Y_PERCENT)
          : gesture.startPosition;

        if (!cancelled) {
          setStageNodePosition(layoutKey, gesture.nodeId, nextPosition, stageLayoutMode);
          const candidate = rect?.width && rect.height
            ? findSynthesisGestureCandidate({
                draggedNodeId: gesture.nodeId,
                draggedPosition: nextPosition,
                nodes: positionedNodes,
                action: synthesisAction,
                resolveAction: resolveSynthesisAction,
                viewport: rect
              })
            : null;
          if (didDragRef.current && candidate && armRef.current?.ready &&
            armRef.current.key === candidate.action.key && !actionsRef.current.generationBusy) {
            actionsRef.current.onProposeSynthesis?.(candidate.action);
          }
        }
      } else if (!cancelled) {
        setStagePan(layoutKey, livePanRef.current || gesture.startPan, stageLayoutMode);
      }

      if (didDragRef.current) {
        suppressClickUntilRef.current = performance.now() + 180;
      }

      if (
        activePointerTargetRef.current &&
        typeof activePointerTargetRef.current.releasePointerCapture === "function" &&
        activePointerTargetRef.current.hasPointerCapture?.(gesture.pointerId)
      ) {
        activePointerTargetRef.current.releasePointerCapture(gesture.pointerId);
      }

      activePointerTargetRef.current = null;
      livePanRef.current = null;
      didDragRef.current = false;
      setSynthesisCandidateId(null);
      resetArm();
      setGesture(null);
    };

    const handlePointerUp = (event: PointerEvent) => finishPointer(event, false);
    const handlePointerCancel = (event: PointerEvent) => finishPointer(event, true);
    const cancelGesture = () => finishPointer({ pointerId: gesture.pointerId } as PointerEvent, true);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); cancelGesture(); }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("blur", cancelGesture);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (gesture.kind === "node") {
        clearNodeDragPreview(gesture.nodeId);
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("blur", cancelGesture);
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
    setStagePan,
    setTrackPanPreview,
    stageLayoutMode,
    synthesisAction,
    resolveSynthesisAction,
    resetArm,
    positionedNodes
  ]);

  const handleStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canPanStage || event.button !== 0 || event.target !== event.currentTarget) {
      return;
    }
    if (event.pointerType === "touch") {
      return;
    }
    event.preventDefault();
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    activePointerTargetRef.current = event.currentTarget;
    didDragRef.current = false;
    setGesture({
      kind: "pan",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPan: resolvedPan
    });
  };

  const handleNodePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, node: DialogueStageNode) => {
    pointerTypeRef.current = event.pointerType;
    if (event.button !== 0) {
      return;
    }
    if (event.pointerType === "touch") {
      const target = event.currentTarget;
      const { pointerId, clientX, clientY } = event;
      if (touchHoldRef.current) window.clearTimeout(touchHoldRef.current.timer);
      touchHoldRef.current = { pointerId, x: clientX, y: clientY, timer: window.setTimeout(() => {
        touchHoldRef.current = null;
        target.setPointerCapture?.(pointerId);
        activePointerTargetRef.current = target;
        didDragRef.current = false;
        setGesture({ kind: "node", pointerId, nodeId: node.id,
          startClientX: clientX, startClientY: clientY, startPosition: getNodePosition(node) });
      }, 350) };
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
      startPosition: getNodePosition(node)
    });
  };

  const handleNodeClick = (node: DialogueStageNode, detail: number) => {
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
  const pendingAnchor = pendingPreview?.kind === "branches"
    ? positionedNodes.find(({ node }) => node.id === pendingPreview.anchorNodeId) || focusStageNode
    : null;
  const pendingAnchorPosition = pendingAnchor?.position || { x: 50, y: 42 };
  const pendingBranchNodes = pendingPreview?.kind === "branches"
    ? {
        thesis: clampNodePosition({ x: pendingAnchorPosition.x - 20, y: pendingAnchorPosition.y + 28 }),
        antithesis: clampNodePosition({ x: pendingAnchorPosition.x + 20, y: pendingAnchorPosition.y + 28 }),
        anchor: pendingAnchorPosition,
        prompt: pendingPreview.prompt.trim() || "新的母题"
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
          y: (pendingSynthesisSources.thesis.position.y + pendingSynthesisSources.antithesis.position.y) / 2 + 12
        }
      }
    : null;
  return (
    <section
      className={styles.stagePanel}
      aria-labelledby="dialogue-stage-heading"
      data-testid="dialogue-stage"
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
            gesture?.kind === "pan" ? styles.stageViewportPanning : ""
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
            className={[
              styles.stageTrack,
              canPanStage ? styles.stageTrackInteractive : "",
              gesture?.kind === "pan" ? styles.stageTrackPanning : ""
            ].join(" ")}
            style={
              {
                "--stage-pan-x": `${resolvedPan.x}px`,
                "--stage-pan-y": `${resolvedPan.y}px`
              } as CSSProperties
            }
            onPointerDown={handleStagePointerDown}
            data-testid="dialogue-stage-track"
            data-metaball-renderer={metaballRendererState}
          >
            {pendingBranchNodes ? (
              <div
                className={styles.stagePendingLayer}
                data-testid="dialogue-stage-pending-branches"
                role="status"
                aria-live="polite"
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
                    <small>母题</small>
                  </div>
                ) : null}
                <div
                  className={[styles.stagePendingGhost, styles.stagePendingThesis].join(" ")}
                  style={{ left: `${pendingBranchNodes.thesis.x}%`, top: `${pendingBranchNodes.thesis.y}%` }}
                  data-testid="dialogue-stage-pending-thesis"
                  data-metaball-surface="pending-thesis"
                  data-metaball-role="thesis"
                  data-metaball-relation="child"
                  data-liquid-color-key={pendingBranchNodes.prompt}
                  aria-hidden="true"
                >
                  <strong>正</strong>
                  <small>正在生成</small>
                </div>
                <div
                  className={[styles.stagePendingGhost, styles.stagePendingAntithesis].join(" ")}
                  style={{ left: `${pendingBranchNodes.antithesis.x}%`, top: `${pendingBranchNodes.antithesis.y}%` }}
                  data-testid="dialogue-stage-pending-antithesis"
                  data-metaball-surface="pending-antithesis"
                  data-metaball-role="antithesis"
                  data-metaball-relation="child"
                  data-liquid-color-key={pendingBranchNodes.prompt}
                  aria-hidden="true"
                >
                  <strong>反</strong>
                  <small>正在生成</small>
                </div>
                <p className={styles.stagePendingCaption}>正在让问题分岔，正与反会在这里落位。</p>
              </div>
            ) : null}
            {pendingSynthesisMark ? (
              <div
                className={styles.stagePendingLayer}
                data-testid="dialogue-stage-pending-synthesis"
                role="status"
                aria-live="polite"
              >
                <div
                  className={[styles.stagePendingGhost, styles.stagePendingSynthesis].join(" ")}
                  style={{ left: `${pendingSynthesisMark.center.x}%`, top: `${pendingSynthesisMark.center.y}%` }}
                  data-testid="dialogue-stage-pending-synthesis-node"
                  data-metaball-surface="pending-synthesis"
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
              <p
                className={styles.synthesisBridgePreview}
                role="status"
                aria-live="polite"
                data-testid="dialogue-synthesis-bridge-preview"
                data-armed={synthesisArmed ? "true" : "false"}
              >
                {synthesisArmed ? "松手合成 · 移开取消" : "稍停，准备合成…"}
              </p>
            ) : null}
            {!nodes.length && !pendingBranchNodes ? (
              <>
                <div className={styles.emptyStageCluster}>
                  <button
                    type="button"
                    className={[styles.emptyStageBlob, styles.emptyStageRoot, styles.emptyStageRootButton].join(" ")}
                    onClick={() => onPrimaryAction?.(null)}
                    data-metaball-surface="empty-root"
                    data-metaball-role="user"
                    data-metaball-relation="focus"
                    data-liquid-color-key="empty-theme"
                  >
                    <span>主题</span>
                    <small>点此输入</small>
                  </button>
                  <div
                    className={[styles.emptyStageBlob, styles.emptyStageThesis].join(" ")}
                    data-testid="dialogue-empty-stage-thesis"
                    data-metaball-surface="pending-thesis"
                    data-metaball-role="thesis"
                    data-metaball-relation="decorative"
                    data-liquid-color-key="empty-theme"
                    aria-hidden="true"
                  >
                    <span>正</span>
                  </div>
                  <div
                    className={[styles.emptyStageBlob, styles.emptyStageAntithesis].join(" ")}
                    data-testid="dialogue-empty-stage-antithesis"
                    data-metaball-surface="pending-antithesis"
                    data-metaball-role="antithesis"
                    data-metaball-relation="decorative"
                    data-liquid-color-key="empty-theme"
                    aria-hidden="true"
                  >
                    <span>反</span>
                  </div>
                  <p className={styles.emptyStageHint} data-testid="dialogue-empty-stage-hint">
                    {emptyStageHint}
                  </p>
                </div>
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
                  data-metaball-role={getMetaballRole(node)}
                  data-metaball-relation={node.relation}
                  data-liquid-color-key={node.preview || node.label}
                  aria-label={buildStageNodeAriaLabel(node)}
                  style={
                    {
                      left: `${position.x}%`,
                      top: `${position.y}%`,
                      "--stage-node-drag-x": "0px",
                      "--stage-node-drag-y": "0px"
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
                  <span className={styles.stageNodeInner}>
                    <strong>
                      <span className={styles.stageNodeTextFull}>{node.label}</span>
                      <span className={styles.stageNodeTextShort}>{node.label}</span>
                    </strong>
                    {node.branchType ? <small>{node.branchType}</small> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
