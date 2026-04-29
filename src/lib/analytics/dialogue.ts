import { Graph } from "@/types/anicca";
import { ActiveWorkspaceRecord } from "@/types/workspace";

export type WorkspaceResumedSource = "boot" | "switch";

export type DialogueTelemetryEvent =
  | {
      name: "workspace_resumed";
      payload: {
        source: WorkspaceResumedSource;
        nodeCount: number;
        entryCount: number;
        hasFocus: boolean;
        hasComposerTarget: boolean;
      };
    }
  | {
      name: "continuation_created";
      payload: {
        source: "root" | "continuation";
        parentKind: "assistant" | "user" | "none";
        nodeCount: number;
        entryCount: number;
      };
    }
  | {
      name: "synthesis_created";
      payload: {
        nodeCount: number;
        entryCount: number;
        sourceCount: number;
        hasLineageParent: boolean;
      };
    };

export type DialogueTelemetrySink = {
  track: (event: DialogueTelemetryEvent) => void | Promise<void>;
};

const noopSink: DialogueTelemetrySink = {
  track() {}
};

let dialogueTelemetrySink: DialogueTelemetrySink = noopSink;

function getGraphCounts(graph: Graph) {
  return {
    nodeCount: Object.keys(graph.nodes).length,
    entryCount: graph.entryIds.length
  };
}

export function setDialogueTelemetrySink(sink: DialogueTelemetrySink | null | undefined) {
  dialogueTelemetrySink = sink || noopSink;
}

export function resetDialogueTelemetrySinkForTests() {
  dialogueTelemetrySink = noopSink;
}

export async function emitDialogueTelemetry(event: DialogueTelemetryEvent) {
  try {
    await Promise.resolve(dialogueTelemetrySink.track(event));
  } catch (error) {
    console.warn("dialogue telemetry sink failed", error);
  }
}

export function buildWorkspaceResumedEvent(
  record: ActiveWorkspaceRecord,
  source: WorkspaceResumedSource
): DialogueTelemetryEvent {
  const counts = getGraphCounts(record.snapshot.graph);
  return {
    name: "workspace_resumed",
    payload: {
      source,
      ...counts,
      hasFocus: Boolean(record.snapshot.focusedNodeId),
      hasComposerTarget: Boolean(record.snapshot.composerParentId)
    }
  };
}

export function buildContinuationCreatedEvent(
  graph: Graph,
  composerTargetId: string | null
): DialogueTelemetryEvent {
  const counts = getGraphCounts(graph);
  const rawParentKind = composerTargetId ? graph.nodes[composerTargetId]?.kind || "none" : "none";
  const parentKind =
    rawParentKind === "user" || rawParentKind === "assistant" ? rawParentKind : "none";

  return {
    name: "continuation_created",
    payload: {
      source: composerTargetId ? "continuation" : "root",
      parentKind,
      ...counts
    }
  };
}

export function buildSynthesisCreatedEvent(
  graph: Graph,
  synthesisId: string
): DialogueTelemetryEvent {
  const counts = getGraphCounts(graph);
  const synthesisNode = graph.nodes[synthesisId];
  const sourceCount = Array.isArray(synthesisNode?.meta?.sourceNodeIds)
    ? synthesisNode.meta.sourceNodeIds.length
    : 0;

  return {
    name: "synthesis_created",
    payload: {
      ...counts,
      sourceCount,
      hasLineageParent: Boolean(synthesisNode?.meta?.lineageParentId)
    }
  };
}
