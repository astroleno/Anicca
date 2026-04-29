import { LlmProvider, MockProvider } from "@/llm/provider";
import { OpenAIProvider } from "@/llm/openaiProvider";

// Provider 注册中心（最小）：可扩展为限速/并发控制

class ProviderRegistry {
  private map = new Map<string, LlmProvider>();
  constructor(){
    const mock = new MockProvider();
    this.map.set(mock.name, mock);
    const openai = new OpenAIProvider();
    this.map.set(openai.name, openai);
  }
  register(p: LlmProvider){ this.map.set(p.name, p); }
  get(name: string): LlmProvider | undefined { return this.map.get(name); }
}

export const providerRegistry = new ProviderRegistry();


