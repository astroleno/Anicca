"use client";

import { PointerEvent as ReactPointerEvent, useEffect, useRef, useState, type CSSProperties } from "react";
import { useDialogueUiStore } from "@/features/dialectic/store";
import { DialogueStageNode } from "@/features/dialectic/viewModel";
import { StagePan, StagePoint } from "@/types/anicca";
import styles from "./DialogueShell.module.css";

type BubbleStageProps = {
  layoutKey: string;
  nodes: DialogueStageNode[];
  focusNodeId: string | null;
  onSelect: (nodeId: string) => void;
  emptyAction?: {
    label: string;
    onTrigger: () => void;
  } | null;
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
const NODE_PADDING_PERCENT = 10;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampNodePosition(position: StagePoint) {
  return {
    x: clamp(position.x, NODE_PADDING_PERCENT, 100 - NODE_PADDING_PERCENT),
    y: clamp(position.y, NODE_PADDING_PERCENT, 100 - NODE_PADDING_PERCENT)
  };
}

export function BubbleStage({ layoutKey, nodes, focusNodeId, onSelect, emptyAction = null }: BubbleStageProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activePointerTargetRef = useRef<HTMLElement | null>(null);
  const stageLayout = useDialogueUiStore((state) => state.stageLayouts[layoutKey] || null);
  const setStageNodePosition = useDialogueUiStore((state) => state.setStageNodePosition);
  const setStagePan = useDialogueUiStore((state) => state.setStagePan);
  const [gesture, setGesture] = useState<ActiveStageGesture | null>(null);
  const livePanRef = useRef<StagePan | null>(null);
  const didDragRef = useRef(false);
  const suppressClickUntilRef = useRef(0);
  const canPanStage = nodes.length > 0;
  const hasThesis = nodes.some((node) => node.branchType === "正");
  const hasAntithesis = nodes.some((node) => node.branchType === "反");
  const hasSynthesis = nodes.some((node) => node.branchType === "合");
  const relationshipHint = hasSynthesis
    ? "拖动节点只是整理舞台；合已作为这条谱系的收束记录保留。"
    : hasThesis && hasAntithesis
      ? "拖动节点只是整理舞台；是否生成合由同一母题下的正反成对关系决定。"
      : null;
  const resolvedPan = stageLayout?.pan || DEFAULT_STAGE_PAN;

  const getNodePosition = (node: DialogueStageNode): StagePoint =>
    stageLayout?.nodePositions[node.id] || { x: node.seedX, y: node.seedY };

  const setTrackPanPreview = (pan: StagePan) => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    track.style.setProperty("--stage-pan-x", `${pan.x}px`);
    track.style.setProperty("--stage-pan-y", `${pan.y}px`);
  };

  const setNodeDragPreview = (nodeId: string, offsetX: number, offsetY: number) => {
    const node = nodeRefs.current[nodeId];
    if (!node) {
      return;
    }

    node.style.setProperty("--stage-node-drag-x", `${offsetX}px`);
    node.style.setProperty("--stage-node-drag-y", `${offsetY}px`);
  };

  useEffect(() => {
    setGesture(null);
    livePanRef.current = null;
    didDragRef.current = false;
    suppressClickUntilRef.current = 0;
    activePointerTargetRef.current = null;
  }, [layoutKey]);

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
        const viewport = viewportRef.current;
        const rect = viewport?.getBoundingClientRect();
        const nextPosition = rect?.width && rect.height
          ? clampNodePosition({
              x: gesture.startPosition.x + ((event.clientX - gesture.startClientX) / rect.width) * 100,
              y: gesture.startPosition.y + ((event.clientY - gesture.startClientY) / rect.height) * 100
            })
          : gesture.startPosition;

        setStageNodePosition(layoutKey, gesture.nodeId, nextPosition);
      } else {
        setStagePan(layoutKey, livePanRef.current || gesture.startPan);
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
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [gesture, layoutKey, setStageNodePosition, setStagePan]);

  const handleStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canPanStage || event.button !== 0 || event.target !== event.currentTarget) {
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

  const handleNodeClick = (nodeId: string) => {
    if (performance.now() < suppressClickUntilRef.current) {
      return;
    }

    onSelect(nodeId);
  };

  return (
    <section
      className={styles.stagePanel}
      aria-labelledby="dialogue-stage-heading"
      data-testid="dialogue-stage"
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
          {relationshipHint ? <p className={styles.stageRelationshipHint}>{relationshipHint}</p> : null}
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
            {!nodes.length ? (
              <>
                <div className={styles.emptyStageCluster} aria-hidden="true">
                  <div className={[styles.emptyStageBlob, styles.emptyStageRoot].join(" ")}>
                    <span>主题</span>
                  </div>
                  <div className={[styles.emptyStageBlob, styles.emptyStageThesis].join(" ")}>
                    <span>正</span>
                  </div>
                  <div className={[styles.emptyStageBlob, styles.emptyStageAntithesis].join(" ")}>
                    <span>反</span>
                  </div>
                  <p className={styles.emptyStageHint}>
                    给它一个母题，它会先长出正与反；节点可拖动整理舞台。
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
            {nodes.map((node) => {
              const position = getNodePosition(node);
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
                    node.kind === "user" ? styles.stageNodeUser : "",
                    node.id === focusNodeId ? styles.stageNodeFocused : "",
                    node.relation === "ancestor" ? styles.stageNodeAncestor : "",
                    node.relation === "source" ? styles.stageNodeSource : "",
                    isDragging ? styles.stageNodeDragging : ""
                  ].join(" ")}
                  data-testid={`dialogue-stage-node-${node.id}`}
                  style={
                    {
                      left: `${position.x}%`,
                      top: `${position.y}%`,
                      "--stage-node-drag-x": "0px",
                      "--stage-node-drag-y": "0px"
                    } as CSSProperties
                  }
                  onClick={() => handleNodeClick(node.id)}
                  onPointerDown={(event) => handleNodePointerDown(event, node)}
                >
                  <span className={styles.stageNodeInner}>
                    <strong>{node.label}</strong>
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
