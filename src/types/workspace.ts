import { Graph, StageLayouts } from "@/types/anicca";
import { ANICCA_WORKSPACE_SCHEMA_VERSION } from "@/lib/persist/local";

export type WorkspaceId = string;
export type WorkspaceTitleSource = "derived" | "manual";

export const ANICCA_WORKSPACE_REGISTRY_SCHEMA_VERSION = "anicca-workspace-registry-v1";
export const ANICCA_WORKSPACE_BUNDLE_VERSION = "anicca-workspace-bundle-v1";
export const ANICCA_WORKSPACE_REGISTRY_VERSION = ANICCA_WORKSPACE_REGISTRY_SCHEMA_VERSION;

export type WorkspaceRegistryEntry = {
  id: WorkspaceId;
  title: string;
  titleSource?: WorkspaceTitleSource;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  entryCount: number;
  nodeCount: number;
  focusedNodeId?: string | null;
};

export type WorkspaceRegistry = {
  schemaVersion: typeof ANICCA_WORKSPACE_REGISTRY_SCHEMA_VERSION;
  entries: WorkspaceRegistryEntry[];
};

export type PersistedWorkspaceSnapshot = {
  schemaVersion: typeof ANICCA_WORKSPACE_SCHEMA_VERSION;
  workspaceId: WorkspaceId;
  graph: Graph;
  focusedNodeId: string | null;
  composerParentId: string | null;
  stageLayouts: StageLayouts;
};

export type ActivatedWorkspaceSnapshot = PersistedWorkspaceSnapshot & {
  workspaceSessionId: string;
};

export interface WorkspaceBundleMetadata {
  title: string;
  createdAt: string;
  updatedAt: string;
  exportedAt: string;
  sourceWorkspaceId: WorkspaceId;
}

export interface WorkspaceBundle {
  version: typeof ANICCA_WORKSPACE_BUNDLE_VERSION;
  metadata: WorkspaceBundleMetadata;
  snapshot: PersistedWorkspaceSnapshot;
}

export interface ImportedWorkspaceRecord {
  id: WorkspaceId;
  title: string;
  snapshot: PersistedWorkspaceSnapshot;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
}

export interface WorkspaceRecord {
  entry: WorkspaceRegistryEntry;
  snapshot: PersistedWorkspaceSnapshot;
  registry: WorkspaceRegistry;
}

export interface ActiveWorkspaceRecord {
  activeWorkspaceId: WorkspaceId;
  entry: WorkspaceRegistryEntry;
  snapshot: ActivatedWorkspaceSnapshot;
  registry: WorkspaceRegistry;
}
