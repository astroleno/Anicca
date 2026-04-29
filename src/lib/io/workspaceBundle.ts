import { createClientId } from "@/features/dialectic/store";
import { ANICCA_WORKSPACE_SCHEMA_VERSION } from "@/lib/persist/local";
import { createEmptyGraph, Graph, StageLayouts } from "@/types/anicca";
import {
  ANICCA_WORKSPACE_BUNDLE_VERSION,
  ImportedWorkspaceRecord,
  PersistedWorkspaceSnapshot,
  WorkspaceArtifacts,
  WorkspaceBundle,
  WorkspaceId,
  WorkspaceRegistryEntry
} from "@/types/workspace";

type WorkspaceRecordLike = {
  entry: WorkspaceRegistryEntry;
  snapshot: PersistedWorkspaceSnapshot;
};

type SerializeWorkspaceBundleOptions = {
  exportedAt?: string;
};

type ImportWorkspaceBundleOptions = {
  now?: () => string;
  generateWorkspaceId?: () => WorkspaceId;
};

function nowIso() {
  return new Date().toISOString();
}

function isValidIsoTimestamp(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function normalizeStageLayouts(stageLayouts: unknown): StageLayouts {
  return stageLayouts && typeof stageLayouts === "object"
    ? (stageLayouts as StageLayouts)
    : {};
}

function normalizeArtifacts(artifacts: unknown): WorkspaceArtifacts | undefined {
  if (!artifacts || typeof artifacts !== "object") {
    return undefined;
  }
  return artifacts as WorkspaceArtifacts;
}

function deriveFallbackTitle(snapshot: PersistedWorkspaceSnapshot) {
  const rootId = snapshot.graph.entryIds[0];
  const rootNode = rootId ? snapshot.graph.nodes[rootId] : null;
  const focusNode = snapshot.focusedNodeId
    ? snapshot.graph.nodes[snapshot.focusedNodeId]
    : null;
  const candidate = rootNode?.text || focusNode?.text || "未命名工作区";
  return candidate.trim().slice(0, 48) || "未命名工作区";
}

function parseBundleJson(text: string): WorkspaceBundle {
  try {
    return JSON.parse(text) as WorkspaceBundle;
  } catch {
    throw new Error("invalid_workspace_bundle_json");
  }
}

function isValidGraphShape(graph: unknown): graph is Graph {
  if (!graph || typeof graph !== "object") {
    return false;
  }

  const candidate = graph as Graph;
  return (
    candidate.version === createEmptyGraph().version &&
    Boolean(candidate.nodes) &&
    typeof candidate.nodes === "object" &&
    Boolean(candidate.edges) &&
    typeof candidate.edges === "object" &&
    Array.isArray(candidate.entryIds)
  );
}

function isValidSnapshotShape(snapshot: unknown): snapshot is PersistedWorkspaceSnapshot {
  if (!snapshot || typeof snapshot !== "object") {
    return false;
  }

  const candidate = snapshot as PersistedWorkspaceSnapshot;
  return (
    candidate.schemaVersion === ANICCA_WORKSPACE_SCHEMA_VERSION &&
    typeof candidate.workspaceId === "string" &&
    isValidGraphShape(candidate.graph)
  );
}

function assertValidWorkspaceBundle(bundle: WorkspaceBundle) {
  if (bundle?.version !== ANICCA_WORKSPACE_BUNDLE_VERSION) {
    throw new Error("invalid_workspace_bundle_version");
  }

  if (!bundle.metadata || typeof bundle.metadata !== "object") {
    throw new Error("invalid_workspace_bundle_metadata");
  }

  if (typeof bundle.metadata.title !== "string") {
    throw new Error("invalid_workspace_bundle_metadata");
  }

  if (!bundle.snapshot || typeof bundle.snapshot !== "object") {
    throw new Error("invalid_workspace_bundle_snapshot");
  }

  if ((bundle.snapshot as PersistedWorkspaceSnapshot).graph?.version !== createEmptyGraph().version) {
    throw new Error("invalid_workspace_bundle_graph_version");
  }

  if (!isValidSnapshotShape(bundle.snapshot)) {
    throw new Error("invalid_workspace_bundle_snapshot");
  }
}

export function serializeWorkspaceBundle(
  record: WorkspaceRecordLike,
  options: SerializeWorkspaceBundleOptions = {}
) {
  const exportedAt = options.exportedAt || nowIso();
  const bundle: WorkspaceBundle = {
    version: ANICCA_WORKSPACE_BUNDLE_VERSION,
    metadata: {
      title: record.entry.title,
      createdAt: record.entry.createdAt,
      updatedAt: record.entry.updatedAt,
      exportedAt,
      sourceWorkspaceId: record.entry.id
    },
    snapshot: {
      ...record.snapshot,
      stageLayouts: normalizeStageLayouts(record.snapshot.stageLayouts),
      artifacts: normalizeArtifacts(record.snapshot.artifacts)
    }
  };

  return JSON.stringify(bundle, null, 2);
}

export function exportWorkspaceBundle(
  record: WorkspaceRecordLike,
  options: SerializeWorkspaceBundleOptions = {}
) {
  return new Blob([serializeWorkspaceBundle(record, options)], {
    type: "application/json"
  });
}

export async function importWorkspaceBundleFile(
  file: File,
  options: ImportWorkspaceBundleOptions = {}
) {
  return importWorkspaceBundleText(await file.text(), options);
}

export function importWorkspaceBundleText(
  text: string,
  options: ImportWorkspaceBundleOptions = {}
): ImportedWorkspaceRecord {
  const bundle = parseBundleJson(text);
  assertValidWorkspaceBundle(bundle);

  const now = options.now?.() || nowIso();
  const workspaceId =
    options.generateWorkspaceId?.() || createClientId("workspace");

  const createdAt = isValidIsoTimestamp(bundle.metadata.createdAt)
    ? new Date(bundle.metadata.createdAt).toISOString()
    : now;
  const updatedAt = isValidIsoTimestamp(bundle.metadata.updatedAt)
    ? new Date(bundle.metadata.updatedAt).toISOString()
    : createdAt;
  const title = bundle.metadata.title.trim() || deriveFallbackTitle(bundle.snapshot);

  return {
    id: workspaceId,
    title,
    createdAt,
    updatedAt,
    lastOpenedAt: now,
    snapshot: {
      ...bundle.snapshot,
      workspaceId,
      stageLayouts: normalizeStageLayouts(bundle.snapshot.stageLayouts),
      artifacts: normalizeArtifacts(bundle.snapshot.artifacts)
    }
  };
}
