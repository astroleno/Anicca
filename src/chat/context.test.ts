import { buildParentContext } from "@/chat/context";
import { AniccaNode, BranchType, Graph, createEmptyGraph } from "@/types/anicca";

const FROZEN_NOW = new Date("2026-04-29T12:00:00.000Z");

function addNode(graph: Graph, node: AniccaNode) {
  graph.nodes[node.id] = node;
  if (node.kind === "user" && node.parents.length === 0) {
    graph.entryIds.push(node.id);
  }
  for (const parentId of node.parents) {
    graph.nodes[parentId]?.children.push(node.id);
  }
  return node.id;
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
  addUser(graph, "user_root", "我要不要继续这个项目");
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
  return graph;
}

describe("buildParentContext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("locks the full messages for a normal parent chain with sibling summaries", () => {
    const built = buildParentContext("asst_child_thesis", "system", undefined, buildTwoRoundGraph());

    expect(built.messages).toMatchInlineSnapshot(`
      [
        {
          "content": "system",
          "createdAt": "2026-04-29T12:00:00.000Z",
          "id": "sys_asst_child_thesis",
          "role": "system",
        },
        {
          "content": "我要不要继续这个项目",
          "createdAt": "2026-04-29T00:00:00.000Z",
          "id": "user_root",
          "role": "user",
        },
        {
          "content": "继续：继续推进；暂停：暂停重构",
          "createdAt": "2026-04-29T00:00:00.000Z",
          "id": "user_root_summary",
          "role": "assistant",
        },
        {
          "content": "如果继续，要怎么开始",
          "createdAt": "2026-04-29T00:02:00.000Z",
          "id": "user_child",
          "role": "user",
        },
        {
          "content": "拆小：拆小推进；降速：降速观察",
          "createdAt": "2026-04-29T00:02:00.000Z",
          "id": "user_child_summary",
          "role": "assistant",
        },
      ]
    `);
  });

  it("locks synthesis source summaries from sourceNodeIds and lineageParentId", () => {
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

    const built = buildParentContext("asst_synthesis", "system", undefined, graph);

    expect(built.messages).toMatchInlineSnapshot(`
      [
        {
          "content": "system",
          "createdAt": "2026-04-29T12:00:00.000Z",
          "id": "sys_asst_synthesis",
          "role": "system",
        },
        {
          "content": "我要不要继续这个项目",
          "createdAt": "2026-04-29T00:00:00.000Z",
          "id": "user_root",
          "role": "user",
        },
        {
          "content": "来源：继续：继续推进；暂停：暂停重构",
          "createdAt": "2026-04-29T00:00:00.000Z",
          "id": "user_root_summary",
          "role": "assistant",
        },
      ]
    `);
  });

  it("locks branch-filtered summaries for legacy branch continuation", () => {
    const built = buildParentContext("asst_child_thesis", "system", "反", buildTwoRoundGraph());

    expect(built.messages).toMatchInlineSnapshot(`
      [
        {
          "content": "system",
          "createdAt": "2026-04-29T12:00:00.000Z",
          "id": "sys_asst_child_thesis",
          "role": "system",
        },
        {
          "content": "我要不要继续这个项目",
          "createdAt": "2026-04-29T00:00:00.000Z",
          "id": "user_root",
          "role": "user",
        },
        {
          "content": "暂停：暂停重构",
          "createdAt": "2026-04-29T00:00:00.000Z",
          "id": "user_root_summary",
          "role": "assistant",
        },
        {
          "content": "如果继续，要怎么开始",
          "createdAt": "2026-04-29T00:02:00.000Z",
          "id": "user_child",
          "role": "user",
        },
        {
          "content": "降速：降速观察",
          "createdAt": "2026-04-29T00:02:00.000Z",
          "id": "user_child_summary",
          "role": "assistant",
        },
      ]
    `);
  });

  it("locks the five-round parent cap", () => {
    const graph = createEmptyGraph();
    let parentAssistantId: string | null = null;
    for (let index = 1; index <= 6; index += 1) {
      const userId = `user_${index}`;
      const assistantId = `asst_${index}`;
      addUser(
        graph,
        userId,
        `第 ${index} 轮用户问题`,
        parentAssistantId ? [parentAssistantId] : [],
        `2026-04-29T00:0${index}:00.000Z`
      );
      addAssistant(graph, assistantId, "正", [userId], {
        text: `第 ${index} 轮正方正文`,
        summary: `第 ${index} 轮正方摘要`,
        label: `第 ${index} 正`,
        createdAt: `2026-04-29T00:0${index}:30.000Z`
      });
      parentAssistantId = assistantId;
    }

    const built = buildParentContext("asst_6", "system", undefined, graph);

    expect(built.messages).toMatchInlineSnapshot(`
      [
        {
          "content": "system",
          "createdAt": "2026-04-29T12:00:00.000Z",
          "id": "sys_asst_6",
          "role": "system",
        },
        {
          "content": "第 2 正：第 2 轮正方摘要",
          "createdAt": "2026-04-29T00:02:00.000Z",
          "id": "user_2_summary",
          "role": "assistant",
        },
        {
          "content": "第 3 正：第 3 轮正方摘要",
          "createdAt": "2026-04-29T00:03:00.000Z",
          "id": "user_3_summary",
          "role": "assistant",
        },
        {
          "content": "第 4 轮用户问题",
          "createdAt": "2026-04-29T00:04:00.000Z",
          "id": "user_4",
          "role": "user",
        },
        {
          "content": "第 4 正：第 4 轮正方摘要",
          "createdAt": "2026-04-29T00:04:00.000Z",
          "id": "user_4_summary",
          "role": "assistant",
        },
        {
          "content": "第 5 轮用户问题",
          "createdAt": "2026-04-29T00:05:00.000Z",
          "id": "user_5",
          "role": "user",
        },
        {
          "content": "第 5 正：第 5 轮正方摘要",
          "createdAt": "2026-04-29T00:05:00.000Z",
          "id": "user_5_summary",
          "role": "assistant",
        },
        {
          "content": "第 6 轮用户问题",
          "createdAt": "2026-04-29T00:06:00.000Z",
          "id": "user_6",
          "role": "user",
        },
        {
          "content": "第 6 正：第 6 轮正方摘要",
          "createdAt": "2026-04-29T00:06:00.000Z",
          "id": "user_6_summary",
          "role": "assistant",
        },
      ]
    `);
    expect(built.messages.map((message) => message.id)).not.toContain("user_1");
    expect(built.weightsUsed).toHaveLength(5);
  });
});
