import { AniccaNode, BranchType, Edge, Graph } from "@/types/anicca";
import {
  RetrievalClampedOptions,
  RetrievalEdge,
  RetrievalGraphView,
  RetrievalNode,
  RetrievalNodeMatch,
  RetrievalRelation,
  RetrievalSubgraph
} from "./types";

type MatchField = RetrievalNodeMatch["matchedFields"][number];
type MatchKind = RetrievalNodeMatch["bestMatch"];

type NormalizeStats = {
  danglingEdges: number;
  duplicateEdges: number;
};

type NormalizedGraph = {
  view: RetrievalGraphView;
  stats: NormalizeStats;
};

type QueryOptions = {
  depth?: number;
  maxDepth?: number;
  maxNodes?: number;
  maxEdges?: number;
  seedLimit?: number;
  maxQueryChars?: number;
  relations?: RetrievalRelation[];
  direction?: "in" | "out" | "both";
  excludeNodeIds?: string[];
};

const DEFAULT_RELATIONS: RetrievalRelation[] = ["thesis", "antithesis", "synthesis", "continuation"];
const ALL_RELATIONS: RetrievalRelation[] = [
  "lineage",
  "thesis",
  "antithesis",
  "synthesis",
  "continuation",
  "source",
  "merge",
  "artifact"
];
const FIELD_ORDER: MatchField[] = ["label", "summary", "text", "branchType"];
const FIELD_BONUS: Record<MatchField, number> = {
  label: 30,
  summary: 20,
  text: 10,
  branchType: 5
};
const MATCH_BASE: Record<MatchKind, number> = {
  exact: 100,
  prefix: 70,
  substring: 40
};
const MATCH_ORDER: Record<MatchKind, number> = {
  exact: 0,
  prefix: 1,
  substring: 2
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isBranchType(value: unknown): value is BranchType {
  return value === "正" || value === "反" || value === "合";
}

function isRetrievalRelation(value: unknown): value is RetrievalRelation {
  return typeof value === "string" && ALL_RELATIONS.includes(value as RetrievalRelation);
}

function safeNodes(graph: Graph): Record<string, AniccaNode> {
  const maybeGraph = graph as unknown;
  if (!isRecord(maybeGraph) || !isRecord(maybeGraph.nodes)) {
    return {};
  }

  return maybeGraph.nodes as Record<string, AniccaNode>;
}

function safeEdges(graph: Graph): Record<string, Edge> {
  const maybeGraph = graph as unknown;
  if (!isRecord(maybeGraph) || !isRecord(maybeGraph.edges)) {
    return {};
  }

  return maybeGraph.edges as Record<string, Edge>;
}

function toRetrievalNode(id: string, node: AniccaNode, warnings: string[]): RetrievalNode | null {
  if (!node || !["user", "assistant", "merge"].includes(node.kind)) {
    warnings.push(`skipped node ${id}: unsupported kind`);
    return null;
  }

  const text = typeof node.text === "string" ? node.text : "";
  const summary = typeof node.meta?.summary === "string" ? node.meta.summary : undefined;
  const branchType = isBranchType(node.branchType) ? node.branchType : undefined;
  const label = [node.meta?.label, branchType, text, id]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0)!
    .trim();

  return {
    id,
    label,
    text,
    summary,
    kind: node.kind,
    branchType,
    createdAt: typeof node.createdAt === "string" ? node.createdAt : ""
  };
}

function relationFromReason(reason: string | undefined): RetrievalRelation | null {
  if (reason === "正") return "thesis";
  if (reason === "反") return "antithesis";
  if (reason === "synthesis") return "synthesis";
  if (reason === "continue") return "continuation";
  if (reason === "merge") return "merge";
  if (isRetrievalRelation(reason)) return reason;
  return null;
}

function inferRelation(from: RetrievalNode | undefined, to: RetrievalNode | undefined): RetrievalRelation | null {
  if (!from || !to) {
    return null;
  }

  if (to.kind === "merge") {
    return "merge";
  }

  if (from.kind === "user" && to.kind === "assistant") {
    if (to.branchType === "正") return "thesis";
    if (to.branchType === "反") return "antithesis";
    if (to.branchType === "合") return "synthesis";
  }

  if (from.kind === "assistant" && to.kind === "user") {
    return "continuation";
  }

  if (from.kind === "assistant" && to.kind === "assistant" && to.branchType === "合") {
    return "synthesis";
  }

  return null;
}

function canonicalRelation(
  reason: string | undefined,
  from: RetrievalNode | undefined,
  to: RetrievalNode | undefined,
  warnings: string[],
  edgeId: string
): RetrievalRelation | null {
  const explicit = relationFromReason(reason);
  if (explicit) {
    return explicit;
  }

  const inferred = inferRelation(from, to);
  if (reason && inferred) {
    warnings.push(`edge ${edgeId}: unknown edge reason "${reason}", inferred ${inferred}`);
  } else if (reason && !inferred) {
    warnings.push(`edge ${edgeId}: unknown edge reason "${reason}"`);
  }

  return inferred;
}

function normalizeGraphInternal(graph: Graph): NormalizedGraph {
  const rawNodes = safeNodes(graph);
  const rawEdges = safeEdges(graph);
  const warnings: string[] = [];
  const stats: NormalizeStats = {
    danglingEdges: 0,
    duplicateEdges: 0
  };
  const nodes: Record<string, RetrievalNode> = {};
  const edges: RetrievalEdge[] = [];
  const seenKeys = new Set<string>();
  const explicitPairs = new Map<string, Set<RetrievalRelation>>();

  for (const [nodeId, node] of Object.entries(rawNodes)) {
    const normalized = toRetrievalNode(typeof node?.id === "string" ? node.id : nodeId, node, warnings);
    if (normalized) {
      nodes[normalized.id] = normalized;
    }
  }

  function pairKey(from: string, to: string) {
    return `${from}->${to}`;
  }

  function rememberExplicitPair(from: string, to: string, relation: RetrievalRelation) {
    const key = pairKey(from, to);
    const relations = explicitPairs.get(key) || new Set<RetrievalRelation>();
    relations.add(relation);
    explicitPairs.set(key, relations);
  }

  function addEdge(edge: RetrievalEdge, source: "explicit" | "derived") {
    const key = `${edge.from}->${edge.to}:${edge.relation}`;
    if (seenKeys.has(key)) {
      stats.duplicateEdges += 1;
      warnings.push(`duplicate edge skipped: ${key}`);
      return false;
    }

    seenKeys.add(key);
    edges.push(edge);
    if (source === "explicit") {
      rememberExplicitPair(edge.from, edge.to, edge.relation);
    }
    return true;
  }

  for (const [edgeKey, edge] of Object.entries(rawEdges)) {
    const edgeId = typeof edge?.id === "string" ? edge.id : edgeKey;
    const from = typeof edge?.from === "string" ? edge.from : "";
    const to = typeof edge?.to === "string" ? edge.to : "";
    const fromNode = nodes[from];
    const toNode = nodes[to];
    if (!from || !to || !fromNode || !toNode) {
      stats.danglingEdges += 1;
      warnings.push(`edge ${edgeId}: dangling endpoint ${from || "<missing>"} -> ${to || "<missing>"}`);
      continue;
    }

    const relation = canonicalRelation(edge.reason, fromNode, toNode, warnings, edgeId);
    if (!relation) {
      warnings.push(`edge ${edgeId}: skipped because relation could not be inferred`);
      continue;
    }

    addEdge(
      {
        id: edgeId,
        from,
        to,
        relation,
        confidence: "explicit",
        reason: edge.reason
      },
      "explicit"
    );
  }

  function addDerivedEdge(from: string, to: string, reason: string, relation: RetrievalRelation, sourceId: string) {
    if (!nodes[from] || !nodes[to]) {
      stats.danglingEdges += 1;
      warnings.push(`derived edge ${sourceId}: dangling endpoint ${from} -> ${to}`);
      return;
    }

    if (seenKeys.has(`${from}->${to}:${relation}`)) {
      return;
    }

    const explicitRelations = explicitPairs.get(pairKey(from, to));
    if (explicitRelations) {
      if (!explicitRelations.has(relation)) {
        warnings.push(`derived edge ${sourceId}: graph.edges conflict for ${from} -> ${to}, kept explicit edge`);
      }
      return;
    }

    addEdge(
      {
        id: sourceId,
        from,
        to,
        relation,
        confidence: "derived",
        reason
      },
      "derived"
    );
  }

  for (const [nodeId, node] of Object.entries(rawNodes)) {
    const normalizedNode = nodes[typeof node?.id === "string" ? node.id : nodeId];
    if (!normalizedNode) {
      continue;
    }

    for (const parentId of asStringArray(node.parents)) {
      const relation = inferRelation(nodes[parentId], normalizedNode);
      if (!relation) {
        stats.danglingEdges += nodes[parentId] ? 0 : 1;
        warnings.push(`parent backfill ${parentId} -> ${normalizedNode.id}: dangling or unsupported relation`);
        continue;
      }
      addDerivedEdge(parentId, normalizedNode.id, "parent", relation, `derived_parent:${parentId}->${normalizedNode.id}:${relation}`);
    }

    for (const childId of asStringArray(node.children)) {
      const relation = inferRelation(normalizedNode, nodes[childId]);
      if (!relation) {
        stats.danglingEdges += nodes[childId] ? 0 : 1;
        warnings.push(`child backfill ${normalizedNode.id} -> ${childId}: dangling or unsupported relation`);
        continue;
      }
      addDerivedEdge(normalizedNode.id, childId, "child", relation, `derived_child:${normalizedNode.id}->${childId}:${relation}`);
    }

    if (normalizedNode.kind === "assistant" && normalizedNode.branchType === "合") {
      for (const sourceNodeId of asStringArray(node.meta?.sourceNodeIds)) {
        if (!nodes[sourceNodeId] || nodes[sourceNodeId].kind !== "assistant") {
          stats.danglingEdges += 1;
          warnings.push(`sourceNodeIds backfill ${sourceNodeId} -> ${normalizedNode.id}: dangling source`);
          continue;
        }
        addDerivedEdge(
          sourceNodeId,
          normalizedNode.id,
          "sourceNodeIds",
          "synthesis",
          `derived_source:${sourceNodeId}->${normalizedNode.id}:synthesis`
        );
      }

      if (typeof node.meta?.lineageParentId === "string") {
        const lineageParentId = node.meta.lineageParentId;
        if (nodes[lineageParentId]?.kind === "user") {
          addDerivedEdge(
            normalizedNode.id,
            lineageParentId,
            "lineageParentId",
            "lineage",
            `derived_lineage:${normalizedNode.id}->${lineageParentId}:lineage`
          );
        } else {
          stats.danglingEdges += 1;
          warnings.push(`lineageParentId backfill ${normalizedNode.id} -> ${lineageParentId}: dangling parent`);
        }
      }
    }
  }

  return {
    view: {
      nodes,
      edges,
      warnings
    },
    stats
  };
}

export function normalizeGraphForRetrieval(graph: Graph): RetrievalGraphView {
  return normalizeGraphInternal(graph).view;
}

export function getNode(graph: Graph, nodeId: string): RetrievalNode | null {
  return normalizeGraphForRetrieval(graph).nodes[nodeId] || null;
}

function normalizeSearchText(input: string) {
  return input.trim().toLocaleLowerCase();
}

function queryTerms(query: string, maxQueryChars: number) {
  const normalized = normalizeSearchText(query.slice(0, maxQueryChars));
  if (!normalized) {
    return [];
  }

  const splitTerms = normalized.split(/\s+/).filter(Boolean);
  return splitTerms.length ? splitTerms : [normalized];
}

function matchKind(value: string, term: string): MatchKind | null {
  const normalizedValue = normalizeSearchText(value);
  if (!normalizedValue || !term) {
    return null;
  }

  if (normalizedValue === term) return "exact";
  if (normalizedValue.startsWith(term)) return "prefix";
  if (normalizedValue.includes(term)) return "substring";
  return null;
}

function scoreNodes(view: RetrievalGraphView, query: string, maxQueryChars: number): RetrievalNodeMatch[] {
  const terms = queryTerms(query, maxQueryChars);
  if (!terms.length) {
    return [];
  }

  const matches = Object.values(view.nodes)
    .map((node) => {
      let bestScore = 0;
      let bestMatch: MatchKind | null = null;
      let bestFieldOrder = FIELD_ORDER.length;
      const matchedFields: MatchField[] = [];

      for (const field of FIELD_ORDER) {
        const value = field === "branchType" ? node.branchType : node[field];
        if (typeof value !== "string" || !value.trim()) {
          continue;
        }

        let bestFieldMatch: MatchKind | null = null;
        for (const term of terms) {
          const current = matchKind(value, term);
          if (!current) {
            continue;
          }
          if (!bestFieldMatch || MATCH_ORDER[current] < MATCH_ORDER[bestFieldMatch]) {
            bestFieldMatch = current;
          }
        }

        if (!bestFieldMatch) {
          continue;
        }

        matchedFields.push(field);
        const score = MATCH_BASE[bestFieldMatch] + FIELD_BONUS[field];
        if (
          score > bestScore ||
          (score === bestScore && (!bestMatch || MATCH_ORDER[bestFieldMatch] < MATCH_ORDER[bestMatch])) ||
          (score === bestScore && FIELD_ORDER.indexOf(field) < bestFieldOrder)
        ) {
          bestScore = score;
          bestMatch = bestFieldMatch;
          bestFieldOrder = FIELD_ORDER.indexOf(field);
        }
      }

      if (!bestMatch) {
        return null;
      }

      return {
        node,
        score: bestScore,
        rank: 0,
        bestMatch,
        matchedFields
      };
    })
    .filter((match): match is Omit<RetrievalNodeMatch, "rank"> & { rank: number } => Boolean(match))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (MATCH_ORDER[left.bestMatch] !== MATCH_ORDER[right.bestMatch]) {
        return MATCH_ORDER[left.bestMatch] - MATCH_ORDER[right.bestMatch];
      }
      const leftFieldOrder = FIELD_ORDER.indexOf(left.matchedFields[0]);
      const rightFieldOrder = FIELD_ORDER.indexOf(right.matchedFields[0]);
      if (leftFieldOrder !== rightFieldOrder) return leftFieldOrder - rightFieldOrder;
      return left.node.id.localeCompare(right.node.id);
    });

  return matches.map((match, index) => ({
    ...match,
    rank: index + 1
  }));
}

export function findByLabelOrText(
  graph: Graph,
  query: string,
  options: {
    limit?: number;
    maxQueryChars?: number;
  } = {}
): RetrievalNodeMatch[] {
  const view = normalizeGraphForRetrieval(graph);
  const maxQueryChars = clampInteger(options.maxQueryChars ?? 500, 0, 500);
  const limit = Math.max(0, Math.floor(options.limit ?? 20));
  return scoreNodes(view, query, maxQueryChars).slice(0, limit);
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return max;
  }

  return Math.min(max, Math.max(min, Math.floor(value)));
}

function dedupeRelations(relations: RetrievalRelation[]) {
  const seen = new Set<RetrievalRelation>();
  const result: RetrievalRelation[] = [];
  for (const relation of relations) {
    if (!isRetrievalRelation(relation) || seen.has(relation)) {
      continue;
    }
    seen.add(relation);
    result.push(relation);
  }
  return result;
}

function clampOptions(options: QueryOptions, warnings: string[]): RetrievalClampedOptions {
  const requestedMaxDepth = options.maxDepth ?? 2;
  const maxDepth = clampInteger(requestedMaxDepth, 0, 2);
  const depth = clampInteger(options.depth ?? 2, 0, maxDepth);
  const maxNodes = clampInteger(options.maxNodes ?? 20, 0, 20);
  const maxEdges = clampInteger(options.maxEdges ?? 40, 0, 40);
  const seedLimit = clampInteger(options.seedLimit ?? 3, 0, 3);
  const maxQueryChars = clampInteger(options.maxQueryChars ?? 500, 0, 500);
  const relations = dedupeRelations(options.relations || DEFAULT_RELATIONS);
  const direction = options.direction === "in" || options.direction === "out" ? options.direction : "both";

  if (
    requestedMaxDepth !== maxDepth ||
    (options.depth ?? 2) !== depth ||
    (options.maxNodes ?? 20) !== maxNodes ||
    (options.maxEdges ?? 40) !== maxEdges ||
    (options.seedLimit ?? 3) !== seedLimit ||
    (options.maxQueryChars ?? 500) !== maxQueryChars
  ) {
    warnings.push("query options clamped to Phase 1A safety limits");
  }

  return {
    depth,
    maxDepth,
    maxNodes,
    maxEdges,
    seedLimit,
    maxQueryChars,
    relations: relations.length ? relations : [...DEFAULT_RELATIONS],
    direction
  };
}

function edgeTouchesExcluded(edge: RetrievalEdge, excludeNodeIds: Set<string>) {
  return excludeNodeIds.has(edge.from) || excludeNodeIds.has(edge.to);
}

function otherEndpoint(edge: RetrievalEdge, currentNodeId: string, direction: RetrievalClampedOptions["direction"]) {
  if ((direction === "out" || direction === "both") && edge.from === currentNodeId) {
    return edge.to;
  }
  if ((direction === "in" || direction === "both") && edge.to === currentNodeId) {
    return edge.from;
  }
  return null;
}

export function queryWorkspaceGraph(graph: Graph, query: string, options: QueryOptions = {}): RetrievalSubgraph {
  const normalized = normalizeGraphInternal(graph);
  const warnings = [...normalized.view.warnings];
  const clampedOptions = clampOptions(options, warnings);
  const relationSet = new Set(clampedOptions.relations);
  const excludeNodeIds = new Set(options.excludeNodeIds || []);
  const omitted = {
    matches: 0,
    nodes: 0,
    edges: 0,
    excludedNodes: 0,
    danglingEdges: normalized.stats.danglingEdges,
    duplicateEdges: normalized.stats.duplicateEdges
  };
  const excludedSeen = new Set<string>();
  const allMatches = scoreNodes(normalized.view, query, clampedOptions.maxQueryChars);

  function noteExcluded(nodeId: string) {
    if (!excludedSeen.has(nodeId)) {
      excludedSeen.add(nodeId);
      omitted.excludedNodes = excludedSeen.size;
    }
  }

  const includedMatches = allMatches.filter((match) => {
    if (excludeNodeIds.has(match.node.id)) {
      noteExcluded(match.node.id);
      return false;
    }
    return true;
  });
  const seedMatches = includedMatches.slice(0, clampedOptions.seedLimit).map((match, index) => ({
    ...match,
    rank: index + 1
  }));
  omitted.matches = Math.max(0, allMatches.length - seedMatches.length);

  const selectedNodes = new Map<string, RetrievalNode>();
  const selectedEdges: RetrievalEdge[] = [];
  const visited = new Set<string>();
  const queue: Array<{ nodeId: string; depth: number }> = [];

  for (const match of seedMatches) {
    if (selectedNodes.size >= clampedOptions.maxNodes) {
      omitted.nodes += 1;
      continue;
    }
    selectedNodes.set(match.node.id, match.node);
    visited.add(match.node.id);
    queue.push({ nodeId: match.node.id, depth: 0 });
  }

  while (queue.length) {
    const current = queue.shift()!;
    if (current.depth >= clampedOptions.depth) {
      continue;
    }

    for (const edge of normalized.view.edges) {
      if (!relationSet.has(edge.relation)) {
        continue;
      }

      const nextNodeId = otherEndpoint(edge, current.nodeId, clampedOptions.direction);
      if (!nextNodeId) {
        continue;
      }

      if (edgeTouchesExcluded(edge, excludeNodeIds)) {
        noteExcluded(edge.from);
        noteExcluded(edge.to);
        omitted.edges += 1;
        continue;
      }

      const nextNode = normalized.view.nodes[nextNodeId];
      if (!nextNode) {
        omitted.danglingEdges += 1;
        omitted.edges += 1;
        continue;
      }

      if (visited.has(nextNodeId)) {
        continue;
      }

      if (selectedNodes.size >= clampedOptions.maxNodes) {
        omitted.nodes += 1;
        omitted.edges += 1;
        continue;
      }

      if (selectedEdges.length >= clampedOptions.maxEdges) {
        omitted.edges += 1;
        continue;
      }

      visited.add(nextNodeId);
      selectedNodes.set(nextNodeId, nextNode);
      selectedEdges.push(edge);
      queue.push({ nodeId: nextNodeId, depth: current.depth + 1 });
    }
  }

  return {
    nodes: [...selectedNodes.values()],
    edges: selectedEdges,
    seedNodeIds: seedMatches.map((match) => match.node.id),
    seedMatches,
    clampedOptions,
    omitted,
    warnings
  };
}
