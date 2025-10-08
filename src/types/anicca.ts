// Anicca 对话域核心类型定义
// 说明：仅定义最小 MVP 所需字段，后续可按需扩展。

export type BranchType = "正" | "反";

export type NodeKind = "user" | "assistant" | "merge";

export interface AniccaNodeMeta {
  temperature?: number; // 记录生成口径，便于回放
  topP?: number;
  seedId?: number; // 复现用种子
  model?: string; // 使用的模型名
  promptHash?: string; // 上下文哈希，追踪变更
  summary?: string; // 单行摘要（≤30字，不复述用户原文）
  summaryStatus?: "ok" | "missing" | "invalid"; // 用于补摘要流程
}

export interface AniccaNode {
  id: string;
  kind: NodeKind;
  text?: string; // 显示内容；merge 节点可为空或为注释
  createdAt: string; // ISO 时间字符串，服务端/客户端统一写入
  parents: string[]; // 上游节点 id 列表
  children: string[]; // 下游节点 id 列表
  branchType?: BranchType; // 仅 assistant 分支需要
  meta?: AniccaNodeMeta;
}

export interface Edge {
  id: string;
  from: string;
  to: string;
  reason?: string; // 可选，记录连边原因或提示
}

export interface Graph {
  version: "anicca-mvp-1";
  nodes: Record<string, AniccaNode>;
  edges: Record<string, Edge>;
  entryIds: string[]; // 入口 user 节点（支持多主题）
}

export function createEmptyGraph(): Graph {
  return { version: "anicca-mvp-1", nodes: {}, edges: {}, entryIds: [] };
}


