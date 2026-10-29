import { projectEvolution, compactEvolution } from "@/features/dialectic/evolution";
import { BranchGraphStore } from "@/store/branchGraph";
import { clusterEvolutionNodes } from "./evolutionClustering";

const camera = { x: 0, y: 0, scale: .4 }, viewport = { width: 390, height: 844 };
function model(count: number) {
  const store = new BranchGraphStore();
  for (let i = 0; i < count; i++) store.createUserNode(`想法${i}`);
  return projectEvolution(store.getGraph());
}
it.each([4, 8])("keeps %i nodes individually named at a narrow fit scale", count => {
  const nodes = model(count).nodes.map(node => ({ ...node, x: 100, y: 100 }));
  const groups = clusterEvolutionNodes(nodes, camera, viewport, new Set(), () => 88);
  expect(groups).toHaveLength(count); expect(groups.every(group => group.ids.length === 1)).toBe(true);
});
it.each([9, 120, 121])("groups only colliding peers in one generation and protects active sources (%i nodes)", count => {
  const nodes = compactEvolution(model(count)).nodes.map((node, i) => ({ ...node, x: 100, y: 100, generation: i === 2 ? 1 : 0 }));
  const groups = clusterEvolutionNodes(nodes, camera, viewport, new Set([nodes[0].id, nodes[1].id]), () => 88);
  expect(groups.find(group => group.ids.includes(nodes[0].id))?.ids).toEqual([nodes[0].id]);
  expect(groups.find(group => group.ids.includes(nodes[1].id))?.ids).toEqual([nodes[1].id]);
  expect(groups.find(group => group.ids.includes(nodes[2].id))?.ids).toEqual([nodes[2].id]);
  expect(groups.every(group => new Set(group.nodes.map(node => node.generation)).size === 1)).toBe(true);
  expect(groups.flatMap(group => group.ids)).toHaveLength(count);
});
it("leaves non-overlapping nodes separate after zooming and includes offscreen nodes only within the draw margin", () => {
  const nodes = model(9).nodes.map((node, i) => ({ ...node, x: 100, y: 100 + i * 150 }));
  const groups = clusterEvolutionNodes(nodes, { x: 0, y: 0, scale: 1 }, viewport, new Set(), () => 88);
  expect(groups.every(group => group.ids.length === 1)).toBe(true);
  expect(groups.flatMap(group => group.ids)).toEqual(nodes.slice(0, 6).map(node => node.id));
});
