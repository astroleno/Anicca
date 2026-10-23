import type { AniccaNode, Graph } from "@/types/anicca";
import { readUnderstandingChange, type DeferredSynthesis } from "@/features/dialectic/meaning";
import { seedLabel } from "@/features/dialectic/seeds";
import styles from "./SeedMeaning.module.css";

export function UnderstandingChange({ node }: { node: AniccaNode | undefined }) {
  const change = readUnderstandingChange(node?.meta?.change);
  if (!change) return null;
  const label = node?.meta?.polarity ? "这个角度看见" : node?.branchType === "正" ? "向前一步"
    : node?.branchType === "反" ? "重新看前提" : "新的联系";
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
