"use client";

import { FormEvent, type Ref } from "react";
import { DialogueErrorState } from "@/features/dialectic/store";
import { DialogueComposerTarget } from "@/features/dialectic/viewModel";
import styles from "./DialogueShell.module.css";

type DialogueComposerProps = {
  target: DialogueComposerTarget;
  value: string;
  disabled: boolean;
  pendingAction: string | null;
  targetFrozen?: boolean;
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
  errorState,
  textareaRef,
  onChange,
  onSubmit
}: DialogueComposerProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form
      className={styles.composer}
      onSubmit={handleSubmit}
      aria-busy={pendingAction ? "true" : undefined}
      data-testid="dialogue-composer"
    >
      <div className={styles.composerMeta}>
        <p className={styles.eyebrow}>续写</p>
        <div className={styles.composerTarget}>
          <strong>{targetFrozen ? "正在续写到" : "将续写到"}</strong>
          <span>{target.label}</span>
          {target.branchType ? <small>{target.branchType}</small> : null}
        </div>
      </div>

      <label className={styles.composerField}>
        <span className={styles.composerLabel}>输入</span>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="把当前母题推进到下一轮。"
          rows={3}
          disabled={disabled}
        />
      </label>

      <div className={styles.composerActions}>
        <button type="submit" className={styles.primaryButton} disabled={disabled || !value.trim()}>
          {pendingAction === "branches" ? "生成中..." : pendingAction === "synthesis" ? "收束中" : "生成正 / 反"}
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
