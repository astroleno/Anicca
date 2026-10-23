import { BranchType, NodeKind } from "@/types/anicca";
import type { SeedPerspective, ThinkingSpace } from "@/features/perspectives/model";
import type { PolarityOrigin } from "@/features/perspectives/polarity";

export type RetrievalRelation =
  | "lineage"
  | "thesis"
  | "antithesis"
  | "polarity"
  | "synthesis"
  | "continuation"
  | "source"
  | "merge"
  | "artifact"
  | "growth:expand"
  | "growth:counter_aha"
  | "growth:merge_promote"
  | "growth:resonate"
  | "growth:reframe";

export type RetrievalConfidence = "explicit" | "derived" | "inferred";

export type RetrievalNode = {
  id: string;
  label: string;
  text: string;
  summary?: string;
  kind: Extract<NodeKind, "user" | "assistant" | "merge">;
  branchType?: BranchType;
  polarity?: PolarityOrigin;
  perspective?: SeedPerspective;
  fissionFrame?: ThinkingSpace;
  growth?: {
    operator?: string;
    artworkId?: string;
    sourceArtworkIds?: string[];
    eventId?: string;
  };
  createdAt: string;
};

export type RetrievalEdge = {
  id: string;
  from: string;
  to: string;
  relation: RetrievalRelation;
  confidence: RetrievalConfidence;
  reason?: string;
};

export type RetrievalNodeMatch = {
  node: RetrievalNode;
  score: number;
  rank: number;
  bestMatch: "exact" | "prefix" | "substring";
  matchedFields: Array<
    "label" |
    "summary" |
    "text" |
    "viewpoint" |
    "branchType" |
    "growthOperator" |
    "growthArtworkId" |
    "growthEventId"
  >;
};

export type RetrievalClampedOptions = {
  depth: number;
  maxDepth: number;
  maxNodes: number;
  maxEdges: number;
  seedLimit: number;
  maxQueryChars: number;
  relations: RetrievalRelation[];
  direction: "in" | "out" | "both";
};

export type RetrievalSubgraph = {
  nodes: RetrievalNode[];
  edges: RetrievalEdge[];
  seedNodeIds: string[];
  seedMatches: RetrievalNodeMatch[];
  clampedOptions: RetrievalClampedOptions;
  omitted: {
    matches: number;
    nodes: number;
    edges: number;
    excludedNodes: number;
    danglingEdges: number;
    duplicateEdges: number;
  };
  warnings: string[];
};

export type RetrievalGraphView = {
  nodes: Record<string, RetrievalNode>;
  edges: RetrievalEdge[];
  warnings: string[];
};
