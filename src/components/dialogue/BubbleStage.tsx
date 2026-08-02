"use client";

import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useDialogueUiStore } from "@/features/dialectic/store";
import { DialogueStageNode } from "@/features/dialectic/viewModel";
import { StagePan, StagePoint } from "@/types/anicca";
import styles from "./DialogueShell.module.css";

type BubbleStageProps = {
  layoutKey: string;
  nodes: DialogueStageNode[];
  focusNodeId: string | null;
  onSelect: (nodeId: string) => void;
  onPrimaryAction?: (nodeId: string | null) => void;
  convergenceEventId?: string | null;
  eventNodeId?: string | null;
  pendingPreview?: StagePendingPreview | null;
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

function buildStageCurve(from: StagePoint, to: StagePoint) {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const bend = clamp(Math.abs(from.x - to.x) * 0.18 + Math.abs(from.y - to.y) * 0.08, 4, 10);
  const controlY = from.y <= to.y ? midY - bend : midY + bend;

  return `M ${from.x} ${from.y} Q ${midX} ${controlY} ${to.x} ${to.y}`;
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

export function BubbleStage({
  layoutKey,
  nodes,
  focusNodeId,
  onSelect,
  onPrimaryAction,
  convergenceEventId = null,
  eventNodeId = null,
  pendingPreview = null,
  emptyAction = null
}: BubbleStageProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activePointerTargetRef = useRef<HTMLElement | null>(null);
  const stageLayout = useDialogueUiStore((state) => state.stageLayouts[layoutKey] || null);
  const setStageNodePosition = useDialogueUiStore((state) => state.setStageNodePosition);
  const setStagePan = useDialogueUiStore((state) => state.setStagePan);
  const [gesture, setGesture] = useState<ActiveStageGesture | null>(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
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
    ? hasSynthesisRecord
      ? "点选节点查看谱系；这条谱系已留下合流记录。"
      : hasThesis && hasAntithesis
        ? "点选节点查看正与反。"
        : null
    : hasSynthesisRecord
      ? "已留下合流记录。"
      : hasThesis && hasAntithesis
        ? "正反已生成。"
        : null;
  const emptyStageHint = isCoarsePointer
    ? "写下母题，点选节点查看谱系。"
    : "写下母题，让正反开始生成。";
  const usesCompactGrowthLayout = isNarrowViewport && hasGrowthPerspectives;
  const stageLayoutMode = usesCompactGrowthLayout ? "compact" : "wide";
  const stageLayoutViewport = stageLayoutMode === "compact" ? stageLayout?.compact : stageLayout;
  const resolvedPan = stageLayoutViewport?.pan || DEFAULT_STAGE_PAN;

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
      stageLayoutViewport?.nodePositions[node.id] || defaultPosition,
      node.isGrowthPerspective ? GROWTH_NODE_MAX_Y_PERCENT : NODE_MAX_Y_PERCENT
    );
  };

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
  }, [clearNodeDragPreview, layoutKey]);

  useEffect(() => {
    if (!gesture) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== gesture.pointerId) {
        return;
      }

      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }

      const rect = viewport.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }

      if (gesture.kind === "node") {
        if (Math.abs(event.clientX - gesture.startClientX) > 4 || Math.abs(event.clientY - gesture.startClientY) > 4) {
          didDragRef.current = true;
        }
        setNodeDragPreview(
          gesture.nodeId,
          event.clientX - gesture.startClientX,
          event.clientY - gesture.startClientY
        );
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

    const handlePointerUp = (event: PointerEvent) => {
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

        setStageNodePosition(layoutKey, gesture.nodeId, nextPosition, stageLayoutMode);
      } else {
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
      setGesture(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      if (gesture.kind === "node") {
        clearNodeDragPreview(gesture.nodeId);
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
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
    stageLayoutMode
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
    if (event.button !== 0) {
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
      kind: "node",
      pointerId: event.pointerId,
      nodeId: node.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: getNodePosition(node)
    });
  };

  const handleNodeClick = (node: DialogueStageNode) => {
    if (performance.now() < suppressClickUntilRef.current) {
      return;
    }

    onSelect(node.id);
    onPrimaryAction?.(node.id);
  };

  const positionedNodes = nodes.map((node) => ({
    node,
    position: getNodePosition(node)
  }));
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
  const relationshipLinks = focusStageNode
    ? positionedNodes
        .filter(({ node }) => node.id !== focusStageNode.node.id && ["ancestor", "child", "source"].includes(node.relation))
        .map(({ node, position }) => {
          const sourceFirst = node.relation === "source";
          const from = sourceFirst ? position : focusStageNode.position;
          const to = sourceFirst ? focusStageNode.position : position;
          return {
            fromId: sourceFirst ? node.id : focusStageNode.node.id,
            toId: sourceFirst ? focusStageNode.node.id : node.id,
            d: buildStageCurve(from, to),
            relation: node.relation,
            branchType: node.branchType,
            lineRole: node.relation,
            eventState: eventNodeId && (node.id === eventNodeId || focusStageNode.node.id === eventNodeId)
              ? "synthesis-reveal"
              : undefined
          };
        })
    : [];
  const hasVisibleConvergenceNode = Boolean(
    convergenceEventId && positionedNodes.some(({ node }) => node.id === convergenceEventId)
  );
  const convergenceSources = convergenceEventId && !hasVisibleConvergenceNode
    ? [
        positionedNodes.find(({ node }) => node.branchType === "正" && ["child", "source"].includes(node.relation)),
        positionedNodes.find(({ node }) => node.branchType === "反" && ["child", "source"].includes(node.relation))
      ]
    : [];
  const convergenceCenter = convergenceSources[0] && convergenceSources[1]
    ? {
        x: (convergenceSources[0].position.x + convergenceSources[1].position.x) / 2,
        y: (convergenceSources[0].position.y + convergenceSources[1].position.y) / 2
      }
    : null;
  const convergenceMark = convergenceCenter && convergenceSources[0] && convergenceSources[1]
    ? {
        ...convergenceCenter,
        thesisPath: buildStageCurve(convergenceSources[0].position, convergenceCenter),
        antithesisPath: buildStageCurve(convergenceSources[1].position, convergenceCenter)
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
          >
            {relationshipLinks.length ? (
              <svg
                className={styles.stageRelations}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
                data-testid="dialogue-stage-relations"
              >
                {relationshipLinks.map((link) => (
                  <path
                    key={`${link.fromId}-${link.toId}`}
                    data-testid={`dialogue-stage-relation-${link.fromId}-${link.toId}`}
                    className={[
                      styles.stageRelationPath,
                      link.relation === "source" ? styles.stageRelationSource : "",
                      link.relation === "ancestor" ? styles.stageRelationLineage : "",
                      link.eventState ? styles.stageRelationEvent : "",
                      link.branchType === "正" ? styles.stageRelationThesis : "",
                      link.branchType === "反" ? styles.stageRelationAntithesis : "",
                      link.branchType === "合" ? styles.stageRelationSynthesis : ""
                    ].join(" ")}
                    data-event-state={link.eventState}
                    data-line-role={link.lineRole}
                    data-branch-type={link.branchType}
                    d={link.d}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {convergenceMark ? (
                  <>
                    <path
                      className={[styles.stageConvergenceMark, styles.stageConvergenceMarkThesis].join(" ")}
                      data-testid="dialogue-stage-convergence-mark-thesis"
                      d={convergenceMark.thesisPath}
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      className={[styles.stageConvergenceMark, styles.stageConvergenceMarkAntithesis].join(" ")}
                      data-testid="dialogue-stage-convergence-mark-antithesis"
                      d={convergenceMark.antithesisPath}
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle
                      className={styles.stageConvergenceDot}
                      data-testid="dialogue-stage-convergence-dot"
                      cx={convergenceMark.x}
                      cy={convergenceMark.y}
                      r="1.65"
                      vectorEffect="non-scaling-stroke"
                    />
                  </>
                ) : null}
              </svg>
            ) : null}
            {pendingBranchNodes ? (
              <div
                className={styles.stagePendingLayer}
                data-testid="dialogue-stage-pending-branches"
                role="status"
                aria-live="polite"
              >
                <svg className={styles.stagePendingRelations} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <path
                    className={[styles.stagePendingPath, styles.stagePendingPathThesis].join(" ")}
                    d={buildStageCurve(pendingBranchNodes.anchor, pendingBranchNodes.thesis)}
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    className={[styles.stagePendingPath, styles.stagePendingPathAntithesis].join(" ")}
                    d={buildStageCurve(pendingBranchNodes.anchor, pendingBranchNodes.antithesis)}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                {!nodes.length ? (
                  <div
                    className={[styles.stagePendingGhost, styles.stagePendingRoot].join(" ")}
                    style={{ left: `${pendingBranchNodes.anchor.x}%`, top: `${pendingBranchNodes.anchor.y}%` }}
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
                  aria-hidden="true"
                >
                  <strong>正</strong>
                  <small>正在生成</small>
                </div>
                <div
                  className={[styles.stagePendingGhost, styles.stagePendingAntithesis].join(" ")}
                  style={{ left: `${pendingBranchNodes.antithesis.x}%`, top: `${pendingBranchNodes.antithesis.y}%` }}
                  data-testid="dialogue-stage-pending-antithesis"
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
                <svg className={styles.stagePendingRelations} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <path
                    className={[styles.stagePendingPath, styles.stagePendingPathThesis].join(" ")}
                    d={buildStageCurve(pendingSynthesisMark.thesis.position, pendingSynthesisMark.center)}
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    className={[styles.stagePendingPath, styles.stagePendingPathAntithesis].join(" ")}
                    d={buildStageCurve(pendingSynthesisMark.antithesis.position, pendingSynthesisMark.center)}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                <div
                  className={[styles.stagePendingGhost, styles.stagePendingSynthesis].join(" ")}
                  style={{ left: `${pendingSynthesisMark.center.x}%`, top: `${pendingSynthesisMark.center.y}%` }}
                  data-testid="dialogue-stage-pending-synthesis-node"
                  aria-hidden="true"
                >
                  <strong>合</strong>
                  <small>合流中</small>
                </div>
                <p className={styles.stagePendingCaption}>正在收束「{pendingSynthesisMark.label}」。</p>
              </div>
            ) : null}
            {!nodes.length && !pendingBranchNodes ? (
              <>
                <div className={styles.emptyStageCluster}>
                  <button
                    type="button"
                    className={[styles.emptyStageBlob, styles.emptyStageRoot, styles.emptyStageRootButton].join(" ")}
                    onClick={() => onPrimaryAction?.(null)}
                  >
                    <span>主题</span>
                    <small>点此输入</small>
                  </button>
                  <div className={[styles.emptyStageBlob, styles.emptyStageThesis].join(" ")} aria-hidden="true">
                    <span>正</span>
                  </div>
                  <div className={[styles.emptyStageBlob, styles.emptyStageAntithesis].join(" ")} aria-hidden="true">
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
                  aria-label={buildStageNodeAriaLabel(node)}
                  style={
                    {
                      left: `${position.x}%`,
                      top: `${position.y}%`,
                      "--stage-node-drag-x": "0px",
                      "--stage-node-drag-y": "0px"
                    } as CSSProperties
                  }
                  onClick={() => handleNodeClick(node)}
                  onPointerDown={(event) => handleNodePointerDown(event, node)}
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
