"use client";

import { useEffect, useState, type Ref } from "react";
import { DIALECTIC_INPUT_MAX_LENGTH } from "@/features/dialectic/api";
import type { DialogueErrorState } from "@/features/dialectic/store";
import type { DialogueComposerTarget } from "@/features/dialectic/viewModel";
import styles from "./DialogueShell.module.css";

type Props = {
  target: DialogueComposerTarget;
  value: string;
  disabled: boolean;
  pendingAction: string | null;
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
  target, value, disabled, pendingAction, isEmptyStart, errorState,
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
      data-empty-start={isEmptyStart ? "true" : undefined} data-empty-open="true"
      data-testid="dialogue-composer" aria-busy={Boolean(pendingAction)}
      onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      {target.nodeId ? (
        <div className={styles.seedComposerTarget}>
          <span>基于「{target.label}」</span>
          <button type="button" disabled={disabled} onClick={onResetTarget}>写新想法</button>
        </div>
      ) : null}
      <label className={styles.composerField}>
        <span className={styles.composerLabel}>输入</span>
        <textarea ref={textareaRef} aria-label="输入" rows={1} value={value}
          maxLength={DIALECTIC_INPUT_MAX_LENGTH}
          placeholder={pendingAction ? "等待时，也可以继续写…" : target.nodeId ? "补充你的想法…" : "写下一个想法…"}
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
          {pendingAction === "branches" ? "生成中…" : pendingAction === "synthesis" ? "合成中…" : "生成"}
        </button>
      </div>
      {pendingAction ? <div className={styles.generationProgress}>
        <span role="status">{elapsed < 10 ? (pendingAction === "synthesis" ? "正在寻找两颗想法的新联系" : "正在展开正反两种视角") : elapsed < 30 ? "仍在等待模型返回，你可以随时取消" : "这次等待较久，取消后可以重试"}</span>
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
