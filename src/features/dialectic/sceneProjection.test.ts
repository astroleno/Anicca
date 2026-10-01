import { createEmptyGraph } from "@/types/anicca";
import { projectDialogueScene } from "./sceneProjection";

describe("scene projection", () => {
  it("keeps graph identity, removes stale duplicates, and bounds layout seeds", () => {
    const graph = createEmptyGraph();
    graph.nodes.root = {
      id: "root",
      kind: "user",
      text: "主题",
      createdAt: "2026-10-01T00:00:00.000Z",
      parents: [],
      children: []
    };
    graph.entryIds = ["root"];

    const scene = projectDialogueScene(graph, [
      { id: "root", label: "主题", kind: "assistant", relation: "focus", seedX: -20, seedY: 140 },
      { id: "root", label: "重复", kind: "user", relation: "child", seedX: 50, seedY: 50 },
      { id: "stale", label: "失效", kind: "user", relation: "child", seedX: 50, seedY: 50 }
    ]);

    expect(scene.visibleNodeIds).toEqual(["root"]);
    expect(scene.nodes[0]).toMatchObject({ id: "root", kind: "user", seedX: 8, seedY: 92 });
  });
});
