import { createClientId, useDialogueUiStore } from "@/features/dialectic/store";

describe("useDialogueUiStore", () => {
  beforeEach(() => {
    useDialogueUiStore.setState({
      workspaceSessionId: "ws_test",
      focusedNodeId: null,
      composerParentId: null,
      errorMessage: null,
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
});
