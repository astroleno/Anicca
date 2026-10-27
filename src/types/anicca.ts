// Anicca 对话域核心类型定义
// 说明：Dialectic V2 以 local-first graph 作为主线真相源。
import type { GrowthNodeMeta } from "@/features/growth/types";
import type { SeedPerspective, ThinkingSpace } from "@/features/perspectives/model";
import type { PolarityOrigin } from "@/features/perspectives/polarity";
import type { DeferredSynthesis } from "@/features/dialectic/meaning";
import type { InquiryOrigin } from "@/features/dialectic/inquiry";
import type { NoveltyAssessment } from "@/features/dialectic/novelty";

export const ANICCA_GRAPH_VERSION = "anicca-dialectic-v2";

export type BranchType = "正" | "反" | "合";

export type NodeKind = "user" | "assistant" | "merge";

export interface AniccaNodeMeta {
  temperature?: number; // 记录生成口径，便于回放
  topP?: number;
  seedId?: number; // 复现用种子
  model?: string; // 使用的模型名
  promptHash?: string; // 上下文哈希，追踪变更
  summary?: string; // 单行摘要（≤30字，不复述用户原文）
  summaryStatus?: "ok" | "missing" | "invalid"; // 用于补摘要流程
  label?: string; // UI 短标签
  sourceNodeIds?: string[]; // 合节点的两个来源 seed，保留原节点
  sourceInstanceIds?: string[]; // 与 sourceNodeIds 同序的舞台实例；缺失时回到原种子
  lineageParentId?: string; // 旧版同母题合的共同上游；跨母题合可以没有此字段
  growth?: GrowthNodeMeta; // A2A growth provenance, namespaced to keep dialectic metadata stable
  perspective?: SeedPerspective;
  polarity?: PolarityOrigin;
  fissionFrame?: ThinkingSpace;
  fissionGroupId?: string; // 同一次普通正反展开的配对标识，跨刷新保留
  change?: string;
  connectionInput?: string;
  inquiry?: InquiryOrigin;
  novelty?: NoveltyAssessment;
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
  version: typeof ANICCA_GRAPH_VERSION;
  nodes: Record<string, AniccaNode>;
  edges: Record<string, Edge>;
  entryIds: string[]; // 入口 user 节点（支持多主题）
  deferredSyntheses?: Record<string, DeferredSynthesis>;
}

export interface StagePoint {
  x: number;
  y: number;
  z?: number;
}

export interface StagePan {
  x: number;
  y: number;
}

export type StageLayoutMode = "wide" | "compact";

export interface StageLayoutViewport {
  pan: StagePan;
  nodePositions: Record<string, StagePoint>;
}

export interface StageLayoutView {
  pan: StagePan;
  nodePositions: Record<string, StagePoint>;
  // Legacy persisted layouts remain the wide view. Compact coordinates are opt-in
  // so importing an older workspace falls back to the responsive Growth seeds.
  compact?: StageLayoutViewport;
}

export type StageLayouts = Record<string, StageLayoutView>;

// Graph nodes own concept content. Instances only own a place on the stage.
export type SeedInstance = { id: string; conceptId: string; createdAt: string; ordinal: number };
export type SeedInstances = Record<string, SeedInstance>;

export function createEmptyGraph(): Graph {
  return { version: ANICCA_GRAPH_VERSION, nodes: {}, edges: {}, entryIds: [] };
}
