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
  onGrowthSubmit?: () => void;
};

type DialogueComposerNextStepChoice = {
  currentLabel: string;
  currentSummary: string;
  thesisLabel: string;
  antithesisLabel: string;
  thesisSummary: string;
  antithesisSummary: string;
  synthesisLabel: string;
  synthesisBusy: boolean;
  synthesisDisabled: boolean;
  roundtableBusy: boolean;
  roundtableDisabled: boolean;
  onSelectThesis: () => void;
  onSelectAntithesis: () => void;
  onSynthesize: () => void;
  onRoundtable: () => void;
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
  onSubmit,
  onGrowthSubmit
}: DialogueComposerProps) {
  const targetDescriptionId = useId();
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };
  const isRootTarget = target.kind === "root";
  const isSynthesisRecordTarget = target.displayRole === "synthesis-record";
  const isNextStepChoice = Boolean(nextStepChoice && !targetFrozen && isRootTarget && !pendingAction);
  const thesisChoiceLabel = nextStepChoice ? "沿正继续写" : "";
  const antithesisChoiceLabel = nextStepChoice ? "沿反继续写" : "";
  const branchContinuationVerb =
    target.branchType === "正" ? "沿正方续写" : target.branchType === "反" ? "沿反方续写" : "将续写到";
  const targetVerb = targetFrozen
    ? targetFrozenReason === "synthesis"
      ? "正在生成合流"
      : target.branchType === "正"
        ? "正在沿正方续写"
        : target.branchType === "反"
          ? "正在沿反方续写"
          : "正在续写到"
    : isNextStepChoice
      ? "主决策"
    : isSynthesisRecordTarget
      ? "基于这次合流"
    : isRootTarget
        ? "开启新主题"
        : branchContinuationVerb;
  const targetLabel = isNextStepChoice
    ? "正反已生成"
    : isRootTarget && !isSynthesisRecordTarget
      ? "输入一个新问题，将另起一条谱系。"
      : target.label;
  const actionLabel = isRootTarget && !pendingAction ? "开启新主题" : "生成正 / 反";
  const composerEyebrow = isNextStepChoice ? "选择" : isRootTarget && !targetFrozen ? "新主题" : "续写";
  const placeholder = targetFrozen
    ? "生成还在进行，先让这次请求落稳。"
    : isNextStepChoice
      ? "先选择沿正或沿反续写，也可以合流或召集圆桌。"
    : isSynthesisRecordTarget
      ? "基于这次合流继续追问。"
    : isRootTarget
      ? "输入一个新问题，将另起一条谱系。"
        : target.branchType === "正"
          ? "输入沿正方继续追问的内容。"
          : target.branchType === "反"
            ? "输入沿反方继续追问的内容。"
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
        <>
          <div
            className={styles.composerDecisionContext}
            data-testid="dialogue-decision-context"
            aria-label="当前正反摘要"
          >
            <p className={styles.composerDecisionPrompt}>
              <span>当前节点</span>
              <strong>{nextStepChoice.currentLabel}</strong>
              {nextStepChoice.currentSummary ? <small>{nextStepChoice.currentSummary}</small> : null}
            </p>
            <div className={styles.composerDecisionBranches}>
              <span>
                <b>正</b>
                {nextStepChoice.thesisSummary || nextStepChoice.thesisLabel}
              </span>
              <span>
                <b>反</b>
                {nextStepChoice.antithesisSummary || nextStepChoice.antithesisLabel}
              </span>
            </div>
          </div>
          <div className={styles.composerChoiceBar} aria-label="下一步选择">
            <button
              type="button"
              className={styles.composerChoiceButton}
              data-choice="thesis"
              aria-label={`沿正继续写：${nextStepChoice.thesisLabel}`}
              onClick={nextStepChoice.onSelectThesis}
            >
              <span className={styles.composerChoiceDesktopLabel}>{thesisChoiceLabel}</span>
              <span className={styles.composerChoiceMobileLabel}>沿正写</span>
              <small>{nextStepChoice.thesisSummary || nextStepChoice.thesisLabel}</small>
            </button>
            <button
              type="button"
              className={styles.composerChoiceButton}
              data-choice="antithesis"
              aria-label={`沿反继续写：${nextStepChoice.antithesisLabel}`}
              onClick={nextStepChoice.onSelectAntithesis}
            >
              <span className={styles.composerChoiceDesktopLabel}>{antithesisChoiceLabel}</span>
              <span className={styles.composerChoiceMobileLabel}>沿反写</span>
              <small>{nextStepChoice.antithesisSummary || nextStepChoice.antithesisLabel}</small>
            </button>
            <button
              type="button"
              className={styles.composerChoiceButton}
              data-choice="synthesis"
              aria-label={`合流记录：${nextStepChoice.synthesisLabel}`}
              onClick={nextStepChoice.onSynthesize}
              disabled={nextStepChoice.synthesisDisabled}
              aria-busy={nextStepChoice.synthesisBusy ? "true" : undefined}
            >
              <span className={styles.composerChoiceDesktopLabel}>
                {nextStepChoice.synthesisBusy ? "合流中" : "合流记录"}
              </span>
              <span className={styles.composerChoiceMobileLabel}>
                {nextStepChoice.synthesisBusy ? "合流中" : "合流记录"}
              </span>
              <small>{nextStepChoice.synthesisLabel}</small>
            </button>
            <button
              type="button"
              className={styles.composerChoiceButton}
              data-choice="roundtable"
              aria-label={`发起圆桌旁路：${nextStepChoice.currentLabel}`}
              onClick={nextStepChoice.onRoundtable}
              disabled={nextStepChoice.roundtableDisabled}
              aria-busy={nextStepChoice.roundtableBusy ? "true" : undefined}
            >
              <span className={styles.composerChoiceDesktopLabel}>
                {nextStepChoice.roundtableBusy ? "圆桌中" : "圆桌旁路"}
              </span>
              <span className={styles.composerChoiceMobileLabel}>
                {nextStepChoice.roundtableBusy ? "圆桌中" : "圆桌"}
              </span>
              <small>旁路记录</small>
            </button>
          </div>
        </>
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

      {!isNextStepChoice ? (
        <div className={styles.composerActions}>
          {onGrowthSubmit ? (
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={disabled || !value.trim()}
              onClick={onGrowthSubmit}
            >
              画作视角
            </button>
          ) : null}
          <button type="submit" className={styles.primaryButton} disabled={disabled || !value.trim()}>
            {pendingAction === "branches" ? "生成中..." : pendingAction === "synthesis" ? "合流中" : actionLabel}
          </button>
        </div>
      ) : null}

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
