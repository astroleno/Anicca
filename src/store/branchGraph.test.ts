import { createEmptyGraph } from "@/types/anicca";
import { BranchGraphStore } from "@/store/branchGraph";

describe("BranchGraphStore", () => {
  it("creates a child user under an assistant branch", () => {
    const store = new BranchGraphStore();
    const rootId = store.createUserNode("root");
    const { thesisId } = store.createAssistantPair(rootId, {
      thesis: { text: "正" },
      antithesis: { text: "反" }
    });

    const childUserId = store.createChildUserNode(thesisId, "继续展开");
    const graph = store.getGraph();

    expect(graph.nodes[childUserId].parents).toEqual([thesisId]);
    expect(graph.nodes[thesisId].children).toContain(childUserId);
    expect(graph.entryIds).toEqual([rootId]);
  });

  it("persists synthesis dual-source metadata with lineage parent", () => {
    const store = new BranchGraphStore();
    const rootId = store.createUserNode("root");
    const { thesisId, antithesisId } = store.createAssistantPair(rootId, {
      thesis: { text: "继续", summary: "继续推进", label: "继续" },
      antithesis: { text: "暂停", summary: "暂停重构", label: "暂停" }
    });

    const synthesisId = store.createSynthesisAssistant([antithesisId, thesisId], {
      text: "重开主线",
      summary: "主线重开",
      label: "重开"
    });

    const graph = store.getGraph();
    expect(graph.nodes[synthesisId].branchType).toBe("合");
    expect(graph.nodes[synthesisId].parents).toEqual([thesisId, antithesisId]);
    expect(graph.nodes[synthesisId].meta).toMatchObject({
      sourceNodeIds: [thesisId, antithesisId],
      lineageParentId: rootId,
      summary: "主线重开",
      label: "重开"
    });
  });

  it("can replace the entire graph", () => {
    const store = new BranchGraphStore();
    const graph = createEmptyGraph();
    const rootId = "user_manual";
    graph.nodes[rootId] = {
      id: rootId,
      kind: "user",
      text: "manual",
      createdAt: new Date().toISOString(),
      parents: [],
      children: []
    };
    graph.entryIds.push(rootId);

    store.setGraph(graph);

    expect(store.getGraph().nodes[rootId]?.text).toBe("manual");
  });
});
