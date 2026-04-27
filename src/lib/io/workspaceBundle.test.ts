import {
  importWorkspaceBundleText,
  serializeWorkspaceBundle
} from "@/lib/io/workspaceBundle";
import {
  ANICCA_WORKSPACE_BUNDLE_VERSION,
  PersistedWorkspaceSnapshot,
  WorkspaceRegistryEntry
} from "@/types/workspace";
import { ANICCA_WORKSPACE_SCHEMA_VERSION } from "@/lib/persist/local";
import { createEmptyGraph } from "@/types/anicca";

function buildWorkspaceRecord() {
  const graph = createEmptyGraph();
  graph.nodes.user_root_1 = {
    id: "user_root_1",
    kind: "user",
    text: "导出当前工作区",
    createdAt: "2026-04-25T12:00:00.000Z",
    parents: [],
    children: []
  };
  graph.entryIds.push("user_root_1");

  const snapshot: PersistedWorkspaceSnapshot = {
    schemaVersion: ANICCA_WORKSPACE_SCHEMA_VERSION,
    workspaceId: "workspace_source_1",
    graph,
    focusedNodeId: "user_root_1",
    composerParentId: "user_root_1",
    stageLayouts: {}
  };
  const entry: WorkspaceRegistryEntry = {
    id: "workspace_source_1",
    title: "导出当前工作区",
    createdAt: "2026-04-25T12:00:00.000Z",
    updatedAt: "2026-04-25T12:05:00.000Z",
    lastOpenedAt: "2026-04-27T09:15:00.000Z",
    nodeCount: 1,
    entryCount: 1,
    focusedNodeId: "user_root_1"
  };

  return { entry, snapshot };
}

describe("workspace bundle io", () => {
  it("serializes the active workspace as a versioned bundle", () => {
    const text = serializeWorkspaceBundle(buildWorkspaceRecord(), {
      exportedAt: "2026-04-27T10:00:00.000Z"
    });

    const bundle = JSON.parse(text);
    expect(bundle.version).toBe(ANICCA_WORKSPACE_BUNDLE_VERSION);
    expect(bundle.metadata.title).toBe("导出当前工作区");
    expect(bundle.metadata.exportedAt).toBe("2026-04-27T10:00:00.000Z");
    expect(bundle.snapshot.workspaceId).toBe("workspace_source_1");
  });

  it("rejects malformed JSON payloads", () => {
    expect(() => importWorkspaceBundleText("{bad-json")).toThrow(
      "invalid_workspace_bundle_json"
    );
  });

  it("rejects incompatible graph versions", () => {
    const broken = JSON.parse(serializeWorkspaceBundle(buildWorkspaceRecord()));
    broken.snapshot.graph.version = "anicca-mvp-1";

    expect(() =>
      importWorkspaceBundleText(JSON.stringify(broken))
    ).toThrow("invalid_workspace_bundle_graph_version");
  });

  it("assigns a fresh local workspace id and resets recency metadata on import", () => {
    const imported = importWorkspaceBundleText(serializeWorkspaceBundle(buildWorkspaceRecord()), {
      now: () => "2026-04-27T11:00:00.000Z",
      generateWorkspaceId: () => "workspace_imported_1"
    });

    expect(imported.id).toBe("workspace_imported_1");
    expect(imported.snapshot.workspaceId).toBe("workspace_imported_1");
    expect(imported.createdAt).toBe("2026-04-25T12:00:00.000Z");
    expect(imported.updatedAt).toBe("2026-04-25T12:05:00.000Z");
    expect(imported.lastOpenedAt).toBe("2026-04-27T11:00:00.000Z");
  });

  it("keeps runtime session ownership out of imported snapshots", () => {
    const imported = importWorkspaceBundleText(serializeWorkspaceBundle(buildWorkspaceRecord()), {
      now: () => "2026-04-27T11:00:00.000Z",
      generateWorkspaceId: () => "workspace_imported_1"
    });

    expect(imported.snapshot).not.toHaveProperty("workspaceSessionId");
  });
});
