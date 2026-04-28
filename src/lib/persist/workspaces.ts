import { createClientId } from "@/features/dialectic/store";
import { ANICCA_WORKSPACE_SCHEMA_VERSION, loadGraphLocal } from "@/lib/persist/local";
import { createEmptyGraph, Graph, StageLayouts } from "@/types/anicca";
import {
  ActiveWorkspaceRecord,
  ActivatedWorkspaceSnapshot,
  ANICCA_WORKSPACE_REGISTRY_SCHEMA_VERSION,
  PersistedWorkspaceSnapshot,
  WorkspaceId,
  WorkspaceRecord,
  WorkspaceRegistry,
  WorkspaceRegistryEntry,
  WorkspaceTitleSource
} from "@/types/workspace";

export const LEGACY_WORKSPACE_KEY = "anicca_workspace_v2";
export const MIGRATION_MARKER_KEY = "anicca_workspace_legacy_migrated_v1";
export const REGISTRY_KEY = "anicca_workspace_registry_v1";
export const ACTIVE_WORKSPACE_KEY = "anicca_workspace_active_v1";
export const SNAPSHOT_KEY_PREFIX = "anicca_workspace_snapshot_v1:";

export const LEGACY_WORKSPACE_MIGRATED_KEY = MIGRATION_MARKER_KEY;
export const WORKSPACE_REGISTRY_STORAGE_KEY = REGISTRY_KEY;
export const ACTIVE_WORKSPACE_STORAGE_KEY = ACTIVE_WORKSPACE_KEY;

type WorkspacePersistenceOptions = {
  now?: () => string;
  createWorkspaceId?: () => WorkspaceId;
  createWorkspaceSessionId?: () => string;
};

type WorkspaceRecordInput = {
  workspaceId: WorkspaceId;
  title?: string;
  titleSource?: WorkspaceTitleSource;
  createdAt?: string;
  updatedAt?: string;
  lastOpenedAt?: string;
  graph: Graph;
  focusedNodeId: string | null;
  composerParentId: string | null;
  stageLayouts?: StageLayouts;
};

type SaveWorkspaceRecordInput = {
  id: WorkspaceId;
  title?: string;
  titleSource?: WorkspaceTitleSource;
  createdAt?: string;
  updatedAt?: string;
  lastOpenedAt?: string;
  snapshot: PersistedWorkspaceSnapshot;
};

function nowIso(options?: WorkspacePersistenceOptions) {
  return options?.now?.() || new Date().toISOString();
}

function createWorkspaceId(options?: WorkspacePersistenceOptions): WorkspaceId {
  return options?.createWorkspaceId?.() || createClientId("workspace");
}

function createWorkspaceSessionId(options?: WorkspacePersistenceOptions) {
  return options?.createWorkspaceSessionId?.() || createClientId("ws");
}

export function getWorkspaceSnapshotStorageKey(workspaceId: WorkspaceId) {
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

function normalizeWorkspaceTitle(title: string | undefined | null) {
  return title?.trim() || "";
}

function normalizeStageLayouts(stageLayouts: unknown): StageLayouts {
  return stageLayouts && typeof stageLayouts === "object" ? (stageLayouts as StageLayouts) : {};
}

function deriveWorkspaceTitle(graph: Graph) {
  const firstEntryId = graph.entryIds[0];
  const text = firstEntryId ? graph.nodes[firstEntryId]?.text?.trim() : "";
  return text.slice(0, 48) || "未命名工作区";
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

  return {
    schemaVersion: ANICCA_WORKSPACE_REGISTRY_SCHEMA_VERSION,
    entries: parsed.entries.filter(
      (entry): entry is WorkspaceRegistryEntry =>
        Boolean(entry) &&
        typeof entry.id === "string" &&
        typeof entry.title === "string" &&
        typeof entry.createdAt === "string" &&
        typeof entry.updatedAt === "string" &&
        typeof entry.lastOpenedAt === "string"
    ).map((entry) => ({
      ...entry,
      titleSource: entry.titleSource === "manual" ? "manual" : "derived",
      entryCount: Number.isFinite(entry.entryCount) ? entry.entryCount : 0,
      nodeCount: Number.isFinite(entry.nodeCount) ? entry.nodeCount : 0
    }))
  };
}

function saveWorkspaceRegistry(registry: WorkspaceRegistry) {
  writeJson(REGISTRY_KEY, registry);
}

function inferTitleSource(existing: WorkspaceRegistryEntry | null | undefined): WorkspaceTitleSource {
  return existing?.titleSource === "manual" ? "manual" : "derived";
}

function buildRegistryEntry(
  snapshot: PersistedWorkspaceSnapshot,
  timestamp: string,
  existing?: WorkspaceRegistryEntry | null,
  overrides?: {
    title?: string;
    titleSource?: WorkspaceTitleSource;
    createdAt?: string;
    updatedAt?: string;
    lastOpenedAt?: string;
  }
): WorkspaceRegistryEntry {
  const explicitTitle = normalizeWorkspaceTitle(overrides?.title);
  const titleSource = overrides?.titleSource || (explicitTitle ? "manual" : inferTitleSource(existing));
  const title =
    explicitTitle ||
    (titleSource === "derived" ? deriveWorkspaceTitle(snapshot.graph) : existing?.title) ||
    deriveWorkspaceTitle(snapshot.graph);

  return {
    id: snapshot.workspaceId,
    title,
    titleSource,
    createdAt: overrides?.createdAt || existing?.createdAt || timestamp,
    updatedAt: overrides?.updatedAt || timestamp,
    lastOpenedAt: overrides?.lastOpenedAt || existing?.lastOpenedAt || timestamp,
    entryCount: snapshot.graph.entryIds.length,
    nodeCount: Object.keys(snapshot.graph.nodes).length,
    focusedNodeId: snapshot.focusedNodeId
  };
}

function normalizeSnapshot(input: WorkspaceRecordInput): PersistedWorkspaceSnapshot {
  return {
    schemaVersion: ANICCA_WORKSPACE_SCHEMA_VERSION,
    workspaceId: input.workspaceId,
    graph: input.graph,
    focusedNodeId: input.focusedNodeId,
    composerParentId: input.composerParentId,
    stageLayouts: normalizeStageLayouts(input.stageLayouts)
  };
}

export function loadWorkspaceSnapshot(workspaceId: WorkspaceId): PersistedWorkspaceSnapshot | null {
  const parsed = readJson<PersistedWorkspaceSnapshot>(getWorkspaceSnapshotStorageKey(workspaceId));
  if (parsed?.schemaVersion !== ANICCA_WORKSPACE_SCHEMA_VERSION) {
    return null;
  }
  if (parsed.workspaceId !== workspaceId || parsed.graph?.version !== "anicca-dialectic-v2") {
    return null;
  }

  return {
    ...parsed,
    stageLayouts: normalizeStageLayouts(parsed.stageLayouts)
  };
}

export function loadWorkspaceRecord(workspaceId: WorkspaceId): WorkspaceRecord | null {
  const registry = loadWorkspaceRegistry();
  const entry = registry.entries.find((candidate) => candidate.id === workspaceId) || null;
  const snapshot = loadWorkspaceSnapshot(workspaceId);
  if (!entry || !snapshot) {
    return null;
  }

  return {
    entry,
    snapshot,
    registry
  };
}

export function createWorkspaceRecord(
  input: WorkspaceRecordInput,
  options?: WorkspacePersistenceOptions
): PersistedWorkspaceSnapshot {
  const timestamp = nowIso(options);
  const snapshot = normalizeSnapshot(input);
  writeJson(getWorkspaceSnapshotStorageKey(snapshot.workspaceId), snapshot);

  const registry = loadWorkspaceRegistry();
  const existing = registry.entries.find((entry) => entry.id === snapshot.workspaceId) || null;
  const nextEntry = buildRegistryEntry(snapshot, timestamp, existing, {
    title: input.title,
    titleSource: input.titleSource,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    lastOpenedAt: input.lastOpenedAt
  });
  saveWorkspaceRegistry({
    schemaVersion: ANICCA_WORKSPACE_REGISTRY_SCHEMA_VERSION,
    entries: [
      nextEntry,
      ...registry.entries.filter((entry) => entry.id !== snapshot.workspaceId)
    ]
  });

  return snapshot;
}

export function saveWorkspaceRecord(
  input: SaveWorkspaceRecordInput,
  options?: WorkspacePersistenceOptions
) {
  const snapshot = createWorkspaceRecord(
    {
      workspaceId: input.id,
      title: input.title,
      titleSource: input.titleSource,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      lastOpenedAt: input.lastOpenedAt,
      graph: input.snapshot.graph,
      focusedNodeId: input.snapshot.focusedNodeId,
      composerParentId: input.snapshot.composerParentId,
      stageLayouts: input.snapshot.stageLayouts
    },
    options
  );
  return loadWorkspaceRecord(snapshot.workspaceId);
}

export function saveActiveWorkspaceSnapshot(input: WorkspaceRecordInput, options?: WorkspacePersistenceOptions) {
  const activeWorkspaceId = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
  if (!activeWorkspaceId || activeWorkspaceId !== input.workspaceId) {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, input.workspaceId);
  }
  createWorkspaceRecord(input, options);
}

export function setActiveWorkspaceId(workspaceId: WorkspaceId) {
  localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
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
  setActiveWorkspaceId(workspaceId);

  return {
    ...snapshot,
    workspaceSessionId: createWorkspaceSessionId(options)
  };
}

export function listRecentWorkspaces() {
  return [...loadWorkspaceRegistry().entries].sort((left, right) => {
    const byLastOpened =
      new Date(right.lastOpenedAt).getTime() - new Date(left.lastOpenedAt).getTime();
    if (byLastOpened !== 0) {
      return byLastOpened;
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

export function renameWorkspace(workspaceId: WorkspaceId, title: string, options?: WorkspacePersistenceOptions) {
  const record = loadWorkspaceRecord(workspaceId);
  if (!record) {
    return null;
  }

  const timestamp = nowIso(options);
  const normalizedTitle = normalizeWorkspaceTitle(title);
  const nextEntry = buildRegistryEntry(record.snapshot, timestamp, record.entry, {
    title: normalizedTitle || undefined,
    titleSource: normalizedTitle ? "manual" : "derived",
    createdAt: record.entry.createdAt,
    updatedAt: timestamp,
    lastOpenedAt: record.entry.lastOpenedAt
  });
  saveWorkspaceRegistry({
    schemaVersion: ANICCA_WORKSPACE_REGISTRY_SCHEMA_VERSION,
    entries: record.registry.entries.map((entry) =>
      entry.id === workspaceId ? nextEntry : entry
    )
  });
  return nextEntry;
}

export function createWorkspace(options?: { title?: string } & WorkspacePersistenceOptions): ActiveWorkspaceRecord | null {
  const workspaceId = createWorkspaceId(options);
  createWorkspaceRecord(
    {
      workspaceId,
      title: options?.title,
      graph: createEmptyGraph(),
      focusedNodeId: null,
      composerParentId: null,
      stageLayouts: {}
    },
    options
  );
  setActiveWorkspaceId(workspaceId);
  return loadActiveWorkspace(options);
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
  setActiveWorkspaceId(workspaceId);
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

export function loadActiveWorkspace(options?: WorkspacePersistenceOptions): ActiveWorkspaceRecord | null {
  const snapshot = initializeActiveWorkspace(options);
  const registry = loadWorkspaceRegistry();
  const entry =
    registry.entries.find((candidate) => candidate.id === snapshot.workspaceId) ||
    buildRegistryEntry(snapshot, nowIso(options), null);

  return {
    activeWorkspaceId: snapshot.workspaceId,
    entry,
    snapshot,
    registry
  };
}
