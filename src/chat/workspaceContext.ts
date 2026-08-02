import { buildParentContext } from "@/chat/context";
import type { BuiltContext } from "@/chat/context";
import type { AniccaNode, BranchType, Graph } from "@/types/anicca";
import type { Message } from "@/types/chat";
import { renderRetrievalContext } from "@/features/retrieval/contextRender";
import { queryWorkspaceGraph } from "@/features/retrieval/workspaceGraphQuery";
import type { RetrievalRelation, RetrievalSubgraph } from "@/features/retrieval/types";

export type ParentContextCoverage = {
  coveredNodeIds: string[];
  sourceNodeIds: string[];
  coveredEdgeIds: string[];
};

export type WorkspaceRetrievalOptions = {
  enabled: boolean;
  depth?: number;
  maxDepth?: number;
  maxNodes?: number;
  maxEdges?: number;
  charBudget?: number;
  maxCharBudget?: number;
  relations?: RetrievalRelation[];
  direction?: "in" | "out" | "both";
};

export type WorkspaceBuiltContext = BuiltContext & {
  coverage: ParentContextCoverage;
  retrieval?: {
    subgraph: RetrievalSubgraph;
    message?: Message;
  };
};

export type BuildWorkspaceContextInput = {
  targetId?: string | null;
  queryText: string;
  systemPrelude: string;
  branchFilter?: BranchType;
  graph: Graph;
  graphRevision?: number;
  workspaceSessionId?: string;
  retrieval?: WorkspaceRetrievalOptions;
};

function branchOrder(branchType?: BranchType): number {
  if (branchType === "正") return 0;
  if (branchType === "反") return 1;
  if (branchType === "合") return 2;
  return 99;
}

function getLineageParentUserId(graph: Graph, assistantNode: AniccaNode): string | null {
  if (assistantNode.kind !== "assistant") {
    return null;
  }

  if (assistantNode.branchType === "合" && assistantNode.meta?.lineageParentId) {
    return assistantNode.meta.lineageParentId;
  }

  const parentId = assistantNode.parents.find((nodeId) => graph.nodes[nodeId]?.kind === "user");
  return parentId || null;
}

function getParentAssistantId(graph: Graph, userNode: AniccaNode): string | null {
  return userNode.parents.find((nodeId) => graph.nodes[nodeId]?.kind === "assistant") || null;
}

function collectRoundAssistantIds(
  graph: Graph,
  userNode: AniccaNode,
  branchFilter?: BranchType,
  currentAssistant?: AniccaNode
): string[] {
  if (currentAssistant?.branchType === "合") {
    return (currentAssistant.meta?.sourceNodeIds || []).filter((nodeId) => Boolean(graph.nodes[nodeId]));
  }

  return userNode.children
    .map((nodeId) => graph.nodes[nodeId])
    .filter((child): child is AniccaNode => Boolean(child) && child.kind === "assistant")
    .filter((child) => !branchFilter || child.branchType === branchFilter)
    .sort((left, right) => branchOrder(left.branchType) - branchOrder(right.branchType))
    .map((child) => child.id);
}

function sortedIds(ids: Set<string>) {
  return [...ids].sort((left, right) => left.localeCompare(right));
}

function sortedSourceNodeIds(graph: Graph, ids: Set<string>) {
  return [...ids].sort((left, right) => {
    const branchDelta = branchOrder(graph.nodes[left]?.branchType) - branchOrder(graph.nodes[right]?.branchType);
    if (branchDelta !== 0) return branchDelta;
    return left.localeCompare(right);
  });
}

function collectCoveredEdgeIds(graph: Graph, coveredNodeIds: Set<string>) {
  const edgeIds = new Set<string>();
  for (const edge of Object.values(graph.edges)) {
    if (coveredNodeIds.has(edge.from) && coveredNodeIds.has(edge.to)) {
      edgeIds.add(edge.id);
    }
  }
  return sortedIds(edgeIds);
}

function emptyCoverage(): ParentContextCoverage {
  return {
    coveredNodeIds: [],
    sourceNodeIds: [],
    coveredEdgeIds: []
  };
}

export function collectParentContextCoverage(input: {
  targetId?: string | null;
  branchFilter?: BranchType;
  graph: Graph;
}): ParentContextCoverage {
  if (!input.targetId) {
    return emptyCoverage();
  }

  const target = input.graph.nodes[input.targetId];
  const coveredNodeIds = new Set<string>();
  const sourceNodeIds = new Set<string>();
  let currentAssistant = target?.kind === "assistant" ? target : null;
  let count = 0;

  while (currentAssistant && count < 5) {
    coveredNodeIds.add(currentAssistant.id);

    const userParentId = getLineageParentUserId(input.graph, currentAssistant);
    if (!userParentId) {
      break;
    }

    const userNode = input.graph.nodes[userParentId];
    if (!userNode || userNode.kind !== "user") {
      break;
    }
    coveredNodeIds.add(userNode.id);

    const roundAssistantIds = collectRoundAssistantIds(input.graph, userNode, input.branchFilter, currentAssistant);
    for (const nodeId of roundAssistantIds) {
      coveredNodeIds.add(nodeId);
      if (currentAssistant.branchType === "合") {
        sourceNodeIds.add(nodeId);
      }
    }

    const parentAssistantId = getParentAssistantId(input.graph, userNode);
    currentAssistant = parentAssistantId ? input.graph.nodes[parentAssistantId] || null : null;
    count++;
  }

  return {
    coveredNodeIds: sortedIds(coveredNodeIds),
    sourceNodeIds: sortedSourceNodeIds(input.graph, sourceNodeIds),
    coveredEdgeIds: collectCoveredEdgeIds(input.graph, coveredNodeIds)
  };
}

function buildSystemOnlyContext(systemPrelude: string): BuiltContext {
  const messages: Message[] = [];
  if (systemPrelude) {
    messages.push({
      id: "sys_workspace",
      role: "system",
      content: systemPrelude,
      createdAt: new Date().toISOString()
    });
  }

  return {
    systemPrelude,
    messages,
    weightsUsed: [],
    lengthCaps: []
  };
}

function buildBaseContext(input: BuildWorkspaceContextInput): BuiltContext {
  if (!input.targetId) {
    return buildSystemOnlyContext(input.systemPrelude);
  }
  return buildParentContext(input.targetId, input.systemPrelude, input.branchFilter, input.graph);
}

export function buildWorkspaceContext(input: BuildWorkspaceContextInput): WorkspaceBuiltContext {
  const baseContext = buildBaseContext(input);
  const coverage = collectParentContextCoverage({
    targetId: input.targetId,
    branchFilter: input.branchFilter,
    graph: input.graph
  });

  if (!input.retrieval?.enabled) {
    return {
      ...baseContext,
      coverage
    };
  }

  const subgraph = queryWorkspaceGraph(input.graph, input.queryText, {
    depth: input.retrieval.depth,
    maxDepth: input.retrieval.maxDepth,
    maxNodes: input.retrieval.maxNodes,
    maxEdges: input.retrieval.maxEdges,
    relations: input.retrieval.relations,
    direction: input.retrieval.direction,
    excludeNodeIds: coverage.coveredNodeIds
  });
  const content = renderRetrievalContext(subgraph, {
    charBudget: input.retrieval.charBudget,
    maxCharBudget: input.retrieval.maxCharBudget
  });
  const message = content
    ? {
        id: "retrieval_context",
        role: "system" as const,
        content,
        createdAt: new Date().toISOString()
      }
    : undefined;

  return {
    ...baseContext,
    messages: message ? [...baseContext.messages, message] : baseContext.messages,
    coverage,
    retrieval: {
      subgraph,
      message
    }
  };
}
