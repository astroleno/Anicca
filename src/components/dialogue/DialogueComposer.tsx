"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Ref } from "react";
import { DIALECTIC_INPUT_MAX_LENGTH } from "@/features/dialectic/api";
import type { DialogueErrorState } from "@/features/dialectic/store";
import type { DialogueComposerTarget } from "@/features/dialectic/viewModel";
import styles from "./DialogueShell.module.css";
import { inquiryLabel, type InquiryTarget } from "@/features/dialectic/inquiry";

type Props = {
  target: DialogueComposerTarget;
  perspectiveLabel?: string;
  value: string;
  disabled: boolean;
  pendingAction: string | null;
  pendingMessage?: string;
  connectionTarget?: string;
  inquiryTarget?: InquiryTarget;
  inline?: boolean;
  draftSaveError?: boolean;
  onRemember?(): void;
  isEmptyStart?: boolean;
  emptyStartOpen?: boolean;
  targetFrozen?: boolean;
  targetFrozenReason?: string | null;
  errorState: DialogueErrorState | null;
  rootRef?: Ref<HTMLFormElement>;
  textareaRef?: Ref<HTMLTextAreaElement>;
  onChange(value: string): void;
  onSubmit(): void;
  onCancel?(): void;
  onRetry?(): void;
  onResetTarget?(): void;
};

export function DialogueComposer({
  target, perspectiveLabel, value, disabled, pendingAction, pendingMessage, connectionTarget, inquiryTarget, inline, draftSaveError, onRemember, isEmptyStart, errorState,
  rootRef, textareaRef, onChange, onSubmit, onCancel, onRetry, onResetTarget
}: Props) {
  const [elapsed, setElapsed] = useState(0);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const attachField = useCallback((field: HTMLTextAreaElement | null) => {
    fieldRef.current = field;
    if (typeof textareaRef === "function") textareaRef(field);
    else if (textareaRef) (textareaRef as { current: HTMLTextAreaElement | null }).current = field;
  }, [textareaRef]);
  const fitField = useCallback(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "44px";
    field.style.height = `${Math.min(110, Math.max(44, field.scrollHeight))}px`;
    field.style.overflowY = field.scrollHeight > 110 ? "auto" : "hidden";
  }, []);
  useLayoutEffect(fitField, [value, fitField]);
  useEffect(() => {
    const field = fieldRef.current;
    if (!field || typeof ResizeObserver === "undefined") return;
    let width = field.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (field.clientWidth !== width) {
        width = field.clientWidth;
        cancelAnimationFrame(frame);
        // Resizing the observed field inside this callback creates a resize loop during handoff.
        frame = requestAnimationFrame(() => { frame = 0; fitField(); });
      }
    });
    observer.observe(field);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [fitField]);
  useEffect(() => {
    setElapsed(0);
    if (!pendingAction) return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [pendingAction]);
  return (
    <form ref={rootRef} className={styles.composer} data-mode="compose"
      data-target={pendingAction === "synthesis" ? "synthesis" : target.nodeId ? "seed" : "root"}
      data-empty-start={isEmptyStart ? "true" : undefined} data-empty-open="true"
      data-inquiry={inquiryTarget ? "true" : undefined}
      data-inline={inline ? "true" : undefined}
      data-testid="dialogue-composer" aria-busy={Boolean(pendingAction)}
      data-perspective={perspectiveLabel ? "true" : undefined}
      onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      {connectionTarget || target.nodeId || pendingAction === "synthesis" || !isEmptyStart || perspectiveLabel ? (
        <div className={styles.seedComposerTarget} aria-live="polite" aria-label={perspectiveLabel ? "生成视角与续写对象" : "续写对象"}>
          <span title={perspectiveLabel ? `从「${perspectiveLabel}」看${target.nodeId ? ` · ${target.label}` : ""}` : pendingAction === "synthesis" ? target.label : target.nodeId ? target.label : "独立的新想法"}>
            {inquiryTarget ? inline ? inquiryLabel(inquiryTarget.intent) : `${inquiryLabel(inquiryTarget.intent)} · ${target.label}` : connectionTarget ? `补充联系：${connectionTarget}` : perspectiveLabel ? `从「${perspectiveLabel}」看${target.nodeId ? ` · ${target.label}` : ""}`
              : pendingAction === "synthesis" ? `本次合成：${target.label}` : target.nodeId ? `${pendingAction ? "本次" : ""}基于「${target.label}」` : "独立的新想法"}
          </span>
          {!inline && (connectionTarget || target.nodeId) ? <button type="button" disabled={disabled} onClick={onResetTarget}>写新想法</button> : null}
        </div>
      ) : null}
      {inquiryTarget && !inline ? <blockquote className={styles.composerQuote} aria-label="本次追问的原句">{inquiryTarget.quote}</blockquote> : null}
      <label className={styles.composerField}>
        <span className={styles.composerLabel}>输入</span>
        <textarea id="dialogue-input" ref={attachField} aria-label="输入" rows={1} value={value}
          maxLength={DIALECTIC_INPUT_MAX_LENGTH}
          placeholder={pendingAction ? "等待时，也可以继续写…" : inquiryTarget ? "围绕这句话，你想追问什么？" : connectionTarget ? "你想让它们怎样相遇？" : target.nodeId ? "补充你的想法…" : "写下一个想法…"}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (!disabled && value.trim()) onSubmit();
            }
          }} />
      </label>
      <div className={styles.composerActions}>
        {onRemember && value.trim() && !pendingAction ? <button type="button" className={styles.secondaryButton} disabled={disabled} onClick={onRemember}>先记下</button> : null}
        {pendingAction && onCancel ? (
          <button type="button" className={styles.secondaryButton} onClick={onCancel}>取消</button>
        ) : null}
        <button type="submit" className={styles.primaryButton} disabled={disabled || !value.trim()}>
          {pendingAction === "branches" ? "生成中…" : pendingAction === "synthesis" ? "合成中…" : inquiryTarget ? "追问" : connectionTarget ? "再试一次" : "生成"}
        </button>
      </div>
      {draftSaveError ? <p className={styles.draftSaveError} role="status">草稿暂时未能保存，请先保留这段文字。</p> : null}
      {pendingAction ? <div className={styles.generationProgress}>
        <span>{elapsed < 10 ? (pendingMessage || (pendingAction === "synthesis" ? "正在寻找两颗想法的新联系" : "正在展开正反两种视角")) : elapsed < 30 ? "还在生成，可以继续写下一个想法" : "这次需要久一点，你可以取消后重试"}</span>
        <span aria-label="已用时间">{elapsed} 秒</span>
        <span className={styles.generationShimmer} aria-hidden="true" />
      </div> : null}
      {errorState ? (
        <div className={styles.errorPanel} role="alert">
          <strong>{errorState.title}</strong><span>{errorState.detail}</span>
          {errorState.recovery ? <small>{errorState.recovery}</small> : null}
          {onRetry ? <button type="button" className={styles.secondaryButton} disabled={disabled} onClick={onRetry}
            title="重新发送上次请求，保留当前草稿">重试</button> : null}
        </div>
      ) : null}
    </form>
  );
}
