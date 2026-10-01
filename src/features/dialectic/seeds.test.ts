import { BranchGraphStore } from "@/store/branchGraph";
import { deriveDialogueView } from "./viewModel";
import { buildSeedContext, buildSeedScene, seedPairAction } from "./seeds";
import { commitSeedSplitResult } from "./controller";
import { serializeWorkspaceBundle, importWorkspaceBundleText } from "@/lib/io/workspaceBundle";
import { ANICCA_WORKSPACE_SCHEMA_VERSION } from "@/lib/persist/local";

describe("seed operations", () => {
  it("combines same-role seeds across themes, splits the result and combines it again without losing sources", () => {
    const store = new BranchGraphStore();
    const first = store.createUserNode("远程协作");
    const second = store.createUserNode("一个人的创作");
    const a = store.createAssistantPair(first, { thesis: { text: "异步讨论" } }).thesisId;
    const b = store.createAssistantPair(second, { thesis: { text: "独立思考" } }).thesisId;
    const action = seedPairAction(store.getGraph(), a, b);
    expect(action?.available).toBe(true);
    const combined = store.createSynthesisAssistant([a, b], { text: "先独立思考，再交换作品", label: "交换作品" });
    expect(store.getGraph().nodes[combined].meta?.lineageParentId).toBeUndefined();
    const split = commitSeedSplitResult(store, combined, { requestId: "split", thesis: { text: "定期交换", summary: "规律反馈", label: "交换", stance: "正" }, antithesis: { text: "需要时交换", summary: "按需反馈", label: "按需", stance: "反" } });
    const recombined = store.createSynthesisAssistant([first, split.thesisId], { text: "异步创作小组" });
    const graph = store.getGraph();
    expect(graph.nodes[split.thesisId].parents).toEqual([combined]);
    expect(graph.nodes[recombined].meta?.sourceNodeIds).toEqual(expect.arrayContaining([first, split.thesisId]));
    expect(Object.keys(graph.nodes)).toHaveLength(10);
    expect(graph.entryIds).toEqual([first, second]);
    expect(deriveDialogueView(graph, recombined).sidebarItems.map((item) => item.id)).toEqual(expect.arrayContaining(Object.keys(graph.nodes)));
    const context = buildSeedContext(graph, [split.thesisId]).map((message) => message.content).join("\n");
    for (const source of ["远程协作", "一个人的创作", "异步讨论", "独立思考", "交换作品"]) expect(context).toContain(source);
    const now = "2026-10-01T00:00:00.000Z";
    const bundle = serializeWorkspaceBundle({ entry: { id: "test", title: "Seed workspace", createdAt: now, updatedAt: now, lastOpenedAt: now, entryCount: 2, nodeCount: 10 }, snapshot: { schemaVersion: ANICCA_WORKSPACE_SCHEMA_VERSION, workspaceId: "test", graph, focusedNodeId: recombined, composerParentId: combined, stageLayouts: {} } });
    const restored = importWorkspaceBundleText(bundle);
    expect(restored.snapshot.graph).toEqual(graph);
    expect(restored.snapshot.composerParentId).toBe(combined);
  });

  it("rejects self-combination and missing sources without leaving a partial graph", () => {
    const store = new BranchGraphStore();
    const a = store.createUserNode("a");
    expect(seedPairAction(store.getGraph(), a, a)).toBeNull();
    expect(() => store.createSynthesisAssistant([a, a])).toThrow("unique");
    expect(() => store.createSynthesisAssistant([a, "missing"])).toThrow("exist");
    expect(() => store.createAssistantPair("missing")).toThrow("parent not found");
    expect(Object.keys(store.getGraph().nodes)).toEqual([a]);
  });

  it("keeps older seeds selectable beyond the render budget", () => {
    const store = new BranchGraphStore();
    const ids = Array.from({ length: 40 }, (_, i) => store.createUserNode(`idea ${i}`));
    const scene = buildSeedScene(store.getGraph(), ids[0], ids[1]);
    expect(scene).toHaveLength(8);
    expect(scene.map((node) => node.id)).toEqual(expect.arrayContaining([ids[0], ids[1], ids[39]]));
    expect(deriveDialogueView(store.getGraph(), ids[0]).sidebarItems).toHaveLength(40);
  });

  it("bounds a wide ancestry while retaining both current sources", () => {
    const store = new BranchGraphStore();
    const ids = Array.from({ length: 32 }, (_, i) => store.createUserNode(`ancestor ${i}`));
    let level = ids;
    while (level.length > 2) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += 2) next.push(store.createSynthesisAssistant([level[i], level[i + 1]], { text: `merge ${level.length} ${i}` }));
      level = next;
    }
    const graph = store.getGraph();
    const context = buildSeedContext(graph, level);
    expect(context).toHaveLength(16);
    for (const id of level) expect(context.some(message => message.content.includes(graph.nodes[id].text!))).toBe(true);
  });
});
