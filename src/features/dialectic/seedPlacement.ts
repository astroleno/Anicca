import type { StagePoint } from "@/types/anicca";
import type { DialogueStageNode } from "./sceneProjection";

// Offset clusters leave a reading lane between seeds without arranging them as a menu.
// These are starting points only: saved positions always win, including after resize.
function initialPosition(index: number, count: number, compact: boolean): StagePoint {
  const points = count <= 3
    ? count === 1 ? [[50, 42]] : count === 2 ? [[32, 43], [69, 55]]
      : compact ? [[48, 27], [28, 57], [72, 65]] : [[48, 28], [34, 57], [66, 65]]
    : compact
      ? count <= 6 ? [[28, 17], [72, 25], [26, 45], [73, 52], [30, 73], [72, 81]]
        : [[28, 14], [72, 19], [26, 36], [73, 41], [29, 58], [71, 63], [27, 79], [73, 84]]
      : count <= 4 ? [[30, 28], [68, 37], [35, 68], [75, 73]]
        : count <= 6 ? [[25, 26], [51, 35], [77, 23], [26, 66], [52, 75], [76, 63]]
          : [[23, 22], [50, 28], [77, 20], [28, 50], [57, 54], [80, 49], [35, 80], [68, 81]];
  const point = points[index];
  return { x: point[0], y: point[1] };
}

export function arrangeSeedScene(nodes: DialogueStageNode[]): DialogueStageNode[] {
  if (nodes.length > 8) return nodes;
  return nodes.map((node, index) => {
    const wide = initialPosition(index, nodes.length, false);
    const compact = initialPosition(index, nodes.length, true);
    const scores = node.spatialCoordinates;
    return { ...node, seedX: scores?.x !== undefined ? 50 + scores.x * 27 : wide.x,
      seedY: scores?.y !== undefined ? 50 - scores.y * 25 : wide.y,
      compactSeedX: scores?.x !== undefined ? 50 + scores.x * 25 : compact.x,
      compactSeedY: scores?.y !== undefined ? 50 - scores.y * 25 : compact.y };
  });
}

/** Preserve saved positions. Only new arrivals compete for space near their sources. */
export function placeSeeds(nodes: DialogueStageNode[], saved: Record<string, StagePoint> = {}, compact = false) {
  const result = { ...saved };
  const initial = Object.keys(saved).length === 0;
  const hasSpatialSeeds = nodes.some(node => node.spatialCoordinates);
  const occupied = nodes.flatMap(node => saved[node.id] ? [saved[node.id]] : []);
  const distance = (a: StagePoint, b: StagePoint) => Math.hypot((a.x - b.x) * (compact ? .65 : 1.4), a.y - b.y);
  for (const node of nodes) {
    if (result[node.id]) continue;
    const fallback = { x: compact ? node.compactSeedX ?? node.seedX : node.seedX,
      y: compact ? node.compactSeedY ?? node.seedY : node.seedY, ...(node.seedZ !== undefined ? { z: node.seedZ } : {}) };
    const origins = (node.originNodeIds || []).flatMap(id => result[id] ? [result[id]] : []);
    const center = origins.length && !node.spatialCoordinates ? {
      x: origins.reduce((sum, point) => sum + point.x, 0) / origins.length,
      y: origins.reduce((sum, point) => sum + point.y, 0) / origins.length
    } : fallback;
    let position = fallback;
    const minimumClearance = compact ? 22 : 29;
    if (!initial || node.spatialCoordinates || (hasSpatialSeeds && occupied.some(other => distance(fallback, other) < minimumClearance))) {
      let candidates: StagePoint[] = [fallback];
      for (let row = 0; row < 7; row++) {
        for (let column = 0; column < 9; column++) candidates.push({
          x: 18 + column * 7.5 + (row % 2 ? 3 : 0),
          y: 16 + row * 10.5 + (column % 2 ? 2 : 0)
        });
      }
      const scores = node.spatialCoordinates;
      if (scores) {
        const matching = candidates.filter(point => (Math.abs(scores.x || 0) < .4 || ((point.x - 50) * (scores.x || 0) >= 0))
          && (Math.abs(scores.y || 0) < .4 || ((50 - point.y) * (scores.y || 0) >= 0)));
        if (matching.length) candidates = matching;
      }
      const clearance = (point: StagePoint) => Math.min(100, ...occupied.map(other => distance(point, other)));
      const free = candidates.filter(point => clearance(point) >= minimumClearance);
      // Prefer a nearby open position; in a dense scene use the least crowded one.
      position = (free.length ? free.sort((a, b) => distance(a, center) - distance(b, center))
        : candidates.sort((a, b) => clearance(b) - clearance(a)))[0];
    }
    result[node.id] = { ...position, ...(node.seedZ !== undefined ? { z: node.seedZ } : {}) };
    occupied.push(position);
  }
  return result;
}
