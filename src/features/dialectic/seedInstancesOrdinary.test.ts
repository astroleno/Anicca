import { defaultThinkingSpace } from "@/features/perspectives/model";
import { BranchGraphStore } from "@/store/branchGraph";
import { buildSeedInstanceScene } from "./seedInstances";

it("tiers the exact focus instance and both directions of a direct edge", () => {
  const store = new BranchGraphStore();
  const root = store.createUserNode("起点");
  const { thesisId: a, antithesisId: b } = store.createAssistantPair(root);
  const copy = { id: "copy", conceptId: a, createdAt: new Date().toISOString(), ordinal: 1 };
  const other = { ...copy, id: "other", ordinal: 2 };
  const result = store.createSynthesisAssistant([a, b], { sourceInstanceIds: [copy.id, b] });
  const graph = store.getGraph();
  const input = {
    graph, instances: { copy, other }, pinnedInstanceIds: [copy.id, other.id, root, a, b, result],
    expandedResultId: null, thinkingSpace: defaultThinkingSpace()
  };
  const tiers = (focusId: string, activeInstanceId = focusId) => Object.fromEntries(
    buildSeedInstanceScene({ ...input, focusId, activeInstanceId }).map(node => [node.id, node.ordinaryTier])
  );

  expect(tiers(root)).toEqual({
    [root]: "focus", [a]: "direct", [b]: "direct", [result]: "distant", copy: "distant", other: "distant"
  });
  expect(tiers(a, copy.id)).toEqual({
    [root]: "distant", [a]: "distant", [b]: "distant", [result]: "direct", copy: "focus", other: "distant"
  });
  expect(tiers(a)).toEqual({
    [root]: "direct", [a]: "focus", [b]: "distant", [result]: "distant", copy: "distant", other: "distant"
  });
  delete graph.nodes[result].branchType;
  expect(tiers(result)).toEqual({
    [root]: "distant", [a]: "distant", [b]: "direct", [result]: "focus", copy: "direct", other: "distant"
  });
  // Source metadata and the old edge record still name this disconnected parent.
  graph.nodes[a].children = [];
  expect(tiers(result)[copy.id]).toBe("distant");
  expect(tiers(a, copy.id)[result]).toBe("distant");
});
