import type { Message } from "@/types/chat";
import { emitDialogueTelemetry } from "@/lib/analytics/dialogue";
import type { AxisSuggestion, SeedPerspective, ThinkingAxis, ThinkingSpace } from "@/features/perspectives/model";
import { readDeferredDraft, readUnderstandingChange, type DeferredDraft } from "./meaning";
import { readNovelty, type ComparisonSeed, type NoveltyAssessment } from "./novelty";
import type { InquiryOrigin } from "./inquiry";

export const DIALECTIC_INPUT_MAX_LENGTH = 2000;

export type DialecticContextMessage = Pick<Message, "role" | "content">;

export type BranchPayload = {
  text: string;
  summary: string;
  label: string;
  stance: "正" | "反";
  perspective?: SeedPerspective;
  change?: string;
  novelty?: NoveltyAssessment;
};

export type BranchesResponse = {
  requestId: string;
  thesis: BranchPayload;
  antithesis: BranchPayload;
  suggestedAxes?: AxisSuggestion[];
};

export type SynthesisPayload = {
  text: string;
  summary: string;
  label: string;
  stance: "合";
  perspective?: SeedPerspective;
  change?: string;
};

export type SynthesizedResponse = {
  requestId: string;
  outcome?: "synthesized";
  synthesis: SynthesisPayload;
  suggestedAxes?: AxisSuggestion[];
};
export type SynthesisResponse = SynthesizedResponse | {
  requestId: string; outcome: "deferred"; deferred: DeferredDraft;
  synthesis?: never; suggestedAxes?: never;
};

export type GenerateBranchesInput = {
  requestId: string;
  userText: string;
  contextMessages: DialecticContextMessage[];
  perspective?: ThinkingSpace;
  comparisonSeeds?: ComparisonSeed[];
};

export type InquiryPayload = Omit<BranchPayload, "stance">;
export type InquiryResponse = { requestId: string; inquiry: InquiryPayload };
export type GenerateInquiryInput = { requestId: string; sourceText: string; origin: InquiryOrigin;
  contextMessages: DialecticContextMessage[]; perspective?: ThinkingSpace };

export type PolarityPayload = Omit<BranchPayload, "stance">;
export type GeneratePolarityInput = GenerateBranchesInput & { perspective: ThinkingSpace; axisId: string };
export type PolarityResponse = {
  requestId: string;
  axis: ThinkingAxis;
  negative: PolarityPayload;
  positive: PolarityPayload;
};

export type SeedSource = {
  id: string;
  text: string;
  summary: string;
  label: string;
  stance: "正" | "反" | "合" | "想法" | "视角";
};

export type GenerateSynthesisInput = {
  requestId: string;
  rootInput: string;
  contextMessages: DialecticContextMessage[];
  perspective?: ThinkingSpace;
  connectionInput?: string;
} & ({ sources: [SeedSource, SeedSource]; thesis?: never; antithesis?: never } |
  { sources?: never; thesis: BranchPayload; antithesis: BranchPayload });

export type DialecticRequestOptions = {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

export class DialecticApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: string;

  constructor(input: { status: number; code: string; details?: string }) {
    super(input.details ? `${input.code}: ${input.details}` : input.code);
    this.name = "DialecticApiError";
    this.status = input.status;
    this.code = input.code;
    this.details = input.details || "";
  }
}

async function requestJson<T>(
  url: "/api/branches" | "/api/synthesis" | "/api/polarities" | "/api/inquiry",
  body: Record<string, unknown>,
  options: DialecticRequestOptions = {}
): Promise<T> {
  const request = options.fetchImpl || fetch;
  const started = performance.now();
  let outcome: "success" | "failed" | "cancelled" = "failed";
  let status: number | null = null;
  try {
    options.signal?.throwIfAborted();
    const response = await request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: options.signal
    });
    status = response.status;

    const data = await response.json().catch(() => {
      if (response.ok) throw new DialecticApiError({ status: response.status, code: "invalid_model_output", details: "response_invalid_json" });
      return {};
    });
    options.signal?.throwIfAborted();
    if (!response.ok) {
      throw new DialecticApiError({
        status: response.status,
        code: typeof data?.error === "string" ? data.error : `http_${response.status}`,
        details: typeof data?.details === "string" ? data.details : ""
      });
    }

    outcome = "success";
    return data as T;
  } catch (error) {
    outcome = options.signal?.aborted || isAbortError(error) ? "cancelled" : "failed";
    throw error;
  } finally {
    void emitDialogueTelemetry({ name: "generation_finished", payload: {
      endpoint: url === "/api/branches" ? "branches" : url === "/api/polarities" ? "polarities" : url === "/api/inquiry" ? "inquiry" : "synthesis",
      elapsedMs: Math.round(performance.now() - started), outcome, status
    } });
  }
}

export async function generateBranches(
  input: GenerateBranchesInput,
  options?: DialecticRequestOptions
): Promise<BranchesResponse> {
  const response = await requestJson<BranchesResponse>("/api/branches", { ...input, meaningVersion: 1 }, options);
  for (const branch of [response.thesis, response.antithesis]) {
    if (branch?.novelty !== undefined) branch.novelty = readNovelty(branch.novelty) || { status: "unchecked" };
  }
  return response;
}

export async function generateInquiry(input: GenerateInquiryInput, options?: DialecticRequestOptions): Promise<InquiryResponse> {
  const response = await requestJson<InquiryResponse>("/api/inquiry", input, options);
  const result = response?.inquiry;
  if (response?.requestId !== input.requestId || typeof result?.text !== "string" || !result.text.trim() ||
    typeof result.summary !== "string" || !result.summary.trim() || typeof result.label !== "string" || !result.label.trim() ||
    !readUnderstandingChange(result.change) || "stance" in result) {
    throw new DialecticApiError({ status: 502, code: "invalid_model_output", details: "inquiry_response_incomplete" });
  }
  return response;
}

export async function generateSynthesis(
  input: GenerateSynthesisInput,
  options?: DialecticRequestOptions
): Promise<SynthesisResponse> {
  const response = await requestJson<SynthesisResponse>("/api/synthesis", { ...input, meaningVersion: 1 }, options);
  if (response?.requestId !== input.requestId ||
    (response.outcome !== undefined && response.outcome !== "synthesized" && response.outcome !== "deferred") || (response.outcome === "deferred"
    ? !readDeferredDraft(response.deferred) || Boolean(response.synthesis)
    : !response.synthesis?.text?.trim() || response.synthesis.stance !== "合" ||
      (response.synthesis.change !== undefined && !readUnderstandingChange(response.synthesis.change)))) {
    throw new DialecticApiError({ status: 502, code: "invalid_model_output", details: "synthesis_response_incomplete" });
  }
  return response;
}

export async function generatePolarity(input: GeneratePolarityInput, options?: DialecticRequestOptions): Promise<PolarityResponse> {
  const response = await requestJson<PolarityResponse>("/api/polarities", { ...input, meaningVersion: 1 }, options);
  const expected = input.perspective.axes.find(axis => axis.id === input.axisId);
  const completePole = (pole: PolarityPayload | undefined) => Boolean(pole && typeof pole.text === "string" && pole.text.trim() &&
    typeof pole.summary === "string" && pole.summary.trim() && typeof pole.label === "string" && pole.label.trim() &&
    Array.isArray(pole.perspective?.axes) && !("stance" in pole));
  if (!expected || response?.requestId !== input.requestId || response.axis?.id !== input.axisId ||
    response.axis.negative !== expected.negative || response.axis.positive !== expected.positive ||
    !completePole(response.negative) || !completePole(response.positive)) {
    throw new DialecticApiError({ status: 502, code: "invalid_model_output", details: "polarity_response_incomplete" });
  }
  return response;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : Boolean(
        error &&
          typeof error === "object" &&
          "name" in error &&
          error.name === "AbortError"
      );
}
