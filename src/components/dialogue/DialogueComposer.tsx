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
  nextStepChoice?: DialogueComposerNextStepChoice | null;
  isEmptyStart?: boolean;
  emptyStartOpen?: boolean;
  targetFrozen?: boolean;
  targetFrozenReason?: "branches" | "synthesis" | null;
  errorState: DialogueErrorState | null;
  textareaRef?: Ref<HTMLTextAreaElement>;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

type DialogueComposerNextStepChoice = {
  thesisLabel: string;
  antithesisLabel: string;
  synthesisLabel: string;
  synthesisBusy: boolean;
  synthesisDisabled: boolean;
  onSelectThesis: () => void;
  onSelectAntithesis: () => void;
  onSynthesize: () => void;
};

export function DialogueComposer({
  target,
  value,
  disabled,
  pendingAction,
  nextStepChoice = null,
  isEmptyStart = false,
  emptyStartOpen = true,
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
  const isNextStepChoice = Boolean(nextStepChoice && !targetFrozen && isRootTarget && !pendingAction);
  const thesisChoiceLabel = nextStepChoice ? `${nextStepChoice.thesisLabel}（正）` : "";
  const antithesisChoiceLabel = nextStepChoice ? `${nextStepChoice.antithesisLabel}（反）` : "";
  const targetVerb = targetFrozen
    ? targetFrozenReason === "synthesis"
      ? "正在记录合流"
      : "正在续写到"
    : isNextStepChoice
      ? "下一步"
    : isSynthesisRecordTarget
      ? "基于这次合流"
      : isRootTarget
        ? "将开启"
        : "将续写到";
  const targetLabel = isNextStepChoice ? "正反已生成，选择下一步" : target.label;
  const actionLabel = isRootTarget && !pendingAction ? (isNextStepChoice ? "另开主题" : "开启新主题") : "生成正 / 反";
  const composerEyebrow = isNextStepChoice ? "选择" : isRootTarget && !targetFrozen ? "新主题" : "续写";
  const placeholder = targetFrozen
    ? "生成还在进行，先让这次请求落稳。"
    : isNextStepChoice
      ? "先选择一侧继续，或记录合流。"
    : isSynthesisRecordTarget
      ? "基于这次合流继续追问。"
      : isRootTarget
        ? "写下一个新的母题，它会开启另一条谱系。"
        : "把当前节点推进到下一轮。";

  return (
    <form
      className={styles.composer}
      data-mode={isNextStepChoice ? "choice" : "compose"}
      data-empty-start={isEmptyStart ? "true" : undefined}
      data-empty-open={emptyStartOpen ? "true" : undefined}
      onSubmit={handleSubmit}
      aria-busy={pendingAction ? "true" : undefined}
      data-testid="dialogue-composer"
    >
      <div className={styles.composerMeta}>
        <p className={styles.eyebrow}>{composerEyebrow}</p>
        <div className={styles.composerTarget} id={targetDescriptionId}>
          <strong>{targetVerb}</strong>
          <span>{targetLabel}</span>
          {target.branchType && !isSynthesisRecordTarget ? <small>{target.branchType}</small> : null}
        </div>
      </div>

      {nextStepChoice && isNextStepChoice ? (
        <div className={styles.composerChoiceBar} aria-label="下一步选择">
          <button
            type="button"
            className={styles.composerChoiceButton}
            aria-label={`继续正方：${nextStepChoice.thesisLabel}`}
            onClick={nextStepChoice.onSelectThesis}
          >
            <span className={styles.composerChoiceDesktopLabel}>{thesisChoiceLabel}</span>
            <span className={styles.composerChoiceMobileLabel}>继续</span>
          </button>
          <button
            type="button"
            className={styles.composerChoiceButton}
            aria-label={`继续反方：${nextStepChoice.antithesisLabel}`}
            onClick={nextStepChoice.onSelectAntithesis}
          >
            <span className={styles.composerChoiceDesktopLabel}>{antithesisChoiceLabel}</span>
            <span className={styles.composerChoiceMobileLabel}>暂停</span>
          </button>
          <button
            type="button"
            className={styles.composerChoiceButton}
            aria-label={`记录合流：${nextStepChoice.synthesisLabel}`}
            onClick={nextStepChoice.onSynthesize}
            disabled={nextStepChoice.synthesisDisabled}
            aria-busy={nextStepChoice.synthesisBusy ? "true" : undefined}
          >
            <span className={styles.composerChoiceDesktopLabel}>
              {nextStepChoice.synthesisBusy ? "合流中" : "记录合流"}
            </span>
            <span className={styles.composerChoiceMobileLabel}>
              {nextStepChoice.synthesisBusy ? "合流中" : "合流"}
            </span>
            <small>{nextStepChoice.synthesisLabel}</small>
          </button>
        </div>
      ) : null}

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
