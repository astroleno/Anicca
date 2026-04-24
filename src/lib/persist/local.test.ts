import { createEmptyGraph } from "@/types/anicca";
import {
  ANICCA_WORKSPACE_SCHEMA_VERSION,
  loadGraphLocal,
  saveGraphLocal
} from "@/lib/persist/local";

describe("workspace persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saves and restores graph plus workspace state", () => {
    const graph = createEmptyGraph();
    graph.nodes.user_1 = {
      id: "user_1",
      kind: "user",
      text: "root",
      createdAt: new Date().toISOString(),
      parents: [],
      children: []
    };
    graph.entryIds.push("user_1");

    saveGraphLocal({
      schemaVersion: ANICCA_WORKSPACE_SCHEMA_VERSION,
      workspaceSessionId: "ws_1",
      graph,
      focusedNodeId: "user_1",
      composerParentId: null
    });

    expect(loadGraphLocal()).toEqual({
      schemaVersion: ANICCA_WORKSPACE_SCHEMA_VERSION,
      workspaceSessionId: "ws_1",
      graph,
      focusedNodeId: "user_1",
      composerParentId: null
    });
  });

  it("invalidates incompatible snapshot versions cleanly", () => {
    localStorage.setItem(
      "anicca_workspace_v2",
      JSON.stringify({
        schemaVersion: "old-version",
        graph: createEmptyGraph()
      })
    );

    expect(loadGraphLocal()).toBeNull();
  });
});
