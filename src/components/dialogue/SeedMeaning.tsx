import type { AniccaNode, Graph } from "@/types/anicca";
import { readUnderstandingChange, type DeferredSynthesis } from "@/features/dialectic/meaning";
import { seedLabel } from "@/features/dialectic/seeds";
import { readNovelty } from "@/features/dialectic/novelty";
import styles from "./SeedMeaning.module.css";

export function UnderstandingChange({ node, graph, onPick, onReframe, compact = false }: { node: AniccaNode | undefined; graph?: Graph; onPick?(id: string): void; onReframe?(): void; compact?: boolean }) {
  const change = readUnderstandingChange(node?.meta?.change);
  const novelty = readNovelty(node?.meta?.novelty);
  if (novelty?.status === "unchecked") return null;
  const earlier = novelty?.status === "revisit" && graph?.nodes[novelty.sourceId || ""];
  if (earlier && earlier.text?.includes(novelty!.sourceEvidence!) && node?.text?.includes(novelty!.resultEvidence!)) {
    if (compact) return <details className={`${styles.change} ${styles.compact}`} aria-label="与此前想法的联系" data-seed-meaning data-reading-summary>
      <summary><span>与此前相近</span><span className={styles.preview}>{novelty!.reason}</span></summary>
      <details><summary>对照两处原文</summary><blockquote>{novelty!.sourceEvidence}</blockquote><blockquote>{novelty!.resultEvidence}</blockquote></details>
      <div className={styles.actions}>{onPick ? <button type="button" onClick={() => onPick(earlier.id)}>回看「{seedLabel(graph!, earlier.id)}」</button> : null}
        {onReframe ? <button type="button" onClick={onReframe}>换个角度展开</button> : null}</div>
    </details>;
    return <aside className={styles.change} aria-label="与此前想法的联系" data-seed-meaning>
      <span>与此前相近</span><p>{novelty!.reason}</p>
      <details><summary>对照两处原文</summary><blockquote>{novelty!.sourceEvidence}</blockquote><blockquote>{novelty!.resultEvidence}</blockquote></details>
      <div className={styles.actions}>{onPick ? <button type="button" onClick={() => onPick(earlier.id)}>回看「{seedLabel(graph!, earlier.id)}」</button> : null}
        {onReframe ? <button type="button" onClick={onReframe}>换个角度展开</button> : null}</div>
    </aside>;
  }
  if (!change || novelty?.status === "revisit") return null;
  const label = node?.meta?.inquiry ? "这次追问澄清" : node?.meta?.polarity ? "这个角度看见" : node?.branchType === "正" ? "向前一步"
    : node?.branchType === "反" ? "重新看前提" : "新的联系";
  if (compact) return <details className={`${styles.change} ${styles.compact}`} aria-label="这一步的理解变化" data-seed-meaning data-reading-summary>
    <summary><span>{label}</span><span className={styles.preview}>{change}</span></summary>
  </details>;
  return <aside className={styles.change} aria-label="这一步的理解变化" data-seed-meaning>
    <span>{label}</span><p>{change}</p>
  </aside>;
}

export function DeferredEncounter({ encounter, graph, busy, onPick, onContinue, onDismiss }: {
  encounter: DeferredSynthesis; graph: Graph; busy: boolean;
  onPick(id: string): void; onContinue?(): void; onDismiss?(): void;
}) {
  return <section className={styles.encounter} aria-label="暂不融合" data-testid="deferred-encounter" data-seed-meaning>
    <h3>让两个想法先各自生长</h3>
    <div className={styles.sources}>{encounter.sourceNodeIds.map((id, index) =>
      <button type="button" key={id} onClick={() => onPick(encounter.sourceInstanceIds?.[index] || id)}>{seedLabel(graph, id)}</button>)}</div>
    <p>{encounter.reason}</p>
    <p className={styles.question}>{encounter.question}</p>
    {encounter.connectionInput ? <details><summary>这次补充的联系</summary><p>{encounter.connectionInput}</p></details> : null}
    <div className={styles.actions}>
      {onContinue ? <button type="button" disabled={busy} onClick={onContinue}>补充联系</button> : null}
      {onDismiss ? <button type="button" onClick={onDismiss}>分别继续</button> : null}
    </div>
  </section>;
}
