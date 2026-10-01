import type { StagePoint } from "@/types/anicca";
import type { DialogueStageNode } from "./sceneProjection";

/** Preserve saved positions. Only new arrivals compete for space near their sources. */
export function placeSeeds(nodes: DialogueStageNode[], saved: Record<string, StagePoint> = {}, compact = false) {
  const result = { ...saved };
  const initial = Object.keys(saved).length === 0;
  const occupied = nodes.flatMap(node => saved[node.id] ? [saved[node.id]] : []);
  const distance = (a: StagePoint, b: StagePoint) => Math.hypot((a.x - b.x) * (compact ? .65 : 1.4), a.y - b.y);
  for (const node of nodes) {
    if (result[node.id]) continue;
    const fallback = { x: compact ? node.compactSeedX ?? node.seedX : node.seedX,
      y: compact ? node.compactSeedY ?? node.seedY : node.seedY };
    const origins = (node.originNodeIds || []).flatMap(id => result[id] ? [result[id]] : []);
    const center = origins.length ? {
      x: origins.reduce((sum, point) => sum + point.x, 0) / origins.length,
      y: origins.reduce((sum, point) => sum + point.y, 0) / origins.length
    } : fallback;
    let position = fallback;
    if (!initial) {
      const candidates: StagePoint[] = [];
      for (let y = 16; y <= 82; y += 11) {
        for (let x = 18; x <= 82; x += 8) candidates.push({ x, y });
      }
      const clearance = (point: StagePoint) => Math.min(100, ...occupied.map(other => distance(point, other)));
      const free = candidates.filter(point => clearance(point) >= (compact ? 22 : 29));
      // Prefer a nearby open position; in a dense scene use the least crowded one.
      position = (free.length ? free.sort((a, b) => distance(a, center) - distance(b, center))
        : candidates.sort((a, b) => clearance(b) - clearance(a)))[0];
    }
    result[node.id] = position;
    occupied.push(position);
  }
  return result;
}
