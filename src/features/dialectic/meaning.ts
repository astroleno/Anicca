import type { Graph } from "@/types/anicca";
import { normalizeThinkingSpace, type ThinkingSpace } from "@/features/perspectives/model";

/** A model's account of this step, never a claim about what the user believes. */
export function readUnderstandingChange(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().replace(/\s+/gu, " ");
  return Array.from(text).length >= 6 && Array.from(text).length <= 100 ? text : undefined;
}

export type DeferredDraft = { reason: string; question: string };
export type DeferredSynthesis = DeferredDraft & {
  id: string;
  sourceNodeIds: [string, string];
  sourceInstanceIds?: [string, string];
  createdAt: string;
  perspective?: ThinkingSpace;
  connectionInput?: string;
  resolvedNodeId?: string;
};

export function readDeferredDraft(value: unknown): DeferredDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).sort().join(",") !== "question,reason") return null;
  const line = (v: unknown, min: number, max: number) => {
    if (typeof v !== "string") return null;
    const text = v.trim().replace(/\s+/gu, " "), length = Array.from(text).length;
    return length >= min && length <= max ? text : null;
  };
  const reason = line(raw.reason, 12, 180), question = line(raw.question, 6, 100);
  return reason && question ? { reason, question } : null;
}

/** These encounters carry no generative edge: an unsuccessful meeting is not a new idea. */
export function deferredSyntheses(graph: Graph, nodeId?: string): DeferredSynthesis[] {
  if (!graph.deferredSyntheses || typeof graph.deferredSyntheses !== "object") return [];
  return Object.values(graph.deferredSyntheses).flatMap(raw => {
    if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !raw.id ||
      !Array.isArray(raw.sourceNodeIds) || raw.sourceNodeIds.length !== 2 || new Set(raw.sourceNodeIds).size !== 2 ||
      raw.sourceNodeIds.some(id => typeof id !== "string" || !graph.nodes[id]) ||
      (nodeId && !raw.sourceNodeIds.includes(nodeId)) || typeof raw.createdAt !== "string" || !Number.isFinite(Date.parse(raw.createdAt))) return [];
    const draft = readDeferredDraft({ reason: raw.reason, question: raw.question });
    if (!draft) return [];
    return [{ ...draft, id: raw.id, sourceNodeIds: raw.sourceNodeIds,
      createdAt: raw.createdAt,
      ...(Array.isArray(raw.sourceInstanceIds) && raw.sourceInstanceIds.length === 2 && raw.sourceInstanceIds.every(id => typeof id === "string")
        ? { sourceInstanceIds: raw.sourceInstanceIds } : {}),
      ...(raw.perspective ? { perspective: normalizeThinkingSpace(raw.perspective) } : {}),
      ...(typeof raw.connectionInput === "string" ? { connectionInput: raw.connectionInput.slice(0, 2000) } : {}),
      ...(typeof raw.resolvedNodeId === "string" && graph.nodes[raw.resolvedNodeId] ? { resolvedNodeId: raw.resolvedNodeId } : {}) }];
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const UNDERSTANDING_CHANGE_PROMPT = "每份结果增加 change：用 6–100 字的一句话指出相对当前来源新增或修正了哪个具体理解，不重复 summary，不写泛泛的‘更深入’或自评，不宣称用户已被说服。正写推进了什么，反写质疑哪个前提，合写双方怎样形成新的解释，极性写这个观察入口新看见什么。比较对象是当前父种子，不是最初问题，也不是生成过程中的内部草稿；不要写‘修正草稿’或暴露校正过程。祖先已经提出的区分不能重新冒充新发现，也不能虚构父种子曾持有的错误主张。变化必须能从正文找到依据；写不出具体差异时先改正文。";
