import { create } from "zustand";
import { StageLayoutMode, StageLayouts, StagePan, StagePoint, SeedInstances, type StageLayoutView } from "@/types/anicca";
import { defaultThinkingSpace, normalizeThinkingSpace, type ThinkingSpace, type ThinkingAxis } from "@/features/perspectives/model";
import { normalizeSeedInstances } from "./seedInstances";

export type PendingSlot = "branches" | "synthesis";

export type PendingRequest = {
  requestId: string;
  workspaceSessionId: string;
  focusSnapshotId: string;
  composerTargetId: string | null;
  sourceLabel?: string;
  synthesisActionKey?: string;
  polarityAxis?: ThinkingAxis;
  inquiry?: boolean;
};

type PendingState = Record<PendingSlot, PendingRequest | null>;

export type HydratedWorkspaceState = {
  workspaceId: string;
  workspaceSessionId: string;
  focusedNodeId: string | null;
  composerParentId: string | null;
  stageLayouts?: StageLayouts;
  seedInstances?: SeedInstances;
  thinkingSpace?: ThinkingSpace;
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
  stagePreview: { layoutKey: string; view: StageLayoutView } | null;
  beginStagePreview: (layoutKey: string, wide: Record<string, StagePoint>, compact: Record<string, StagePoint>) => void;
  endStagePreview: () => void;
  seedInstances: SeedInstances;
  addSeedInstance: (conceptId: string) => string;
  removeSeedInstance: (id: string) => void;
  setStageNodePositions: (layoutKey: string, wide: Record<string, StagePoint>, compact: Record<string, StagePoint>) => void;
  thinkingSpace: ThinkingSpace;
  setThinkingSpace: (space: ThinkingSpace) => void;
  arrangeStage: (layoutKey: string) => void;
  errorState: DialogueErrorState | null;
  pendingAction: PendingSlot | null;
  pending: PendingState;
  hydrateWorkspace: (state: HydratedWorkspaceState) => void;
  setFocusedNodeId: (nodeId: string | null) => void;
  setComposerParentId: (nodeId: string | null) => void;
  setStageNodePosition: (layoutKey: string, nodeId: string, position: StagePoint, mode?: StageLayoutMode) => void;
  ensureStageNodePositions: (layoutKey: string, wide: Record<string, StagePoint>, compact: Record<string, StagePoint>) => void;
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

function activeLayout(state: DialogueUiState, layoutKey: string) {
  return state.stagePreview?.layoutKey === layoutKey ? state.stagePreview.view : getStageLayoutView(state.stageLayouts, layoutKey);
}

function writeLayout(state: DialogueUiState, layoutKey: string, view: StageLayoutView) {
  return state.stagePreview?.layoutKey === layoutKey
    ? { stagePreview: { layoutKey, view } }
    : { stageLayouts: { ...state.stageLayouts, [layoutKey]: view } };
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
  stagePreview: null,
  beginStagePreview: (layoutKey, wide, compact) => set(state => {
    const layout = activeLayout(state, layoutKey);
    return { stagePreview: { layoutKey, view: { ...layout, nodePositions: wide,
      compact: { ...getStageLayoutViewport(layout, "compact"), nodePositions: compact } } } };
  }),
  endStagePreview: () => set({ stagePreview: null }),
  seedInstances: {},
  addSeedInstance: (conceptId) => {
    const id = createClientId("instance");
    set(state => ({ seedInstances: { ...state.seedInstances, [id]: { id, conceptId, createdAt: new Date().toISOString(),
      ordinal: Math.max(0, ...Object.values(state.seedInstances).filter(instance => instance.conceptId === conceptId).map(instance => instance.ordinal)) + 1 } } }));
    return id;
  },
  removeSeedInstance: (id) => set(state => {
    if (!Object.prototype.hasOwnProperty.call(state.seedInstances, id)) return state;
    const instances = { ...state.seedInstances };
    delete instances[id];
    const stageLayouts = Object.fromEntries(Object.entries(state.stageLayouts).map(([key, layout]) => {
      const wide = { ...layout.nodePositions }, compact = { ...layout.compact?.nodePositions };
      delete wide[id]; delete compact[id];
      return [key, { ...layout, nodePositions: wide, ...(layout.compact ? { compact: { ...layout.compact, nodePositions: compact } } : {}) }];
    }));
    return { seedInstances: instances, stageLayouts };
  }),
  setStageNodePositions: (layoutKey, wide, compact) => set(state => {
    const layout = activeLayout(state, layoutKey);
    return writeLayout(state, layoutKey, { ...layout, nodePositions: wide,
      compact: { ...getStageLayoutViewport(layout, "compact"), nodePositions: compact } });
  }),
  thinkingSpace: defaultThinkingSpace(),
  setThinkingSpace: (space) => set({ thinkingSpace: normalizeThinkingSpace(space) }),
  arrangeStage: (layoutKey) => set(state => {
    const layouts = { ...state.stageLayouts }; delete layouts[layoutKey];
    return { stageLayouts: layouts, stagePreview: null };
  }),
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
      stagePreview: null,
      seedInstances: normalizeSeedInstances(state.seedInstances),
      thinkingSpace: normalizeThinkingSpace(state.thinkingSpace),
      errorState: null,
      pendingAction: null,
      pending: getInitialPending()
    }),
  setFocusedNodeId: (nodeId) => set({ focusedNodeId: nodeId }),
  setComposerParentId: (nodeId) => set({ composerParentId: nodeId }),
  ensureStageNodePositions: (layoutKey, wide, compact) => set(state => {
    const current = activeLayout(state, layoutKey);
    const narrow = getStageLayoutViewport(current, "compact");
    if (Object.keys(wide).every(id => current.nodePositions[id]) && Object.keys(compact).every(id => narrow.nodePositions[id])) return state;
    return writeLayout(state, layoutKey, {
      ...current, nodePositions: { ...wide, ...current.nodePositions },
      compact: { ...narrow, nodePositions: { ...compact, ...narrow.nodePositions } }
    });
  }),
  setStageNodePosition: (layoutKey, nodeId, position, mode = "wide") =>
    set((state) => {
      const currentView = activeLayout(state, layoutKey);
      const currentViewport = getStageLayoutViewport(currentView, mode);
      const nodePositions = {
        ...currentViewport.nodePositions,
        [nodeId]: position
      };
      return writeLayout(state, layoutKey, {
            ...currentView,
            ...(mode === "compact"
              ? { compact: { pan: currentViewport.pan, nodePositions } }
              : { nodePositions })
      });
    }),
  setStagePan: (layoutKey, pan, mode = "wide") =>
    set((state) => {
      const currentView = activeLayout(state, layoutKey);
      const currentViewport = getStageLayoutViewport(currentView, mode);
      return writeLayout(state, layoutKey, {
            ...currentView,
            ...(mode === "compact"
              ? { compact: { pan, nodePositions: currentViewport.nodePositions } }
              : { pan })
      });
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
      stagePreview: null,
      errorState: null,
      pendingAction: null,
      pending: getInitialPending()
    });
  }
}));

export { createClientId };
