"use client";

import { FormEvent, useId, type Ref } from "react";
import { DialogueErrorState } from "@/features/dialectic/store";
import { DialogueComposerTarget } from "@/features/dialectic/viewModel";
import styles from "./DialogueShell.module.css";

type DialogueComposerProps = {
  target: DialogueComposerTarget;
  value: string;
  disabled: boolean;
  pendingAction: string | null;
  targetFrozen?: boolean;
  targetFrozenReason?: "branches" | "synthesis" | null;
  errorState: DialogueErrorState | null;
  textareaRef?: Ref<HTMLTextAreaElement>;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function DialogueComposer({
  target,
  value,
  disabled,
  pendingAction,
  targetFrozen = false,
  targetFrozenReason = null,
  errorState,
  textareaRef,
  onChange,
  onSubmit
}: DialogueComposerProps) {
  const targetDescriptionId = useId();
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };
  const isSynthesisRecordTarget = target.displayRole === "synthesis-record";
  const targetVerb = targetFrozen
    ? targetFrozenReason === "synthesis"
      ? "正在记录合流"
      : "正在续写到"
    : isSynthesisRecordTarget
      ? "基于这次合流"
      : target.kind === "root"
        ? "将开启"
      : "将续写到";
  const actionLabel = target.kind === "root" && !pendingAction ? "开启新主题" : "生成正 / 反";

  return (
    <form
      className={styles.composer}
      onSubmit={handleSubmit}
      aria-busy={pendingAction ? "true" : undefined}
      data-testid="dialogue-composer"
    >
      <div className={styles.composerMeta}>
        <p className={styles.eyebrow}>续写</p>
        <div className={styles.composerTarget} id={targetDescriptionId}>
          <strong>{targetVerb}</strong>
          <span>{target.label}</span>
          {target.branchType && !isSynthesisRecordTarget ? <small>{target.branchType}</small> : null}
        </div>
      </div>

      <label className={styles.composerField}>
        <span className={styles.composerLabel}>输入</span>
        <textarea
          ref={textareaRef}
          aria-describedby={targetDescriptionId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="把当前母题推进到下一轮。"
          rows={3}
          disabled={disabled}
        />
      </label>

      <div className={styles.composerActions}>
        <button type="submit" className={styles.primaryButton} disabled={disabled || !value.trim()}>
          {pendingAction === "branches" ? "生成中..." : pendingAction === "synthesis" ? "收束中" : actionLabel}
        </button>
      </div>

      {errorState ? (
        <div className={styles.errorPanel} role="alert">
          <strong className={styles.errorTitle}>{errorState.title}</strong>
          <span>{errorState.detail}</span>
          {errorState.recovery ? <small className={styles.errorRecovery}>{errorState.recovery}</small> : null}
        </div>
      ) : null}
    </form>
  );
}
