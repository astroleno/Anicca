"use client";

import { DialogueNodeDetail, DialogueSynthesisAction } from "@/features/dialectic/viewModel";
import styles from "./DialogueShell.module.css";

type ConversationPanelProps = {
  node: DialogueNodeDetail | null;
  synthesisAction: DialogueSynthesisAction | null;
  synthesisPending: boolean;
  onGenerateSynthesis: (action: DialogueSynthesisAction) => void;
  onSelectSource: (nodeId: string) => void;
  onSummonRoundtable: () => void;
};

export function ConversationPanel({
  node,
  synthesisAction,
  synthesisPending,
  onGenerateSynthesis,
  onSelectSource,
  onSummonRoundtable
}: ConversationPanelProps) {
  return (
    <section className={styles.panel} aria-labelledby="conversation-panel-heading" data-testid="dialogue-panel">
      <div className={styles.panelHeader}>
        <p className={styles.eyebrow}>当前节点</p>
        <h2 id="conversation-panel-heading">{node ? node.label : "等待主题"}</h2>
        {node?.branchType ? <span className={styles.panelPill}>{node.branchType}</span> : null}
      </div>

      {node ? (
        <>
          {node.summary ? <p className={styles.panelSummary}>{node.summary}</p> : null}
          <div className={styles.panelBody}>
            {node.text ? <p>{node.text}</p> : <p className={styles.panelMuted}>这个节点还没有正文。</p>}
          </div>

          {node.sourceNodes.length ? (
            <section className={styles.panelSources} aria-label="合的来源">
              <h3>来源</h3>
              <div className={styles.panelSourceList}>
                {node.sourceNodes.map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    className={styles.panelSourceCard}
                    onClick={() => onSelectSource(source.id)}
                  >
                    <span className={styles.panelSourceTitle}>
                      {source.label}
                      {source.branchType ? <small>{source.branchType}</small> : null}
                    </span>
                    {source.summary ? <span>{source.summary}</span> : null}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <p className={styles.panelMuted}>从一个主题开始，或沿已有分支继续展开。</p>
      )}

      {synthesisAction ? (
        <div className={styles.panelActionRow}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => onGenerateSynthesis(synthesisAction)}
            disabled={!synthesisAction.available || synthesisPending}
            aria-busy={synthesisPending ? "true" : undefined}
          >
            {synthesisPending ? "收束中..." : synthesisAction.available ? "生成合" : "已有合"}
          </button>
          <span className={styles.panelActionHint}>
            {synthesisPending ? "正在沿当前谱系收束正与反" : synthesisAction.label}
          </span>
        </div>
      ) : null}

      {node ? (
        <div className={styles.panelActionRow}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onSummonRoundtable}
          >
            召集圆桌讨论此节点
          </button>
          <span className={styles.panelActionHint}>作为 sidecar artifact 保存，不直接写入主图。</span>
        </div>
      ) : null}
    </section>
  );
}
