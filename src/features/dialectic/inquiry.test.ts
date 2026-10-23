import { BranchGraphStore } from "@/store/branchGraph";
import { readInquiryTarget, inquirySentences } from "./inquiry";
import { buildSeedContext } from "./seeds";
import { projectEvolution, evolutionPath, searchEvolution } from "./evolution";
import { normalizeGraphForRetrieval } from "@/features/retrieval/workspaceGraphQuery";

it("keeps one quoted question and one response with a traceable path through reload", () => {
  const store = new BranchGraphStore(), sourceId = store.createUserNode("每条伏线都要认领。自由探索可以持续。");
  const origin = { sourceNodeId: sourceId, quote: "每条伏线都要认领。", intent: "counterexample" as const, question: "有没有不用认领的情况？" };
  const { questionId, responseId } = store.createInquiry(origin, { text: "如果它只是背景而不限制后续选择，就不必认领。", label: "背景与约束", summary: "区分背景和必要约束", change: "将全部认领改为判断是否构成约束。" });
  store.setGraph(JSON.parse(JSON.stringify(store.getGraph())));
  expect(Object.values(store.getGraph().nodes)).toHaveLength(3);
  expect(store.getGraph().nodes[responseId].branchType).toBeUndefined();
  expect(store.getGraph().nodes[responseId].meta?.inquiry).toEqual(origin);
  expect(buildSeedContext(store.getGraph(), [responseId]).some(item => item.role === "user" && item.content.includes(origin.quote))).toBe(true);
  const view = normalizeGraphForRetrieval(store.getGraph());
  expect(view.edges.map(edge => edge.relation)).toEqual(["inquiry", "inquiry"]);
  const evolution = projectEvolution(store.getGraph());
  expect(evolutionPath(evolution, responseId)).toEqual([sourceId, questionId, responseId]);
  expect(searchEvolution(evolution, origin.quote, "inquiry").map(node => node.id)).toEqual([questionId, responseId]);
});

it("refuses fabricated, stale or oversized quotes before mutating the graph", () => {
  const store = new BranchGraphStore(), source = store.createUserNode("实际原文。");
  const invalid = { sourceNodeId: source, quote: "被偷偷改写的原文", intent: "premise" as const, question: "为什么？" };
  expect(readInquiryTarget(invalid, store.getGraph())).toBeUndefined();
  expect(() => store.createInquiry(invalid, { text: "回答" })).toThrow();
  expect(Object.keys(store.getGraph().nodes)).toHaveLength(1);
  expect(inquirySentences("第一句。第二句？\n第三句！")).toEqual(["第一句。", "第二句？", "第三句！"]);
});
