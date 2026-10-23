import { defaultThinkingSpace, annotatePerspective } from "./model";
import { BranchGraphStore } from "@/store/branchGraph";
import { commitBranchesResult, commitSynthesisResult } from "@/features/dialectic/controller";
import { useDialogueUiStore } from "@/features/dialectic/store";
import { activateWorkspace, createWorkspaceRecord, loadWorkspaceRecord } from "@/lib/persist/workspaces";
import { importWorkspaceBundleText, serializeWorkspaceBundle } from "@/lib/io/workspaceBundle";
import { arrangeSeedScene, placeSeeds } from "@/features/dialectic/seedPlacement";
import { buildSeedContext, buildSeedScene } from "@/features/dialectic/seeds";

beforeEach(() => localStorage.clear());

function seeded() {
  const space = defaultThinkingSpace(); space.focus.horizon = 1;
  const store = new BranchGraphStore(), annotation = annotatePerspective(space, { scale: .8, concern: .7, horizon: .9 });
  const result = commitBranchesResult(store, { targetAssistantId: null, userText: "让探索持续生长", perspective: annotatePerspective(space), response: {
    requestId: "thinking-1", thesis: { text: "从长期看探索的秩序", summary: "探索的秩序", label: "秩序", stance: "正", perspective: annotation },
    antithesis: { text: "从长期看探索的意外", summary: "探索的意外", label: "意外", stance: "反", perspective: annotation }
  } });
  return { space, store, annotation, result };
}

it("commits the request snapshot to roots, both stances and synthesis without losing their meaning", () => {
  const { space, store, result, annotation } = seeded();
  const id = commitSynthesisResult(store, { thesisId: result.thesisId, antithesisId: result.antithesisId,
    response: { requestId: "thinking-2", synthesis: { text: "持续探索", summary: "持续探索", label: "生长", stance: "合", perspective: annotation } } });
  space.focus.horizon = -1;
  const graph = store.getGraph();
  expect(graph.nodes[result.userNodeId].meta?.perspective?.axes.find(axis => axis.id === "horizon")?.selected).toBe(1);
  for (const seedId of [result.thesisId, result.antithesisId, id]) expect(graph.nodes[seedId].meta?.perspective).toEqual(annotation);
  expect(graph.nodes[id].branchType).toBe("合");
  expect(buildSeedContext(graph, [id]).some(message => message.content.includes("当时选择的角度=长远"))).toBe(true);
});

it("keeps framework, selected perspective and xyz independent between workspaces and across export/import", () => {
  const { space, store, result } = seeded();
  const stageLayouts = { scene: { pan: { x: 0, y: 0 }, nodePositions: { [result.thesisId]: { x: 72, y: 34, z: .4 } } } };
  createWorkspaceRecord({ workspaceId: "thinking-a", graph: store.getGraph(), focusedNodeId: result.userNodeId, composerParentId: null, thinkingSpace: space, stageLayouts });
  createWorkspaceRecord({ workspaceId: "thinking-b", graph: new BranchGraphStore().getGraph(), focusedNodeId: null, composerParentId: null });
  const a = activateWorkspace("thinking-a")!, b = activateWorkspace("thinking-b")!;
  useDialogueUiStore.getState().hydrateWorkspace(a);
  expect(useDialogueUiStore.getState().thinkingSpace.focus.horizon).toBe(1);
  useDialogueUiStore.getState().hydrateWorkspace(b);
  expect(useDialogueUiStore.getState().thinkingSpace.focus).toEqual({});
  const record = loadWorkspaceRecord("thinking-a")!;
  const imported = importWorkspaceBundleText(serializeWorkspaceBundle(record), { generateWorkspaceId: () => "thinking-copy" });
  expect(imported.snapshot.thinkingSpace).toEqual(space);
  expect(imported.snapshot.stageLayouts).toEqual(stageLayouts);
  expect(imported.snapshot.graph.nodes[result.thesisId].meta?.perspective).toEqual(record.snapshot.graph.nodes[result.thesisId].meta?.perspective);
});

it("places generated seeds toward their semantic poles while preserving manually saved positions", () => {
  const { space, store, result } = seeded();
  const scene = arrangeSeedScene(buildSeedScene(store.getGraph(), result.userNodeId, null, space, 5));
  const placed = placeSeeds(scene);
  for (const id of [result.thesisId, result.antithesisId]) {
    expect(placed[id].x).toBeGreaterThanOrEqual(50); expect(placed[id].y).toBeLessThanOrEqual(50);
    expect(placed[id].z).toBeCloseTo(.9 * .46);
  }
  const manual = { x: 22, y: 77, z: -.3 };
  expect(placeSeeds(scene, { [result.thesisId]: manual })[result.thesisId]).toBe(manual);
});
