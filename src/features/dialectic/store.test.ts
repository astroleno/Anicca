import { createClientId, useDialogueUiStore } from "@/features/dialectic/store";

describe("useDialogueUiStore", () => {
  beforeEach(() => {
    useDialogueUiStore.setState({
      workspaceId: "workspace_test",
      workspaceSessionId: "ws_test",
      focusedNodeId: null,
      composerParentId: null,
      stageLayouts: {},
      stagePreview: null,
      errorState: null,
      pendingAction: null,
      pending: {
        branches: null,
        synthesis: null
      }
    });
  });

  it("keeps branch and synthesis pending slots mutually exclusive", () => {
    useDialogueUiStore.getState().beginPending("branches", {
      requestId: createClientId("req"),
      workspaceSessionId: "ws_test",
      focusSnapshotId: "focus:a",
      composerTargetId: "node_a"
    });

    useDialogueUiStore.getState().beginPending("synthesis", {
      requestId: createClientId("req"),
      workspaceSessionId: "ws_test",
      focusSnapshotId: "focus:b",
      composerTargetId: "node_b"
    });

    expect(useDialogueUiStore.getState().pending.branches).toBeNull();
    expect(useDialogueUiStore.getState().pending.synthesis?.composerTargetId).toBe("node_b");
    expect(useDialogueUiStore.getState().pendingAction).toBe("synthesis");
  });

  it("stores stage node positions and pan per focus snapshot", () => {
    useDialogueUiStore.getState().setStageNodePosition("focus:root", "node_a", { x: 44, y: 57 });
    useDialogueUiStore.getState().setStagePan("focus:root", { x: 24, y: -18 });

    expect(useDialogueUiStore.getState().stageLayouts["focus:root"]).toEqual({
      pan: { x: 24, y: -18 },
      nodePositions: {
        node_a: { x: 44, y: 57 }
      }
    });
  });

  it("keeps in-flight pending state when focus changes", () => {
    useDialogueUiStore.getState().beginPending("branches", {
      requestId: "req_pending",
      workspaceSessionId: "ws_test",
      focusSnapshotId: "focus:a",
      composerTargetId: "node_a"
    });

    useDialogueUiStore.getState().setFocusedNodeId("node_b");

    expect(useDialogueUiStore.getState()).toMatchObject({
      focusedNodeId: "node_b",
      pendingAction: "branches",
      pending: {
        branches: {
          requestId: "req_pending",
          workspaceSessionId: "ws_test",
          focusSnapshotId: "focus:a",
          composerTargetId: "node_a"
        },
        synthesis: null
      }
    });
  });

  it("keeps source-layout dragging and new placements temporary and restores the persisted layout", () => {
    const state = useDialogueUiStore.getState();
    state.setStageNodePosition("seeds:w", "a", { x: 30, y: 40, z: .2 });
    state.setStagePan("seeds:w", { x: 4, y: 6 });
    const base = structuredClone(useDialogueUiStore.getState().stageLayouts);
    state.beginStagePreview("seeds:w", { a: { x: 55, y: 65 } }, { a: { x: 60, y: 70 } });
    state.setStageNodePosition("seeds:w", "a", { x: 75, y: 80 });
    state.setStagePan("seeds:w", { x: 20, y: 30 }, "compact");
    state.ensureStageNodePositions("seeds:w", { b: { x: 20, y: 20 } }, { b: { x: 22, y: 22 } });
    expect(useDialogueUiStore.getState().stageLayouts).toEqual(base);
    expect(useDialogueUiStore.getState().stagePreview?.view.nodePositions.a).toEqual({ x: 75, y: 80 });
    expect(useDialogueUiStore.getState().stagePreview?.view.compact?.pan).toEqual({ x: 20, y: 30 });
    state.endStagePreview();
    expect(useDialogueUiStore.getState().stagePreview).toBeNull();
    expect(useDialogueUiStore.getState().stageLayouts).toEqual(base);
  });

  it("hydrates persisted workspace identity and clears transient pending state", () => {
    useDialogueUiStore.getState().beginPending("branches", {
      requestId: createClientId("req"),
      workspaceSessionId: "ws_test",
      focusSnapshotId: "focus:a",
      composerTargetId: "node_a"
    });

    useDialogueUiStore.getState().hydrateWorkspace({
      workspaceId: "workspace_2",
      workspaceSessionId: "ws_runtime_2",
      focusedNodeId: "node_focus",
      composerParentId: "node_parent",
      stageLayouts: {
        "focus:node_focus": {
          pan: { x: 1, y: 2 },
          nodePositions: {}
        }
      }
    });

    expect(useDialogueUiStore.getState()).toMatchObject({
      workspaceId: "workspace_2",
      workspaceSessionId: "ws_runtime_2",
      focusedNodeId: "node_focus",
      composerParentId: "node_parent",
      pendingAction: null,
      pending: {
        branches: null,
        synthesis: null
      }
    });
  });
});
