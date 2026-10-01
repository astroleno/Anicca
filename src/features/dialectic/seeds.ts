import type { Graph } from "@/types/anicca";
import type { DialogueStageNode, DialogueSynthesisAction } from "./viewModel";
import type { DialecticContextMessage } from "./api";

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
  const ordered: string[] = [];
  const queue = sourceIds.map((id) => ({ id, depth: 0 }));
  // Visit both sources before ancestors so one deep lineage cannot consume
  // the entire context budget before the second source is considered.
  while (queue.length && ordered.length < 16) {
    const { id, depth } = queue.shift()!;
    if (seen.has(id) || depth > 4) continue;
    const node = graph.nodes[id];
    if (!node) continue;
    seen.add(id);
    ordered.push(id);
    for (const parent of node.parents) queue.push({ id: parent, depth: depth + 1 });
  }
  return ordered.reverse().map((id) => {
    const node = graph.nodes[id];
    return { role: node.kind === "user" ? "user" as const : "assistant" as const,
      content: `[${node.branchType || "想法"} · ${seedLabel(graph, id)}] ${(node.meta?.summary || node.text || "").slice(0, 500)}` };
  });
}

/** Eight visible seeds is a drawing budget; every other seed remains accessible in history. */
export function buildSeedScene(graph: Graph, focusId: string | null, pinnedId: string | null): DialogueStageNode[] {
  const all = Object.keys(graph.nodes);
  const visible = all.slice(-8);
  for (const id of [focusId, pinnedId]) {
    if (id && graph.nodes[id] && !visible.includes(id)) {
      const removable = visible.findIndex((candidate) => candidate !== focusId && candidate !== pinnedId);
      if (visible.length >= 8 && removable >= 0) visible.splice(removable, 1);
      visible.unshift(id);
    }
  }
  const positions = visible.length <= 3
    ? [[50, 36], [28, 61], [72, 61]]
    : visible.length <= 6 ? [[22, 27], [50, 27], [78, 27], [22, 72], [50, 72], [78, 72]]
    : [[22, 22], [50, 22], [78, 22], [22, 51], [50, 51], [78, 51], [35, 80], [65, 80]];
  return visible.map((id, index) => {
    const node = graph.nodes[id];
    return { id, label: seedLabel(graph, id), preview: node.text, summary: node.meta?.summary,
      originNodeIds: node.meta?.sourceNodeIds || node.parents,
      kind: node.kind, branchType: node.branchType, relation: id === focusId ? "focus" : "child",
      seedX: positions[index][0], seedY: positions[index][1],
      compactSeedX: visible.length <= 3 ? positions[index][0] : (index % 2 ? 73 : 27),
      compactSeedY: visible.length <= 3 ? positions[index][1] : 16 + Math.floor(index / 2) * (visible.length <= 6 ? 30 : 22) };
  });
}
