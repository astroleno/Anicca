"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./DialogueShell.module.css";

const STORAGE_KEY = "anicca:seed-guide:v1";
const STEPS = [
  ["写下一个想法", "在下方输入，生成“正”和“反”，从两种方向看它。"],
  ["每颗想法都能继续生长", "单击阅读，双击直接裂变；触屏点开卡片后点“裂变”。"],
  ["把任意两颗想法放在一起", "拖动靠近，稍停后松手合成；移开可取消。触屏先长按，也可点“组合”再选另一颗。"]
];

export function SeedGuide({ empty, requested, pending }: { empty: boolean; requested: number; pending: boolean }) {
  const [step, setStep] = useState<number | null>(null);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    try { if (empty && localStorage.getItem(STORAGE_KEY) !== "done") setStep(0); } catch { if (empty) setStep(0); }
  }, [empty]);
  useEffect(() => { if (requested > 0) setStep(0); }, [requested]);
  const close = () => {
    setStep(null);
    try { localStorage.setItem(STORAGE_KEY, "done"); } catch { /* Help stays dismissible without storage. */ }
  };
  if (step === null || pending) return null;
  return <aside className={styles.seedGuide} aria-label="三步开始">
    <div aria-live="polite"><small>{step + 1} / 3</small><h2>{STEPS[step][0]}</h2><p>{STEPS[step][1]}</p></div>
    <div><button type="button" onClick={close}>关闭提示</button>
      <button type="button" onClick={() => step === 2 ? close() : setStep(step + 1)}>{step === 2 ? "开始探索" : "下一步"}</button></div>
  </aside>;
}
