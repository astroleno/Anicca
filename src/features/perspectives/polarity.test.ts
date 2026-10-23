import { defaultThinkingSpace, johariThinkingSpace } from "./model";
import { normalizePolarityOrigin, polarityFrame, polarityPerspective, polarityLabel } from "./polarity";
import { BranchGraphStore } from "@/store/branchGraph";
import { commitPolarityResult, commitSeedSplitResult } from "@/features/dialectic/controller";
import { seedInstancePairAction } from "@/features/dialectic/seedInstances";
import { importWorkspaceBundleText, serializeWorkspaceBundle } from "@/lib/io/workspaceBundle";

it("changes only the requested axis and captures each endpoint independently of model assessment", () => {
  const space = defaultThinkingSpace(); space.focus = { concern: 1, horizon: -1 };
  expect(polarityFrame(space, "scale", -1).focus).toEqual({ concern: 1, horizon: -1, scale: -1 });
  const annotation = polarityPerspective(space, "scale", -1, { scale: .9, concern: .6 });
  expect(annotation.axes[0]).toMatchObject({ value: -1, selected: -1, source: "viewpoint" });
  expect(annotation.axes[1]).toMatchObject({ value: .6, selected: 1 });
  expect(space.focus).toEqual({ concern: 1, horizon: -1 });
  expect(() => polarityFrame(space, "missing", 1)).toThrow("polarity_axis_missing");
});

it("retains Johari endpoints as requested hypothetical lenses, never inferred knowledge", () => {
  const space = johariThinkingSpace(); space.focus["johari-self"] = 1;
  const result = polarityPerspective(space, "johari-self", -1, { "johari-self": 1, "johari-others": 1 });
  expect(result.axes.map(axis => [axis.value, axis.source])).toEqual([[-1, "viewpoint"], [0, "viewpoint"]]);
});

it("normalizes imported provenance and freezes axis definitions", () => {
  const space = defaultThinkingSpace();
  const origin = normalizePolarityOrigin({ groupId: "pair_a", axisId: "scale", pole: -1, frame: space })!;
  space.axes[0].negative = "另一个含义";
  expect(polarityLabel(origin)).toBe("细节");
  expect(origin.frame.focus.scale).toBe(-1);
  expect(normalizePolarityOrigin({ ...origin, axisId: "__proto__" })).toBeUndefined();
  expect(normalizePolarityOrigin({ ...origin, frame: {} })).toBeUndefined();
  expect(normalizePolarityOrigin({ ...origin, pole: 0 })).toBeUndefined();
});

it("commits two stance-free concepts atomically and keeps their lenses through export, fission, copying and fusion", () => {
  const store = new BranchGraphStore(), root = store.createUserNode("创作怎样持续？");
  const frame = defaultThinkingSpace(); frame.focus.horizon = 1;
  const listener = vi.fn(); store.subscribe(listener);
  const pair = commitPolarityResult(store, root, frame, { requestId: "pair_test", axis: frame.axes[1],
    negative: { text: "从个体看", summary: "个体的空间", label: "个人节奏", perspective: polarityPerspective(frame, "concern", -1) },
    positive: { text: "从群体看", summary: "共同的空间", label: "共同记忆", perspective: polarityPerspective(frame, "concern", 1) } });
  expect(listener).toHaveBeenCalledTimes(1);
  expect(store.getGraph().nodes[root].children).toEqual([pair.negativeId, pair.positiveId]);
  for (const id of [pair.negativeId, pair.positiveId]) expect(store.getGraph().nodes[id].branchType).toBeUndefined();
  const originalFrame = store.getGraph().nodes[pair.negativeId].meta!.polarity!.frame;
  const split = commitSeedSplitResult(store, pair.negativeId, { requestId: "ordinary", thesis: {
    text: "深化个人节奏", summary: "深化", label: "自定节奏", stance: "正" }, antithesis: {
    text: "质疑个人节奏的前提", summary: "质疑", label: "节奏前提", stance: "反" } }, originalFrame);
  expect(store.getGraph().nodes[split.thesisId]).toMatchObject({ branchType: "正", meta: { fissionFrame: { focus: { concern: -1, horizon: 1 } } } });
  const instance = { id: "copy_a", conceptId: pair.negativeId, createdAt: "2026-10-21T00:00:00Z", ordinal: 1 };
  const action = seedInstancePairAction(store.getGraph(), { copy_a: instance }, "copy_a", pair.positiveId)!;
  const merged = store.createSynthesisAssistant([action.thesisId, action.antithesisId], { text: "合流", sourceInstanceIds: action.sourceInstanceIds });
  expect(store.getGraph().nodes[merged].meta?.sourceInstanceIds).toEqual(["copy_a", pair.positiveId]);
  const text = serializeWorkspaceBundle({ entry: { id: "w", title: "思考", createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z", lastOpenedAt: "2026-10-21T00:00:00Z", entryCount: 1, nodeCount: 6 },
    snapshot: { schemaVersion: "anicca-workspace-v2", workspaceId: "w", graph: store.getGraph(), focusedNodeId: pair.negativeId, composerParentId: null, seedInstances: { copy_a: instance }, thinkingSpace: frame, stageLayouts: {} } });
  const imported = importWorkspaceBundleText(text);
  expect(imported.snapshot.graph.nodes[pair.negativeId].meta?.polarity?.frame.focus).toEqual({ horizon: 1, concern: -1 });
  expect(imported.snapshot.seedInstances?.copy_a.conceptId).toBe(pair.negativeId);
});

it("does not create half a pair when the axis no longer exists", () => {
  const store = new BranchGraphStore(), root = store.createUserNode("想法");
  expect(() => store.createPolarityPair(root, { groupId: "bad", axisId: "missing", frame: defaultThinkingSpace(), negative: {}, positive: {} })).toThrow();
  expect(Object.keys(store.getGraph().nodes)).toHaveLength(1);
  expect(store.getGraph().nodes[root].children).toEqual([]);
});
