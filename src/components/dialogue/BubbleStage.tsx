"use client";

import { DialogueStageNode } from "@/features/dialectic/viewModel";
import styles from "./DialogueShell.module.css";

type BubbleStageProps = {
  nodes: DialogueStageNode[];
  focusNodeId: string | null;
  onSelect: (nodeId: string) => void;
};

export function BubbleStage({ nodes, focusNodeId, onSelect }: BubbleStageProps) {
  const hasThesis = nodes.some((node) => node.branchType === "正");
  const hasAntithesis = nodes.some((node) => node.branchType === "反");
  const hasSynthesis = nodes.some((node) => node.branchType === "合");
  const relationshipHint = hasSynthesis
    ? "正与反仍保持张力，合只在同一条谱系里收束。"
    : hasThesis && hasAntithesis
      ? "让正与反先彼此拉开，再决定什么时候收成合。"
      : null;

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
        <div className={styles.stageViewport} data-testid="dialogue-stage-viewport">
          {relationshipHint ? <p className={styles.stageRelationshipHint}>{relationshipHint}</p> : null}
          {!nodes.length ? (
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
              <p className={styles.emptyStageHint}>给它一个母题，它会先裂成正与反；等你愿意，再让它们收成合。</p>
            </div>
          ) : null}
          {nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              className={[
                styles.stageNode,
                node.branchType === "正" ? styles.stageNodeThesis : "",
                node.branchType === "反" ? styles.stageNodeAntithesis : "",
                node.branchType === "合" ? styles.stageNodeSynthesis : "",
                node.kind === "user" ? styles.stageNodeUser : "",
                node.id === focusNodeId ? styles.stageNodeFocused : "",
                node.relation === "ancestor" ? styles.stageNodeAncestor : "",
                node.relation === "source" ? styles.stageNodeSource : ""
              ].join(" ")}
              data-testid={`dialogue-stage-node-${node.id}`}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              onClick={() => onSelect(node.id)}
            >
              <span className={styles.stageNodeInner}>
                <strong>{node.label}</strong>
                {node.branchType ? <small>{node.branchType}</small> : null}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
