import { LiquidMotion } from "./motion";
import type { DialogueMetaballNode } from "../metaball/model";

const node = (id: string, x: number): DialogueMetaballNode => ({ id, center: [x, 0], radius: .1, color: [.8, .7, .9], emphasis: 1 });

it("moves continuously toward a new target and settles without losing identity", () => {
  const motion = new LiquidMotion();
  motion.step([node("a", 0)], 0, false);
  const first = motion.step([node("a", .6)], 16, false);
  expect(first.nodes[0].center[0]).toBeGreaterThan(0);
  expect(first.nodes[0].center[0]).toBeLessThan(.6);
  let result = first;
  for (let time = 32; time <= 2000; time += 16) result = motion.step([node("a", .6)], time, false);
  expect(result.nodes[0].center[0]).toBe(.6);
  expect(result.moving).toBe(false);
});

it("grows a new seed from an existing seed and snaps when motion is reduced", () => {
  const motion = new LiquidMotion();
  motion.step([node("a", 0)], 0, false);
  const born = motion.step([node("a", 0), node("b", .5)], 16, false);
  expect(born.nodes[1].center[0]).toBeLessThan(.5);
  expect(born.nodes[1].radius).toBeLessThan(.1);
  const reduced = motion.step([node("b", .5)], 100000, true);
  expect(reduced.nodes).toEqual([node("b", .5)]);
  expect(reduced.moving).toBe(false);
});
