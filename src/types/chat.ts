// 聊天消息/用量/工具调用的最小类型

export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
  id: string;
  role: Role;
  content: string; // 最小实现：纯文本
  createdAt: string;
}

export interface Usage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}


