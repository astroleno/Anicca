import { branchGraphStore } from "@/store/branchGraph";
import { chatRun } from "@/chat/core";
import { Message } from "@/types/chat";
import { buildParentContext } from "@/chat/context";
import { normalizeSummary, isValidSummary } from "@/chat/summary";

async function fetchPrompt(type: 'thesis'|'antithesis'): Promise<string> {
  try {
    const res = await fetch(`/api/prompts?type=${type}`, { cache: 'no-store' as any });
    const data = await res.json();
    return String(data?.content || '');
  } catch (e) {
    console.error('fetchPrompt error', e);
    return '';
  }
}

export async function runNode(providerName: string, nodeId: string, model: string) {
  const g = branchGraphStore.getGraph();
  const target = g.nodes[nodeId];
  if (!target) throw new Error("node not found");
  if (target.kind !== "assistant") throw new Error("runNode requires assistant node");

  // 构建系统提示
  let systemPrelude = '';
  if (target.branchType === '正') systemPrelude = await fetchPrompt('thesis');
  if (target.branchType === '反') systemPrelude = await fetchPrompt('antithesis');

  // 父系 5 轮上下文（已裁剪）
  const built = buildParentContext(nodeId, systemPrelude);
  const msgs: Message[] = built.messages;

  const { text } = await chatRun({
    providerName,
    model,
    messages: msgs,
    temperature: target.meta?.temperature
  });
  branchGraphStore.setNodeText(nodeId, text);

  // 摘要校验与落盘（占位：此处用简单规则，可后续改为结构化返回）
  const parentText = (() => {
    const pid = g.nodes[nodeId]?.parents?.[0];
    const p = pid ? g.nodes[pid] : undefined;
    return p?.kind === 'user' ? (p.text || '') : '';
  })();
  let summary = normalizeSummary(text.slice(0, 30)); // 简易截断
  const ok = isValidSummary(summary, parentText);
  const meta = g.nodes[nodeId].meta || (g.nodes[nodeId].meta = {});
  meta.summary = ok ? summary : '';
  meta.summaryStatus = ok ? 'ok' : 'invalid';

  return text;
}


