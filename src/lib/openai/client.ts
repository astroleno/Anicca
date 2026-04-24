import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy-key-for-build",
  baseURL: process.env.OPENAI_BASE_URL || undefined
});

export function getDefaultModel(model?: string): string {
  return model || process.env.ANICCA_DEFAULT_MODEL || "gpt-4o-mini";
}
