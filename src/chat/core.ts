import { providerRegistry } from "@/chat/providers/registry";
import { StreamHandler } from "@/chat/stream/sse";
import { Message } from "@/types/chat";

export interface ChatRunInput {
  providerName: string; // 如 'mock'
  model: string;        // 如 'mock-echo'
  messages: Message[];  // 最小：user→assistant 文本
  temperature?: number;
}

export async function chatRun(input: ChatRunInput, handler?: StreamHandler): Promise<{ text: string }>{
  const { providerName, model, messages, temperature } = input;
  const provider = providerRegistry.get(providerName);
  if (!provider) throw new Error(`provider not found: ${providerName}`);

  try {
    handler?.onStart?.();
    // 最小实现：整段生成
    const text = await provider.generate({
      model,
      messages: messages.map(m => ({ role: m.role as any, content: m.content })),
      options: { temperature, maxTokens: 512 }
    });
    handler?.onChunk?.({ type: 'text', delta: text });
    handler?.onEnd?.(text);
    return { text };
  } catch (e) {
    handler?.onError?.(e);
    throw e;
  }
}


