import type { Graph } from "@/types/anicca";
import type { DialogueStageNode, DialogueSynthesisAction } from "./viewModel";
import type { DialecticContextMessage } from "./api";
import { compatibleCoordinates, graphGenerations, seedPerspectiveLabel, type ThinkingSpace } from "@/features/perspectives/model";
import { polarityLabel } from "@/features/perspectives/polarity";

export function seedLabel(graph: Graph, id: string) {
  const node = graph.nodes[id];
  return node?.meta?.label || (node?.text || "想法").slice(0, 14);
}

// The historical action field names remain compatible with saved views and pending previews.
// They identify source A/B here and do not impose a stance or common-parent constraint.
export function seedPairAction(graph: Graph, left: string, right: string): DialogueSynthesisAction | null {
  if (left === right || !graph.nodes[left]?.text?.trim() || !graph.nodes[right]?.text?.trim()) return null;
  return {
    key: [left, right].sort().join(":"), lineageParentId: "",
    thesisId: left, antithesisId: right, synthesisId: null,
    label: `${seedLabel(graph, left)} / ${seedLabel(graph, right)}`, available: true
  };
}

/** Bounded ancestry from BOTH sources, including direct assistant-to-assistant splits. */
export function buildSeedContext(graph: Graph, sourceIds: string[]): DialecticContextMessage[] {
  const seen = new Set<string>();
  const ancestry: { id: string; depth: number }[] = [];
  const queue = sourceIds.map((id) => ({ id, depth: 0 }));
  // Walk only relevant ancestors, including user origins beyond the recent window.
  // A cursor avoids repeated array shifts on long histories; seen also handles cycles.
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const { id, depth } = queue[cursor];
    if (seen.has(id)) continue;
    const node = graph.nodes[id];
    if (!node) continue;
    seen.add(id);
    ancestry.push({ id, depth });
    for (const parent of node.parents) queue.push({ id: parent, depth: depth + 1 });
  }
  // Keep the same 16-node transport budget. Sources, user origins and subsequent
  // user corrections take precedence over older model-generated interpretations.
  const retained = new Set<string>();
  const priorities = [
    ...sourceIds,
    ...ancestry.filter(({ id }) => graph.nodes[id].kind === "user" && graph.nodes[id].parents.length === 0).map(({ id }) => id),
    ...ancestry.filter(({ id }) => graph.nodes[id].kind === "user").map(({ id }) => id),
    ...ancestry.filter(({ depth }) => depth <= 4).map(({ id }) => id)
  ];
  for (const id of priorities) {
    if (retained.size >= 16) break;
    if (seen.has(id)) retained.add(id);
  }
  return ancestry.filter(({ id }) => retained.has(id)).reverse().map(({ id }) => {
    const node = graph.nodes[id];
    const text = node.text || node.meta?.summary || "";
    const excerpt = text.length <= 1200 ? text : `${text.slice(0, 800)}\n[中段省略]\n${text.slice(-400)}`;
    const lens = seedPerspectiveLabel(node.meta?.perspective);
    return { role: node.kind === "user" ? "user" as const : "assistant" as const,
      content: `[${node.branchType || (polarityLabel(node.meta?.polarity) ? "极性视角" : "想法")} · ${seedLabel(graph, id)} · id=${id} · 来源=${node.parents.join(",") || "无"}${lens ? ` · 当时选择的角度=${lens}` : ""}] ${excerpt}` };
  });
}

/** Eight visible seeds is a drawing budget; every other seed remains accessible in history. */
export function buildSeedScene(graph: Graph, focusId: string | null, pinnedId: string | null, thinkingSpace?: ThinkingSpace, budget = 8, requiredIds: string[] = []): DialogueStageNode[] {
  const all = Object.keys(graph.nodes);
  const limit = Math.max(3, Math.min(8, budget));
  const selected = new Set<string>();
  const retain = (id: string | null | undefined) => { if (id && graph.nodes[id] && selected.size < limit) selected.add(id); };
  requiredIds.forEach(retain);
  retain(focusId); retain(pinnedId);
  for (const id of [focusId, pinnedId]) if (id && graph.nodes[id]) {
    const node = graph.nodes[id];
    for (const parent of node.meta?.sourceNodeIds || node.parents) retain(parent);
  }
  for (const id of [focusId, pinnedId]) if (id && graph.nodes[id]) {
    for (const child of [...graph.nodes[id].children].reverse()) retain(child);
  }
  // A question's synthesis sits one step beyond its two branches. Keep that
  // completed thought visible together with the question and its sources.
  for (const id of [focusId, pinnedId]) if (id && graph.nodes[id]) {
    for (const child of [...graph.nodes[id].children].reverse()) {
      for (const descendant of [...(graph.nodes[child]?.children || [])].reverse()) {
        if (graph.nodes[descendant]?.branchType === "合") retain(descendant);
      }
    }
  }
  if (focusId && graph.nodes[focusId]) for (const parent of graph.nodes[focusId].parents) {
    for (const sibling of graph.nodes[parent]?.children || []) retain(sibling);
  }
  for (let i = all.length - 1; i >= 0 && selected.size < limit; i--) retain(all[i]);
  const visible = all.filter(id => selected.has(id));
  const generations = graphGenerations(graph);
  const positions = visible.length <= 3
    ? [[50, 36], [28, 61], [72, 61]]
    : visible.length <= 6 ? [[22, 27], [50, 27], [78, 27], [22, 72], [50, 72], [78, 72]]
    : [[22, 22], [50, 22], [78, 22], [22, 51], [50, 51], [78, 51], [35, 80], [65, 80]];
  return visible.map((id, index) => {
    const node = graph.nodes[id];
    const generation = generations.get(id) || 0;
    const coordinates = thinkingSpace && node.kind !== "user" ? compatibleCoordinates(node.meta?.perspective, thinkingSpace) : undefined;
    const positioned = coordinates && Object.values(coordinates).some(value => Math.abs(value || 0) > .05);
    return { id, label: seedLabel(graph, id), preview: node.text, summary: node.meta?.summary,
      originNodeIds: node.meta?.sourceNodeIds || node.parents,
      kind: node.kind, branchType: node.branchType, relation: id === focusId ? "focus" : "child",
      generation, perspective: node.meta?.perspective, polarity: node.meta?.polarity,
      seedZ: coordinates?.z !== undefined ? coordinates.z * .46 : Math.min(.24, generation * .065) - .12,
      ...(positioned ? { spatialCoordinates: coordinates } : {}),
      seedX: positions[index][0], seedY: positions[index][1],
      compactSeedX: visible.length <= 3 ? positions[index][0] : (index % 2 ? 73 : 27),
      compactSeedY: visible.length <= 3 ? positions[index][1] : 16 + Math.floor(index / 2) * (visible.length <= 6 ? 30 : 22) };
  });
}
