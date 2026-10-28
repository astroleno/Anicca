import { BranchGraphStore } from "@/store/branchGraph";
import { buildComparisonSeeds, readComparisonSeeds, validateNovelty } from "./novelty";

it("compares earlier companion branches as well as direct ancestors within a fixed budget", () => {
  const store = new BranchGraphStore(), root = store.createUserNode("写作怎样收束？");
  const a = store.createAssistantPair(root, { thesis: { text: "等待重复出现的主题。" }, antithesis: { text: "重复也可能只是写作惯性。" } });
  const b = store.createAssistantPair(a.thesisId, { thesis: { text: "回看那些反复出现的主题。" }, antithesis: { text: "需要检验反复是否具有意义。" } });
  const later = store.createAssistantPair(a.thesisId, { thesis: { text: "之后的新探索。" }, antithesis: { text: "之后的新检验。" } });
  const graph = store.getGraph();
  // The comparison cutoff is temporal: paired responses share a round, even
  // when creating the test nodes happens to cross a real millisecond boundary.
  graph.nodes[root].createdAt = "2026-10-28T00:00:00.000Z";
  for (const id of [a.thesisId, a.antithesisId]) graph.nodes[id].createdAt = "2026-10-28T00:00:00.001Z";
  for (const id of [b.thesisId, b.antithesisId]) graph.nodes[id].createdAt = "2026-10-28T00:00:00.002Z";
  for (const id of [later.thesisId, later.antithesisId]) graph.nodes[id].createdAt = "2026-10-28T00:00:00.003Z";
  const ids = buildComparisonSeeds(graph, b.thesisId).map(item => item.id);
  expect(ids).toEqual(expect.arrayContaining([a.thesisId, a.antithesisId, b.thesisId, b.antithesisId]));
  expect(ids).not.toContain(later.thesisId);
  expect(ids).not.toContain(later.antithesisId);
  expect(buildComparisonSeeds(store.getGraph(), root).map(item => item.id)).toEqual([a.thesisId, a.antithesisId]);
  expect(ids.length).toBeLessThanOrEqual(8);
});

it("requires grounded evidence for a revisit and never treats a malformed review as new", () => {
  const sources = [{ id: "a", label: "取舍", text: "只认领真正有张力的伏线，其余留在背景。" }];
  const text = "只把有张力的线索升格为债，不必认领所有伏线。";
  const valid = { status: "revisit", sourceId: "a", reason: "两处都主张只认领有张力的线索。", sourceEvidence: "只认领真正有张力的伏线", resultEvidence: "只把有张力的线索升格为债" };
  expect(validateNovelty(valid, text, sources).status).toBe("revisit");
  expect(validateNovelty({ ...valid, sourceId: "invented" }, text, sources).status).toBe("unchecked");
  expect(validateNovelty({ ...valid, resultEvidence: "新文没有说过的话" }, text, sources).status).toBe("unchecked");
  expect(validateNovelty({ status: "new" }, text, sources)).toEqual({ status: "new" });
  expect(validateNovelty({}, text, sources)).toEqual({ status: "unchecked" });
  expect(readComparisonSeeds(Array.from({ length: 9 }, () => sources[0]))).toBeNull();
});
