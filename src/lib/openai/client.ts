import OpenAI from "openai";

let openaiClient: OpenAI | null = null;
let dialecticClient: OpenAI | null = null;

export function getOpenAiClient() {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "dummy-key-for-build",
      baseURL: process.env.OPENAI_BASE_URL || undefined
    });
  }

  return openaiClient;
}

export const openai = new Proxy({} as OpenAI, {
  get(_target, property, receiver) {
    return Reflect.get(getOpenAiClient(), property, receiver);
  }
});

export function getDefaultModel(model?: string): string {
  return model || process.env.ANICCA_DEFAULT_MODEL || "gpt-4o-mini";
}

export function getDialecticModel(model?: string): string {
  return model || process.env.DEEPSEEK_MODEL || getDefaultModel();
}

export function getDialecticOpenAiClient() {
  const hasDedicatedDialecticProvider = Boolean(
    process.env.DEEPSEEK_BASE_URL || process.env.DEEPSEEK_API_KEY
  );
  if (!hasDedicatedDialecticProvider) {
    return getOpenAiClient();
  }

  if (!dialecticClient) {
    dialecticClient = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || "dummy-key-for-build",
      baseURL: process.env.DEEPSEEK_BASE_URL || process.env.OPENAI_BASE_URL || undefined
    });
  }

  return dialecticClient;
}
