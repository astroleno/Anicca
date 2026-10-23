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

it("welcomes only the selected partner within a bounded offset and returns to its saved origin", () => {
  const motion = new LiquidMotion();
  const targets = [node("a",0),node("b",.23),node("other",.5)];
  const original = structuredClone(targets);
  motion.step(targets,0,false);
  let result = motion.step(targets,16,false,"a","b",.01);
  for(let time=32;time<=800;time+=16) result=motion.step(targets,time,false,"a","b",.01);
  expect(result.nodes[1].center[0]).toBeLessThan(.23);
  expect(result.nodes[1].center[0]).toBeGreaterThanOrEqual(.218);
  expect(result.nodes[2].center[0]).toBe(.5);
  const radii:number[]=[];
  for(let time=816;time<=3000;time+=16){result=motion.step(targets,time,false);radii.push(result.nodes[1].radius);}
  expect(Math.min(...radii)).toBeLessThan(.1);
  expect(Math.min(...radii)).toBeGreaterThan(.094);
  expect(result.nodes[1].center[0]).toBe(.23);
  expect(result.nodes[1].radius).toBe(.1);
  expect(targets).toEqual(original);
});

it("keeps the partner still under reduced motion",()=>{
  const targets=[node("a",0),node("b",.23)];
  const result=new LiquidMotion().step(targets,0,true,"a","b",.01);
  expect(result.nodes[1]).toEqual(targets[1]);
  expect(result.moving).toBe(false);
});

it("keeps the held seed under the pointer while its partner keeps a soft response",()=>{
  const motion = new LiquidMotion();
  motion.step([node("a",0),node("b",.6)],0,false);
  const result = motion.step([node("a",.38),node("b",.6)],16,false,"a","b",.01);
  expect(result.nodes[0].center).toEqual([.38,0]);
  expect(result.nodes[1].center[0]).toBeLessThan(.6);
  expect(result.nodes[1].center[0]).toBeGreaterThan(.59);
});

it("continues a named pending seed without collapsing its volume or restarting its motion", () => {
  const motion = new LiquidMotion(), root = node("root", -.5);
  const preview = { ...node("pending-thesis", .2), radius: .14, spaceDepth: .3 };
  motion.step([root, preview], 0, false);
  const waiting = motion.step([root, { ...preview, center: [.25, 0] }], 16, false).nodes[1];
  const complete = { ...node("negative", .4), spaceDepth: -.3, emergeFrom: ["pending-thesis", "root"] };
  const first = motion.step([root, complete], 16, false).nodes[1];
  expect(first.center).toEqual(waiting.center);
  expect(first.radius).toBe(waiting.radius);
  expect(first.spaceDepth).toBe(waiting.spaceDepth);
  const next = motion.step([root, complete], 32, false).nodes[1];
  expect(next.radius).toBeGreaterThan(.1);
  expect(next.center[0]).toBeGreaterThan(first.center[0]);
  expect(next.spaceDepth).toBeLessThan(first.spaceDepth!);
  let settled = next;
  for (let time = 48; time <= 3000; time += 16) settled = motion.step([root, complete], time, false).nodes[1];
  expect(settled.center).toEqual(complete.center);
  expect(settled.spaceDepth).toBe(-.3);
});

it("does not spend an idle interval on the first step of a newly changed target", () => {
  const regular = new LiquidMotion(), afterIdle = new LiquidMotion();
  for (const motion of [regular, afterIdle]) motion.step([node("a", 0)], 1000, false);
  const expected = regular.step([node("a", .6)], 1000 + 1000 / 60, false).nodes[0];
  const resumed = afterIdle.step([node("a", .6)], 5000, false).nodes[0];
  expect(resumed.center[0]).toBeCloseTo(expected.center[0]);
  expect(resumed.center[0]).toBeLessThan(.03);
  const held = afterIdle.step([node("a", .4)], 6000, false, "a");
  expect(held.nodes[0].center).toEqual([.4, 0]);
});

it("catches an arriving seed where it is painted, then follows the pointer without a jump", () => {
  const motion = new LiquidMotion(), start = { ...node("a", 0), spaceDepth: 0 }, goal = { ...node("a", .6), spaceDepth: .4 };
  motion.step([start], 0, false);
  const arriving = motion.step([goal], 16, false).nodes[0];
  const caught = motion.step([goal], 32, false, "a").nodes[0];
  expect(caught.center).toEqual(arriving.center); expect(caught.spaceDepth).toBe(arriving.spaceDepth);
  const moved = { ...goal, center: [.13, .1] as [number, number], spaceDepth: .12 };
  expect(motion.step([moved], 48, false, "a").nodes[0].center).toEqual(moved.center);
  expect(motion.step([goal], 64, false, "a").nodes[0].center).toEqual(goal.center);
});

it("resumes its arrival after a tap that did not move the seed", () => {
  const motion = new LiquidMotion(); motion.step([node("a", 0)], 0, false);
  const goal = node("a", .6), arriving = motion.step([goal], 16, false).nodes[0];
  motion.step([goal], 32, false, "a");
  const released = motion.step([goal], 48, false).nodes[0];
  expect(released.center[0]).toBeGreaterThan(arriving.center[0]);
  expect(released.center[0]).toBeLessThan(goal.center[0]);
  const preference = new LiquidMotion(); preference.step([node("a", 0)], 0, false);
  preference.step([goal], 16, false); preference.step([goal], 32, false, "a");
  expect(preference.step([goal], 48, true, "a").nodes[0].center).toEqual(goal.center);
  expect(preference.step([goal], 64, false, "a").nodes[0].center).toEqual(goal.center);
});

it("branches from the selected origin rather than the nearest unrelated seed", () => {
  const motion = new LiquidMotion(), source = { ...node("source-copy", -.5), spaceDepth: .4 }, other = node("other", .45);
  motion.step([source, other], 0, false);
  const target = { ...node("child", .5), spaceDepth: -.4, emergeFrom: ["pending-antithesis", "source-copy"] };
  const born = motion.step([source, other, target], 0, false).nodes[2];
  expect(born.center).toEqual(source.center);
  expect(born.spaceDepth).toBe(.4);
  expect(born.radius).toBe(.015);
});

it("starts a synthesis between its actual sources and respects reduced motion", () => {
  const motion = new LiquidMotion(), sources = [node("copy", -.4), node("other", .6)];
  motion.step(sources, 0, false);
  const target = { ...node("result", .7), emergeFrom: ["pending-synthesis", "copy", "other"] };
  const born = motion.step([...sources, target], 0, false).nodes[2];
  expect(born.center[0]).toBeCloseTo(.1);
  expect(born.radius).toBe(.015);
  expect(motion.step([target], 16, true).nodes).toEqual([target]);
});

it("finishes an arrival in visible elapsed time even when almost every frame is dropped", () => {
  const motion = new LiquidMotion();
  const origin = { ...node("a", 0), spaceDepth: -.3 };
  const goal = { ...node("a", .6), spaceDepth: .4, radius: .2 };
  motion.step([origin], 0, false);
  expect(motion.step([goal], 16, false).moving).toBe(true);
  const result = motion.step([goal], 2016, false);
  expect(result.nodes[0].center).toEqual(goal.center);
  expect(result.nodes[0].spaceDepth).toBe(goal.spaceDepth);
  expect(result.nodes[0].radius).toBe(goal.radius);
  expect(result.moving).toBe(false);
});

it("does not spend a slow previous frame on a newly arriving target or contact", () => {
  const motion = new LiquidMotion();
  motion.step([node("a", 0)], 0, false);
  const arriving = motion.step([node("a", .6)], 16, false).nodes[0];
  const redirected = motion.step([node("a", .8), node("b", .9)], 2016, false);
  expect(redirected.nodes[0].center[0]).toBeGreaterThan(arriving.center[0]);
  expect(redirected.nodes[0].center[0]).toBeLessThan(.1);
  expect(redirected.nodes[1].radius).toBeLessThan(.025);
  const caught = motion.step([node("a", .8), node("b", .9)], 4016, false, "a", "b");
  expect(caught.nodes[0].center).toEqual(redirected.nodes[0].center);
  expect(caught.nodes[0].radius).toBeGreaterThan(.095);
});
