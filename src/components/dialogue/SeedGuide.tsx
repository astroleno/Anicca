"use client";

import { useEffect, useRef, useState } from "react";
import { stageGestureHint } from "@/features/dialectic/platform";
import { useCoarsePointer } from "./useCoarsePointer";
import styles from "./DialogueShell.module.css";

const STORAGE_KEY = "anicca:seed-guide:v1";
const STEPS = {
  write: "写下一个想法，让它生出正与反",
  explore: "继续写、裂变或组合，从这里接着想",
  combine: "再选一颗种子，寻找新的联系"
};

type Props = {
  empty: boolean;
  requested: number;
  pending: boolean;
  suspended?: boolean;
  reading: boolean;
  combining: boolean;
  completed: boolean;
  onStart(): void;
};

export function SeedGuide({ empty, requested, pending, suspended, reading, combining, completed, onStart }: Props) {
  const coarsePointer = useCoarsePointer();
  const [open, setOpen] = useState(false);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    try { if (!completed && localStorage.getItem(STORAGE_KEY) !== "done") setOpen(true); } catch { if (!completed) setOpen(true); }
  }, [completed]);
  useEffect(() => { if (requested > 0) setOpen(true); }, [requested]);
  useEffect(() => {
    if (!completed) return;
    setOpen(false);
    try { localStorage.setItem(STORAGE_KEY, "done"); } catch { /* Completion is still reflected this session. */ }
  }, [completed]);
  const close = () => {
    setOpen(false);
    try { localStorage.setItem(STORAGE_KEY, "done"); } catch { /* Help stays dismissible without storage. */ }
  };
  if (!open || pending || suspended) return null;
  const step = empty ? "write" : combining ? "combine" : reading ? "explore" : "read";
  const hint = step === "read" ? `点一颗读读；${stageGestureHint(coarsePointer)}` : STEPS[step];
  return <aside className={styles.seedGuide} aria-label="探索提示" data-step={step} data-preserve-seed-reading>
    <div aria-live="polite">
      {empty ? <button className={styles.seedGuideStart} type="button" aria-label="写下想法" onClick={onStart}>{hint}</button>
        : <p>{hint}</p>}
    </div>
    <button className={styles.seedGuideClose} type="button" aria-label="关闭提示" onClick={close}>×</button>
  </aside>;
}
