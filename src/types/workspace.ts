import { Graph, StageLayouts } from "@/types/anicca";
import { ANICCA_WORKSPACE_SCHEMA_VERSION } from "@/lib/persist/local";

export type WorkspaceId = string;

export const ANICCA_WORKSPACE_REGISTRY_SCHEMA_VERSION = "anicca-workspace-registry-v1";

export type WorkspaceRegistryEntry = {
  id: WorkspaceId;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  entryCount: number;
  nodeCount: number;
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
