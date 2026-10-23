"use client";

import { useEffect, useRef, useState } from "react";
import { inquirySentences, type InquiryTarget } from "@/features/dialectic/inquiry";
import styles from "./SeedPassage.module.css";

export function SeedPassage({ nodeId, text, className, busy, onInquiry }: {
  nodeId: string; text: string; className: string; busy: boolean; onInquiry?(target: InquiryTarget): void;
}) {
  const passage = useRef<HTMLDivElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  const [choosing, setChoosing] = useState(false);
  const [quote, setQuote] = useState("");
  useEffect(() => {
    if (!onInquiry) return;
    const selected = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount || !passage.current) return;
      const range = selection.getRangeAt(0);
      if (!passage.current.contains(range.startContainer) || !passage.current.contains(range.endContainer)) return;
      const value = selection.toString().trim();
      if (value.length >= 2 && value.length <= 600 && text.includes(value)) { setQuote(value); setChoosing(false); }
    };
    document.addEventListener("selectionchange", selected);
    return () => document.removeEventListener("selectionchange", selected);
  }, [text, onInquiry]);
  return <>
    {onInquiry ? <div className={styles.entry} data-seed-meaning><button type="button" disabled={busy} aria-expanded={choosing}
      onClick={() => { setChoosing(value => !value); setQuote(""); }}>{choosing ? "返回全文" : "选一句追问"}</button></div> : null}
    <div ref={passage} className={className} data-seed-passage>
      {choosing ? <div className={styles.sentences} aria-label="选择要追问的原句">
        {inquirySentences(text).map((sentence, index) => <button type="button" key={index} disabled={sentence.length > 600}
          onClick={() => { setQuote(sentence); setChoosing(false); requestAnimationFrame(() => action.current?.focus({ preventScroll: true })); }}>{sentence}</button>)}
      </div> : <p>{text}</p>}
    </div>
    {quote && onInquiry ? <div className={styles.selection} aria-label="围绕选句继续" data-seed-meaning
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setQuote(""); } }}>
      <blockquote>{quote}</blockquote>
      <div><button ref={action} type="button" disabled={busy} onClick={() => onInquiry({ sourceNodeId: nodeId, quote, intent: "premise" })}>追问前提</button>
        <button type="button" disabled={busy} onClick={() => onInquiry({ sourceNodeId: nodeId, quote, intent: "counterexample" })}>找反例</button>
        <button type="button" aria-label="取消选句" onClick={() => { setQuote(""); window.getSelection()?.removeAllRanges(); }}>收起</button></div>
    </div> : null}
  </>;
}
