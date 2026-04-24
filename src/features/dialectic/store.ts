import { create } from "zustand";

export type PendingSlot = "branches" | "synthesis";

export type PendingRequest = {
  requestId: string;
  workspaceSessionId: string;
  focusSnapshotId: string;
  composerTargetId: string | null;
};

type PendingState = Record<PendingSlot, PendingRequest | null>;

export type HydratedWorkspaceState = {
  workspaceSessionId: string;
  focusedNodeId: string | null;
  composerParentId: string | null;
};

type DialogueUiState = {
  workspaceSessionId: string;
  focusedNodeId: string | null;
  composerParentId: string | null;
  errorMessage: string | null;
  pendingAction: PendingSlot | null;
  pending: PendingState;
  hydrateWorkspace: (state: HydratedWorkspaceState) => void;
  setFocusedNodeId: (nodeId: string | null) => void;
  setComposerParentId: (nodeId: string | null) => void;
  beginPending: (slot: PendingSlot, pending: PendingRequest) => void;
  clearPending: (slot: PendingSlot) => void;
  cancelPendingRequests: () => void;
  setErrorMessage: (message: string | null) => void;
  resetTransientState: () => void;
};

function createClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getInitialPending(): PendingState {
  return {
    branches: null,
    synthesis: null
  };
}

export const useDialogueUiStore = create<DialogueUiState>((set, get) => ({
  workspaceSessionId: createClientId("ws"),
  focusedNodeId: null,
  composerParentId: null,
  errorMessage: null,
  pendingAction: null,
  pending: getInitialPending(),
  hydrateWorkspace: (state) =>
    set({
      workspaceSessionId: state.workspaceSessionId,
      focusedNodeId: state.focusedNodeId,
      composerParentId: state.composerParentId,
      errorMessage: null,
      pendingAction: null,
      pending: getInitialPending()
    }),
  setFocusedNodeId: (nodeId) =>
    set({
      focusedNodeId: nodeId,
      pendingAction: null,
      pending: getInitialPending()
    }),
  setComposerParentId: (nodeId) => set({ composerParentId: nodeId }),
  beginPending: (slot, pending) =>
    set({
      pendingAction: slot,
      pending: {
        ...getInitialPending(),
        [slot]: pending
      },
      errorMessage: null
    }),
  clearPending: (slot) =>
    set((state) => {
      const nextPending = {
        ...state.pending,
        [slot]: null
      };
      return {
        pending: nextPending,
        pendingAction: nextPending.branches ? "branches" : nextPending.synthesis ? "synthesis" : null
      };
    }),
  cancelPendingRequests: () =>
    set({
      pendingAction: null,
      pending: getInitialPending()
    }),
  setErrorMessage: (message) => set({ errorMessage: message }),
  resetTransientState: () => {
    const workspaceSessionId = get().workspaceSessionId;
    set({
      workspaceSessionId,
      errorMessage: null,
      pendingAction: null,
      pending: getInitialPending()
    });
  }
}));

export { createClientId };
