import { addDenseBranches, evolutionFixture } from "../../../tests/evolutionFixture";
import { compactEvolution, evolutionPath, projectEvolution, searchEvolution } from "./evolution";

describe("evolution projection", () => {
  it("keeps generation width legible in dense histories without merging identities or source relations", () => {
    const f = evolutionFixture(), m = projectEvolution(addDenseBranches(f.graph)), compact = compactEvolution(m);
    expect(compact.nodes).toHaveLength(1508); expect(compact.edges).toBe(m.edges);
    expect(Math.max(...compact.nodes.map(node => node.y))).toBeLessThan(1200);
    expect(compact.byId.get(f.negative)?.y).not.toBe(compact.byId.get(f.positive)?.y);
    expect(evolutionPath(compact, "dense_1499")).toEqual(evolutionPath(m, "dense_1499"));
    expect(new Set(compact.nodes.map(node => node.id)).size).toBe(1508);
  });
  it("preserves polarity, multiple generations and both synthesis sources without lineage shortcuts", () => {
    const f = evolutionFixture(), before = JSON.stringify(f.graph), m = projectEvolution(f.graph);
    expect(m.nodes).toHaveLength(8); expect(m.edges).toHaveLength(8);
    expect(m.edges.filter(edge => edge.to === f.synthesis).map(edge => edge.from).sort()).toEqual([f.positive, f.nextThesis].sort());
    expect(m.byId.get(f.negative)).toMatchObject({ kind: "polarity", generation: 1, phase: "沿「关切」展开 · 个体", lens: "个体 · 长远" });
    expect(m.byId.get(f.nextThesis)).toMatchObject({ kind: "fission", generation: 3, lens: "长远" });
    expect(m.byId.get(f.synthesis)).toMatchObject({ generation: 4, cyclic: false });
    expect(m.edges.some(edge => edge.from === f.synthesis && edge.to === f.root)).toBe(false);
    const path = evolutionPath(m, f.synthesis);
    expect(new Set(path)).toEqual(new Set([f.root, f.negative, f.positive, f.thesis, f.nextThesis, f.synthesis]));
    expect(path[0]).toBe(f.root); expect(path[path.length - 1]).toBe(f.synthesis);
    for (const edge of m.edges.filter(edge => path.includes(edge.to) && path.includes(edge.from))) expect(path.indexOf(edge.from)).toBeLessThan(path.indexOf(edge.to));
    expect(JSON.stringify(f.graph)).toBe(before);
  });

  it("searches captured pole and lens names and keeps fission distinct", () => {
    const f = evolutionFixture(), m = projectEvolution(f.graph);
    f.frame.axes[1].negative = "改名之后";
    expect(searchEvolution(m, "关切 个体", "polarity").map(node => node.id)).toEqual([f.negative]);
    expect(searchEvolution(m, "长远", "fission")).toHaveLength(4);
    expect(searchEvolution(m, "", "synthesis").map(node => node.id)).toEqual([f.synthesis]);
    expect(searchEvolution(m, "改名之后")).toEqual([]);
  });

  it("handles disconnected roots, malformed cycles and missing endpoints without false replay", () => {
    const f = evolutionFixture(), other = f.store.createUserNode("另一个起点"), graph = f.store.getGraph();
    graph.nodes[f.root].parents = [f.synthesis, "missing"];
    const m = projectEvolution(graph);
    expect(evolutionPath(m, f.synthesis)).toEqual([]); expect(evolutionPath(m, other)).toEqual([other]);
    expect(m.nodes.every(node => Number.isFinite(node.x + node.y))).toBe(true);
    graph.nodes[other].parents = [other]; expect(evolutionPath(projectEvolution(graph), other)).toEqual([]);
  });

  it("supports synthesis across questions and recovers source membership when stored edges are absent", () => {
    const f = evolutionFixture(), other = f.store.createUserNode("另一个问题");
    const result = f.store.createSynthesisAssistant([f.synthesis, other]), graph = f.store.getGraph(); graph.edges = {};
    const m = projectEvolution(graph), path = evolutionPath(m, result);
    expect(m.byId.get(result)?.parents.sort()).toEqual([f.synthesis, other].sort());
    expect(path).toContain(other); expect(path).toContain(f.root); expect(path[path.length - 1]).toBe(result);
  });
});
