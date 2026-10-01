import type { AniccaNode, BranchType, Graph } from "@/types/anicca";

export type DialogueStageNode = {
  id: string;
  label: string;
  preview?: string;
  summary?: string;
  kind: AniccaNode["kind"];
  branchType?: BranchType;
  displayRole?: "node" | "synthesis-record";
  isGrowthPerspective?: boolean;
  relation: "focus" | "ancestor" | "child" | "source";
  seedX: number;
  seedY: number;
  compactSeedX?: number;
  compactSeedY?: number;
  originNodeIds?: string[];
};

export type DialogueSceneProjection = {
  nodes: DialogueStageNode[];
  visibleNodeIds: string[];
};

const MIN_X = 8;
const MAX_X = 92;
const MIN_Y = 8;
const MAX_Y = 92;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampOptional(value: number | undefined, min: number, max: number) {
  return typeof value === "number" ? clamp(value, min, max) : undefined;
}

/**
 * Final, DOM-free boundary between the semantic graph view and the liquid
 * runtime. It keeps identity stable, rejects stale nodes, and bounds layout
 * seeds without treating the visible node budget as graph history.
 */
export function projectDialogueScene(
  graph: Graph,
  stageNodes: DialogueStageNode[]
): DialogueSceneProjection {
  const seen = new Set<string>();
  const nodes = stageNodes.flatMap((stageNode) => {
    const graphNode = graph.nodes[stageNode.id];
    if (!graphNode || seen.has(stageNode.id)) {
      return [];
    }

    seen.add(stageNode.id);
    return [{
      ...stageNode,
      id: graphNode.id,
      kind: graphNode.kind,
      branchType: graphNode.branchType,
      seedX: clamp(stageNode.seedX, MIN_X, MAX_X),
      seedY: clamp(stageNode.seedY, MIN_Y, MAX_Y),
      compactSeedX: clampOptional(stageNode.compactSeedX, MIN_X, MAX_X),
      compactSeedY: clampOptional(stageNode.compactSeedY, MIN_Y, MAX_Y)
    }];
  });

  return {
    nodes,
    visibleNodeIds: nodes.map((node) => node.id)
  };
}
