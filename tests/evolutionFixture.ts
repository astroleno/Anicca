import { BranchGraphStore } from "@/store/branchGraph";
import { defaultThinkingSpace } from "@/features/perspectives/model";
import type { Graph } from "@/types/anicca";

export function evolutionFixture() {
  const store = new BranchGraphStore(), frame = defaultThinkingSpace();
  frame.focus = { horizon: 1 };
  const root = store.createUserNode("是否继续投入这个项目");
  const { negativeId: negative, positiveId: positive } = store.createPolarityPair(root, {
    groupId: "polarity-example", axisId: "concern", frame,
    negative: { label: "个体成本", text: "个体需要承担的试错成本" },
    positive: { label: "群体收益", text: "群体获得的长期收益" }
  });
  const { thesisId: thesis, antithesisId: antithesis } = store.createAssistantPair(negative, {
    frame, thesis: { label: "小步尝试", text: "低成本地验证" }, antithesis: { label: "机会成本", text: "先检查机会成本" }
  });
  const { thesisId: nextThesis, antithesisId: nextAntithesis } = store.createAssistantPair(thesis, {
    frame, thesis: { label: "一周实验", text: "限定一周的验证" }, antithesis: { label: "实验盲点", text: "识别样本偏差" }
  });
  const synthesis = store.createSynthesisAssistant([nextThesis, positive], { label: "兼顾两端", text: "用一周实验兼顾个人成本与群体收益" });
  return { graph: store.getGraph(), frame, store, root, negative, positive, thesis, antithesis, nextThesis, nextAntithesis, synthesis };
}

export function addDenseBranches(graph: Graph, count = 1500) {
  for (let index = 0; index < count; index++) {
    const id = `dense_${index}`, parent = index ? `dense_${Math.floor((index - 1) / 2)}` : graph.entryIds[0];
    const synthesis = index > 1 && index % 32 === 0;
    const parents = synthesis ? [parent, `dense_${index - 2}`] : [parent];
    const branchType = synthesis ? "合" : index % 2 ? "正" : "反";
    graph.nodes[id] = { id, kind: "assistant", text: `第 ${index + 1} 个思考的完整内容`, createdAt: new Date(Date.UTC(2026, 9, 21, 12, 0, 0, index)).toISOString(),
      parents, children: [], branchType, meta: { label: `思考 ${index + 1}`, ...(synthesis ? { sourceNodeIds: parents } : {}) } };
    parents.forEach(from => { graph.nodes[from].children.push(id); graph.edges[`${from}:${id}`] = { id: `${from}:${id}`, from, to: id, reason: synthesis ? "synthesis" : branchType }; });
  }
  return graph;
}
