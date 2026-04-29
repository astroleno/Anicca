// LLM Provider 抽象与一个最小 Mock 实现

export type Msg = { role: "user" | "assistant" | "system"; content: string };

export interface GenerateInput {
  messages: Msg[];
  model: string;
  seed?: number;
  options?: { temperature?: number; maxTokens?: number };
}

export interface LlmProvider {
  name: string;
  models(): Promise<string[]>;
  generate(input: GenerateInput): Promise<string>; // 最小：直接返回完整文本
}

export class MockProvider implements LlmProvider {
  name = "mock";
  async models(): Promise<string[]> { return ["mock-echo"]; }
  async generate(input: GenerateInput): Promise<string> {
    const last = input.messages[input.messages.length - 1];
    const prefix = input.model || "mock";
    return `[${prefix}] ${last?.content ?? ""}`;
  }
}


