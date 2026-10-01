import type { DialogueMetaballNode } from "../metaball/model";
import { liquidBlendTargets, RESTING_LIQUID_BLEND, DRAGGED_LIQUID_BLEND } from "./fusion";

const node = (id: string, x: number): DialogueMetaballNode => ({ id, center: [x, 0], radius: 0.1, color: [0.5, 0.5, 0.5], emphasis: 1 });

describe("liquid drag fusion", () => {
  it("keeps a crowded resting scene separate, and restores it after release", () => {
    const nodes = [node("a", 0), node("b", 0.2), node("c", 0.42)];
    expect(liquidBlendTargets(nodes)).toEqual([0.14, 0.14, 0.14]);
    expect(liquidBlendTargets(nodes, "a")).toEqual([0.3, 0.3, 0.14]);
    expect(liquidBlendTargets(nodes, null)).toEqual([0.14, 0.14, 0.14]);
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
    expect(liquidBlendTargets([node("a", 0), node("b", 1)], "a")).toEqual([0.14, 0.14]);
  });
});
