import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

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
