import { readFileSync } from "node:fs";
import { BranchGraphStore } from "@/store/branchGraph";
import { createEmptyGraph } from "@/types/anicca";
import { ANICCA_WORKSPACE_SCHEMA_VERSION } from "@/lib/persist/local";
import {
  importWorkspaceBundleText,
  serializeWorkspaceBundle
} from "@/lib/io/workspaceBundle";
import {
  findByLabelOrText,
  normalizeGraphForRetrieval,
  queryWorkspaceGraph
} from "@/features/retrieval/workspaceGraphQuery";
import {
  assertArtworkSupportsOperator,
  findArtworkAgentProfile,
  getArtworkAgentProfiles
} from "./artworkAgents";
import { projectGrowthSessionToGraph } from "./graphProjection";
import { runGrowthSession } from "./orchestrator";
import { rankArtworkAgents, routeArtworkAgents } from "./router";
import {
  ArtworkAgentProfile,
  ArtworkAgentResponse,
  parseArtworkAgentProfile,
  parseArtworkAgentResponse,
  parseUserAgentEvent
} from "./types";
import { buildUserAgentEvent } from "./userEvent";

const docsText = readFileSync(
  `${process.cwd()}/docs/a2a-growth-agent-100-examples.md`,
  "utf8"
);

const validResponse: ArtworkAgentResponse = {
  artworkId: "artwork_test",
  operator: "expand",
  stance: "extends",
  text: "response text",
  summary: "summary",
  memoryHooks: [],
  tensionDelta: "adds_context",
  confidence: 0.7
};

const customProfile: ArtworkAgentProfile = parseArtworkAgentProfile({
  artworkId: "artwork_custom",
  title: "自定义画作",
  voice: "specific",
  themes: ["custom"],
  sensoryHooks: ["ink"],
  memoryAffinities: ["custom memory"],
  capabilities: ["expand", "resonate"],
  constraints: ["avoid diagnosis"]
});

function project(text: string, requestId: string, candidateLimit = 3) {
  const store = new BranchGraphStore();
  const session = runGrowthSession({ text, requestId, candidateLimit });
  const projection = projectGrowthSessionToGraph(store, session);
  return { store, session, projection, graph: store.getGraph() };
}

describe("A2A growth 100 example design document", () => {
  it("keeps the markdown inventory at ten agents and one hundred sequential cases", () => {
    const agents = [...docsText.matchAll(/^## Agent (\d{2}):/gm)].map((match) => match[1]);
    const cases = [...docsText.matchAll(/^\d+\. \*\*(A(\d{2})-(\d{2}) [^*]+)\*\*/gm)];

    expect(agents).toEqual(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]);
    expect(cases).toHaveLength(100);
    expect(new Set(cases.map((match) => match[1])).size).toBe(100);

    for (let agent = 1; agent <= 10; agent += 1) {
      const expected = Array.from({ length: 10 }, (_, index) =>
        `A${String(agent).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`
      );
      expect(cases.filter((match) => Number(match[2]) === agent).map((match) => `A${match[2]}-${match[3]}`))
        .toEqual(expected);
    }
  });
});

describe("A01 contract sentinel examples", () => {
  it("rejects empty events and sanitizes or stabilizes event IDs", () => {
    expect(() => buildUserAgentEvent("   ")).toThrow("growth_event_empty_input");
    expect(buildUserAgentEvent({ text: "继续推进", requestId: "req:42/a" }).id).toBe("event_req_42_a");
    expect(buildUserAgentEvent("同一个输入应该得到同一个事件 id").id).toBe(
      buildUserAgentEvent("同一个输入应该得到同一个事件 id").id
    );
  });

  it("accepts turn memory refs but rejects unsafe contract widening", () => {
    const event = buildUserAgentEvent({
      text: "把这条显式记忆放进当前回合",
      requestId: "req_memory",
      memoryRefs: [
        {
          id: "mem_explicit",
          label: "用户明确提到的上下文",
          source: "explicit",
          scope: "turn",
          confidence: 0.8
        }
      ]
    });

    expect(event.memoryRefs).toHaveLength(1);
    expect(() =>
      parseUserAgentEvent({
        ...event,
        memoryRefs: [{ ...event.memoryRefs[0], source: "browser_history" }]
      })
    ).toThrow("invalid_memory_ref_source");
    expect(() =>
      parseUserAgentEvent({
        ...event,
        memoryRefs: [{ ...event.memoryRefs[0], scope: "workspace", decay: undefined, expiresAt: undefined }]
      })
    ).toThrow("invalid_memory_ref_lifecycle");
    expect(() => parseArtworkAgentResponse({ ...validResponse, operator: "debate" })).toThrow(
      "invalid_growth_operator"
    );
    expect(() => parseArtworkAgentResponse({ ...validResponse, text: " " })).toThrow(
      "invalid_artwork_agent_response_text"
    );
  });
});

describe("A02 user event interpreter examples", () => {
  it.each([
    ["帮我推荐一个能回应迷茫的画作视角", "search", ["neutral"], []],
    ["帮我设计一个新的对话分支", "create", ["generative"], ["expand"]],
    ["继续做还是暂停复盘？", "compare", [], ["reframe"]],
    ["我承认我有点害怕这个方向会失败", "confess", ["uneasy"], ["resonate"]],
    ["下一步继续推进，但先拆小", "continue", [], []],
    ["我想知道这个方向为什么卡住", "reflect", ["reflective", "blocked"], ["resonate"]]
  ] as const)("%s", (text, intent, moods, needs) => {
    const event = buildUserAgentEvent(text);

    expect(event.intent).toBe(intent);
    for (const mood of moods) expect(event.affect.mood).toContain(mood);
    for (const need of needs) expect(event.growthNeeds).toContain(need);
    expect(event.memoryRefs).toEqual([]);
  });

  it("bounds uncertainty and detects ambiguity, mixed frames, single frames, and blocked mood", () => {
    expect(buildUserAgentEvent("也许这一步不确定，可能需要换个角度？")).toMatchObject({
      affect: { uncertainty: expect.any(Number) },
      tensions: expect.arrayContaining(["ambiguity"]),
      growthNeeds: expect.arrayContaining(["expand"])
    });
    expect(buildUserAgentEvent("也许这一步不确定，可能需要换个角度？").affect.uncertainty)
      .toBeLessThanOrEqual(1);
    expect(buildUserAgentEvent("我一边想加速，另一边又觉得应该等一等").tensions)
      .toContain("mixed_frame");
    expect(buildUserAgentEvent("这个方案一定是唯一答案，必须马上定下来").tensions)
      .toContain("single_frame");
    expect(buildUserAgentEvent("我很累，卡住了，不知道要不要继续").affect.mood)
      .toContain("blocked");
  });
});

describe("A03 and A04 artwork router/profile examples", () => {
  it.each([
    ["下一步风险和方向都不确定，像夜里找灯", "artwork_night_crossing"],
    ["这件事像雾山留白，我不急着定论", "artwork_mist_mountain"],
    ["裂隙里还能生长吗？我想修复这个冲突", "artwork_cracked_garden"],
    ["把这个计划拆小到桌面清单和下一步动作", "artwork_still_table"]
  ] as const)("routes %s", (text, artworkId) => {
    expect(routeArtworkAgents(buildUserAgentEvent(text), getArtworkAgentProfiles(), 4)[0].profile.artworkId)
      .toBe(artworkId);
  });

  it("honors candidate limits, fallback registry order, and capability-supported operators", () => {
    const profiles = getArtworkAgentProfiles();
    const overconfident = routeArtworkAgents(buildUserAgentEvent("必须选这个，其他都是错的"), profiles, 3);
    const noOverlap = rankArtworkAgents(buildUserAgentEvent("今天随便聊一个没有明显标签的话题"), profiles);

    expect(routeArtworkAgents(buildUserAgentEvent("不确定，想看一个最贴近的画作视角"), profiles, 1))
      .toHaveLength(1);
    expect(routeArtworkAgents(buildUserAgentEvent("风险、方向、修复、执行都要看"), profiles, 4))
      .toHaveLength(4);
    expect(noOverlap.map((route) => route.profile.artworkId)).toEqual(profiles.map((profile) => profile.artworkId));
    expect(overconfident.some((route) => route.operator === "counter_aha")).toBe(true);
    expect(overconfident.every((route) => route.profile.capabilities.includes(route.operator))).toBe(true);
    expect(routeArtworkAgents(buildUserAgentEvent("也许不确定，需要展开"), profiles, 3)[0].matchedSignals)
      .toContain("expand");
  });

  it("validates profile registry shape and keeps profile affinities out of user memory", () => {
    const profiles = getArtworkAgentProfiles();
    const night = findArtworkAgentProfile("artwork_night_crossing", profiles);

    expect(profiles).toHaveLength(4);
    expect(night?.title).toBe("夜航灯");
    expect(findArtworkAgentProfile("artwork_unknown", profiles)).toBeNull();
    expect(() => assertArtworkSupportsOperator(profiles[0], "counter_aha")).toThrow(
      "artwork_operator_not_supported"
    );
    expect(() => parseArtworkAgentProfile({ ...customProfile, capabilities: ["summon"] })).toThrow(
      "invalid_growth_operator"
    );
    expect(parseArtworkAgentProfile({ ...customProfile, constraints: ["avoid diagnosis"] }).constraints)
      .toEqual(["avoid diagnosis"]);
    expect(buildUserAgentEvent("留白、山、雾、冷光").memoryRefs).toEqual([]);
  });
});

describe("A05 and A06 orchestration/projection examples", () => {
  it("builds deterministic local sessions with synthesis only for multiple responses", () => {
    const one = runGrowthSession({ text: "也许下一步要把这个方向拆小一点？", requestId: "req_growth" });
    const two = runGrowthSession({ text: "也许下一步要把这个方向拆小一点？", requestId: "req_growth" });
    const single = runGrowthSession({ text: "只要一个视角", requestId: "req_one", candidateLimit: 1 });
    const four = runGrowthSession({ text: "风险、修复、执行、留白都要看", requestId: "req_four", candidateLimit: 4 });

    expect(one.requestId).toBe("req_growth");
    expect(one.userEvent.id).toBe("event_req_growth");
    expect(one.responses).toHaveLength(one.candidates.length);
    expect(one.responses.every((response, index) => response.text.includes(one.candidates[index].title))).toBe(true);
    expect(one.responses.every((response) => response.confidence >= 0 && response.confidence <= 1)).toBe(true);
    expect(one.synthesis?.sourceArtworkIds).toEqual(one.responses.map((response) => response.artworkId));
    expect(single.synthesis).toBeUndefined();
    expect(four.responses).toHaveLength(4);
    expect(two.responses.map((response) => [response.artworkId, response.operator, response.summary]))
      .toEqual(one.responses.map((response) => [response.artworkId, response.operator, response.summary]));
  });

  it("honors custom candidates and keeps stance tied to operator", () => {
    const session = runGrowthSession({
      text: "帮我设计一个 custom 分支",
      requestId: "req_custom",
      artworkAgents: [customProfile],
      candidateLimit: 3
    });
    const stanceByOperator = new Map(session.responses.map((response) => [response.operator, response.stance]));

    expect(session.candidates).toEqual([customProfile]);
    expect(session.responses).toHaveLength(1);
    expect(stanceByOperator.get("expand")).toBe("extends");
  });

  it("projects root and child growth graphs with metadata, edge reasons, and deduped parents", () => {
    const { store, session, projection, graph } = project("可能要换个角度继续推进", "req_projection");
    const synthesisConfidence = Number(
      (session.responses.reduce((sum, response) => sum + response.confidence, 0) / session.responses.length).toFixed(2)
    );

    expect(graph.entryIds).toEqual([projection.userNodeId]);
    expect(graph.nodes[projection.userNodeId].meta?.growth?.eventId).toBe("event_req_projection");
    expect(projection.responseNodeIds.every((nodeId) => graph.nodes[nodeId].branchType === undefined)).toBe(true);
    expect(graph.nodes[projection.responseNodeIds[0]].meta?.label).toBe(session.candidates[0].title);
    expect(Object.values(graph.edges).map((edge) => edge.reason)).toEqual(
      expect.arrayContaining([`growth:${session.responses[0].operator}`, "growth:merge_promote"])
    );
    expect(graph.nodes[projection.synthesisNodeId!].meta).toMatchObject({
      sourceNodeIds: projection.responseNodeIds,
      growth: { confidence: synthesisConfidence }
    });

    expect(() => projectGrowthSessionToGraph(store, session, { targetAssistantId: "missing" }))
      .toThrow("assistant parent not found");
    expect(() => store.createGrowthAssistant([], {
      text: "orphan",
      growth: { eventId: "event_orphan", operator: "expand" }
    })).toThrow("growth assistant requires at least one parent");

    const childId = store.createGrowthAssistant([projection.userNodeId, projection.userNodeId], {
      text: "deduped",
      growth: { eventId: "event_deduped", operator: "expand" }
    });
    expect(graph.nodes[childId].parents).toEqual([projection.userNodeId]);
  });
});

describe("A07, A09, and A10 retrieval/privacy/e2e examples", () => {
  it("normalizes growth metadata, filters growth relations, and warns on corrupted growth edges", () => {
    const { graph, projection } = project("这个方案一定是唯一答案，必须马上定下来", "req_retrieval");
    const view = normalizeGraphForRetrieval(graph);
    const counterNodeId = projection.responseNodeIds.find(
      (nodeId) => graph.nodes[nodeId].meta?.growth?.operator === "counter_aha"
    )!;

    expect(view.nodes[counterNodeId].growth).toMatchObject({
      operator: "counter_aha",
      artworkId: expect.any(String),
      eventId: "event_req_retrieval"
    });
    expect(findByLabelOrText(graph, "counter_aha")[0].matchedFields).toContain("growthOperator");
    expect(findByLabelOrText(graph, graph.nodes[counterNodeId].meta?.growth?.artworkId || "")[0].matchedFields)
      .toContain("growthArtworkId");
    expect(queryWorkspaceGraph(graph, "counter_aha").edges.every((edge) => !edge.relation.startsWith("growth:")))
      .toBe(true);
    expect(queryWorkspaceGraph(graph, "counter_aha", {
      relations: ["growth:counter_aha", "growth:merge_promote"],
      depth: 2
    }).edges.map((edge) => edge.relation)).toEqual(expect.arrayContaining(["growth:counter_aha"]));

    graph.edges.bad_growth = { id: "bad_growth", from: projection.userNodeId, to: "missing", reason: "growth:expand" };
    graph.edges.unknown_growth = {
      id: "unknown_growth",
      from: projection.userNodeId,
      to: counterNodeId,
      reason: "growth:unknown_operator"
    };
    const corrupted = normalizeGraphForRetrieval(graph);
    expect(corrupted.warnings.join("\n")).toContain("dangling endpoint");
    expect(corrupted.warnings.join("\n")).toContain("unknown growth edge reason");
  });

  it("keeps affect turn-scoped and isolates concurrent event IDs", () => {
    const anxious = runGrowthSession({ text: "我最近总是害怕失败", requestId: "req_anxious" });
    const a = project("也许这一步不确定，可能需要换个角度？", "req_a");
    const b = project("把这个计划拆小到桌面清单和下一步动作", "req_b");

    expect(anxious.userEvent.affect.mood).toContain("uneasy");
    expect(anxious.userEvent.memoryRefs).toEqual([]);
    expect(anxious.responses.map((response) => response.text).join("\n")).not.toMatch(/诊断|人格|永久/);
    expect(a.session.userEvent.id).toBe("event_req_a");
    expect(b.session.userEvent.id).toBe("event_req_b");
    expect(findByLabelOrText(a.graph, "event_req_a")[0].matchedFields).toContain("growthEventId");
    expect(findByLabelOrText(b.graph, "event_req_b")[0].matchedFields).toContain("growthEventId");
    expect(buildUserAgentEvent("？？？？可能吗？？？？").affect.uncertainty).toBeLessThanOrEqual(1);
    expect(buildUserAgentEvent("长文本".repeat(500)).id).toBe(buildUserAgentEvent("长文本".repeat(500)).id);
  });

  it("roundtrips projected growth through workspace bundles and remains queryable", () => {
    const { graph } = project("裂隙里还能生长吗？我想修复这个冲突", "req_roundtrip", 4);
    const text = serializeWorkspaceBundle({
      entry: {
        id: "workspace_growth",
        title: "Growth Roundtrip",
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
        lastOpenedAt: "2026-06-11T00:00:00.000Z",
        nodeCount: Object.keys(graph.nodes).length,
        entryCount: graph.entryIds.length
      },
      snapshot: {
        schemaVersion: ANICCA_WORKSPACE_SCHEMA_VERSION,
        workspaceId: "workspace_growth",
        graph,
        focusedNodeId: graph.entryIds[0],
        composerParentId: null,
        stageLayouts: {}
      }
    });
    const imported = importWorkspaceBundleText(text, {
      now: () => "2026-06-11T01:00:00.000Z",
      generateWorkspaceId: () => "workspace_imported_growth"
    });
    const matches = findByLabelOrText(imported.snapshot.graph, "artwork_cracked_garden");
    const synthesis = Object.values(imported.snapshot.graph.nodes).find(
      (node) => node.meta?.growth?.operator === "merge_promote"
    );

    expect(imported.snapshot.workspaceId).toBe("workspace_imported_growth");
    expect(matches[0].matchedFields).toContain("growthArtworkId");
    expect(synthesis?.meta?.growth?.sourceArtworkIds).toContain("artwork_cracked_garden");
    expect(queryWorkspaceGraph(imported.snapshot.graph, "artwork_cracked_garden", {
      relations: ["growth:expand", "growth:counter_aha", "growth:merge_promote", "growth:resonate", "growth:reframe"],
      depth: 2
    }).edges.some((edge) => edge.relation.startsWith("growth:"))).toBe(true);
  });

  it("does not require model configuration for the local-first flow", () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const session = runGrowthSession({ text: "帮我设计一个新的分支，让它更有生长感", requestId: "req_local" });
      const graph = createEmptyGraph();

      expect(session.userEvent.intent).toBe("create");
      expect(session.userEvent.affect.mood).toContain("generative");
      expect(session.userEvent.growthNeeds).toContain("expand");
      expect(session.responses.every((response) => response.operator !== "merge_promote")).toBe(true);
      expect(graph).toMatchObject({ nodes: {}, edges: {}, entryIds: [] });
    } finally {
      if (previous === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previous;
      }
    }
  });
});
