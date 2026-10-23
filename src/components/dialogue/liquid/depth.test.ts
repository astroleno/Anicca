import type { DialogueMetaballNode } from "../metaball/model";
import { LiquidDepthMotion } from "./depth";

const nodes: DialogueMetaballNode[] = [
  {id:"source",center:[0,0],depth:.06,radius:.1,color:[.5,.5,.5],emphasis:1},
  {id:"partner",center:[.2,0],depth:-.06,radius:.1,color:[.5,.5,.5],emphasis:1},
  {id:"other",center:[.4,0],depth:.3,radius:.1,color:[.5,.5,.5],emphasis:1}
];

it("brings a visually touching pair into physical contact without moving their screen anchors",()=>{
  const motion=new LiquidDepthMotion();
  const resting = motion.step(nodes,0,false);
  let result=motion.step(nodes,16,false,"source","partner");
  expect(result.nodes[0].depth).toBeLessThan(resting.nodes[0].depth!);
  expect(result.nodes[0].depth).toBeGreaterThan(0);
  for(let time=32;time<=1000;time+=16)result=motion.step(nodes,time,false,"source","partner");
  expect(result.nodes[0].depth).toBeCloseTo(result.nodes[1].depth!,4);
  expect(result.nodes[0].center).toBe(nodes[0].center);
  expect(result.nodes[0].radius).toBe(nodes[0].radius);
  expect(result.nodes[2]).toBe(nodes[2]);
});

it("relaxes depth offsets after release and preserves the saved spatial scene",()=>{
  const original=structuredClone(nodes),motion=new LiquidDepthMotion();
  const resting = new LiquidDepthMotion().step(nodes,0,false).nodes;
  motion.step(nodes,0,false,"source","partner");
  const first=motion.step(nodes,16,false);
  expect(first.nodes[0].depth).toBeGreaterThan(0);
  expect(first.nodes[0].depth).toBeLessThan(resting[0].depth!);
  let result=first;
  for(let time=32;time<=1000;time+=16)result=motion.step(nodes,time,false);
  expect(result.nodes).toEqual(resting);
  expect(result.moving).toBe(false);
  expect(nodes).toEqual(original);
});

it("keeps unpaired and distant seeds at their real depth",()=>{
  const motion=new LiquidDepthMotion();
  const distant=nodes.map(n=>n.id==="partner"?{...n,center:[1,0] as [number,number]}:n);
  expect(motion.step(distant,0,false).nodes).toBe(distant);
  expect(motion.step(distant,16,false,"source","partner").nodes).toBe(distant);
});

it("does not magnetize far depth planes merely because their projections overlap", () => {
  const far = nodes.slice(0,2).map((node,i) => ({ ...node, center:[0,0] as [number,number], depth:i ? .4 : -.4 }));
  const motion = new LiquidDepthMotion();
  expect(motion.step(far,0,true,"source","partner").nodes).toBe(far);
});

it("aligns contact immediately when motion is reduced",()=>{
  const result=new LiquidDepthMotion().step(nodes,0,true,"source","partner");
  expect(result.nodes[0].depth).toBe(0);
  expect(result.nodes[1].depth).toBe(0);
  expect(result.moving).toBe(false);
});

it("keeps stacked historical seeds as separate volumes without rewriting their layout",()=>{
  const stacked=nodes.slice(0,2).map((n,i)=>({...n,id:i?"b":"a",center:[0,0] as [number,number],depth:0}));
  const result=new LiquidDepthMotion().step(stacked,0,false);
  const [front,back]=result.nodes;
  expect(front.depth).toBe(0);
  expect(back.depth).toBeGreaterThan(.2);
  expect(back.center).toBe(stacked[1].center);
  expect(back.radius).toBe(stacked[1].radius);
  expect(stacked.map(n=>n.depth)).toEqual([0,0]);
});

it("keeps a third overlapping seed out of the active pair's shared depth",()=>{
  const overlapping=nodes.map(n=>({...n,center:[0,0] as [number,number],depth:n.id==="other"?0:n.depth}));
  const result=new LiquidDepthMotion().step(overlapping,0,true,"source","partner");
  expect(result.nodes[0].depth).toBe(result.nodes[1].depth);
  expect(result.nodes[2].depth).toBeGreaterThan(.2);
});
