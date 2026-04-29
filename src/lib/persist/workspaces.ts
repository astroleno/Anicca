import { ANICCA_WORKSPACE_SCHEMA_VERSION, loadGraphLocal } from "@/lib/persist/local";
import { createClientId } from "@/features/dialectic/store";
import { createEmptyGraph, Graph, StageLayouts } from "@/types/anicca";
import {
  ActivatedWorkspaceSnapshot,
  ANICCA_WORKSPACE_REGISTRY_SCHEMA_VERSION,
  PersistedWorkspaceSnapshot,
  WorkspaceId,
  WorkspaceRegistry,
  WorkspaceRegistryEntry
} from "@/types/workspace";

export const LEGACY_WORKSPACE_KEY = "anicca_workspace_v2";
export const MIGRATION_MARKER_KEY = "anicca_workspace_legacy_migrated_v1";
export const REGISTRY_KEY = "anicca_workspace_registry_v1";
export const ACTIVE_WORKSPACE_KEY = "anicca_workspace_active_v1";
export const SNAPSHOT_KEY_PREFIX = "anicca_workspace_snapshot_v1:";

type WorkspacePersistenceOptions = {
  now?: () => string;
  createWorkspaceId?: () => WorkspaceId;
  createWorkspaceSessionId?: () => string;
};

type WorkspaceRecordInput = {
  workspaceId: WorkspaceId;
  graph: Graph;
  focusedNodeId: string | null;
  composerParentId: string | null;
  stageLayouts?: StageLayouts;
};

function nowIso(options?: WorkspacePersistenceOptions) {
  return options?.now?.() || new Date().toISOString();
}

function createWorkspaceId(options?: WorkspacePersistenceOptions): WorkspaceId {
  return options?.createWorkspaceId?.() || createClientId("workspace");
}

function createWorkspaceSessionId(options?: WorkspacePersistenceOptions): string {
  return options?.createWorkspaceSessionId?.() || createClientId("ws");
}

function snapshotKey(workspaceId: WorkspaceId) {
  return `${SNAPSHOT_KEY_PREFIX}${workspaceId}`;
}

function readJson<T>(key: string): T | null {
  try {
    const text = localStorage.getItem(key);
    return text ? (JSON.parse(text) as T) : null;
  } catch (error) {
    console.error("workspace persistence read error", { key, error });
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getEmptyRegistry(): WorkspaceRegistry {
  return {
    schemaVersion: ANICCA_WORKSPACE_REGISTRY_SCHEMA_VERSION,
    entries: []
  };
}

export function loadWorkspaceRegistry(): WorkspaceRegistry {
  const parsed = readJson<WorkspaceRegistry>(REGISTRY_KEY);
  if (parsed?.schemaVersion !== ANICCA_WORKSPACE_REGISTRY_SCHEMA_VERSION || !Array.isArray(parsed.entries)) {
    return getEmptyRegistry();
  }

  return parsed;
}

function saveWorkspaceRegistry(registry: WorkspaceRegistry) {
  writeJson(REGISTRY_KEY, registry);
}

function deriveWorkspaceTitle(graph: Graph) {
  const firstEntryId = graph.entryIds[0];
  const text = firstEntryId ? graph.nodes[firstEntryId]?.text?.trim() : "";
  return text || "未命名工作区";
}

function buildRegistryEntry(
  snapshot: PersistedWorkspaceSnapshot,
  timestamp: string,
  existing?: WorkspaceRegistryEntry
): WorkspaceRegistryEntry {
  return {
    id: snapshot.workspaceId,
    title: existing?.title || deriveWorkspaceTitle(snapshot.graph),
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    lastOpenedAt: existing?.lastOpenedAt || timestamp,
    entryCount: snapshot.graph.entryIds.length,
    nodeCount: Object.keys(snapshot.graph.nodes).length
  };
}

function normalizeSnapshot(input: WorkspaceRecordInput): PersistedWorkspaceSnapshot {
  return {
    schemaVersion: ANICCA_WORKSPACE_SCHEMA_VERSION,
    workspaceId: input.workspaceId,
    graph: input.graph,
    focusedNodeId: input.focusedNodeId,
    composerParentId: input.composerParentId,
    stageLayouts: input.stageLayouts || {}
  };
}

function loadWorkspaceSnapshot(workspaceId: WorkspaceId): PersistedWorkspaceSnapshot | null {
  const parsed = readJson<PersistedWorkspaceSnapshot>(snapshotKey(workspaceId));
  if (parsed?.schemaVersion !== ANICCA_WORKSPACE_SCHEMA_VERSION) {
    return null;
  }
  if (parsed.workspaceId !== workspaceId || parsed.graph?.version !== "anicca-dialectic-v2") {
    return null;
  }

  return {
    ...parsed,
    stageLayouts: parsed.stageLayouts && typeof parsed.stageLayouts === "object" ? parsed.stageLayouts : {}
  };
}

export function createWorkspaceRecord(
  input: WorkspaceRecordInput,
  options?: WorkspacePersistenceOptions
): PersistedWorkspaceSnapshot {
  const timestamp = nowIso(options);
  const snapshot = normalizeSnapshot(input);
  writeJson(snapshotKey(snapshot.workspaceId), snapshot);

  const registry = loadWorkspaceRegistry();
  const existing = registry.entries.find((entry) => entry.id === snapshot.workspaceId);
  const nextEntry = buildRegistryEntry(snapshot, timestamp, existing);
  saveWorkspaceRegistry({
    schemaVersion: ANICCA_WORKSPACE_REGISTRY_SCHEMA_VERSION,
    entries: [
      nextEntry,
      ...registry.entries.filter((entry) => entry.id !== snapshot.workspaceId)
    ]
  });

  return snapshot;
}

export function saveActiveWorkspaceSnapshot(input: WorkspaceRecordInput, options?: WorkspacePersistenceOptions) {
  const activeWorkspaceId = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
  if (!activeWorkspaceId || activeWorkspaceId !== input.workspaceId) {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, input.workspaceId);
  }
  createWorkspaceRecord(input, options);
}

export function activateWorkspace(
  workspaceId: WorkspaceId,
  options?: WorkspacePersistenceOptions
): ActivatedWorkspaceSnapshot | null {
  const snapshot = loadWorkspaceSnapshot(workspaceId);
  if (!snapshot) {
    return null;
  }

  const timestamp = nowIso(options);
  const registry = loadWorkspaceRegistry();
  const nextEntries = registry.entries.map((entry) =>
    entry.id === workspaceId ? { ...entry, lastOpenedAt: timestamp } : entry
  );
  saveWorkspaceRegistry({
    schemaVersion: ANICCA_WORKSPACE_REGISTRY_SCHEMA_VERSION,
    entries: nextEntries
  });
  localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);

  return {
    ...snapshot,
    workspaceSessionId: createWorkspaceSessionId(options)
  };
}

function migrateLegacyWorkspace(options?: WorkspacePersistenceOptions): ActivatedWorkspaceSnapshot | null {
  if (localStorage.getItem(MIGRATION_MARKER_KEY) === "consumed") {
    return null;
  }

  const legacy = loadGraphLocal();
  if (!legacy) {
    return null;
  }

  const workspaceId = createWorkspaceId(options);
  createWorkspaceRecord(
    {
      workspaceId,
      graph: legacy.graph,
      focusedNodeId: legacy.focusedNodeId,
      composerParentId: legacy.composerParentId,
      stageLayouts: legacy.stageLayouts || {}
    },
    options
  );
  localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
  localStorage.setItem(MIGRATION_MARKER_KEY, "consumed");
  localStorage.removeItem(LEGACY_WORKSPACE_KEY);

  return activateWorkspace(workspaceId, options);
}

function createEmptyWorkspace(options?: WorkspacePersistenceOptions): ActivatedWorkspaceSnapshot {
  const workspaceId = createWorkspaceId(options);
  createWorkspaceRecord(
    {
      workspaceId,
      graph: createEmptyGraph(),
      focusedNodeId: null,
      composerParentId: null,
      stageLayouts: {}
    },
    options
  );
  return activateWorkspace(workspaceId, options) as ActivatedWorkspaceSnapshot;
}

export function initializeActiveWorkspace(options?: WorkspacePersistenceOptions): ActivatedWorkspaceSnapshot {
  const registry = loadWorkspaceRegistry();
  if (registry.entries.length > 0) {
    const activeWorkspaceId = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    const activeEntry =
      registry.entries.find((entry) => entry.id === activeWorkspaceId) ||
      registry.entries[0];
    const activated = activateWorkspace(activeEntry.id, options);
    if (activated) {
      return activated;
    }
  }

  const migrated = migrateLegacyWorkspace(options);
  if (migrated) {
    return migrated;
  }

  return createEmptyWorkspace(options);
}
