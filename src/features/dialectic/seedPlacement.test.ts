import { placeSeeds } from "./seedPlacement";
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
