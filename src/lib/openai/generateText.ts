import OpenAI from "openai";
import { getOpenAiClient } from "@/lib/openai/client";
import { readChatCompletionText } from "@/lib/openai/readChatCompletionText";
import { readOutputText } from "@/lib/openai/readOutputText";

export type OpenAiTransport = "responses" | "chat_completions";

export type GenerateTextOptions = {
  model: string;
  input: string;
  maxOutputTokens: number;
  temperature?: number;
  client?: OpenAI;
  signal?: AbortSignal;
  onProviderCall?: (transport: OpenAiTransport) => void;
};

export type TokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
};

function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function readUsage(value: unknown, transport: OpenAiTransport): { usage?: TokenUsage } {
  if (!value || typeof value !== "object") return {};
  const usage = value as Record<string, unknown>;
  const details = (transport === "responses" ? usage.input_tokens_details : usage.prompt_tokens_details) as
    { cached_tokens?: unknown } | undefined;
  return { usage: {
    inputTokens: tokenCount(transport === "responses" ? usage.input_tokens : usage.prompt_tokens),
    outputTokens: tokenCount(transport === "responses" ? usage.output_tokens : usage.completion_tokens),
    cachedInputTokens: tokenCount(details?.cached_tokens ?? usage.prompt_cache_hit_tokens)
  } };
}

function normalizeConfiguredPattern(pattern: string) {
  return pattern.trim().toLowerCase();
}

function getChatCompletionsOnlyModelPatterns() {
  const configured = process.env.ANICCA_CHAT_COMPLETIONS_MODELS;
  if (!configured) {
    return ["gemini-", "deepseek-"];
  }

  return configured
    .split(",")
    .map(normalizeConfiguredPattern)
    .filter(Boolean);
}

export function prefersChatCompletions(model: string) {
  const normalizedModel = model.trim().toLowerCase();
  if (normalizedModel.startsWith("deepseek-")) {
    return true;
  }

  return getChatCompletionsOnlyModelPatterns().some((pattern) => {
    if (pattern.endsWith("*")) {
      return normalizedModel.startsWith(pattern.slice(0, -1));
    }

    return normalizedModel === pattern || normalizedModel.startsWith(pattern);
  });
}

function isResponsesUnsupported(error: unknown) {
  const message =
    typeof error === "object" && error && "message" in error && typeof error.message === "string"
      ? error.message
      : "";

  return /not implemented|convert_request_failed|unsupported|invalid url/i.test(message);
}

async function generateViaResponses(
  client: OpenAI,
  model: string,
  input: string,
  maxOutputTokens: number,
  temperature?: number,
  signal?: AbortSignal
) {
  const response = await client.responses.create({
    model,
    input,
    temperature,
    max_output_tokens: maxOutputTokens
  }, ...(signal ? [{ signal }] : []));

  return {
    text: readOutputText(response),
    transport: "responses" as const,
    ...readUsage(response.usage, "responses")
  };
}

async function generateViaChatCompletions(
  client: OpenAI,
  model: string,
  input: string,
  maxOutputTokens: number,
  temperature?: number,
  signal?: AbortSignal
) {
  const request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
    thinking?: { type: "disabled" };
  } = {
    model,
    messages: [
      {
        role: "user",
        content: input
      }
    ],
    temperature,
    max_tokens: maxOutputTokens
  };
  if (model.trim().toLowerCase().startsWith("deepseek-")) {
    request.thinking = { type: "disabled" };
  }

  const response = await client.chat.completions.create(request, ...(signal ? [{ signal }] : []));

  return {
    text: readChatCompletionText(response),
    transport: "chat_completions" as const,
    ...readUsage(response.usage, "chat_completions")
  };
}

export async function generateText({
  model,
  input,
  maxOutputTokens,
  temperature,
  client,
  signal,
  onProviderCall
}: GenerateTextOptions) {
  const resolvedClient = client || getOpenAiClient();
  signal?.throwIfAborted();
  const observe = (transport: OpenAiTransport) => {
    try { onProviderCall?.(transport); } catch { /* Metrics cannot interrupt generation. */ }
  };

  if (prefersChatCompletions(model)) {
    observe("chat_completions");
    return generateViaChatCompletions(resolvedClient, model, input, maxOutputTokens, temperature, signal);
  }

  try {
    observe("responses");
    return await generateViaResponses(resolvedClient, model, input, maxOutputTokens, temperature, signal);
  } catch (error) {
    if (signal?.aborted || !isResponsesUnsupported(error)) {
      throw error;
    }

    observe("chat_completions");
    return generateViaChatCompletions(resolvedClient, model, input, maxOutputTokens, temperature, signal);
  }
}
