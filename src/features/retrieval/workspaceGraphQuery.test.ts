import { BranchGraphStore } from "@/store/branchGraph";
import { AniccaNode, Graph, createEmptyGraph } from "@/types/anicca";
import {
  findByLabelOrText,
  getNode,
  normalizeGraphForRetrieval,
  queryWorkspaceGraph
} from "./workspaceGraphQuery";

function addNode(graph: Graph, node: AniccaNode) {
  graph.nodes[node.id] = node;
  if (node.kind === "user" && node.parents.length === 0) {
    graph.entryIds.push(node.id);
  }
  for (const parentId of node.parents) {
    graph.nodes[parentId]?.children.push(node.id);
  }
}

function buildStoreFixture() {
  const store = new BranchGraphStore();
  const rootId = store.createUserNode("是否继续投入这个项目");
  const { thesisId, antithesisId } = store.createAssistantPair(rootId, {
    thesis: { text: "继续投入并压缩范围", summary: "继续投入", label: "继续" },
    antithesis: { text: "暂停投入，先复盘", summary: "暂停投入", label: "暂停" }
  });
  const synthesisId = store.createSynthesisAssistant([thesisId, antithesisId], {
    text: "保留投入，但改成一周实验",
    summary: "一周实验",
    label: "实验"
  });
  const childUserId = store.createChildUserNode(synthesisId, "实验第一步是什么");
  store.createAssistantPair(childUserId, {
    thesis: { text: "先写测试", summary: "先测试", label: "测试" },
    antithesis: { text: "先访谈", summary: "先访谈", label: "访谈" }
  });
  return { graph: store.getGraph(), rootId, thesisId, antithesisId, synthesisId, childUserId };
}

describe("workspace graph retrieval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an empty subgraph for empty query or empty graph", () => {
    const emptyQuery = queryWorkspaceGraph(buildStoreFixture().graph, " ");
    const emptyGraph = queryWorkspaceGraph(createEmptyGraph(), "投入");

    expect(emptyQuery).toMatchObject({
      nodes: [],
      edges: [],
      seedNodeIds: [],
      clampedOptions: {
        depth: 2,
        maxDepth: 2,
        maxNodes: 20,
        maxEdges: 40,
        seedLimit: 3,
        maxQueryChars: 500,
        relations: ["thesis", "antithesis", "synthesis", "continuation"],
        direction: "both"
      }
    });
    expect(emptyGraph.nodes).toEqual([]);
    expect(emptyGraph.edges).toEqual([]);
  });

  it("normalizes a real store graph without mutating it", () => {
    const { graph, rootId, thesisId, antithesisId, synthesisId } = buildStoreFixture();
    const before = JSON.stringify(graph);

    const view = normalizeGraphForRetrieval(graph);

    expect(JSON.stringify(graph)).toBe(before);
    expect(getNode(graph, thesisId)).toMatchObject({
      id: thesisId,
      label: "继续",
      summary: "继续投入",
      branchType: "正",
      kind: "assistant"
    });
    expect(view.nodes[rootId]).toMatchObject({
      id: rootId,
      label: "是否继续投入这个项目",
      text: "是否继续投入这个项目",
      kind: "user"
    });
    expect(view.edges.map((edge) => edge.relation).sort()).toEqual([
      "antithesis",
      "antithesis",
      "continuation",
      "lineage",
      "synthesis",
      "synthesis",
      "thesis",
      "thesis"
    ]);
    expect(view.edges.filter((edge) => edge.to === synthesisId && edge.relation === "synthesis")).toHaveLength(2);
    expect(view.edges.find((edge) => edge.from === rootId && edge.to === thesisId)).toMatchObject({
      relation: "thesis",
      confidence: "explicit",
      reason: "正"
    });
    expect(view.edges.find((edge) => edge.from === rootId && edge.to === antithesisId)).toMatchObject({
      relation: "antithesis",
      confidence: "explicit",
      reason: "反"
    });
  });

  it("finds matches by label, summary, text, and branch type in deterministic rank order", () => {
    const { graph, rootId, thesisId, antithesisId } = buildStoreFixture();

    expect(findByLabelOrText(graph, "继续").slice(0, 3)).toMatchObject([
      {
        node: { id: thesisId },
        bestMatch: "exact",
        matchedFields: ["label", "summary", "text"]
      },
      {
        node: { id: rootId },
        bestMatch: "substring",
        matchedFields: ["label", "text"]
      }
    ]);
    expect(findByLabelOrText(graph, "正")[0]).toMatchObject({
      node: { id: thesisId },
      bestMatch: "exact",
      matchedFields: ["branchType"]
    });
    expect(findByLabelOrText(graph, "暂停", { limit: 1 })[0]).toMatchObject({
      node: { id: antithesisId },
      rank: 1
    });
    expect(findByLabelOrText(graph, "投入", { maxQueryChars: 0 })).toEqual([]);
  });

  it("queries relevant subgraphs across entries without expanding the whole graph", () => {
    const { graph, rootId, thesisId, antithesisId, synthesisId } = buildStoreFixture();
    const otherRootId = "user_other";
    addNode(graph, {
      id: otherRootId,
      kind: "user",
      text: "另一个完全无关的问题",
      createdAt: "2026-04-29T00:00:00.000Z",
      parents: [],
      children: []
    });

    const result = queryWorkspaceGraph(graph, "投入", { seedLimit: 1 });

    expect(result.seedNodeIds).toContain(rootId);
    expect(result.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([rootId, thesisId, antithesisId, synthesisId])
    );
    expect(result.nodes.map((node) => node.id)).not.toContain(otherRootId);
    expect(result.nodes.map((node) => node.id).length).toBeLessThan(Object.keys(graph.nodes).length);
    expect(result.edges.map((edge) => [edge.from, edge.to, edge.relation])).toEqual(
      expect.arrayContaining([
        [rootId, thesisId, "thesis"],
        [rootId, antithesisId, "antithesis"],
        [thesisId, synthesisId, "synthesis"]
      ])
    );
  });

  it("backfills synthesis source edges from sourceNodeIds only when canonical edges are missing", () => {
    const { graph, thesisId, antithesisId, synthesisId } = buildStoreFixture();
    for (const [edgeId, edge] of Object.entries(graph.edges)) {
      if (edge.reason === "synthesis") {
        delete graph.edges[edgeId];
      }
    }

    const view = normalizeGraphForRetrieval(graph);
    const synthesisEdges = view.edges.filter((edge) => edge.to === synthesisId && edge.relation === "synthesis");

    expect(synthesisEdges).toHaveLength(2);
    expect(synthesisEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: thesisId, confidence: "derived" }),
        expect.objectContaining({ from: antithesisId, confidence: "derived" })
      ])
    );
  });

  it("falls back from missing and unknown edge reasons when endpoint shape is canonical", () => {
    const store = new BranchGraphStore();
    const rootId = store.createUserNode("fork root");
    const forkId = store.forkNode(rootId, { branchType: "正" });
    const graph = store.getGraph();
    const antiId = "asst_unknown_reason";
    addNode(graph, {
      id: antiId,
      kind: "assistant",
      text: "unknown reason branch",
      createdAt: "2026-04-29T00:00:00.000Z",
      parents: [rootId],
      children: [],
      branchType: "反",
      meta: { label: "unknown", summary: "unknown summary" }
    });
    graph.edges.edge_unknown = {
      id: "edge_unknown",
      from: rootId,
      to: antiId,
      reason: "mystery"
    };
    const looseId = "asst_loose_shape_only";
    graph.nodes[looseId] = {
      id: looseId,
      kind: "assistant",
      text: "shape only branch",
      createdAt: "2026-04-29T00:00:00.000Z",
      parents: [],
      children: [],
      branchType: "正",
      meta: { label: "loose", summary: "shape only" }
    };
    graph.edges.edge_loose = {
      id: "edge_loose",
      from: rootId,
      to: looseId
    };
    graph.edges.edge_artifact = {
      id: "edge_artifact",
      from: rootId,
      to: looseId,
      reason: "artifact"
    };

    const view = normalizeGraphForRetrieval(graph);

    expect(view.edges.find((edge) => edge.to === forkId)).toMatchObject({
      relation: "thesis",
      confidence: "derived"
    });
    expect(view.edges.find((edge) => edge.to === antiId)).toMatchObject({
      relation: "antithesis",
      confidence: "derived",
      reason: "mystery"
    });
    expect(view.edges.some((edge) => edge.id === "edge_loose")).toBe(false);
    expect(view.edges.some((edge) => edge.id === "edge_artifact")).toBe(false);
    expect(view.warnings.some((warning) => warning.includes("unknown edge reason"))).toBe(true);
    expect(view.warnings.some((warning) => warning.includes("does not declare"))).toBe(true);
    expect(view.warnings.some((warning) => warning.includes("unsupported reserved edge reason"))).toBe(true);
  });

  it("guards against bad snapshots, duplicate edges, conflicts, and cycles", () => {
    const graph = createEmptyGraph();
    addNode(graph, {
      id: "user_root",
      kind: "user",
      text: "root",
      createdAt: "2026-04-29T00:00:00.000Z",
      parents: ["missing_parent"],
      children: ["asst_a"]
    });
    addNode(graph, {
      id: "asst_a",
      kind: "assistant",
      text: "branch",
      createdAt: "2026-04-29T00:00:00.000Z",
      parents: ["user_root"],
      children: ["user_root"],
      branchType: "正",
      meta: { label: "branch", summary: "branch summary" }
    });
    graph.edges.edge_a = { id: "edge_a", from: "user_root", to: "asst_a", reason: "正" };
    graph.edges.edge_duplicate = { id: "edge_duplicate", from: "user_root", to: "asst_a", reason: "正" };
    graph.edges.edge_dangling = { id: "edge_dangling", from: "user_root", to: "missing", reason: "正" };
    graph.edges.edge_conflict = { id: "edge_conflict", from: "asst_a", to: "user_root", reason: "synthesis" };

    const result = queryWorkspaceGraph(graph, "root", { depth: 2 });

    expect(result.nodes.map((node) => node.id).sort()).toEqual(["asst_a", "user_root"]);
    expect(result.omitted.duplicateEdges).toBeGreaterThanOrEqual(1);
    expect(result.omitted.danglingEdges).toBeGreaterThanOrEqual(2);
    expect(result.warnings.join("\n")).toContain("duplicate edge");
    expect(result.warnings.join("\n")).toContain("dangling");
  });

  it("applies relation filters, direction, excludeNodeIds, and BFS discovery edge semantics", () => {
    const { graph, rootId, thesisId, antithesisId, synthesisId } = buildStoreFixture();
    graph.edges.induced_extra = {
      id: "induced_extra",
      from: thesisId,
      to: antithesisId,
      reason: "synthesis"
    };

    const incomingSynthesis = queryWorkspaceGraph(graph, "实验", {
      relations: ["synthesis"],
      direction: "in",
      depth: 1
    });
    const outgoingSynthesis = queryWorkspaceGraph(graph, "实验", {
      relations: ["synthesis"],
      direction: "out",
      depth: 1,
      seedLimit: 1
    });
    const excluded = queryWorkspaceGraph(graph, "投入", {
      excludeNodeIds: [thesisId],
      depth: 2
    });
    const oneHop = queryWorkspaceGraph(graph, "是否继续投入", {
      depth: 1
    });

    expect(incomingSynthesis.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([synthesisId, thesisId, antithesisId])
    );
    expect(incomingSynthesis.edges.every((edge) => edge.relation === "synthesis")).toBe(true);
    expect(outgoingSynthesis.nodes.map((node) => node.id)).toEqual([synthesisId]);
    expect(excluded.seedNodeIds).not.toContain(thesisId);
    expect(excluded.nodes.map((node) => node.id)).not.toContain(thesisId);
    expect(excluded.edges.some((edge) => edge.from === thesisId || edge.to === thesisId)).toBe(false);
    expect(excluded.omitted.excludedNodes).toBeGreaterThan(0);
    expect(oneHop.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([rootId, thesisId, antithesisId]));
    expect(oneHop.edges.map((edge) => edge.id)).not.toContain("induced_extra");
  });

  it("returns nodes and edges in stable render order", () => {
    const graph = createEmptyGraph();
    addNode(graph, {
      id: "user_seed",
      kind: "user",
      text: "seed query",
      createdAt: "2026-04-29T00:00:00.000Z",
      parents: [],
      children: []
    });
    addNode(graph, {
      id: "asst_b",
      kind: "assistant",
      text: "反 branch",
      createdAt: "2026-04-29T00:00:00.000Z",
      parents: ["user_seed"],
      children: [],
      branchType: "反",
      meta: { label: "B", summary: "反" }
    });
    addNode(graph, {
      id: "asst_a",
      kind: "assistant",
      text: "正 branch",
      createdAt: "2026-04-29T00:00:00.000Z",
      parents: ["user_seed"],
      children: [],
      branchType: "正",
      meta: { label: "A", summary: "正" }
    });
    addNode(graph, {
      id: "asst_s",
      kind: "assistant",
      text: "合 branch",
      createdAt: "2026-04-29T00:00:00.000Z",
      parents: ["asst_a", "asst_b"],
      children: [],
      branchType: "合",
      meta: {
        label: "S",
        summary: "合",
        sourceNodeIds: ["asst_a", "asst_b"],
        lineageParentId: "user_seed"
      }
    });
    graph.edges.edge_s_b = { id: "edge_s_b", from: "asst_b", to: "asst_s", reason: "synthesis" };
    graph.edges.edge_b = { id: "edge_b", from: "user_seed", to: "asst_b", reason: "反" };
    graph.edges.edge_s_a = { id: "edge_s_a", from: "asst_a", to: "asst_s", reason: "synthesis" };
    graph.edges.edge_a = { id: "edge_a", from: "user_seed", to: "asst_a", reason: "正" };

    const result = queryWorkspaceGraph(graph, "seed query", { seedLimit: 1, depth: 2 });

    expect(result.nodes.map((node) => node.id)).toEqual(["user_seed", "asst_a", "asst_b", "asst_s"]);
    expect(result.edges.map((edge) => [edge.id, edge.relation])).toEqual([
      ["edge_a", "thesis"],
      ["edge_b", "antithesis"],
      ["edge_s_a", "synthesis"]
    ]);
  });

  it("clamps unsafe query options", () => {
    const result = queryWorkspaceGraph(buildStoreFixture().graph, "投入", {
      depth: 99,
      maxDepth: 99,
      maxNodes: 99,
      maxEdges: 99,
      seedLimit: 99,
      maxQueryChars: 999
    });

    expect(result.clampedOptions).toMatchObject({
      depth: 2,
      maxDepth: 2,
      maxNodes: 20,
      maxEdges: 40,
      seedLimit: 3,
      maxQueryChars: 500
    });
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining("clamped")]));
  });
});
