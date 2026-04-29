import { createEmptyGraph } from "@/types/anicca";
import { ANICCA_WORKSPACE_SCHEMA_VERSION } from "@/lib/persist/local";
import {
  ACTIVE_WORKSPACE_KEY,
  LEGACY_WORKSPACE_KEY,
  MIGRATION_MARKER_KEY,
  REGISTRY_KEY,
  SNAPSHOT_KEY_PREFIX,
  activateWorkspace,
  createWorkspaceRecord,
  initializeActiveWorkspace
} from "@/lib/persist/workspaces";

function createGraphWithRoot(text = "root") {
  const graph = createEmptyGraph();
  graph.nodes.user_1 = {
    id: "user_1",
    kind: "user",
    text,
    createdAt: "2026-04-24T03:00:00.000Z",
    parents: [],
    children: []
  };
  graph.entryIds.push("user_1");
  return graph;
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
    expect(activated?.workspaceSessionId).not.toBe("legacy_ws_session");

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

    expect(activated?.workspaceId).toBe("workspace_existing");
    expect(activated?.workspaceSessionId).toBe("ws_runtime_2");
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
    const graph = createGraphWithRoot("切换工作区");
    createWorkspaceRecord(
      {
        workspaceId: "workspace_switch",
        graph,
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
});
