import type { DialogueMetaballNode } from "../metaball/model";
import { liquidBlendTargets, RESTING_LIQUID_BLEND, DRAGGED_LIQUID_BLEND } from "./fusion";

const node = (id: string, x: number): DialogueMetaballNode => ({ id, center: [x, 0], radius: 0.1, color: [0.5, 0.5, 0.5], emphasis: 1 });

describe("liquid drag fusion", () => {
  it("restores resting softness after release and strengthens only the dragged pair", () => {
    const nodes = [node("a", 0), node("b", 0.2), node("c", 0.42)];
    expect(liquidBlendTargets(nodes)).toEqual([RESTING_LIQUID_BLEND, RESTING_LIQUID_BLEND, RESTING_LIQUID_BLEND]);
    expect(liquidBlendTargets(nodes, "a")).toEqual([DRAGGED_LIQUID_BLEND, DRAGGED_LIQUID_BLEND, RESTING_LIQUID_BLEND]);
    expect(liquidBlendTargets(nodes, null)).toEqual([RESTING_LIQUID_BLEND, RESTING_LIQUID_BLEND, RESTING_LIQUID_BLEND]);
  });

  it("broadens the neck continuously on approach, independently of screen scale", () => {
    const nodes = [node("a", 0), node("b", 0.26), node("c", 1)];
    const result = liquidBlendTargets(nodes, "a");
    expect(result[0]).toBeGreaterThan(RESTING_LIQUID_BLEND);
    expect(result[0]).toBeLessThan(DRAGGED_LIQUID_BLEND);
    expect(result[1]).toBe(result[0]);
    expect(result[2]).toBe(RESTING_LIQUID_BLEND);
    const scaled = nodes.map(item => ({ ...item, radius: item.radius / 2, center: [item.center[0] / 2, 0] as [number, number] }));
    expect(liquidBlendTargets(scaled, "a")).toEqual(result);
    expect(liquidBlendTargets([node("a", 0), node("b", 1)], "a")).toEqual([RESTING_LIQUID_BLEND, RESTING_LIQUID_BLEND]);
  });

  it("does not attract a different neighbour when a semantic partner is supplied",()=>{
    const nodes=[node("a",0),node("near",.1),node("partner",.23)];
    const blends=liquidBlendTargets(nodes,"a","partner");
    expect(blends[1]).toBe(RESTING_LIQUID_BLEND);
    expect(blends[2]).toBe(DRAGGED_LIQUID_BLEND);
    expect(liquidBlendTargets(nodes,"a",null)).toEqual(nodes.map(()=>RESTING_LIQUID_BLEND));
  });
});
