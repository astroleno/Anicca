import { BranchGraphStore } from "@/store/branchGraph";
import { deferredSyntheses, readUnderstandingChange } from "./meaning";
import { buildSeedContext } from "./seeds";
import { projectEvolution, evolutionPath } from "./evolution";
import { commitSynthesisResult } from "./controller";

it("keeps a deferred meeting outside generative ancestry and survives serialization", () => {
  const store = new BranchGraphStore(), a = store.createUserNode("邮编"), b = store.createUserNode("薄荷");
  const before = JSON.parse(JSON.stringify(store.getGraph()));
  store.deferSynthesis({ id: "meeting", sourceNodeIds: [a, b], sourceInstanceIds: ["copy-a", b],
    createdAt: "2026-10-23T00:00:00Z", reason: "邮编描述投递区域，画作探索光感，当前没有给出两者的联系。", question: "你想让区域和叶片怎样相遇？" });
  const restored = new BranchGraphStore(); restored.setGraph(JSON.parse(JSON.stringify(store.getGraph())));
  expect(restored.getGraph().nodes).toEqual(before.nodes);
  expect(restored.getGraph().edges).toEqual(before.edges);
  expect(deferredSyntheses(restored.getGraph(), a)[0].sourceInstanceIds).toEqual(["copy-a", b]);
  expect(evolutionPath(projectEvolution(restored.getGraph()), a)).toEqual([a]);
  const result = commitSynthesisResult(restored, { thesisId: a, antithesisId: b, connectionInput: "把叶片画成一座假想城市的区域。",
    response: { requestId: "result", synthesis: { text: "这是一个明确的绘画类比。", label: "叶片街区", summary: "以叶片探索区域", stance: "合", change: "投递区域被明确转用为画面组织的假设。" } } });
  restored.resolveDeferredSynthesis("meeting", result);
  expect(deferredSyntheses(restored.getGraph())[0].resolvedNodeId).toBe(result);
  expect(restored.getGraph().nodes[result].meta?.change).toContain("假设");
  expect(buildSeedContext(restored.getGraph(), [result])).toContainEqual({ role: "user", content: "[用户为本次联结补充] 把叶片画成一座假想城市的区域。" });
});

it("never invents a change for legacy nodes or accepts incomplete imported encounters", () => {
  expect(readUnderstandingChange(undefined)).toBeUndefined();
  expect(readUnderstandingChange("更深入")).toBeUndefined();
  const store = new BranchGraphStore();
  const graph = store.getGraph();
  graph.deferredSyntheses = JSON.parse('{"bad":{"id":"bad","sourceNodeIds":["missing","missing"]}}');
  expect(deferredSyntheses(graph)).toEqual([]);
  expect(() => store.deferSynthesis({ id: "bad", sourceNodeIds: ["a", "b"], createdAt: new Date().toISOString(), reason: "这两个来源都不存在，因此不能形成记录。", question: "是否存在来源？" })).toThrow();
  expect(Object.keys(graph.nodes)).toHaveLength(0);
});
