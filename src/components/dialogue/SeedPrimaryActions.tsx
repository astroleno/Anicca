"use client";

import type { Ref } from "react";
import styles from "./DialogueShell.module.css";

/** The same basic operations are available on the stage and while reading. */
export function SeedPrimaryActions({ disabled, onSplit, onPolarity, onCombine, polarityRef, polarityOpen = false }: {
  disabled: boolean; onSplit(): void; onPolarity?(): void; onCombine(): void;
  polarityRef?: Ref<HTMLButtonElement>; polarityOpen?: boolean;
}) {
  return <div className={styles.seedPrimaryActions} role="group" aria-label="种子基本操作">
    <button type="button" disabled={disabled} onClick={onSplit} title="推进判断，检验前提">推演正反</button>
    {onPolarity ? <button ref={polarityRef} type="button" disabled={disabled} onClick={onPolarity}
      aria-expanded={polarityOpen} title="换观察位置，看见两端">沿极性展开</button> : null}
    <button type="button" disabled={disabled} onClick={onCombine} title="选择另一颗种子，生成新的理解">组合</button>
  </div>;
}
