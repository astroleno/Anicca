import { LlmProvider, GenerateInput } from "@/llm/provider";

// 通过本地 /api/chat 代理调用 OpenAI Responses（便于在服务端持有密钥）
export class OpenAIProvider implements LlmProvider {
  name = "openai";
  async models(): Promise<string[]> { return ["gpt-4o-mini"]; }
  async generate(input: GenerateInput): Promise<string> {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: input.messages, model: input.model, temperature: input.options?.temperature })
    });
    if (!res.ok) throw new Error(`openaiProvider_http_${res.status}`);
    const data = await res.json();
    // 兼容旧版 { reply } 与新版 { text, summary }
    const text = typeof data?.text === 'string' ? data.text : (data?.reply || "");
    return String(text || "");
  }
}


