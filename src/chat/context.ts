import { branchGraphStore } from "@/store/branchGraph";
import { Message } from "@/types/chat";
import { BranchType } from "@/types/anicca";

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

// 从目标 assistant 节点回溯父系最近 5 轮 user，拼装“用户原文+该轮正反摘要”（若有）
export function buildParentContext(targetId: string, systemPrelude: string, branchFilter?: BranchType): BuiltContext {
  const g = branchGraphStore.getGraph();
  const target = g.nodes[targetId];
  const msgs: Message[] = [];
  const weightsUsed: number[] = [];
  const lengthCaps: { userCap: number; sumCap: number }[] = [];

  // 注入系统提示在最前
  if (systemPrelude) {
    msgs.push({ id: `sys_${targetId}`, role: 'system', content: systemPrelude, createdAt: new Date().toISOString() });
  }

  let currentParent = target?.parents?.[0];
  let count = 0;
  while (currentParent && count < 5) {
    const userNode = g.nodes[currentParent];
    if (!userNode || userNode.kind !== 'user') break;

    const k = count + 1;
    const w = weight(k);
    const cap = capsForWeight(w);
    weightsUsed.push(w);
    lengthCaps.push(cap);

    const userText = truncate(userNode.text || '', cap.userCap);
    if (userText) {
      msgs.push({ id: userNode.id, role: 'user', content: userText, createdAt: userNode.createdAt });
    }

    // 收集该轮的同分支摘要：仅从该 user 的 children 中选择 branchType 匹配的摘要
    const childSummaries: string[] = [];
    for (const childId of userNode.children) {
      const child = g.nodes[childId];
      if (child?.kind === 'assistant' && child.meta?.summary) {
        if (!branchFilter || child.branchType === branchFilter) {
          childSummaries.push(child.meta.summary);
        }
      }
    }
    if (childSummaries.length) {
      const merged = truncate(childSummaries.join('；'), cap.sumCap);
      if (merged) {
        msgs.push({ id: `${userNode.id}_sum`, role: 'assistant', content: merged, createdAt: userNode.createdAt });
      }
    }

    // 向上
    currentParent = userNode.parents[0];
    count++;
  }

  return { systemPrelude: systemPrelude, messages: msgs, weightsUsed, lengthCaps };
}


