import {
  computeFusedPairs,
  MAX_DIALOGUE_METABALLS,
  packMetaballUniforms,
  projectMetaballSurfaces,
  type MetaballSurfaceRect
} from "./model";

const host = { left: 100, top: 50, width: 800, height: 600 };

describe("dialogue metaball projection", () => {
  it("projects stage rectangles into height-normalized metaball geometry", () => {
    const surfaces: MetaballSurfaceRect[] = [
      { id: "a", role: "user", relation: "focus", left: 350, top: 275, width: 150, height: 150 },
      { id: "b", role: "thesis", relation: "child", left: 470, top: 275, width: 150, height: 150 }
    ];

    const nodes = projectMetaballSurfaces(host, surfaces);

    expect(nodes[0]).toMatchObject({
      id: "a",
      center: [-0.125, 0],
      color: [0.82, 0.86, 0.9],
      emphasis: 1
    });
    expect(nodes[0].radius).toBeCloseTo(0.125, 5);
    expect(nodes[1]).toMatchObject({
      id: "b",
      center: [0.075, 0],
      color: [0.18, 0.82, 0.62],
      emphasis: 0.94
    });
    expect(computeFusedPairs(nodes, 0.055)).toEqual(["a::b"]);
    expect(computeFusedPairs([...nodes].reverse(), 0.055)).toEqual(["a::b"]);
  });

  it("packs fixed-size uniforms and clears unused slots", () => {
    const nodes = projectMetaballSurfaces(host, [
      { id: "a", role: "antithesis", relation: "source", left: 350, top: 275, width: 150, height: 150 }
    ]);

    const packed = packMetaballUniforms(nodes);

    expect(packed.count).toBe(1);
    expect(packed.centers).toHaveLength(MAX_DIALOGUE_METABALLS * 2);
    expect(packed.radii).toHaveLength(MAX_DIALOGUE_METABALLS);
    expect(packed.colors).toHaveLength(MAX_DIALOGUE_METABALLS * 3);
    expect(packed.emphasis).toHaveLength(MAX_DIALOGUE_METABALLS);
    expect(packed.centers.slice(2)).toEqual(Array(14).fill(0));
    expect(packed.radii.slice(1)).toEqual(Array(7).fill(0));
    expect(packed.colors.slice(3)).toEqual(Array(21).fill(0));
    expect(packed.emphasis.slice(1)).toEqual(Array(7).fill(0));
  });

  it("stably keeps the eight highest-priority surfaces", () => {
    const surfaces: MetaballSurfaceRect[] = [
      { id: "decorative-pending", role: "pending", relation: "decorative", left: 100, top: 50, width: 80, height: 80 },
      { id: "child-1", role: "thesis", relation: "child", left: 180, top: 50, width: 80, height: 80 },
      { id: "ancestor-1", role: "neutral", relation: "ancestor", left: 260, top: 50, width: 80, height: 80 },
      { id: "source-1", role: "antithesis", relation: "source", left: 340, top: 50, width: 80, height: 80 },
      { id: "decorative-neutral", role: "neutral", relation: "decorative", left: 420, top: 50, width: 80, height: 80 },
      { id: "child-2", role: "growth", relation: "child", left: 500, top: 50, width: 80, height: 80 },
      { id: "ancestor-2", role: "neutral", relation: "ancestor", left: 580, top: 50, width: 80, height: 80 },
      { id: "source-2", role: "synthesis", relation: "source", left: 660, top: 50, width: 80, height: 80 },
      { id: "focus", role: "user", relation: "focus", left: 740, top: 50, width: 80, height: 80 },
      { id: "decorative-growth", role: "growth", relation: "decorative", left: 820, top: 50, width: 80, height: 80 }
    ];

    const nodes = projectMetaballSurfaces(host, surfaces);

    expect(nodes.map((node) => node.id)).toEqual([
      "focus",
      "source-1",
      "source-2",
      "child-1",
      "child-2",
      "ancestor-1",
      "ancestor-2",
      "decorative-neutral"
    ]);
    expect(nodes).toHaveLength(MAX_DIALOGUE_METABALLS);
    expect(nodes.map((node) => node.id)).not.toContain("decorative-pending");
  });

  it("uses the semantic color palette for every role", () => {
    const roles: MetaballSurfaceRect[] = [
      { id: "synthesis", role: "synthesis", relation: "focus", left: 100, top: 50, width: 50, height: 50 },
      { id: "growth", role: "growth", relation: "source", left: 150, top: 50, width: 50, height: 50 },
      { id: "neutral", role: "neutral", relation: "child", left: 200, top: 50, width: 50, height: 50 },
      { id: "pending", role: "pending", relation: "decorative", left: 250, top: 50, width: 50, height: 50 }
    ];

    const colors = Object.fromEntries(projectMetaballSurfaces(host, roles).map((node) => [node.id, node.color]));

    expect(colors.synthesis).toEqual([0.94, 0.72, 0.34]);
    expect(colors.growth).toEqual([0.48, 0.66, 0.94]);
    expect(colors.neutral).toEqual([0.7, 0.73, 0.78]);
    expect(colors.pending).toEqual([0.7, 0.73, 0.78]);
  });
});
