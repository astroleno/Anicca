import { ANICCA_WORKSPACE_SCHEMA_VERSION } from "@/lib/persist/local";
import {
  ACTIVE_WORKSPACE_KEY,
  LEGACY_WORKSPACE_KEY,
  MIGRATION_MARKER_KEY,
  REGISTRY_KEY,
  SNAPSHOT_KEY_PREFIX,
  activateWorkspace,
  createWorkspace,
  createWorkspaceRecord,
  getWorkspaceSnapshotStorageKey,
  initializeActiveWorkspace,
  listRecentWorkspaces,
  loadWorkspaceRecord,
  loadWorkspaceRegistry,
  renameWorkspace,
  saveWorkspaceRecord
} from "@/lib/persist/workspaces";
import { createEmptyGraph } from "@/types/anicca";
import { PersistedWorkspaceSnapshot } from "@/types/workspace";

function createGraphWithRoot(text = "root", id = "user_1") {
  const graph = createEmptyGraph();
  graph.nodes[id] = {
    id,
    kind: "user",
    text,
    createdAt: "2026-04-24T03:00:00.000Z",
    parents: [],
    children: []
  };
  graph.entryIds.push(id);
  return graph;
}

function buildSnapshot(workspaceId: string, text = "root"): PersistedWorkspaceSnapshot {
  return {
    schemaVersion: ANICCA_WORKSPACE_SCHEMA_VERSION,
    workspaceId,
    graph: createGraphWithRoot(text),
    focusedNodeId: "user_1",
    composerParentId: null,
    stageLayouts: {}
  };
}

function parseStorage<T>(key: string): T | null {
  const value = localStorage.getItem(key);
  return value ? (JSON.parse(value) as T) : null;
}

describe("workspace registry persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("migrates the legacy single workspace into a registry and regenerates the runtime session", () => {
    const graph = createGraphWithRoot("迁移母题");
    localStorage.setItem(
      LEGACY_WORKSPACE_KEY,
      JSON.stringify({
        schemaVersion: ANICCA_WORKSPACE_SCHEMA_VERSION,
        workspaceSessionId: "legacy_ws_session",
        graph,
        focusedNodeId: "user_1",
        composerParentId: null,
        stageLayouts: {
          "focus:user_1": {
            pan: { x: 4, y: -2 },
            nodePositions: {
              user_1: { x: 50, y: 52 }
            }
          }
        }
      })
    );

    const activated = initializeActiveWorkspace({
      now: () => "2026-04-29T00:00:00.000Z",
      createWorkspaceId: () => "workspace_migrated",
      createWorkspaceSessionId: () => "ws_runtime_1"
    });

    expect(activated).toMatchObject({
      workspaceId: "workspace_migrated",
      workspaceSessionId: "ws_runtime_1",
      graph,
      focusedNodeId: "user_1",
      composerParentId: null
    });
    expect(activated.workspaceSessionId).not.toBe("legacy_ws_session");

    expect(parseStorage(REGISTRY_KEY)).toMatchObject({
      entries: [
        {
          id: "workspace_migrated",
          title: "迁移母题",
          createdAt: "2026-04-29T00:00:00.000Z",
          updatedAt: "2026-04-29T00:00:00.000Z",
          lastOpenedAt: "2026-04-29T00:00:00.000Z",
          entryCount: 1,
          nodeCount: 1
        }
      ]
    });
    expect(localStorage.getItem(ACTIVE_WORKSPACE_KEY)).toBe("workspace_migrated");
    expect(localStorage.getItem(MIGRATION_MARKER_KEY)).toBe("consumed");
    expect(localStorage.getItem(LEGACY_WORKSPACE_KEY)).toBeNull();

    const persisted = parseStorage<Record<string, unknown>>(`${SNAPSHOT_KEY_PREFIX}workspace_migrated`);
    expect(persisted).toMatchObject({
      schemaVersion: ANICCA_WORKSPACE_SCHEMA_VERSION,
      workspaceId: "workspace_migrated",
      graph,
      focusedNodeId: "user_1",
      composerParentId: null
    });
    expect(persisted).not.toHaveProperty("workspaceSessionId");
  });

  it("does not duplicate a migrated workspace when the marker exists and the legacy key remains", () => {
    const graph = createGraphWithRoot("已有工作区");
    createWorkspaceRecord(
      {
        workspaceId: "workspace_existing",
        graph,
        focusedNodeId: "user_1",
        composerParentId: null,
        stageLayouts: {}
      },
      {
        now: () => "2026-04-29T00:00:00.000Z"
      }
    );
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, "workspace_existing");
    localStorage.setItem(MIGRATION_MARKER_KEY, "consumed");
    localStorage.setItem(
      LEGACY_WORKSPACE_KEY,
      JSON.stringify({
        schemaVersion: ANICCA_WORKSPACE_SCHEMA_VERSION,
        workspaceSessionId: "legacy_ws_session",
        graph: createGraphWithRoot("旧数据还在"),
        focusedNodeId: "user_1",
        composerParentId: null
      })
    );

    const activated = initializeActiveWorkspace({
      createWorkspaceId: () => "workspace_duplicate",
      createWorkspaceSessionId: () => "ws_runtime_2",
      now: () => "2026-04-29T01:00:00.000Z"
    });

    expect(activated.workspaceId).toBe("workspace_existing");
    expect(activated.workspaceSessionId).toBe("ws_runtime_2");
    expect(parseStorage<{ entries: unknown[] }>(REGISTRY_KEY)?.entries).toHaveLength(1);
  });

  it("creates an active empty workspace when no registry or legacy snapshot exists", () => {
    const activated = initializeActiveWorkspace({
      createWorkspaceId: () => "workspace_empty",
      createWorkspaceSessionId: () => "ws_runtime_empty",
      now: () => "2026-04-29T02:00:00.000Z"
    });

    expect(activated).toMatchObject({
      workspaceId: "workspace_empty",
      workspaceSessionId: "ws_runtime_empty",
      focusedNodeId: null,
      composerParentId: null,
      stageLayouts: {},
      graph: createEmptyGraph()
    });
    expect(localStorage.getItem(ACTIVE_WORKSPACE_KEY)).toBe("workspace_empty");
    expect(parseStorage<{ entries: unknown[] }>(REGISTRY_KEY)?.entries).toHaveLength(1);
  });

  it("regenerates runtime session ids every time a workspace is activated", () => {
    createWorkspaceRecord(
      {
        workspaceId: "workspace_switch",
        graph: createGraphWithRoot("切换工作区"),
        focusedNodeId: "user_1",
        composerParentId: null,
        stageLayouts: {}
      },
      {
        now: () => "2026-04-29T00:00:00.000Z"
      }
    );

    expect(
      activateWorkspace("workspace_switch", {
        createWorkspaceSessionId: () => "ws_runtime_a",
        now: () => "2026-04-29T03:00:00.000Z"
      })?.workspaceSessionId
    ).toBe("ws_runtime_a");
    expect(
      activateWorkspace("workspace_switch", {
        createWorkspaceSessionId: () => "ws_runtime_b",
        now: () => "2026-04-29T03:01:00.000Z"
      })?.workspaceSessionId
    ).toBe("ws_runtime_b");
  });

  it("creates a new empty workspace without mutating the current active snapshot", () => {
    createWorkspaceRecord(
      {
        workspaceId: "workspace_existing",
        graph: createGraphWithRoot("existing"),
        focusedNodeId: "user_1",
        composerParentId: null,
        stageLayouts: {}
      },
      { now: () => "2026-04-29T00:00:00.000Z" }
    );
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, "workspace_existing");

    const created = createWorkspace({
      createWorkspaceId: () => "workspace_created",
      createWorkspaceSessionId: () => "ws_created",
      now: () => "2026-04-29T04:00:00.000Z"
    });

    expect(created?.activeWorkspaceId).toBe("workspace_created");
    expect(created?.snapshot.graph.entryIds).toEqual([]);
    expect(loadWorkspaceRegistry().entries).toHaveLength(2);
    expect(loadWorkspaceRecord("workspace_existing")?.snapshot.graph.entryIds).toEqual(["user_1"]);
  });

  it("lists recent workspaces by local recency metadata", () => {
    saveWorkspaceRecord({
      id: "workspace_old",
      title: "Old Workspace",
      snapshot: buildSnapshot("workspace_old", "old"),
      lastOpenedAt: "2026-04-25T09:00:00.000Z"
    });
    saveWorkspaceRecord({
      id: "workspace_new",
      title: "New Workspace",
      snapshot: buildSnapshot("workspace_new", "new"),
      lastOpenedAt: "2026-04-27T09:00:00.000Z"
    });

    expect(listRecentWorkspaces().map((entry) => entry.id)).toEqual([
      "workspace_new",
      "workspace_old"
    ]);
  });

  it("derives a title from the root topic until the workspace is explicitly renamed", () => {
    const created = createWorkspace({
      createWorkspaceId: () => "workspace_title",
      createWorkspaceSessionId: () => "ws_title"
    })!;

    saveWorkspaceRecord({
      id: created.activeWorkspaceId,
      snapshot: buildSnapshot(created.activeWorkspaceId, "derived root")
    });

    expect(loadWorkspaceRecord(created.activeWorkspaceId)?.entry.title).toBe("derived root");

    renameWorkspace(created.activeWorkspaceId, "Manual Title");
    saveWorkspaceRecord({
      id: created.activeWorkspaceId,
      snapshot: buildSnapshot(created.activeWorkspaceId, "changed root title")
    });

    expect(loadWorkspaceRecord(created.activeWorkspaceId)?.entry.title).toBe("Manual Title");
  });

  it("activates a selected workspace and rotates runtime session ownership", () => {
    saveWorkspaceRecord({
      id: "workspace_one",
      title: "Workspace One",
      snapshot: buildSnapshot("workspace_one", "one")
    });
    saveWorkspaceRecord({
      id: "workspace_two",
      title: "Workspace Two",
      snapshot: buildSnapshot("workspace_two", "two")
    });

    const activated = activateWorkspace("workspace_two", {
      createWorkspaceSessionId: () => "ws_runtime_two"
    });

    expect(activated?.workspaceId).toBe("workspace_two");
    expect(activated?.workspaceSessionId).toBe("ws_runtime_two");
    expect(localStorage.getItem(ACTIVE_WORKSPACE_KEY)).toBe("workspace_two");
  });

  it("renames workspace metadata without rewriting the stored graph snapshot", () => {
    saveWorkspaceRecord({
      id: "workspace_rename",
      title: "Before Rename",
      snapshot: buildSnapshot("workspace_rename", "rename")
    });

    const snapshotBeforeRename = localStorage.getItem(
      getWorkspaceSnapshotStorageKey("workspace_rename")
    );

    renameWorkspace("workspace_rename", "After Rename");

    expect(loadWorkspaceRecord("workspace_rename")?.entry.title).toBe("After Rename");
    expect(localStorage.getItem(getWorkspaceSnapshotStorageKey("workspace_rename"))).toBe(snapshotBeforeRename);
  });
});
