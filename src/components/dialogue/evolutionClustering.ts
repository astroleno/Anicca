import type { EvolutionNode } from "@/features/dialectic/evolution";

export type EvolutionDisplayGroup = { x: number; y: number; ids: string[]; nodes: EvolutionNode[] };

/** Screen-only grouping never changes lineage or combines generations. */
export function clusterEvolutionNodes(nodes: EvolutionNode[], camera: { x: number; y: number; scale: number },
  viewport: { width: number; height: number }, protectedIds: ReadonlySet<string>, labelWidth: (node: EvolutionNode) => number) {
  const groups: EvolutionDisplayGroup[] = [];
  const columns = new Map<number, EvolutionDisplayGroup[]>();
  for (const node of nodes) {
    const x = node.x * camera.scale + camera.x, y = node.y * camera.scale + camera.y;
    if (x < -160 || x > viewport.width + 160 || y < -100 || y > viewport.height + 100) continue;
    const candidates = columns.get(node.generation) || [];
    const group = nodes.length <= 8 || protectedIds.has(node.id) ? undefined : candidates.find(candidate =>
      !candidate.ids.some(id => protectedIds.has(id)) && candidate.nodes.every(member => {
        const mx = member.x * camera.scale + camera.x, my = member.y * camera.scale + camera.y;
        return Math.abs(x - mx) < Math.max(44, (labelWidth(node) + labelWidth(member)) / 2 + 12) && Math.abs(y - my) < 64;
      }));
    if (group) {
      const count = group.ids.length;
      group.x = (group.x * count + x) / (count + 1); group.y = (group.y * count + y) / (count + 1);
      group.ids.push(node.id); group.nodes.push(node);
    } else {
      const next = { x, y, ids: [node.id], nodes: [node] };
      groups.push(next); candidates.push(next); columns.set(node.generation, candidates);
    }
  }
  return groups;
}
