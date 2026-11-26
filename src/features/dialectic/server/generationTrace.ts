import { randomUUID } from "node:crypto";
import { generateText, type GenerateTextOptions, type TokenUsage } from "@/lib/openai/generateText";
import { DIALECTIC_POLICY_CARD_VERSION, type DialecticPolicyCard } from "./policyCards";

export const DIALECTIC_PROMPT_VERSION = "seed-flow-2026-11-26-evidence-units";

const synthesisContractIssues = [
  "synthesis_json", "synthesis_root_keys", "synthesis_keys", "synthesis_field_types", "synthesis_text_empty",
  "synthesis_text_underlength", "synthesis_text_overlength", "synthesis_summary", "synthesis_label", "synthesis_change",
  "synthesis_unsupported_quantity", "synthesis_deferred", "synthesis_applicable_cards", "synthesis_semantic_audit", "synthesis_expansion"
] as const;
export type SynthesisContractIssueCode = typeof synthesisContractIssues[number];

const reviewProtocolCodes = [
  "output_truncated", "invalid_json", "invalid_verdict", "missing_evidence", "invalid_evidence",
  "evidence_too_short", "evidence_too_long", "wrong_evidence_owner", "unmatched_evidence",
  "unknown_evidence_unit", "invalid_evidence_range", "missing_authorization_review",
  "invalid_authorization_review", "unreviewed_authorization_action", "authorization_scope_violation"
] as const;
const reviewEvidenceFields = ["sourceA", "sourceB", "useA", "useB", "consequence", "gap", "opening", "thesis", "target", "premise", "authorization"] as const;
export type ReviewEvidenceField = typeof reviewEvidenceFields[number];
export type ReviewProtocolIssue = { code: typeof reviewProtocolCodes[number]; field?: ReviewEvidenceField };

type CheckDetails = {
  contractIssues?: readonly SynthesisContractIssueCode[];
  reviewIssues?: readonly ReviewProtocolIssue[];
};
type Stage = "branches" | "polarities" | "draft" | "critic" | "audit" | "final";
type Outcome = "success" | "invalid_output" | "reviewer_protocol_error" | "failed" | "cancelled";
type Call = {
  stage: Stage;
  repair: boolean;
  repairKind?: "contract" | "reviewer_protocol" | "prose";
  elapsedMs: number;
  outcome: "success" | "failed" | "cancelled";
  transport?: string;
  providerCalls: number;
  usage?: TokenUsage;
};

/** Request-local metadata only: never accepts prompts, output, or error messages as log fields. */
export function createGenerationTrace(endpoint: "branches" | "synthesis" | "polarities" | "inquiry", model: string, signal: AbortSignal) {
  const started = performance.now();
  const traceId = randomUUID();
  const calls: Call[] = [];
  const checks: ({ stage: Stage; repair: boolean; valid: boolean; reason?: "reviewer_protocol_error" } & CheckDetails)[] = [];
  let finished = false;
  let policyCards: { candidateIds: string[]; applicableIds?: string[] } | undefined;
  return {
    async generate(stage: Stage, options: Omit<GenerateTextOptions, "model" | "signal" | "onProviderCall">, repair = false, timeoutMs?: number, repairKind?: Call["repairKind"]) {
      signal.throwIfAborted();
      const bounded = timeoutMs ? new AbortController() : null;
      const abort = () => bounded?.abort(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      const timer = timeoutMs ? setTimeout(() => bounded?.abort(new DOMException("Review timed out", "TimeoutError")), timeoutMs) : null;
      const callSignal = bounded?.signal || signal;
      const call: Call = { stage, repair, ...(repairKind ? { repairKind } : {}), elapsedMs: 0, outcome: "failed", providerCalls: 0 };
      calls.push(call);
      const callStarted = performance.now();
      try {
        const result = await generateText({ ...options, model, signal: callSignal, onProviderCall() { call.providerCalls += 1; } });
        callSignal.throwIfAborted();
        signal.throwIfAborted();
        call.outcome = "success";
        call.transport = result.transport;
        call.usage = result.usage;
        return result;
      } catch (error) {
        call.outcome = callSignal.aborted ? "cancelled" : "failed";
        callSignal.throwIfAborted();
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        call.elapsedMs = Math.round(performance.now() - callStarted);
      }
    },
    recordPolicyCards(candidates: DialecticPolicyCard[], applicable?: DialecticPolicyCard[]) {
      policyCards = {
        candidateIds: candidates.map(card => card.id),
        ...(applicable ? { applicableIds: applicable.map(card => card.id) } : {})
      };
    },
    check(stage: Stage, valid: boolean, repair = false, reason?: "reviewer_protocol_error", details?: CheckDetails) {
      const contractIssues = details?.contractIssues?.filter(code => synthesisContractIssues.includes(code));
      const reviewIssues = details?.reviewIssues?.flatMap(({ code, field }) =>
        reviewProtocolCodes.includes(code) ? [{ code, ...(field && reviewEvidenceFields.includes(field) ? { field } : {}) }] : []);
      checks.push({ stage, repair, valid, ...(reason ? { reason } : {}),
        ...(contractIssues?.length ? { contractIssues } : {}), ...(reviewIssues?.length ? { reviewIssues } : {}) });
    },
    finish(outcome: Outcome) {
      if (finished) return;
      finished = true;
      // Model is an operator-configured identifier; redact arbitrary submitted strings.
      const modelId = /^[a-zA-Z0-9_.:/-]{1,100}$/.test(model) ? model : "unrecognized";
      const record = {
        schemaVersion: 1, traceId, endpoint, model: modelId,
        promptVersion: DIALECTIC_PROMPT_VERSION, policyVersion: DIALECTIC_POLICY_CARD_VERSION,
        outcome: signal.aborted ? "cancelled" : outcome,
        elapsedMs: Math.round(performance.now() - started),
        modelCalls: calls.length, repairCalls: calls.filter(call => call.repair).length,
        providerCalls: calls.reduce((sum, call) => sum + call.providerCalls, 0),
        firstPassValid: (outcome === "success" || outcome === "invalid_output") && !signal.aborted && checks.length
          ? checks.every(check => check.valid && !check.repair) : null,
        calls, checks, policyCards
      };
      // Logging must never change generation or its error behavior.
      try { console.info(`anicca.generation ${JSON.stringify(record)}`); } catch { /* best effort */ }
    }
  };
}

export type GenerationTrace = ReturnType<typeof createGenerationTrace>;
