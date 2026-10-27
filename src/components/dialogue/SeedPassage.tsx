"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { inquiryQuoteStart, inquirySentenceRanges, type InquiryTarget } from "@/features/dialectic/inquiry";
import styles from "./SeedPassage.module.css";

function sourceOffset(passage: HTMLElement, container: Node, offset: number): number | undefined {
  const element = container.nodeType === Node.ELEMENT_NODE ? container as Element : container.parentElement;
  const source = element?.closest<HTMLElement>("[data-passage-start]");
  if (!source || !passage.contains(source)) return;
  const prefix = document.createRange();
  prefix.selectNodeContents(source);
  prefix.setEnd(container, offset);
  return Number(source.dataset.passageStart) + prefix.toString().length;
}

export function SeedPassage({ nodeId, text, className, busy, onInquiry, inquiryTarget, inquiryComposer, onSelectionChange }: {
  nodeId: string; text: string; className: string; busy: boolean; onInquiry?(target: InquiryTarget): void;
  inquiryTarget?: InquiryTarget; inquiryComposer?: ReactNode; onSelectionChange?(active: boolean): void;
}) {
  const passage = useRef<HTMLDivElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  const [choosing, setChoosing] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<{ quote: string; quoteStart: number } | null>(null);
  const activeSelection = inquiryTarget || selectedQuote;
  const activeQuote = activeSelection?.quote || "";
  const quoteOffset = activeSelection ? inquiryQuoteStart(text, activeSelection) : -1;
  useEffect(() => { onSelectionChange?.(choosing || quoteOffset >= 0); }, [choosing, quoteOffset, onSelectionChange]);
  useEffect(() => {
    if (!onInquiry || inquiryTarget) return;
    const selected = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount || !passage.current) return;
      const range = selection.getRangeAt(0);
      if (!passage.current.contains(range.startContainer) || !passage.current.contains(range.endContainer)) return;
      const start = sourceOffset(passage.current, range.startContainer, range.startOffset);
      const end = sourceOffset(passage.current, range.endContainer, range.endOffset);
      if (start === undefined || end === undefined || end <= start) return;
      const original = text.slice(start, end), value = original.trim();
      if (value.length >= 2 && value.length <= 600 && selection.toString().trim() === value) {
        setSelectedQuote({ quote: value, quoteStart: start + original.length - original.trimStart().length });
        setChoosing(false);
      }
    };
    document.addEventListener("selectionchange", selected);
    return () => document.removeEventListener("selectionchange", selected);
  }, [text, onInquiry, inquiryTarget]);
  const chooseSentence = (sentence: { quote: string; quoteStart: number }) => {
    setSelectedQuote(sentence); setChoosing(false);
    if (inquiryTarget) onInquiry?.({ ...inquiryTarget, ...sentence });
    else requestAnimationFrame(() => action.current?.focus({ preventScroll: true }));
  };
  return <>
    {onInquiry ? <div className={styles.entry} data-seed-meaning><button type="button" disabled={busy} aria-expanded={choosing}
      onClick={() => { setChoosing(value => !value); setSelectedQuote(null); }}>{choosing ? "返回全文" : inquiryTarget ? "换一句追问" : "选一句追问"}</button></div> : null}
    <div ref={passage} className={className} data-seed-passage>
      {choosing ? <div className={styles.sentences} aria-label="选择要追问的原句">
        {inquirySentenceRanges(text).map(sentence => <button type="button" key={sentence.quoteStart} disabled={busy || sentence.quote.length > 600}
          onClick={() => chooseSentence(sentence)}>{sentence.quote}</button>)}
      </div> : quoteOffset >= 0 && onInquiry ? <>
        {quoteOffset > 0 ? <p data-passage-start={0}>{text.slice(0, quoteOffset)}</p> : null}
        <div className={styles.selection} aria-label="围绕选句继续" data-seed-meaning
          onKeyDown={event => { if (event.key === "Escape" && !inquiryTarget) { event.stopPropagation(); setSelectedQuote(null); } }}>
          <blockquote data-passage-start={quoteOffset} aria-label={inquiryTarget ? "本次追问的原句" : undefined}>{activeQuote}</blockquote>
          {inquiryTarget && inquiryComposer ? inquiryComposer : <div>
            <button ref={action} type="button" disabled={busy} onClick={() => onInquiry({ sourceNodeId: nodeId, quote: activeQuote, quoteStart: quoteOffset, intent: "premise" })}>追问前提</button>
            <button type="button" disabled={busy} onClick={() => onInquiry({ sourceNodeId: nodeId, quote: activeQuote, quoteStart: quoteOffset, intent: "counterexample" })}>找反例</button>
            <button type="button" aria-label="取消选句" onClick={() => { setSelectedQuote(null); window.getSelection()?.removeAllRanges(); }}>收起</button>
          </div>}
        </div>
        {quoteOffset + activeQuote.length < text.length ? <p data-passage-start={quoteOffset + activeQuote.length}>{text.slice(quoteOffset + activeQuote.length)}</p> : null}
      </> : <p data-passage-start={0}>{text}</p>}
    </div>
  </>;
}
