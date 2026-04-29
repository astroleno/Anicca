import { ANICCA_GRAPH_VERSION, Graph, StageLayouts } from "@/types/anicca";

const KEY = "anicca_workspace_v2";
export const ANICCA_WORKSPACE_SCHEMA_VERSION = "anicca-workspace-v2";

// Legacy Phase 1 single-workspace snapshot shape. Phase 2 keeps this module as
// the migration source and compatibility bridge; active persistence lives in
// src/lib/persist/workspaces.ts.
export interface WorkspaceSnapshot {
  schemaVersion: typeof ANICCA_WORKSPACE_SCHEMA_VERSION;
  workspaceSessionId: string;
  graph: Graph;
  focusedNodeId: string | null;
  composerParentId: string | null;
  stageLayouts?: StageLayouts;
}

export function saveGraphLocal(snapshot: WorkspaceSnapshot) {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch (e) {
    console.error("saveGraphLocal error", e);
  }
}

export function loadGraphLocal(): WorkspaceSnapshot | null {
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return null;
    const parsed = JSON.parse(text);
    if (parsed?.schemaVersion !== ANICCA_WORKSPACE_SCHEMA_VERSION) return null;
    if (parsed?.graph?.version !== ANICCA_GRAPH_VERSION) return null;
    if (typeof parsed?.workspaceSessionId !== "string") return null;
    return {
      ...parsed,
      stageLayouts:
        parsed?.stageLayouts && typeof parsed.stageLayouts === "object" ? parsed.stageLayouts : {}
    } as WorkspaceSnapshot;
  } catch (e) {
    console.error("loadGraphLocal error", e);
    return null;
  }
}
