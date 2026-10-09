import { arrangeSeedScene, placeSeeds } from "./seedPlacement";
import type { DialogueStageNode } from "./sceneProjection";

const seed = (id: string, x: number, y: number, origins: string[] = []): DialogueStageNode => ({
  id, label: id, kind: "assistant", relation: "child", seedX: x, seedY: y, originNodeIds: origins
});

it("preserves positions through growth, reordering, and reload", () => {
  const original = [seed("a", 50, 36), seed("b", 28, 61), seed("c", 72, 61)];
  const saved = placeSeeds(original);
  const growing = [seed("a", 22, 27), seed("b", 50, 27), seed("c", 78, 27), seed("d", 22, 72, ["a"])];
  const positions = placeSeeds(growing, saved);
  for (const node of original) expect(positions[node.id]).toEqual(saved[node.id]);
  expect(placeSeeds([...growing].reverse(), JSON.parse(JSON.stringify(positions)))).toEqual(positions);
});

it("places a synthesis near the midpoint of both sources without overlapping either", () => {
  const nodes = [seed("a", 28, 61), seed("b", 72, 61), seed("c", 50, 20, ["a", "b"])];
  const result = placeSeeds(nodes, { a: { x: 28, y: 61 }, b: { x: 72, y: 61 } });
  expect(Math.abs(result.c.x - 50)).toBeLessThan(10);
  expect(Math.abs(result.c.y - 61)).toBeLessThan(24);
  expect(result.c).not.toEqual(result.a);
  expect(result.c).not.toEqual(result.b);
});

it("keeps compact clusters separated and preserves saved layouts when the scene changes", () => {
  for (let count = 1; count <= 8; count++) {
    const nodes = Array.from({ length: count }, (_, i) => seed(`node-${i}`, 50, 50));
    const scene = arrangeSeedScene(nodes);
    const positions = placeSeeds(scene, {}, true);
    const points = Object.values(positions);
    // At the narrow supported viewport, settled seed hit areas must stay distinct.
    for (let i = 0; i < points.length; i++) {
      expect(points[i].x).toBeGreaterThanOrEqual(12);
      expect(points[i].x).toBeLessThanOrEqual(88);
      for (let j = i + 1; j < points.length; j++) {
        expect(Math.hypot((points[i].x - points[j].x) * 3.2, (points[i].y - points[j].y) * 4.5)).toBeGreaterThan(88);
      }
    }
    expect(placeSeeds(arrangeSeedScene([...nodes].reverse()), positions, true)).toEqual(positions);
  }
});
