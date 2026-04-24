"use client";

import { FormEvent } from "react";
import { DialogueComposerTarget } from "@/features/dialectic/viewModel";
import styles from "./DialogueShell.module.css";

type DialogueComposerProps = {
  target: DialogueComposerTarget;
  value: string;
  disabled: boolean;
  pendingAction: string | null;
  errorMessage: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function DialogueComposer({
  target,
  value,
  disabled,
  pendingAction,
  errorMessage,
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
          <strong>将续写到</strong>
          <span>{target.label}</span>
          {target.branchType ? <small>{target.branchType}</small> : null}
        </div>
      </div>

      <label className={styles.composerField}>
        <span className={styles.composerLabel}>输入</span>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="把当前母题推进到下一轮。"
          rows={3}
          disabled={disabled}
        />
      </label>

      <div className={styles.composerActions}>
        <button type="submit" className={styles.primaryButton} disabled={disabled || !value.trim()}>
          {pendingAction === "branches" ? "生成中..." : pendingAction === "synthesis" ? "等待收束完成" : "生成正 / 反"}
        </button>
        {errorMessage ? (
          <p className={styles.errorMessage} role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </form>
  );
}
