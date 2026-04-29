import {
  buildContinuationCreatedEvent,
  buildSynthesisCreatedEvent,
  buildWorkspaceResumedEvent,
  emitDialogueTelemetry,
  resetDialogueTelemetrySinkForTests,
  setDialogueTelemetrySink
} from "@/lib/analytics/dialogue";
import { ActiveWorkspaceRecord } from "@/types/workspace";
import { createEmptyGraph } from "@/types/anicca";

function buildWorkspaceRecord(): ActiveWorkspaceRecord {
  const graph = createEmptyGraph();
  graph.nodes.user_root_1 = {
    id: "user_root_1",
    kind: "user",
    text: "这个方向还值不值得继续投入？",
    createdAt: new Date("2026-04-25T12:00:00.000Z").toISOString(),
    parents: [],
    children: ["asst_thesis_1", "asst_antithesis_1"]
  };
  graph.nodes.asst_thesis_1 = {
    id: "asst_thesis_1",
    kind: "assistant",
    branchType: "正",
    text: "继续，但把范围切小。",
    createdAt: new Date("2026-04-25T12:01:00.000Z").toISOString(),
    parents: ["user_root_1"],
    children: ["asst_synthesis_1"]
  };
  graph.nodes.asst_antithesis_1 = {
    id: "asst_antithesis_1",
    kind: "assistant",
    branchType: "反",
    text: "先停一下，别同时铺太开。",
    createdAt: new Date("2026-04-25T12:02:00.000Z").toISOString(),
    parents: ["user_root_1"],
    children: ["asst_synthesis_1"]
  };
  graph.nodes.asst_synthesis_1 = {
    id: "asst_synthesis_1",
    kind: "assistant",
    branchType: "合",
    text: "保留主线，但拆开节奏。",
    createdAt: new Date("2026-04-25T12:03:00.000Z").toISOString(),
    parents: ["asst_thesis_1", "asst_antithesis_1"],
    children: [],
    meta: {
      sourceNodeIds: ["asst_thesis_1", "asst_antithesis_1"],
      lineageParentId: "user_root_1"
    }
  };
  graph.entryIds.push("user_root_1");

  return {
    activeWorkspaceId: "workspace_1",
    entry: {
      id: "workspace_1",
      title: "这个方向还值不值得继续投入？",
      titleSource: "derived",
      createdAt: "2026-04-25T12:00:00.000Z",
      updatedAt: "2026-04-25T12:03:00.000Z",
      lastOpenedAt: "2026-04-28T09:00:00.000Z",
      nodeCount: 4,
      entryCount: 1,
      focusedNodeId: "asst_synthesis_1"
    },
    snapshot: {
      schemaVersion: "anicca-workspace-v2",
      workspaceId: "workspace_1",
      workspaceSessionId: "ws_1",
      graph,
      focusedNodeId: "asst_synthesis_1",
      composerParentId: "asst_synthesis_1",
      stageLayouts: {}
    },
    registry: {
      schemaVersion: "anicca-workspace-registry-v1",
      entries: []
    }
  };
}

describe("dialogue telemetry", () => {
  beforeEach(() => {
    resetDialogueTelemetrySinkForTests();
  });

  it("builds privacy-safe workspace_resumed payloads", () => {
    const event = buildWorkspaceResumedEvent(buildWorkspaceRecord(), "switch");

    expect(event).toEqual({
      name: "workspace_resumed",
      payload: {
        source: "switch",
        nodeCount: 4,
        entryCount: 1,
        hasFocus: true,
        hasComposerTarget: true
      }
    });
  });

  it("builds privacy-safe continuation_created payloads", () => {
    const graph = buildWorkspaceRecord().snapshot.graph;
    const event = buildContinuationCreatedEvent(graph, "asst_thesis_1");

    expect(event).toEqual({
      name: "continuation_created",
      payload: {
        source: "continuation",
        parentKind: "assistant",
        nodeCount: 4,
        entryCount: 1
      }
    });
  });

  it("builds privacy-safe synthesis_created payloads", () => {
    const graph = buildWorkspaceRecord().snapshot.graph;
    const event = buildSynthesisCreatedEvent(graph, "asst_synthesis_1");

    expect(event).toEqual({
      name: "synthesis_created",
      payload: {
        nodeCount: 4,
        entryCount: 1,
        sourceCount: 2,
        hasLineageParent: true
      }
    });
  });

  it("uses a no-op default sink", async () => {
    await expect(
      emitDialogueTelemetry(buildWorkspaceResumedEvent(buildWorkspaceRecord(), "boot"))
    ).resolves.toBeUndefined();
  });

  it("swallows synchronous and async sink failures", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const syncError = new Error("sync_failure");
    const asyncError = new Error("async_failure");
    let calls = 0;

    setDialogueTelemetrySink({
      track() {
        calls += 1;
        if (calls === 1) {
          throw syncError;
        }
        return Promise.reject(asyncError);
      }
    });

    await expect(
      emitDialogueTelemetry(buildWorkspaceResumedEvent(buildWorkspaceRecord(), "boot"))
    ).resolves.toBeUndefined();
    await expect(
      emitDialogueTelemetry(buildWorkspaceResumedEvent(buildWorkspaceRecord(), "switch"))
    ).resolves.toBeUndefined();

    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalled();
  });
});
