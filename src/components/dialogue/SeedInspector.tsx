"use client";

import { useState } from "react";
import type { Graph } from "@/types/anicca";
import { seedLabel } from "@/features/dialectic/seeds";
import styles from "./DialogueShell.module.css";

export function SeedInspector({ graph, nodeId, combining, busy, onClose, onSplit, onWrite, onCombine, onPick }: {
  graph: Graph; nodeId: string; combining: boolean; busy: boolean;
  onClose(): void; onSplit(): void; onWrite(): void; onCombine(): void; onPick(id: string): void;
}) {
  const [query, setQuery] = useState("");
  const node = graph.nodes[nodeId];
  if (!node) return null;
  const candidates = Object.values(graph.nodes).filter((candidate) =>
    candidate.id !== nodeId && candidate.text?.trim() &&
    `${candidate.text} ${candidate.meta?.label || ""}`.includes(query.trim())).reverse();
  return (
    <section className={`${styles.panel} ${styles.seedInspector}`} data-testid="dialogue-panel" aria-labelledby="conversation-panel-heading">
      <header className={styles.seedInspectorHeader}>
        <span>{combining ? "组合" : node.branchType || "想法"}</span>
        <button type="button" className={styles.panelCloseButton} aria-label="收起阅读面板" onClick={onClose}>×</button>
        <h2 id="conversation-panel-heading" tabIndex={-1}>{combining ? "选择另一颗 seed" : seedLabel(graph, nodeId)}</h2>
      </header>
      {combining ? (
        <>
          <p className={styles.seedContextHint}>与「{seedLabel(graph, nodeId)}」组合，也可以直接点选舞台上的 seed。</p>
          <input className={styles.seedSearch} aria-label="搜索 seed" placeholder="搜索已有想法…" value={query} onChange={(event) => setQuery(event.target.value)} />
          <div className={styles.seedPicker}>
            {candidates.map((candidate) => (
              <button key={candidate.id} type="button" disabled={busy} onClick={() => onPick(candidate.id)}>
                <small>{candidate.branchType || "想法"}</small><span>{seedLabel(graph, candidate.id)}</span>
              </button>
            ))}
            {!candidates.length ? <p>还没有可组合的 seed。可以先写一个想法，或裂变当前 seed。</p> : null}
          </div>
        </>
      ) : (
        <>
          <div className={styles.seedBody}><p>{node.text || "这颗 seed 还没有正文。"}</p></div>
          {node.meta?.sourceNodeIds?.length ? (
            <div className={styles.seedSources} aria-label="合的来源">
              <span>来自</span>
              {node.meta.sourceNodeIds.map((id) => <button key={id} type="button" onClick={() => onPick(id)}>{seedLabel(graph, id)}</button>)}
            </div>
          ) : null}
          <div className={styles.seedActions}>
            <button className={styles.primaryButton} type="button" disabled={busy || !node.text?.trim()} onClick={onSplit}>裂变</button>
            <button className={styles.secondaryButton} type="button" disabled={busy || !node.text?.trim()} onClick={onCombine}>组合</button>
            <button className={styles.secondaryButton} type="button" disabled={busy} onClick={onWrite}>继续写</button>
          </div>
        </>
      )}
    </section>
  );
}
