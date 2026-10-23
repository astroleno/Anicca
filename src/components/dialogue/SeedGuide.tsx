"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./DialogueShell.module.css";

const STORAGE_KEY = "anicca:seed-guide:v1";
const STEPS = {
  write: "写下一个想法，让它生出正与反",
  read: "点一颗读读；按住拖近另一颗，稍停后松手合成",
  explore: "继续写、裂变或组合，从这里接着想",
  combine: "再选一颗种子，寻找新的联系"
};

type Props = {
  empty: boolean;
  requested: number;
  pending: boolean;
  reading: boolean;
  combining: boolean;
  completed: boolean;
  onStart(): void;
};

export function SeedGuide({ empty, requested, pending, reading, combining, completed, onStart }: Props) {
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
  if (!open || pending) return null;
  const step = empty ? "write" : combining ? "combine" : reading ? "explore" : "read";
  return <aside className={styles.seedGuide} aria-label="探索提示" data-step={step}>
    <div aria-live="polite">
      {empty ? <button className={styles.seedGuideStart} type="button" aria-label="写下想法" onClick={onStart}>{STEPS[step]}</button>
        : <p>{STEPS[step]}</p>}
    </div>
    <button className={styles.seedGuideClose} type="button" aria-label="关闭提示" onClick={close}>×</button>
  </aside>;
}
