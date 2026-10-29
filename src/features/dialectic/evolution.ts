import type { Graph } from "@/types/anicca";
import { normalizeGraphForRetrieval } from "@/features/retrieval/workspaceGraphQuery";
import type { RetrievalNode, RetrievalRelation } from "@/features/retrieval/types";
import { perspectiveLabel, seedPerspectiveLabel } from "@/features/perspectives/model";
import { polarityAxis, polarityLabel } from "@/features/perspectives/polarity";
import { inquiryLabel } from "./inquiry";

export type EvolutionKind = "question" | "polarity" | "fission" | "synthesis" | "growth" | "inquiry";
export type EvolutionNode = {
  id: string; label: string; summary: string; phase: string; lens: string;
  kind: EvolutionKind; role: string; generation: number; cyclic: boolean;
  x: number; y: number; parents: string[]; searchText: string; source: RetrievalNode;
};
export type EvolutionEdge = { from: string; to: string; relation: RetrievalRelation };
export type Evolution = {
  nodes: EvolutionNode[]; byId: Map<string, EvolutionNode>; edges: EvolutionEdge[];
  maxGeneration: number; width: number; height: number;
};

export function evolutionPhase(node: RetrievalNode) {
  if (node.inquiry) return `${inquiryLabel(node.inquiry.intent)} · ${node.kind === "user" ? "提出追问" : "聚焦回应"}`;
  if (node.polarity) return `沿「${polarityAxis(node.polarity).label}」展开 · ${polarityLabel(node.polarity)}`;
  if (node.branchType === "合" || node.kind === "merge") return "合流";
  if (node.branchType === "正") return "推演正反 · 正 · 深化主张";
  if (node.branchType === "反") return "推演正反 · 反 · 质疑前提";
  if (node.growth) return "画作视角";
  return node.kind === "user" ? "提出问题" : "想法";
}

/** One concept per node. Instance positions and camera axes never define lineage. */
export function projectEvolution(graph: Graph): Evolution {
  const view = normalizeGraphForRetrieval(graph);
  const sources = Object.values(view.nodes).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const edgeMap = new Map<string, EvolutionEdge>();
  const add = (from: string, to: string, relation: RetrievalRelation) => {
    if (!view.nodes[from] || !view.nodes[to]) return;
    const key = JSON.stringify([from, to]);
    if (!edgeMap.has(key)) edgeMap.set(key, { from, to, relation });
  };
  // lineageParentId is a navigation shortcut from a result back to its question,
  // not another generative edge. Including it would manufacture a cycle.
  for (const edge of view.edges) if (edge.relation !== "lineage") add(edge.from, edge.to, edge.relation);
  for (const node of sources) {
    const raw = graph.nodes[node.id];
    for (const parent of raw.parents || []) add(parent, node.id, "lineage");
  }
  const edges = [...edgeMap.values()];
  const parents = new Map(sources.map(node => [node.id, [] as string[]]));
  const children = new Map(sources.map(node => [node.id, [] as string[]]));
  for (const edge of edges) { parents.get(edge.to)!.push(edge.from); children.get(edge.from)!.push(edge.to); }
  const degrees = new Map(sources.map(node => [node.id, parents.get(node.id)!.length]));
  const queue = sources.filter(node => degrees.get(node.id) === 0).map(node => node.id);
  const generation = new Map<string, number>(), lane = new Map<string, number>();
  queue.forEach((id, index) => { generation.set(id, 0); lane.set(id, index); });
  let maxGeneration = 0;
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index], depth = generation.get(id)!;
    maxGeneration = Math.max(maxGeneration, depth);
    for (const child of children.get(id)!) {
      generation.set(child, Math.max(generation.get(child) || 0, depth + 1));
      lane.set(child, Math.min(lane.get(child) ?? Infinity, lane.get(id)!));
      degrees.set(child, degrees.get(child)! - 1);
      if (!degrees.get(child)) queue.push(child);
    }
  }
  const ordered = [...queue, ...sources.filter(node => degrees.get(node.id)! > 0).map(node => node.id)];
  const visited = new Set(queue);
  const columns = new Map<number, Map<number, string[]>>();
  for (const id of ordered) {
    const row = visited.has(id) ? lane.get(id)! : -1;
    const depth = visited.has(id) ? generation.get(id)! : 0;
    if (!columns.has(row)) columns.set(row, new Map());
    const column = columns.get(row)!;
    if (!column.has(depth)) column.set(depth, []);
    column.get(depth)!.push(id);
  }
  const positions = new Map<string, { x: number; y: number }>();
  let height = 60;
  for (const [, columnsInLane] of columns) {
    const rows = Math.max(...[...columnsInLane.values()].map(nodes => nodes.length));
    for (const [depth, nodes] of columnsInLane) nodes.forEach((id, row) => {
      positions.set(id, { x: 100 + depth * 220, y: height + 60 + (row + (rows - nodes.length) / 2) * 140 });
    });
    height += rows * 140 + 70;
  }
  const nodes = ordered.map(id => {
    const source = view.nodes[id], phase = evolutionPhase(source);
    const lens = source.polarity ? perspectiveLabel(source.polarity.frame) : source.fissionFrame ? perspectiveLabel(source.fissionFrame) : seedPerspectiveLabel(source.perspective);
    const kind: EvolutionKind = source.inquiry ? "inquiry" : source.polarity ? "polarity" : source.branchType === "合" || source.kind === "merge" ? "synthesis"
      : source.branchType === "正" || source.branchType === "反" ? "fission" : source.growth ? "growth" : "question";
    return { id, label: source.label, summary: source.summary || source.text, phase, lens, kind,
      role: source.branchType === "正" ? "thesis" : source.branchType === "反" ? "antithesis" : kind === "synthesis" ? "synthesis" : kind === "question" ? "user" : "neutral",
      generation: generation.get(id) || 0, cyclic: !visited.has(id), ...positions.get(id)!,
      parents: parents.get(id)!, source,
      searchText: [source.label, source.summary, source.text, source.inquiry?.quote, source.inquiry?.question, phase, lens].filter(Boolean).join(" ").toLocaleLowerCase()
    };
  });
  return { nodes, byId: new Map(nodes.map(node => [node.id, node])), edges,
    maxGeneration, width: 220 + maxGeneration * 220, height: Math.max(240, height) };
}

/** Ancestor closure in topological order: both synthesis sources, shared roots once. */
export function evolutionPath(model: Evolution, targetId: string): string[] {
  if (!model.byId.has(targetId)) return [];
  const included = new Set<string>(), queue = [targetId];
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    if (included.has(id)) continue;
    const node = model.byId.get(id);
    if (!node || node.cyclic) return [];
    included.add(id); queue.push(...node.parents);
  }
  return model.nodes.filter(node => included.has(node.id)).map(node => node.id);
}

export function searchEvolution(model: Evolution, query: string, kind = "all"): EvolutionNode[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return model.nodes.filter(node => (kind === "all" || node.kind === kind) && words.every(word => node.searchText.includes(word)));
}

/** Dense histories keep generations legible instead of shrinking a whole tree
 * into a vertical hairline. These are visual bins, never merged concepts. */
export function compactEvolution(model: Evolution): Evolution {
  if (model.nodes.length <= 120) return model;
  const nodes = model.nodes.map(node => {
    const slot = node.kind === "question" ? 0 : node.kind === "polarity" ? (node.source.polarity!.pole < 0 ? 1 : 2)
      : node.role === "thesis" ? 3 : node.role === "antithesis" ? 4 : node.kind === "synthesis" ? 5 : 6;
    return { ...node, y: 100 + slot * 150 };
  });
  return { ...model, nodes, byId: new Map(nodes.map(node => [node.id, node])), height: 1150 };
}
