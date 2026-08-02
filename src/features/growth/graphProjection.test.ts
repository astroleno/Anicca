import { BranchGraphStore } from "@/store/branchGraph";
import { projectGrowthSessionToGraph } from "./graphProjection";
import { runGrowthSession } from "./orchestrator";

describe("growth graph projection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes user and assistant nodes with growth provenance", () => {
    const store = new BranchGraphStore();
    const session = runGrowthSession({
      text: "可能要换个角度继续推进",
      requestId: "req_projection"
    });

    const projection = projectGrowthSessionToGraph(store, session);
    const graph = store.getGraph();

    expect(graph.entryIds).toEqual([projection.userNodeId]);
    expect(graph.nodes[projection.userNodeId]).toMatchObject({
      kind: "user",
      text: "可能要换个角度继续推进",
      meta: { growth: { eventId: "event_req_projection" } }
    });
    expect(projection.responseNodeIds).toHaveLength(3);
    expect(projection.responseNodeIds.every((nodeId) => graph.nodes[nodeId].branchType === undefined)).toBe(true);
    expect(projection.responseNodeIds.map((nodeId) => graph.nodes[nodeId].meta?.growth?.operator))
      .toEqual(session.responses.map((response) => response.operator));
    expect(projection.synthesisNodeId).toBeTruthy();
    expect(graph.nodes[projection.synthesisNodeId!].meta).toMatchObject({
      sourceNodeIds: projection.responseNodeIds,
      growth: {
        operator: "merge_promote",
        sourceArtworkIds: session.synthesis?.sourceArtworkIds
      }
    });
    expect(Object.values(graph.edges).map((edge) => edge.reason)).toEqual(
      expect.arrayContaining([
        `growth:${session.responses[0].operator}`,
        "growth:merge_promote"
      ])
    );
  });

  it("projects growth under an existing assistant without changing branch ordering", () => {
    const store = new BranchGraphStore();
    const rootId = store.createUserNode("root");
    const { thesisId, antithesisId } = store.createAssistantPair(rootId, {
      thesis: { text: "正" },
      antithesis: { text: "反" }
    });
    const session = runGrowthSession({ text: "继续拆小", requestId: "req_child" });

    const projection = projectGrowthSessionToGraph(store, session, { targetAssistantId: thesisId });
    const graph = store.getGraph();

    expect(graph.nodes[rootId].children.slice(0, 2)).toEqual([thesisId, antithesisId]);
    expect(graph.nodes[projection.userNodeId].parents).toEqual([thesisId]);
    expect(graph.nodes[thesisId].children).toContain(projection.userNodeId);
  });
});
