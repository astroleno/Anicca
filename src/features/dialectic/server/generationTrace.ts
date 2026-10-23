import { randomUUID } from "node:crypto";
import { generateText, type GenerateTextOptions, type TokenUsage } from "@/lib/openai/generateText";
import { DIALECTIC_POLICY_CARD_VERSION } from "./policyCards";

export const DIALECTIC_PROMPT_VERSION = "seed-flow-2026-10-23-continuity";
type Stage = "branches" | "polarities" | "draft" | "critic" | "audit" | "final";
type Outcome = "success" | "invalid_output" | "failed" | "cancelled";
type Call = {
  stage: Stage;
  repair: boolean;
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
  const checks: { stage: Stage; repair: boolean; valid: boolean }[] = [];
  let finished = false;
  return {
    async generate(stage: Stage, options: Omit<GenerateTextOptions, "model" | "signal" | "onProviderCall">, repair = false, timeoutMs?: number) {
      signal.throwIfAborted();
      const bounded = timeoutMs ? new AbortController() : null;
      const abort = () => bounded?.abort(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      const timer = timeoutMs ? setTimeout(() => bounded?.abort(new DOMException("Review timed out", "TimeoutError")), timeoutMs) : null;
      const callSignal = bounded?.signal || signal;
      const call: Call = { stage, repair, elapsedMs: 0, outcome: "failed", providerCalls: 0 };
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
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        call.elapsedMs = Math.round(performance.now() - callStarted);
      }
    },
    check(stage: Stage, valid: boolean, repair = false) {
      checks.push({ stage, repair, valid });
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
        calls, checks
      };
      // Logging must never change generation or its error behavior.
      try { console.info(`anicca.generation ${JSON.stringify(record)}`); } catch { /* best effort */ }
    }
  };
}

export type GenerationTrace = ReturnType<typeof createGenerationTrace>;
