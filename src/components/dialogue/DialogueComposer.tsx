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
  const isRootTarget = target.kind === "root";
  const isSynthesisRecordTarget = target.displayRole === "synthesis-record";
  const targetVerb = targetFrozen
    ? targetFrozenReason === "synthesis"
      ? "正在记录合流"
      : "正在续写到"
    : isSynthesisRecordTarget
      ? "基于这次合流"
      : isRootTarget
        ? "将开启"
      : "将续写到";
  const actionLabel = isRootTarget && !pendingAction ? "开启新主题" : "生成正 / 反";
  const composerEyebrow = isRootTarget && !targetFrozen ? "新主题" : "续写";
  const placeholder = targetFrozen
    ? "生成还在进行，先让这次请求落稳。"
    : isSynthesisRecordTarget
      ? "基于这次合流继续追问。"
      : isRootTarget
        ? "写下一个新的母题，它会开启另一条谱系。"
        : "把当前节点推进到下一轮。";

  return (
    <form
      className={styles.composer}
      onSubmit={handleSubmit}
      aria-busy={pendingAction ? "true" : undefined}
      data-testid="dialogue-composer"
    >
      <div className={styles.composerMeta}>
        <p className={styles.eyebrow}>{composerEyebrow}</p>
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
          placeholder={placeholder}
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
