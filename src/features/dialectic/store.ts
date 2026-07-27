import { create } from "zustand";
import { StageLayoutMode, StageLayouts, StagePan, StagePoint } from "@/types/anicca";

export type PendingSlot = "branches" | "synthesis";

export type PendingRequest = {
  requestId: string;
  workspaceSessionId: string;
  focusSnapshotId: string;
  composerTargetId: string | null;
  sourceLabel?: string;
  synthesisActionKey?: string;
};

type PendingState = Record<PendingSlot, PendingRequest | null>;

export type HydratedWorkspaceState = {
  workspaceId: string;
  workspaceSessionId: string;
  focusedNodeId: string | null;
  composerParentId: string | null;
  stageLayouts?: StageLayouts;
};

export type DialogueErrorState = {
  title: string;
  detail: string;
  recovery?: string;
};

type DialogueUiState = {
  workspaceId: string;
  workspaceSessionId: string;
  focusedNodeId: string | null;
  composerParentId: string | null;
  stageLayouts: StageLayouts;
  errorState: DialogueErrorState | null;
  pendingAction: PendingSlot | null;
  pending: PendingState;
  hydrateWorkspace: (state: HydratedWorkspaceState) => void;
  setFocusedNodeId: (nodeId: string | null) => void;
  setComposerParentId: (nodeId: string | null) => void;
  setStageNodePosition: (layoutKey: string, nodeId: string, position: StagePoint, mode?: StageLayoutMode) => void;
  setStagePan: (layoutKey: string, pan: StagePan, mode?: StageLayoutMode) => void;
  beginPending: (slot: PendingSlot, pending: PendingRequest) => void;
  clearPending: (slot: PendingSlot) => void;
  cancelPendingRequests: () => void;
  setErrorState: (error: DialogueErrorState | null) => void;
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

function getStageLayoutView(stageLayouts: StageLayouts, layoutKey: string) {
  return stageLayouts[layoutKey] || {
    pan: { x: 0, y: 0 },
    nodePositions: {}
  };
}

function getStageLayoutViewport(layout: ReturnType<typeof getStageLayoutView>, mode: StageLayoutMode) {
  if (mode === "compact") {
    return layout.compact || {
      pan: { x: 0, y: 0 },
      nodePositions: {}
    };
  }

  return {
    pan: layout.pan,
    nodePositions: layout.nodePositions
  };
}

export const useDialogueUiStore = create<DialogueUiState>((set, get) => ({
  workspaceId: createClientId("workspace"),
  workspaceSessionId: createClientId("ws"),
  focusedNodeId: null,
  composerParentId: null,
  stageLayouts: {},
  errorState: null,
  pendingAction: null,
  pending: getInitialPending(),
  hydrateWorkspace: (state) =>
    set({
      workspaceId: state.workspaceId,
      workspaceSessionId: state.workspaceSessionId,
      focusedNodeId: state.focusedNodeId,
      composerParentId: state.composerParentId,
      stageLayouts: state.stageLayouts || {},
      errorState: null,
      pendingAction: null,
      pending: getInitialPending()
    }),
  setFocusedNodeId: (nodeId) => set({ focusedNodeId: nodeId }),
  setComposerParentId: (nodeId) => set({ composerParentId: nodeId }),
  setStageNodePosition: (layoutKey, nodeId, position, mode = "wide") =>
    set((state) => {
      const currentView = getStageLayoutView(state.stageLayouts, layoutKey);
      const currentViewport = getStageLayoutViewport(currentView, mode);
      const nodePositions = {
        ...currentViewport.nodePositions,
        [nodeId]: position
      };
      return {
        stageLayouts: {
          ...state.stageLayouts,
          [layoutKey]: {
            ...currentView,
            ...(mode === "compact"
              ? { compact: { pan: currentViewport.pan, nodePositions } }
              : { nodePositions })
          }
        }
      };
    }),
  setStagePan: (layoutKey, pan, mode = "wide") =>
    set((state) => {
      const currentView = getStageLayoutView(state.stageLayouts, layoutKey);
      const currentViewport = getStageLayoutViewport(currentView, mode);
      return {
        stageLayouts: {
          ...state.stageLayouts,
          [layoutKey]: {
            ...currentView,
            ...(mode === "compact"
              ? { compact: { pan, nodePositions: currentViewport.nodePositions } }
              : { pan })
          }
        }
      };
    }),
  beginPending: (slot, pending) =>
    set({
      pendingAction: slot,
      pending: {
        ...getInitialPending(),
        [slot]: pending
      },
      errorState: null
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
  setErrorState: (error) => set({ errorState: error }),
  resetTransientState: () => {
    const workspaceId = get().workspaceId;
    const workspaceSessionId = get().workspaceSessionId;
    const stageLayouts = get().stageLayouts;
    set({
      workspaceId,
      workspaceSessionId,
      stageLayouts,
      errorState: null,
      pendingAction: null,
      pending: getInitialPending()
    });
  }
}));

export { createClientId };
