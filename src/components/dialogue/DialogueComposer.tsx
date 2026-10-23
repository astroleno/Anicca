"use client";

import { useEffect, useState, type Ref } from "react";
import { DIALECTIC_INPUT_MAX_LENGTH } from "@/features/dialectic/api";
import type { DialogueErrorState } from "@/features/dialectic/store";
import type { DialogueComposerTarget } from "@/features/dialectic/viewModel";
import styles from "./DialogueShell.module.css";

type Props = {
  target: DialogueComposerTarget;
  perspectiveLabel?: string;
  value: string;
  disabled: boolean;
  pendingAction: string | null;
  pendingMessage?: string;
  connectionTarget?: string;
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
  target, perspectiveLabel, value, disabled, pendingAction, pendingMessage, connectionTarget, isEmptyStart, errorState,
  rootRef, textareaRef, onChange, onSubmit, onCancel, onRetry, onResetTarget
}: Props) {
  const [elapsed, setElapsed] = useState(0);
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
      data-testid="dialogue-composer" aria-busy={Boolean(pendingAction)}
      data-perspective={perspectiveLabel ? "true" : undefined}
      onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      {connectionTarget || target.nodeId || pendingAction === "synthesis" || !isEmptyStart || perspectiveLabel ? (
        <div className={styles.seedComposerTarget} aria-live="polite" aria-label={perspectiveLabel ? "生成视角与续写对象" : "续写对象"}>
          <span title={perspectiveLabel ? `从「${perspectiveLabel}」看${target.nodeId ? ` · ${target.label}` : ""}` : pendingAction === "synthesis" ? target.label : target.nodeId ? target.label : "独立的新想法"}>
            {connectionTarget ? `补充联系：${connectionTarget}` : perspectiveLabel ? `从「${perspectiveLabel}」看${target.nodeId ? ` · ${target.label}` : ""}`
              : pendingAction === "synthesis" ? `本次合成：${target.label}` : target.nodeId ? `${pendingAction ? "本次" : ""}基于「${target.label}」` : "独立的新想法"}
          </span>
          {connectionTarget || target.nodeId ? <button type="button" disabled={disabled} onClick={onResetTarget}>写新想法</button> : null}
        </div>
      ) : null}
      <label className={styles.composerField}>
        <span className={styles.composerLabel}>输入</span>
        <textarea id="dialogue-input" ref={textareaRef} aria-label="输入" rows={1} value={value}
          maxLength={DIALECTIC_INPUT_MAX_LENGTH}
          placeholder={pendingAction ? "等待时，也可以继续写…" : connectionTarget ? "你想让它们怎样相遇？" : target.nodeId ? "补充你的想法…" : "写下一个想法…"}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (!disabled && value.trim()) onSubmit();
            }
          }} />
      </label>
      <div className={styles.composerActions}>
        {pendingAction && onCancel ? (
          <button type="button" className={styles.secondaryButton} onClick={onCancel}>取消</button>
        ) : null}
        <button type="submit" className={styles.primaryButton} disabled={disabled || !value.trim()}>
          {pendingAction === "branches" ? "生成中…" : pendingAction === "synthesis" ? "合成中…" : connectionTarget ? "再试一次" : "生成"}
        </button>
      </div>
      {pendingAction ? <div className={styles.generationProgress}>
        <span>{elapsed < 10 ? (pendingMessage || (pendingAction === "synthesis" ? "正在寻找两颗想法的新联系" : "正在展开正反两种视角")) : elapsed < 30 ? "还在生成，可以继续写下一个想法" : "这次需要久一点，你可以取消后重试"}</span>
        <span aria-label="已用时间">{elapsed} 秒</span>
        <span className={styles.generationShimmer} aria-hidden="true" />
      </div> : null}
      {errorState ? (
        <div className={styles.errorPanel} role="alert">
          <strong>{errorState.title}</strong><span>{errorState.detail}</span>
          {errorState.recovery ? <small>{errorState.recovery}</small> : null}
          {onRetry ? <button type="button" className={styles.secondaryButton} disabled={disabled} onClick={onRetry}>重试</button> : null}
        </div>
      ) : null}
    </form>
  );
}
