import { GoogleGenAI } from "@google/genai";
import { PROMPTS } from "./prompts";

// Initialize the client directly with the environment variable
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Retry Logic Helper
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface GenResponse {
  label: string;
  content: string;
}

async function generateWithRetry(
  model: string,
  prompt: string,
  systemInstruction: string,
  retries = 3,
  delay = 2000
): Promise<GenResponse> {
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
      }
    });

    const text = response.text || "{}";
    try {
        return JSON.parse(text);
    } catch (e) {
        console.warn("Failed to parse JSON from Gemini, returning raw text as content.");
        return { label: "Error", content: text };
    }

  } catch (error: any) {
    const isRateLimit =
      error?.code === 429 ||
      error?.status === 'RESOURCE_EXHAUSTED' ||
      (error?.message && (error.message.includes('429') || error.message.includes('quota') || error.message.includes('RESOURCE_EXHAUSTED')));

    if (isRateLimit && retries > 0) {
      console.warn(`Rate limit hit. Retrying in ${delay}ms... (${retries} attempts left)`);
      await wait(delay);
      return generateWithRetry(model, prompt, systemInstruction, retries - 1, delay * 2);
    }

    throw error;
  }
}

export async function generateThesis(topic: string): Promise<GenResponse> {
  try {
    return await generateWithRetry(
      'gemini-2.5-flash',
      `Focus topic: ${topic}`,
      PROMPTS.THESIS
    );
  } catch (error) {
    console.error("Gemini Thesis Error", error);
    return { label: "Silence", content: "The philosopher is temporarily silent." };
  }
}

export async function generateAntithesis(topic: string): Promise<GenResponse> {
  try {
    return await generateWithRetry(
      'gemini-2.5-flash',
      `Concept to contemplate: ${topic}`,
      PROMPTS.ANTITHESIS
    );
  } catch (error) {
    console.error("Gemini Antithesis Error", error);
    return { label: "Void", content: "The void is currently inaccessible." };
  }
}

export async function generateSynthesis(thesis: string, antithesis: string): Promise<GenResponse> {
  try {
    return await generateWithRetry(
      'gemini-2.5-flash',
      `Hypothesis A (Thesis): ${thesis}\n\nHypothesis B (Antithesis): ${antithesis}`,
      PROMPTS.SYNTHESIS
    );
  } catch (error) {
    console.error("Gemini Synthesis Error", error);
    return { label: "Halted", content: "The experiment was halted." };
  }
}
