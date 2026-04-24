import { branchGraphStore } from "@/store/branchGraph";
import { Message } from "@/types/chat";
import { AniccaNode, BranchType, Graph } from "@/types/anicca";

// 计算权重：w_k = exp(-0.5*(k-1))
function weight(k: number): number { return Math.exp(-0.5 * (k - 1)); }

function capsForWeight(w: number){
  if (w >= 0.6) return { userCap: 120, sumCap: 30 };
  if (w >= 0.35) return { userCap: 60, sumCap: 20 };
  return { userCap: 0, sumCap: 15 }; // 仅摘要
}

function truncate(input: string, cap: number): string {
  if (!input) return "";
  if (cap <= 0) return "";
  return input.length > cap ? input.slice(0, cap) : input;
}

export interface BuiltContext {
  systemPrelude: string;
  messages: Message[]; // 已裁剪
  weightsUsed: number[]; // 对应每一条父轮
  lengthCaps: { userCap: number; sumCap: number }[];
}

function branchOrder(branchType?: BranchType): number {
  if (branchType === "正") return 0;
  if (branchType === "反") return 1;
  if (branchType === "合") return 2;
  return 99;
}

function getLineageParentUserId(graph: Graph, assistantNode: AniccaNode): string | null {
  if (assistantNode.kind !== "assistant") {
    return null;
  }

  if (assistantNode.branchType === "合" && assistantNode.meta?.lineageParentId) {
    return assistantNode.meta.lineageParentId;
  }

  const parentId = assistantNode.parents.find((nodeId) => graph.nodes[nodeId]?.kind === "user");
  return parentId || null;
}

function getParentAssistantId(graph: Graph, userNode: AniccaNode): string | null {
  return userNode.parents.find((nodeId) => graph.nodes[nodeId]?.kind === "assistant") || null;
}

function formatAssistantSummary(node: AniccaNode, cap: number): string {
  const label = node.meta?.label || node.branchType || "分支";
  const summary = node.meta?.summary || node.text || "";
  const trimmed = truncate(summary, cap);
  if (!trimmed) {
    return "";
  }

  return `${label}：${trimmed}`;
}

function buildSynthesisSourceSummary(graph: Graph, node: AniccaNode, cap: number): string {
  if (node.kind !== "assistant" || node.branchType !== "合" || !node.meta?.sourceNodeIds?.length) {
    return "";
  }

  const sourceSummary = node.meta.sourceNodeIds
    .map((nodeId) => graph.nodes[nodeId])
    .filter((source): source is AniccaNode => Boolean(source))
    .sort((left, right) => branchOrder(left.branchType) - branchOrder(right.branchType))
    .map((source) => formatAssistantSummary(source, cap))
    .filter(Boolean)
    .join("；");

  return sourceSummary ? `来源：${sourceSummary}` : "";
}

function collectRoundAssistantSummary(graph: Graph, userNode: AniccaNode, cap: number, branchFilter?: BranchType, currentAssistant?: AniccaNode): string {
  if (currentAssistant?.branchType === "合") {
    return buildSynthesisSourceSummary(graph, currentAssistant, cap);
  }

  return userNode.children
    .map((nodeId) => graph.nodes[nodeId])
    .filter((child): child is AniccaNode => Boolean(child) && child.kind === "assistant")
    .filter((child) => !branchFilter || child.branchType === branchFilter)
    .sort((left, right) => branchOrder(left.branchType) - branchOrder(right.branchType))
    .map((child) => formatAssistantSummary(child, cap))
    .filter(Boolean)
    .join("；");
}

export function buildParentContext(targetId: string, systemPrelude: string, branchFilter?: BranchType, graph: Graph = branchGraphStore.getGraph()): BuiltContext {
  const target = graph.nodes[targetId];
  const rounds: Message[][] = [];
  const weightsUsed: number[] = [];
  const lengthCaps: { userCap: number; sumCap: number }[] = [];

  let currentAssistant = target?.kind === "assistant" ? target : null;
  let count = 0;

  while (currentAssistant && count < 5) {
    const userParentId = getLineageParentUserId(graph, currentAssistant);
    if (!userParentId) {
      break;
    }

    const userNode = graph.nodes[userParentId];
    if (!userNode || userNode.kind !== "user") {
      break;
    }

    const k = count + 1;
    const w = weight(k);
    const cap = capsForWeight(w);
    weightsUsed.push(w);
    lengthCaps.push(cap);

    const roundMessages: Message[] = [];
    const userText = truncate(userNode.text || '', cap.userCap);
    if (userText) {
      roundMessages.push({ id: userNode.id, role: 'user', content: userText, createdAt: userNode.createdAt });
    }

    const assistantSummary = collectRoundAssistantSummary(graph, userNode, cap.sumCap, branchFilter, currentAssistant);
    if (assistantSummary) {
      roundMessages.push({
        id: `${userNode.id}_summary`,
        role: "assistant",
        content: assistantSummary,
        createdAt: userNode.createdAt
      });
    }

    rounds.push(roundMessages);
    const parentAssistantId = getParentAssistantId(graph, userNode);
    currentAssistant = parentAssistantId ? graph.nodes[parentAssistantId] || null : null;
    count++;
  }

  const messages: Message[] = [];
  if (systemPrelude) {
    messages.push({ id: `sys_${targetId}`, role: "system", content: systemPrelude, createdAt: new Date().toISOString() });
  }

  for (const round of rounds.reverse()) {
    messages.push(...round);
  }

  return { systemPrelude, messages, weightsUsed, lengthCaps };
}

