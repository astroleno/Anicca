import OpenAI from "openai";
import { getOpenAiClient } from "@/lib/openai/client";
import { readChatCompletionText } from "@/lib/openai/readChatCompletionText";
import { readOutputText } from "@/lib/openai/readOutputText";

export type OpenAiTransport = "responses" | "chat_completions";

type GenerateTextOptions = {
  model: string;
  input: string;
  maxOutputTokens: number;
  temperature?: number;
  client?: OpenAI;
};

function normalizeConfiguredPattern(pattern: string) {
  return pattern.trim().toLowerCase();
}

function getChatCompletionsOnlyModelPatterns() {
  const configured = process.env.ANICCA_CHAT_COMPLETIONS_MODELS;
  if (!configured) {
    return ["gemini-"];
  }

  return configured
    .split(",")
    .map(normalizeConfiguredPattern)
    .filter(Boolean);
}

export function prefersChatCompletions(model: string) {
  const normalizedModel = model.trim().toLowerCase();
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
  temperature?: number
) {
  const response = await client.responses.create({
    model,
    input,
    temperature,
    max_output_tokens: maxOutputTokens
  });

  return {
    text: readOutputText(response),
    transport: "responses" as const
  };
}

async function generateViaChatCompletions(
  client: OpenAI,
  model: string,
  input: string,
  maxOutputTokens: number,
  temperature?: number
) {
  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "user",
        content: input
      }
    ],
    temperature,
    max_tokens: maxOutputTokens
  });

  return {
    text: readChatCompletionText(response),
    transport: "chat_completions" as const
  };
}

export async function generateText({
  model,
  input,
  maxOutputTokens,
  temperature,
  client
}: GenerateTextOptions) {
  const resolvedClient = client || getOpenAiClient();

  if (prefersChatCompletions(model)) {
    return generateViaChatCompletions(resolvedClient, model, input, maxOutputTokens, temperature);
  }

  try {
    return await generateViaResponses(resolvedClient, model, input, maxOutputTokens, temperature);
  } catch (error) {
    if (!isResponsesUnsupported(error)) {
      throw error;
    }

    return generateViaChatCompletions(resolvedClient, model, input, maxOutputTokens, temperature);
  }
}
