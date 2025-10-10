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

  // 父系 5 轮上下文（已裁剪，仅同分支摘要）
  const built = buildParentContext(nodeId, systemPrelude, target.branchType);
  const msgs: Message[] = built.messages;

  // 在 system 注入“上下文配额宣言”（表格文本），便于模型知晓上下文构成与长度上限
  try {
    const header = `上下文配额宣言\n- 说明：w_k = exp(-0.5*(k-1))，按权重分配 user 原文与摘要上限。\n- k 为向上第 k 轮父 user。`; // 简明说明
    const lines: string[] = [];
    for (let i = 0; i < built.weightsUsed.length; i++) {
      const k = i + 1;
      const w = built.weightsUsed[i];
      const cap = built.lengthCaps[i];
      lines.push(`k=${k}\tw=${w.toFixed(2)}\tuser≤${cap.userCap}\tsum≤${cap.sumCap}`);
    }
    const footer = `请在遵守上限前提下，优先利用最近轮的用户原文与要点摘要。`;
    const quotaText = [header, lines.join("\n"), footer].filter(Boolean).join("\n");
    msgs.unshift({ id: `sys_quota_${nodeId}` , role: 'system', content: quotaText, createdAt: new Date().toISOString() });
  } catch (e) {
    // 注入宣言失败不应阻断生成
    console.warn('inject quota declaration failed', e);
  }

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


