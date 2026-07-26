import { buildParentContext } from "@/chat/context";
import type { AniccaNode, BranchType, Edge, Graph } from "@/types/anicca";
import { createEmptyGraph } from "@/types/anicca";
import { buildWorkspaceContext, collectParentContextCoverage } from "./workspaceContext";

const FROZEN_NOW = new Date("2026-04-29T12:00:00.000Z");

function addNode(graph: Graph, node: AniccaNode) {
  graph.nodes[node.id] = node;
  if (node.kind === "user" && node.parents.length === 0 && !graph.entryIds.includes(node.id)) {
    graph.entryIds.push(node.id);
  }
  for (const parentId of node.parents) {
    graph.nodes[parentId]?.children.push(node.id);
  }
  return node.id;
}

function addEdge(graph: Graph, id: string, from: string, to: string, reason?: string) {
  const edge: Edge = { id, from, to, reason };
  graph.edges[id] = edge;
  return edge.id;
}

function addUser(graph: Graph, id: string, text: string, parents: string[] = [], createdAt = "2026-04-29T00:00:00.000Z") {
  return addNode(graph, {
    id,
    kind: "user",
    text,
    createdAt,
    parents,
    children: []
  });
}

function addAssistant(
  graph: Graph,
  id: string,
  branchType: BranchType,
  parents: string[],
  {
    text,
    summary,
    label,
    createdAt = "2026-04-29T00:01:00.000Z",
    sourceNodeIds,
    lineageParentId
  }: {
    text: string;
    summary: string;
    label: string;
    createdAt?: string;
    sourceNodeIds?: string[];
    lineageParentId?: string;
  }
) {
  return addNode(graph, {
    id,
    kind: "assistant",
    text,
    createdAt,
    parents,
    children: [],
    branchType,
    meta: {
      summary,
      label,
      sourceNodeIds,
      lineageParentId
    }
  });
}

function buildTwoRoundGraph() {
  const graph = createEmptyGraph();
  addUser(graph, "user_root", "我要不要继续投入这个项目");
  addAssistant(graph, "asst_root_thesis", "正", ["user_root"], {
    text: "继续完整执行",
    summary: "继续推进",
    label: "继续"
  });
  addAssistant(graph, "asst_root_antithesis", "反", ["user_root"], {
    text: "先暂停一下",
    summary: "暂停重构",
    label: "暂停"
  });
  addUser(graph, "user_child", "如果继续，要怎么开始", ["asst_root_thesis"], "2026-04-29T00:02:00.000Z");
  addAssistant(graph, "asst_child_thesis", "正", ["user_child"], {
    text: "先拆一个薄切片",
    summary: "拆小推进",
    label: "拆小",
    createdAt: "2026-04-29T00:03:00.000Z"
  });
  addAssistant(graph, "asst_child_antithesis", "反", ["user_child"], {
    text: "先把风险列出来",
    summary: "降速观察",
    label: "降速",
    createdAt: "2026-04-29T00:03:00.000Z"
  });
  addEdge(graph, "edge_root_thesis", "user_root", "asst_root_thesis", "正");
  addEdge(graph, "edge_root_antithesis", "user_root", "asst_root_antithesis", "反");
  addEdge(graph, "edge_continue", "asst_root_thesis", "user_child", "continue");
  addEdge(graph, "edge_child_thesis", "user_child", "asst_child_thesis", "正");
  addEdge(graph, "edge_child_antithesis", "user_child", "asst_child_antithesis", "反");
  return graph;
}

function addRelatedEntry(graph: Graph) {
  addUser(graph, "user_other", "继续投入健康计划", [], "2026-04-29T00:05:00.000Z");
  addAssistant(graph, "asst_other", "正", ["user_other"], {
    text: "继续投入但换成健康计划",
    summary: "健康计划",
    label: "健康",
    createdAt: "2026-04-29T00:06:00.000Z"
  });
  addEdge(graph, "edge_other", "user_other", "asst_other", "正");
}

describe("workspace context builder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty coverage when targetId is null", () => {
    expect(collectParentContextCoverage({ targetId: null, graph: buildTwoRoundGraph() })).toEqual({
      coveredNodeIds: [],
      sourceNodeIds: [],
      coveredEdgeIds: []
    });
  });

  it("collects parent users, current assistant, sibling summaries, and matching edges", () => {
    const coverage = collectParentContextCoverage({
      targetId: "asst_child_thesis",
      graph: buildTwoRoundGraph()
    });

    expect(coverage).toEqual({
      coveredNodeIds: [
        "asst_child_antithesis",
        "asst_child_thesis",
        "asst_root_antithesis",
        "asst_root_thesis",
        "user_child",
        "user_root"
      ],
      sourceNodeIds: [],
      coveredEdgeIds: [
        "edge_child_antithesis",
        "edge_child_thesis",
        "edge_continue",
        "edge_root_antithesis",
        "edge_root_thesis"
      ]
    });
  });

  it("respects branchFilter when collecting sibling assistant summaries", () => {
    const coverage = collectParentContextCoverage({
      targetId: "asst_child_thesis",
      branchFilter: "反",
      graph: buildTwoRoundGraph()
    });

    expect(coverage.coveredNodeIds).toEqual([
      "asst_child_antithesis",
      "asst_child_thesis",
      "asst_root_antithesis",
      "asst_root_thesis",
      "user_child",
      "user_root"
    ]);
    expect(coverage.coveredEdgeIds).toEqual([
      "edge_child_antithesis",
      "edge_child_thesis",
      "edge_continue",
      "edge_root_antithesis",
      "edge_root_thesis"
    ]);
  });

  it("collects synthesis sourceNodeIds and source edges", () => {
    const graph = createEmptyGraph();
    addUser(graph, "user_root", "我要不要继续这个项目");
    addAssistant(graph, "asst_thesis", "正", ["user_root"], {
      text: "继续完整执行",
      summary: "继续推进",
      label: "继续"
    });
    addAssistant(graph, "asst_antithesis", "反", ["user_root"], {
      text: "先暂停一下",
      summary: "暂停重构",
      label: "暂停"
    });
    addAssistant(graph, "asst_synthesis", "合", ["asst_thesis", "asst_antithesis"], {
      text: "重开主线",
      summary: "主线重开",
      label: "重开",
      sourceNodeIds: ["asst_thesis", "asst_antithesis"],
      lineageParentId: "user_root",
      createdAt: "2026-04-29T00:04:00.000Z"
    });
    addEdge(graph, "edge_thesis", "user_root", "asst_thesis", "正");
    addEdge(graph, "edge_antithesis", "user_root", "asst_antithesis", "反");
    addEdge(graph, "edge_synthesis_thesis", "asst_thesis", "asst_synthesis", "synthesis");
    addEdge(graph, "edge_synthesis_antithesis", "asst_antithesis", "asst_synthesis", "synthesis");

    expect(collectParentContextCoverage({ targetId: "asst_synthesis", graph })).toEqual({
      coveredNodeIds: ["asst_antithesis", "asst_synthesis", "asst_thesis", "user_root"],
      sourceNodeIds: ["asst_thesis", "asst_antithesis"],
      coveredEdgeIds: ["edge_antithesis", "edge_synthesis_antithesis", "edge_synthesis_thesis", "edge_thesis"]
    });
  });

  it("keeps retrieval-disabled messages byte-for-byte equal to buildParentContext", () => {
    const graph = buildTwoRoundGraph();
    const built = buildWorkspaceContext({
      targetId: "asst_child_thesis",
      queryText: "投入",
      systemPrelude: "system",
      graph,
      retrieval: { enabled: false }
    });

    expect(built.messages).toEqual(buildParentContext("asst_child_thesis", "system", undefined, graph).messages);
    expect(built.retrieval).toBeUndefined();
  });

  it("keeps system prelude when targetId is null and retrieval is disabled", () => {
    const built = buildWorkspaceContext({
      targetId: null,
      queryText: "投入",
      systemPrelude: "system",
      graph: buildTwoRoundGraph(),
      retrieval: { enabled: false }
    });

    expect(built.messages).toEqual([
      {
        id: "sys_workspace",
        role: "system",
        content: "system",
        createdAt: "2026-04-29T12:00:00.000Z"
      }
    ]);
  });

  it("appends retrieval context and excludes nodes already covered by parent context", () => {
    const graph = buildTwoRoundGraph();
    addRelatedEntry(graph);

    const built = buildWorkspaceContext({
      targetId: "asst_child_thesis",
      queryText: "投入",
      systemPrelude: "system",
      graph,
      retrieval: {
        enabled: true,
        depth: 1,
        maxNodes: 4,
        charBudget: 800
      }
    });

    expect(built.messages.at(-1)).toMatchObject({
      id: "retrieval_context",
      role: "system"
    });
    expect(built.retrieval?.message?.content).toContain("NODE [user_other]");
    expect(built.retrieval?.message?.content).not.toContain("NODE [user_root]");
    const retrievalNodeIds = built.retrieval?.subgraph.nodes.map((node) => node.id) || [];
    expect(retrievalNodeIds).toEqual(expect.arrayContaining(["user_other"]));
    for (const coveredNodeId of built.coverage.coveredNodeIds) {
      expect(retrievalNodeIds).not.toContain(coveredNodeId);
    }
    expect(built.retrieval?.subgraph.omitted.excludedNodes).toBeGreaterThan(0);
  });

  it("does not append retrieval message when rendering returns empty content", () => {
    const built = buildWorkspaceContext({
      targetId: "asst_child_thesis",
      queryText: "投入",
      systemPrelude: "system",
      graph: buildTwoRoundGraph(),
      retrieval: {
        enabled: true,
        charBudget: 4
      }
    });

    expect(built.messages.map((message) => message.id)).not.toContain("retrieval_context");
    expect(built.retrieval?.message).toBeUndefined();
  });
});
