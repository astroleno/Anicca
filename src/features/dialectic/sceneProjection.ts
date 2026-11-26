import type { AniccaNode, BranchType, Graph } from "@/types/anicca";
import type { SeedPerspective } from "@/features/perspectives/model";
import type { PolarityOrigin } from "@/features/perspectives/polarity";

export type DialogueStageNode = {
  id: string;
  conceptId?: string;
  instanceNumber?: number;
  sourceRole?: "result" | "source" | "shared" | "other";
  commonParentId?: string;
  semanticColor?: [number, number, number];
  label: string;
  preview?: string;
  summary?: string;
  kind: AniccaNode["kind"];
  branchType?: BranchType;
  displayRole?: "node" | "synthesis-record";
  isGrowthPerspective?: boolean;
  ordinaryTier?: "focus" | "direct" | "distant";
  relation: "focus" | "ancestor" | "child" | "source";
  seedX: number;
  seedY: number;
  seedZ?: number;
  generation?: number;
  perspective?: SeedPerspective;
  polarity?: PolarityOrigin;
  spatialCoordinates?: Partial<Record<"x" | "y" | "z", number>>;
  compactSeedX?: number;
  compactSeedY?: number;
  originNodeIds?: string[];
};

export function stageSeedRole(node: Pick<DialogueStageNode, "kind" | "branchType" | "displayRole" | "isGrowthPerspective">) {
  if (node.kind === "user") return "user";
  if (node.branchType === "正") return "thesis";
  if (node.branchType === "反") return "antithesis";
  if (node.branchType === "合" || node.kind === "merge" || node.displayRole === "synthesis-record") return "synthesis";
  if (node.isGrowthPerspective) return "growth";
  return "neutral";
}

export function isSynthesisSeed(graph: Graph, node: AniccaNode | undefined) {
  if (node?.branchType === "合" || node?.kind === "merge") return true;
  const sources = node?.meta?.sourceNodeIds;
  if (node?.kind !== "assistant" || node.branchType || !Array.isArray(sources) || sources.length !== 2) return false;
  const [left, right] = sources;
  const valid = (id: unknown) => typeof id === "string" && id.length > 0 && id !== node.id &&
    Object.prototype.hasOwnProperty.call(graph.nodes, id);
  return left !== right && valid(left) && valid(right);
}

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
    const graphNode = graph.nodes[stageNode.conceptId || stageNode.id];
    if (!graphNode || seen.has(stageNode.id)) {
      return [];
    }

    seen.add(stageNode.id);
    return [{
      ...stageNode,
      id: stageNode.id,
      ...(stageNode.conceptId ? {
        label: graphNode.meta?.label || (graphNode.text || "想法").slice(0, 14),
        preview: graphNode.text,
        summary: graphNode.meta?.summary
      } : {}),
      kind: graphNode.kind,
      branchType: graphNode.branchType ?? (graphNode.kind === "assistant" && isSynthesisSeed(graph, graphNode) ? "合" : undefined),
      perspective: graphNode.meta?.perspective,
      polarity: graphNode.meta?.polarity,
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
