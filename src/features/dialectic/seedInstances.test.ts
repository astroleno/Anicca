import { BranchGraphStore } from "@/store/branchGraph";
import { useDialogueUiStore } from "./store";
import { defaultThinkingSpace } from "@/features/perspectives/model";
import { buildSeedInstanceScene, normalizeSeedInstances, seedConceptId, seedInstancePairAction, sourceInstances, unfoldedSourcePositions } from "./seedInstances";
import { findSynthesisGestureCandidate } from "./gestures";
import { commitSynthesisResult } from "./controller";
import { projectDialogueScene } from "./sceneProjection";
import { activateWorkspace, createWorkspaceRecord, loadWorkspaceRecord, saveWorkspaceRecord } from "@/lib/persist/workspaces";
import { importWorkspaceBundleText, serializeWorkspaceBundle } from "@/lib/io/workspaceBundle";

function setup() {
  const store = new BranchGraphStore();
  const root = store.createUserNode("共享概念");
  const pair = store.createAssistantPair(root, {
    thesis: { text: "允许探索", label: "探索" }, antithesis: { text: "保留边界", label: "边界" }
  });
  const c = store.createUserNode("另一种想法");
  const x = useDialogueUiStore.getState().addSeedInstance(pair.antithesisId);
  const y = useDialogueUiStore.getState().addSeedInstance(pair.antithesisId);
  return { store, root, a: pair.antithesisId, b: pair.thesisId, c, x, y };
}

beforeEach(() => {
  localStorage.clear();
  useDialogueUiStore.getState().hydrateWorkspace({ workspaceId: "instances", workspaceSessionId: "session", focusedNodeId: null, composerParentId: null });
});

describe("shared concept instances", () => {
  it("shares live content and perspective without duplicating graph history, while moving independently", () => {
    const { store, a, x, y } = setup();
    const graph = store.getGraph(), instances = useDialogueUiStore.getState().seedInstances;
    const scene = () => buildSeedInstanceScene({ graph, instances, focusId: a, activeInstanceId: x, expandedResultId: null, thinkingSpace: defaultThinkingSpace() });
    expect(Object.keys(graph.nodes)).toHaveLength(4);
    expect([a, x, y].map(id => seedConceptId(graph, instances, id))).toEqual([a, a, a]);
    store.setNodeText(a, "概念的新正文");
    store.patchNodeMeta(a, { label: "更新后", perspective: { axes: [{ id: "scale", label: "尺度", negative: "个体", positive: "群体", value: 1, source: "viewpoint" }] } });
    const shared = projectDialogueScene(graph, scene()).nodes.filter(node => node.conceptId === a);
    expect(shared).toHaveLength(3);
    for (const node of shared) expect(node).toMatchObject({ label: "更新后", preview: "概念的新正文", perspective: graph.nodes[a].meta?.perspective });
    const ui = useDialogueUiStore.getState();
    ui.setStageNodePosition("test", a, { x: 20, y: 30, z: .2 });
    ui.setStageNodePosition("test", x, { x: 50, y: 60, z: -.1 });
    ui.setStageNodePosition("test", y, { x: 75, y: 45, z: .3 });
    ui.setStageNodePosition("test", x, { x: 56, y: 66, z: -.4 });
    expect(useDialogueUiStore.getState().stageLayouts.test.nodePositions).toMatchObject({
      [a]: { x: 20, y: 30, z: .2 }, [x]: { x: 56, y: 66, z: -.4 }, [y]: { x: 75, y: 45, z: .3 }
    });
  });

  it("fuses separate instances with different concepts and preserves occurrence identities when sources reorder", () => {
    const { store, a, b, c, x, y } = setup();
    const graph = store.getGraph(), instances = useDialogueUiStore.getState().seedInstances;
    const first = seedInstancePairAction(graph, instances, x, b)!;
    const second = seedInstancePairAction(graph, instances, y, c)!;
    expect(first).toMatchObject({ thesisId: a, antithesisId: b, sourceInstanceIds: [x, b] });
    expect(first.key).not.toBe(second.key);
    expect(seedInstancePairAction(graph, instances, x, a)).toBeNull();
    expect(seedInstancePairAction(graph, instances, x, y)).toBeNull();
    expect(seedInstancePairAction(graph, instances, x, "missing")).toBeNull();
    const ids = [first, second].map((action, index) => commitSynthesisResult(store, { ...action,
      response: { requestId: `request-${index}`, synthesis: { text: `新合 ${index}`, label: `合 ${index}`, summary: "独立结果", stance: "合" } } }));
    expect(new Set(ids).size).toBe(2);
    expect(graph.nodes[ids[0]].meta?.sourceNodeIds).toEqual([b, a]);
    expect(graph.nodes[ids[0]].meta?.sourceInstanceIds).toEqual([b, x]);
    expect(sourceInstances(graph, instances, ids[1])).toEqual([y, c]);
    expect(graph.nodes[a].children).toEqual(expect.arrayContaining(ids));
    expect(graph.nodes[x]).toBeUndefined();
    expect(graph.nodes[y]).toBeUndefined();
    const scene = buildSeedInstanceScene({ graph, instances, focusId: ids[0], activeInstanceId: ids[0], expandedResultId: ids[0], thinkingSpace: defaultThinkingSpace() });
    expect(scene.find(node => node.id === x)).toMatchObject({ conceptId: a, sourceRole: "source" });
    expect(scene.find(node => node.id === y)).toMatchObject({ conceptId: a, sourceRole: "shared" });
    expect(scene.find(node => node.id === ids[0])).toMatchObject({ sourceRole: "result" });
    const nextScene = buildSeedInstanceScene({ graph, instances, focusId: ids[1], activeInstanceId: ids[1], expandedResultId: null, thinkingSpace: defaultThinkingSpace() });
    expect(nextScene.map(node => node.id)).toEqual(expect.arrayContaining([ids[0], ids[1], x, y]));
  });

  it("uses physical instance IDs for drag hit testing and canonical IDs for generation", () => {
    const { store, x, b, a } = setup(), graph = store.getGraph(), instances = useDialogueUiStore.getState().seedInstances;
    const action = seedInstancePairAction(graph, instances, x, b)!;
    const candidate = findSynthesisGestureCandidate({ draggedNodeId: x, draggedPosition: { x: 49, y: 50 },
      viewport: { width: 400, height: 300 }, action, nodes: [
        { node: { id: x, conceptId: a, label: "边界", kind: "assistant", relation: "child", seedX: 30, seedY: 50 }, position: { x: 30, y: 50 } },
        { node: { id: b, label: "探索", kind: "assistant", relation: "child", seedX: 60, seedY: 50 }, position: { x: 60, y: 50 } }
      ] });
    expect(candidate).toMatchObject({ draggedNodeId: x, counterpartNodeId: b, action: { thesisId: a, antithesisId: b } });
  });

  it("falls back to the original after hiding an occurrence without deleting results or other copies", () => {
    const { store, a, b, x, y } = setup(), graph = store.getGraph();
    const result = store.createSynthesisAssistant([a, b], { text: "合", sourceInstanceIds: [x, b] });
    useDialogueUiStore.getState().setStageNodePosition("test", x, { x: 30, y: 40 });
    useDialogueUiStore.getState().removeSeedInstance(x);
    const state = useDialogueUiStore.getState();
    expect(state.seedInstances[x]).toBeUndefined();
    expect(state.stageLayouts.test.nodePositions[x]).toBeUndefined();
    expect(state.seedInstances[y]).toBeDefined();
    expect(sourceInstances(graph, state.seedInstances, result)).toEqual([b, a]);
    expect(Object.keys(graph.nodes)).toHaveLength(5);
  });

  it("bounds rendered copies and can bring an older instance back into view", () => {
    const { store, a, x } = setup();
    for (let index = 0; index < 24; index++) useDialogueUiStore.getState().addSeedInstance(a);
    const scene = buildSeedInstanceScene({ graph: store.getGraph(), instances: useDialogueUiStore.getState().seedInstances,
      focusId: a, activeInstanceId: x, expandedResultId: null, thinkingSpace: defaultThinkingSpace() });
    expect(scene).toHaveLength(8);
    expect(scene.some(node => node.id === x)).toBe(true);
    expect(new Set(scene.map(node => node.id)).size).toBe(scene.length);
  });

  it("spreads the result and its sources, preserving unrelated positions and depth", () => {
    const { store, a, b, c, x } = setup(), graph = store.getGraph(), instances = useDialogueUiStore.getState().seedInstances;
    const result = store.createSynthesisAssistant([a, b], { text: "合", sourceInstanceIds: [x, b] });
    const scene = buildSeedInstanceScene({ graph, instances, focusId: result, activeInstanceId: result, expandedResultId: result, thinkingSpace: defaultThinkingSpace() });
    for (const compact of [false, true]) {
      const saved = { [result]: { x: 50, y: 50 }, [x]: { x: 50, y: 50, z: .35 }, [b]: { x: 50, y: 50 }, [c]: { x: 80, y: 20 } };
      const positions = unfoldedSourcePositions(scene, saved, result, [b, x], compact);
      expect(positions[c]).toEqual(saved[c]);
      expect(positions[x].z).toBe(.35);
      expect(Math.hypot(positions[x].x - positions[b].x, positions[x].y - positions[b].y)).toBeGreaterThan(20);
      expect(positions[result]).not.toEqual(positions[x]);
    }
  });

  it("restores references and positions across workspace switching and bundle round trips", () => {
    const { store, a, x, y } = setup(), graph = store.getGraph(), instances = useDialogueUiStore.getState().seedInstances;
    createWorkspaceRecord({ workspaceId: "shared", graph, focusedNodeId: a, composerParentId: null, seedInstances: instances,
      stageLayouts: { "seeds:shared": { pan: { x: 0, y: 0 }, nodePositions: { [x]: { x: 27, y: 65, z: .2 }, [y]: { x: 73, y: 35, z: -.2 } } } } });
    const activated = activateWorkspace("shared")!;
    useDialogueUiStore.getState().hydrateWorkspace(activated);
    expect(useDialogueUiStore.getState().seedInstances).toEqual(instances);
    const record = loadWorkspaceRecord("shared")!;
    saveWorkspaceRecord({ id: "shared", snapshot: record.snapshot });
    const restored = importWorkspaceBundleText(serializeWorkspaceBundle(loadWorkspaceRecord("shared")!), { generateWorkspaceId: () => "imported" });
    expect(restored.snapshot.seedInstances).toEqual(instances);
    expect(restored.snapshot.graph).toEqual(graph);
    expect(restored.snapshot.stageLayouts["seeds:imported"]).toEqual(record.snapshot.stageLayouts["seeds:shared"]);
    expect(restored.snapshot.stageLayouts["seeds:shared"]).toBeUndefined();
    useDialogueUiStore.getState().hydrateWorkspace({ workspaceId: "old", workspaceSessionId: "old", focusedNodeId: null, composerParentId: null });
    expect(useDialogueUiStore.getState().seedInstances).toEqual({});
    useDialogueUiStore.getState().hydrateWorkspace({ ...restored.snapshot, workspaceSessionId: "restored" });
    expect(useDialogueUiStore.getState().seedInstances).toEqual(instances);
  });

  it("rejects malformed, dangling and graph-colliding references while supporting old snapshots", () => {
    const { store, a, x } = setup(), graph = store.getGraph(), valid = useDialogueUiStore.getState().seedInstances[x];
    expect(normalizeSeedInstances(undefined, graph)).toEqual({});
    const value = { [x]: valid, [a]: { ...valid, id: a }, dangling: { ...valid, id: "dangling", conceptId: "missing" }, mismatch: valid,
      invalid: { ...valid, id: "invalid", createdAt: "invalid" } };
    expect(normalizeSeedInstances(value, graph)).toEqual({ [x]: valid });
    expect(seedConceptId(graph, {}, "toString")).toBeNull();
  });

  it("unfolds legacy synthesis parents even when source metadata was not saved", () => {
    const { store, a, b } = setup();
    const result = store.createSynthesisAssistant([a, b], { text: "旧的合" });
    delete store.getGraph().nodes[result].meta;
    expect(sourceInstances(store.getGraph(), {}, result)).toEqual([b, a]);
  });
});
