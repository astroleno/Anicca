import type { Message } from "@/types/chat";

export const DIALECTIC_INPUT_MAX_LENGTH = 2000;

export type DialecticContextMessage = Pick<Message, "role" | "content">;

export type BranchPayload = {
  text: string;
  summary: string;
  label: string;
  stance: "正" | "反";
};

export type BranchesResponse = {
  requestId: string;
  thesis: BranchPayload;
  antithesis: BranchPayload;
};

export type SynthesisPayload = {
  text: string;
  summary: string;
  label: string;
  stance: "合";
};

export type SynthesisResponse = {
  requestId: string;
  synthesis: SynthesisPayload;
};

export type GenerateBranchesInput = {
  requestId: string;
  userText: string;
  contextMessages: DialecticContextMessage[];
};

export type SeedSource = {
  id: string;
  text: string;
  summary: string;
  label: string;
  stance: "正" | "反" | "合" | "想法";
};

export type GenerateSynthesisInput = {
  requestId: string;
  rootInput: string;
  contextMessages: DialecticContextMessage[];
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
  url: string,
  body: Record<string, unknown>,
  options: DialecticRequestOptions = {}
): Promise<T> {
  const request = options.fetchImpl || fetch;
  const response = await request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal: options.signal
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new DialecticApiError({
      status: response.status,
      code: typeof data?.error === "string" ? data.error : `http_${response.status}`,
      details: typeof data?.details === "string" ? data.details : ""
    });
  }

  return data as T;
}

export function generateBranches(
  input: GenerateBranchesInput,
  options?: DialecticRequestOptions
): Promise<BranchesResponse> {
  return requestJson<BranchesResponse>("/api/branches", input, options);
}

export function generateSynthesis(
  input: GenerateSynthesisInput,
  options?: DialecticRequestOptions
): Promise<SynthesisResponse> {
  return requestJson<SynthesisResponse>("/api/synthesis", input, options);
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
