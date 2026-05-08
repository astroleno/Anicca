"use client";

import { useId, type Ref } from "react";
import { DialogueNodeDetail, DialogueSynthesisAction } from "@/features/dialectic/viewModel";
import styles from "./DialogueShell.module.css";

type ConversationPanelProps = {
  node: DialogueNodeDetail | null;
  synthesisAction: DialogueSynthesisAction | null;
  synthesisPending: boolean;
  roundtablePending: boolean;
  roundtablePendingSourceLabel?: string | null;
  roundtableSummonButtonRef?: Ref<HTMLButtonElement>;
  roundtableSavedButtonRef?: Ref<HTMLButtonElement>;
  savedRoundtableCount: number;
  onGenerateSynthesis: (action: DialogueSynthesisAction) => void;
  onSelectSource: (nodeId: string) => void;
  onSummonRoundtable: () => void;
  onOpenSavedRoundtable: () => void;
};

export function ConversationPanel({
  node,
  synthesisAction,
  synthesisPending,
  roundtablePending,
  roundtablePendingSourceLabel = null,
  roundtableSummonButtonRef,
  roundtableSavedButtonRef,
  savedRoundtableCount,
  onGenerateSynthesis,
  onSelectSource,
  onSummonRoundtable,
  onOpenSavedRoundtable
}: ConversationPanelProps) {
  const roundtableHintId = useId();
  const roundtablePendingHint = roundtablePendingSourceLabel
    ? `正在从「${roundtablePendingSourceLabel}」召集圆桌`
    : "正在召集圆桌";
  const isSynthesisRecord = node?.displayRole === "synthesis-record";

  return (
    <section className={styles.panel} aria-labelledby="conversation-panel-heading" data-testid="dialogue-panel">
      <div className={styles.panelHeader}>
        <p className={styles.eyebrow}>当前节点</p>
        <h2 id="conversation-panel-heading">{node ? node.label : "等待主题"}</h2>
        {isSynthesisRecord ? (
          <span className={styles.panelEventMarker}>合流记录</span>
        ) : node?.branchType ? (
          <span className={styles.panelPill}>{node.branchType}</span>
        ) : null}
      </div>

      {node ? (
        <>
          {node.summary ? <p className={styles.panelSummary}>{node.summary}</p> : null}
          <div className={styles.panelBody}>
            {node.text ? <p>{node.text}</p> : <p className={styles.panelMuted}>这个节点还没有正文。</p>}
          </div>

          {node.sourceNodes.length ? (
            <section className={styles.panelSources} aria-label={isSynthesisRecord ? "这次合流的来源" : "来源节点"}>
              <h3>{isSynthesisRecord ? "合流来源" : "来源"}</h3>
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
        synthesisAction.available ? (
          <div className={styles.panelActionRow}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => onGenerateSynthesis(synthesisAction)}
              disabled={synthesisPending}
              aria-busy={synthesisPending ? "true" : undefined}
            >
              {synthesisPending ? "收束中..." : "记录合流"}
            </button>
            <span className={styles.panelActionHint}>
              {synthesisPending ? "正在沿当前谱系收束正与反" : synthesisAction.label}
            </span>
          </div>
        ) : (
          <div className={styles.panelEventRow}>
            <span className={styles.panelEventPill}>已发生一次合流</span>
            <span className={styles.panelActionHint}>来源：{synthesisAction.label}</span>
            {synthesisAction.synthesisId ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => onSelectSource(synthesisAction.synthesisId!)}
              >
                查看记录
              </button>
            ) : null}
          </div>
        )
      ) : null}

      {node ? (
        <div className={styles.panelActionRow}>
          <button
            type="button"
            ref={roundtableSummonButtonRef}
            className={styles.secondaryButton}
            onClick={onSummonRoundtable}
            disabled={roundtablePending}
            aria-busy={roundtablePending ? "true" : undefined}
            aria-describedby={roundtableHintId}
          >
            {roundtablePending ? "圆桌生成中..." : "召集圆桌讨论此节点"}
          </button>
          <span
            id={roundtableHintId}
            className={styles.panelActionHint}
            role={roundtablePending ? "status" : undefined}
            aria-live={roundtablePending ? "polite" : undefined}
          >
            {roundtablePending ? roundtablePendingHint : "作为 sidecar artifact 保存，不直接写入主图。"}
          </span>
        </div>
      ) : null}

      {node && savedRoundtableCount > 0 ? (
        <div className={styles.panelActionRow}>
          <button
            type="button"
            ref={roundtableSavedButtonRef}
            className={styles.secondaryButton}
            onClick={onOpenSavedRoundtable}
          >
            查看最近圆桌记录
          </button>
          <span className={styles.panelActionHint}>
            当前节点有 {savedRoundtableCount} 条已保存圆桌。
          </span>
        </div>
      ) : null}
    </section>
  );
}
