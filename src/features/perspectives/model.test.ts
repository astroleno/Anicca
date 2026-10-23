import { annotatePerspective, compatibleCoordinates, defaultThinkingSpace, graphGenerations, johariThinkingSpace, normalizeThinkingSpace, normalizeAxisSuggestions, normalizeSeedPerspective, thinkingSpacePrompt } from "./model";
import { BranchGraphStore } from "@/store/branchGraph";

it("keeps independent axes, bounds coordinates, and strips invalid or duplicate dimensions", () => {
  const space = defaultThinkingSpace();
  const result = normalizeThinkingSpace({ axes: [...space.axes, space.axes[0], { ...space.axes[0], id: "extra" }, { id: "__proto__" }], focus: { scale: Infinity, concern: -7, missing: 1 } });
  expect(result.axes).toHaveLength(4);
  expect(result.axes.at(-1)?.placement).toBe("none");
  expect(result.focus).toEqual({ concern: -1 });
});

it("distinguishes model assessment from chosen viewpoint and never infers Johari knowledge", () => {
  const space = johariThinkingSpace(); space.focus["johari-self"] = 1;
  expect(annotatePerspective(space, { "johari-self": -1, "johari-others": 1 }).axes.map(a => [a.value, a.source]))
    .toEqual([[1, "viewpoint"], [0, "viewpoint"]]);
  const content = annotatePerspective(defaultThinkingSpace(), { scale: 2, concern: NaN });
  expect(content.axes[0]).toMatchObject({ value: 1, source: "model" });
  expect(content.axes[1]).toMatchObject({ value: 0, source: "viewpoint" });
});

it("does not reinterpret old positions when the meaning of a pole changes", () => {
  const space = defaultThinkingSpace(), saved = annotatePerspective(space, { scale: .8 });
  expect(compatibleCoordinates(saved, space).x).toBe(.8);
  space.axes[0].positive = "全新含义";
  expect(compatibleCoordinates(saved, space).x).toBeUndefined();
});

it("keeps suggestions separate, deduplicates existing axes and carries selected perspective into prompts", () => {
  const space = defaultThinkingSpace(); space.focus.horizon = 1; space.focus.concern = -1;
  const suggestions = normalizeAxisSuggestions([{ label: "资源", negative: "节制", positive: "扩张", reason: "查看资源边界" }, { label: "重复", negative: "细节", positive: "整体", reason: "已有" }], space.axes);
  expect(suggestions).toHaveLength(1);
  expect(space.axes).toHaveLength(3);
  expect(thinkingSpacePrompt(space)).toContain('"selected":1');
  expect(thinkingSpacePrompt(space)).toContain("长远");
  expect(thinkingSpacePrompt(space)).toContain('"关切"选"个体"');
  expect(thinkingSpacePrompt(space)).not.toContain('"关切"选"群体"');
});

it("counts a synthesis after its deepest parent rather than by list order", () => {
  const store = new BranchGraphStore(), root = store.createUserNode("问题"), pair = store.createAssistantPair(root);
  const split = store.createAssistantPair(pair.thesisId), merged = store.createSynthesisAssistant([pair.antithesisId, split.thesisId]);
  const generations = graphGenerations(store.getGraph());
  expect(generations.get(root)).toBe(0); expect(generations.get(merged)).toBe(3);
});

it("handles long imported histories iteratively and does not invent a generation for cycles", () => {
  const graph = { version: "anicca-dialectic-v2" as const, nodes: {} as ReturnType<BranchGraphStore["getGraph"]>["nodes"], entryIds: ["n0"], edges: {} };
  for (let i=0;i<6000;i++) graph.nodes[`n${i}`] = { id:`n${i}`, kind:"user", createdAt:"", parents:i ? [`n${i-1}`] : [], children:i<5999 ? [`n${i+1}`] : [] };
  expect(graphGenerations(graph).get("n5999")).toBe(5999);
  graph.nodes.n0.parents=["n5999"];
  expect(graphGenerations(graph).get("n5999")).toBe(0);
});

it("rejects malformed provenance and duplicate imported axis annotations", () => {
  const axis=annotatePerspective(defaultThinkingSpace()).axes[0];
  expect(normalizeSeedPerspective({ axes:[axis, axis, { ...axis, id:"bad", source:{ toString:0 } }] })?.axes).toHaveLength(1);
});
