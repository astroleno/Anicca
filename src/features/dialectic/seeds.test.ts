import { BranchGraphStore } from "@/store/branchGraph";
import { deriveDialogueView } from "./viewModel";
import { buildSeedContext, buildSeedScene, fissionPair, seedPairAction } from "./seeds";
import { commitSeedSplitResult } from "./controller";
import { serializeWorkspaceBundle, importWorkspaceBundleText } from "@/lib/io/workspaceBundle";
import { ANICCA_WORKSPACE_SCHEMA_VERSION } from "@/lib/persist/local";

describe("seed operations", () => {
  it("restores exact ordinary pairs across reload, repeated expansion, and synthesis continuation", () => {
    const store = new BranchGraphStore(), source = store.createUserNode("保留开放的角落。");
    const first = store.createAssistantPair(source), second = store.createAssistantPair(source);
    const synthesis = store.createSynthesisAssistant([first.thesisId, first.antithesisId], { text: "共同协商用途与维护。" });
    const continued = store.createAssistantPair(synthesis);
    store.setGraph(JSON.parse(JSON.stringify(store.getGraph())));
    const graph = store.getGraph();
    for (const [parent, pair] of [[source, first], [source, second], [synthesis, continued]] as const) {
      expect(fissionPair(graph, pair.thesisId)).toEqual({ sourceId: parent, firstId: pair.thesisId, secondId: pair.antithesisId });
      expect(fissionPair(graph, pair.antithesisId)).toEqual(fissionPair(graph, pair.thesisId));
      expect(graph.nodes[pair.thesisId].meta?.fissionGroupId).toBeTruthy();
    }
    expect(graph.nodes[first.thesisId].meta?.fissionGroupId).not.toBe(graph.nodes[second.thesisId].meta?.fissionGroupId);
    expect(fissionPair(graph, source)).toBeNull();
    delete graph.nodes[first.antithesisId];
    expect(fissionPair(graph, first.thesisId)).toBeNull();
    // A damaged same-group extra endpoint must not silently select a different sibling.
    graph.nodes[second.antithesisId].meta!.fissionGroupId = graph.nodes[continued.antithesisId].meta!.fissionGroupId;
    expect(fissionPair(graph, second.thesisId)).toBeNull();
    expect(fissionPair(graph, continued.thesisId)?.secondId).toBe(continued.antithesisId);
  });

  it("recovers only an unambiguous legacy pair and does not guess from sibling order", () => {
    const store = new BranchGraphStore(), source = store.createUserNode("旧工作区"), pair = store.createAssistantPair(source);
    const graph = store.getGraph();
    for (const id of [pair.thesisId, pair.antithesisId]) delete graph.nodes[id].meta!.fissionGroupId;
    expect(fissionPair(graph, pair.thesisId)?.secondId).toBe(pair.antithesisId);
    const later = store.createAssistantPair(source);
    expect(fissionPair(graph, pair.thesisId)?.secondId).toBe(pair.antithesisId);
    for (const id of [later.thesisId, later.antithesisId]) delete graph.nodes[id].meta!.fissionGroupId;
    expect(fissionPair(graph, pair.thesisId)).toBeNull();
    expect(fissionPair(graph, later.thesisId)).toBeNull();
  });

  it("retains original constraints and source identities even when an ancestor has a short summary", () => {
    const store = new BranchGraphStore();
    const root = store.createUserNode("愿意听取自愿反馈，但不能录屏，也不能追踪行为。");
    const child = store.createAssistantPair(root, { thesis: { text: "让用户描述具体困难。", summary: "了解困难" } }).thesisId;
    const graph = store.getGraph();
    graph.nodes[root].meta = { ...graph.nodes[root].meta, summary: "了解用户" };
    const context = buildSeedContext(graph, [child]).map(message => message.content).join("\n");
    expect(context).toContain("不能录屏，也不能追踪行为");
    expect(context).toContain(`来源=${root}`);
    expect(context).toContain("让用户描述具体困难");
  });

  it("keeps both user origins through deep cross-topic merges without including unrelated roots", () => {
    const store = new BranchGraphStore();
    const first = store.createUserNode("桥一直存在，只在下雪时可见，不能移动或发声。");
    const second = store.createUserNode("重画窗景，保留注意力变化。");
    store.createUserNode("这是无关工作区主题，不应进入上下文。");
    const descend = (root: string) => {
      let current = root;
      for (let i = 0; i < 9; i++) current = store.createAssistantPair(current, { thesis: { text: `深入 ${root} ${i}` } }).thesisId;
      return current;
    };
    const left = descend(first), right = descend(second);
    const merge = store.createSynthesisAssistant([left, right], { text: "观察与重现" });
    const graph = store.getGraph();
    const context = buildSeedContext(graph, [merge]);
    const text = context.map(message => message.content).join("\n");
    expect(context.length).toBeLessThanOrEqual(16);
    for (const id of [first, second, left, right, merge]) expect(text).toContain(graph.nodes[id].text!);
    expect(text).not.toContain("这是无关工作区主题");
  });

  it("retains a later explicit user correction alongside the origin and current candidate", () => {
    const store = new BranchGraphStore();
    const root = store.createUserNode("桥只在下雪时可见。");
    let current = store.createAssistantPair(root, { thesis: { text: "旧解释" } }).thesisId;
    const correction = store.createChildUserNode(current, "补充：桥一直存在，雪停只是不再可见。");
    current = correction;
    for (let i = 0; i < 7; i++) current = store.createAssistantPair(current, { thesis: { text: `新解释 ${i}` } }).thesisId;
    const text = buildSeedContext(store.getGraph(), [current]).map(message => message.content).join("\n");
    expect(text).toContain("桥只在下雪时可见。");
    expect(text).toContain("补充：桥一直存在，雪停只是不再可见。");
    expect(text).toContain("新解释 6");
  });
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
    expect(fissionPair(restored.snapshot.graph, split.thesisId)).toEqual({ sourceId: combined, firstId: split.thesisId, secondId: split.antithesisId });
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

  it("keeps an older question and both of its branches visible in the quieter five-seed scene", () => {
    const store = new BranchGraphStore(), root = store.createUserNode("旧问题"), pair = store.createAssistantPair(root);
    const synthesis = store.createSynthesisAssistant([pair.thesisId, pair.antithesisId]);
    for (let i=0;i<4;i++) store.createAssistantPair(store.createUserNode(`新问题 ${i}`));
    const scene = buildSeedScene(store.getGraph(), root, null, undefined, 5);
    expect(scene).toHaveLength(5);
    expect(scene.map(node => node.id)).toEqual(expect.arrayContaining([root, pair.thesisId, pair.antithesisId, synthesis]));
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
