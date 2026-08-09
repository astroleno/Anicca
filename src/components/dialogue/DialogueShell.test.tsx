import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DialogueShell,
  isDialogueDemoWorkspaceEnabled,
  isDialogueRetrievalDebugPreviewEnabled,
  setDialogueWorkspaceRetrievalContextEnabledForTests
} from "@/components/dialogue/DialogueShell";
import { useDialogueUiStore } from "@/features/dialectic/store";
import {
  DialogueTelemetryEvent,
  resetDialogueTelemetrySinkForTests,
  setDialogueTelemetrySink
} from "@/lib/analytics/dialogue";
import { serializeWorkspaceBundle } from "@/lib/io/workspaceBundle";
import { ANICCA_WORKSPACE_SCHEMA_VERSION } from "@/lib/persist/local";
import {
  ACTIVE_WORKSPACE_KEY,
  loadWorkspaceRecord,
  loadWorkspaceRegistry,
  REGISTRY_KEY,
  SNAPSHOT_KEY_PREFIX,
  saveWorkspaceRecord,
  setActiveWorkspaceId
} from "@/lib/persist/workspaces";
import { branchGraphStore } from "@/store/branchGraph";
import { createEmptyGraph } from "@/types/anicca";
import { PersistedWorkspaceSnapshot } from "@/types/workspace";
import { createDeferred } from "../../../tests/deferred";

function resetWorkspace(focusedNodeId: string | null = null) {
  branchGraphStore.setGraph(createEmptyGraph());
  useDialogueUiStore.setState({
    workspaceId: "workspace_test",
    workspaceSessionId: "ws_test",
    focusedNodeId,
    composerParentId: null,
    stageLayouts: {},
    errorState: null,
    pendingAction: null,
    pending: {
      branches: null,
      synthesis: null
    }
  });
  localStorage.clear();
}

function buildRegistryGraph(nodeId: string, text: string) {
  const graph = createEmptyGraph();
  graph.nodes[nodeId] = {
    id: nodeId,
    kind: "user",
    text,
    createdAt: "2026-04-29T00:00:00.000Z",
    parents: [],
    children: []
  };
  graph.entryIds.push(nodeId);
  return graph;
}

function seedRegistryWorkspace() {
  const graph = buildRegistryGraph("user_registry", "从 registry 恢复");

  localStorage.setItem(
    REGISTRY_KEY,
    JSON.stringify({
      schemaVersion: "anicca-workspace-registry-v1",
      entries: [
        {
          id: "workspace_registry",
          title: "从 registry 恢复",
          createdAt: "2026-04-29T00:00:00.000Z",
          updatedAt: "2026-04-29T00:00:00.000Z",
          lastOpenedAt: "2026-04-29T00:00:00.000Z",
          entryCount: 1,
          nodeCount: 1
        }
      ]
    })
  );
  localStorage.setItem(ACTIVE_WORKSPACE_KEY, "workspace_registry");
  localStorage.setItem(
    `${SNAPSHOT_KEY_PREFIX}workspace_registry`,
    JSON.stringify({
      schemaVersion: "anicca-workspace-v2",
      workspaceId: "workspace_registry",
      graph,
      focusedNodeId: "user_registry",
      composerParentId: null,
      stageLayouts: {}
    })
  );

  return graph;
}

function seedPair() {
  const rootUserId = branchGraphStore.createUserNode("要不要继续这个项目");
  const { thesisId, antithesisId } = branchGraphStore.createAssistantPair(rootUserId, {
    thesis: { text: "继续", summary: "继续推进", label: "继续" },
    antithesis: { text: "暂停", summary: "暂停重构", label: "暂停" }
  });
  return { rootUserId, thesisId, antithesisId };
}

function seedActiveWorkspaceFromCurrentGraph() {
  const state = useDialogueUiStore.getState();
  saveWorkspaceRecord({
    id: "workspace_test",
    title: "Workspace Test Boot",
    snapshot: {
      schemaVersion: ANICCA_WORKSPACE_SCHEMA_VERSION,
      workspaceId: "workspace_test",
      graph: branchGraphStore.getGraph(),
      focusedNodeId: state.focusedNodeId,
      composerParentId: state.composerParentId,
      stageLayouts: state.stageLayouts
    }
  });
  setActiveWorkspaceId("workspace_test");
}

function seedSavedRoundtableArtifact(sourceNodeId: string) {
  const record = loadWorkspaceRecord("workspace_test")!;
  saveWorkspaceRecord({
    id: "workspace_test",
    title: record.entry.title,
    snapshot: {
      ...record.snapshot,
      artifacts: {
        roundtables: {
          roundtable_saved: {
            id: "roundtable_saved",
            topic: "saved topic",
            sourceNodeId,
            createdAt: "2026-04-29T00:00:00.000Z",
            updatedAt: "2026-04-29T00:01:00.000Z",
            state: {
              topic: "saved topic",
              participants: [
                {
                  name: "汉娜·阿伦特",
                  mbti: "INTJ",
                  stance: "行动需要承担公共责任。",
                  reason: "从行动与责任切入。"
                }
              ],
              rounds: [],
              currentQuestion: "q1",
              nextQuestion: "从保存记录继续追问",
              lastCoreTension: "保存下来的张力",
              status: "active"
            }
          }
        }
      }
    }
  });
}

function readFetchBody(fetchMock: ReturnType<typeof vi.fn>, callIndex = 0) {
  const [, init] = fetchMock.mock.calls[callIndex] as [string, RequestInit];
  return JSON.parse(String(init.body || "{}"));
}

function normalizeRequestId<T extends { requestId?: unknown }>(body: T) {
  return {
    ...body,
    requestId: "<requestId>"
  };
}

function createDeepenedRoundtableResponse(requestId: string) {
  return new Response(
    JSON.stringify({
      requestId,
      state: {
        topic: "saved topic",
        participants: [
          {
            name: "汉娜·阿伦特",
            mbti: "INTJ",
            stance: "行动需要承担公共责任。",
            reason: "从行动与责任切入。"
          }
        ],
        rounds: [
          {
            guidingQuestion: "第二层问题",
            utterances: [
              {
                speaker: "汉娜·阿伦特",
                action: "质疑",
                text: "责任不能被流程吞掉。",
                summary: "责任仍需由行动者承担。"
              }
            ],
            coreTension: "流程效率与责任归属",
            framework: "流程 -> 判断 -> 责任",
            nextQuestion: "谁来承担下一步的判断？"
          }
        ],
        currentQuestion: "谁来承担下一步的判断？",
        nextQuestion: "谁来承担下一步的判断？",
        lastCoreTension: "流程效率与责任归属",
        status: "active"
      }
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function normalizeRetrievalContextIds<T extends { contextMessages?: Array<{ content?: string }> }>(body: T) {
  return {
    ...body,
    contextMessages: body.contextMessages?.map((message) => ({
      ...message,
      content: message.content?.startsWith("相关谱系片段:")
        ? normalizeRetrievalContextContent(message.content)
        : message.content
    }))
  };
}

function normalizeRetrievalContextContent(content: string) {
  const normalized = content.replace(/\b(?:user|asst)_[a-z0-9_]+/g, "<nodeId>");
  const [header, ...lines] = normalized.split("\n");
  const nodeLines = lines.filter((line) => line.startsWith("NODE ")).sort();
  const edgeLines = lines.filter((line) => line.startsWith("EDGE ")).sort();
  return [header, ...nodeLines, ...edgeLines].join("\n");
}

describe("DialogueShell", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setDialogueWorkspaceRetrievalContextEnabledForTests(false);
    resetDialogueTelemetrySinkForTests();
    window.history.replaceState({}, "", "/dialogue");
    resetWorkspace();
  });

  it("shows composer and synthesis affordance from the derived view model", async () => {
    const user = userEvent.setup();
    const { rootUserId, thesisId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    expect((await screen.findAllByText("合流记录")).length).toBeGreaterThan(0);
    expect(screen.getByText("主决策")).toBeInTheDocument();
    expect(screen.getByText("正反已生成")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("先选择推进、暂缓，或留下合流记录。")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("把当前母题推进到下一轮。")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开启新主题" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /继续推进正方/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /暂缓判断反方/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /合流记录/ }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /继续推进正方/ }));

    expect(useDialogueUiStore.getState().focusedNodeId).toBe(thesisId);
    expect(screen.getByText("将续写到")).toBeInTheDocument();
  });

  it("loads a demo workspace from the empty-state action", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/dialogue?demo=1");
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    await user.click(await screen.findByRole("button", { name: "载入示例谱系" }));

    expect(await screen.findByTestId("dialogue-stage-node-user_root_1")).toBeInTheDocument();
    expect(screen.queryByTestId("dialogue-stage-node-asst_synthesis_1")).not.toBeInTheDocument();
    expect(useDialogueUiStore.getState().focusedNodeId).toBe("user_root_1");
    expect(branchGraphStore.getGraph().entryIds).toEqual(["user_root_1"]);
  });

  it("runs the artwork perspective command locally without calling the branch route", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<DialogueShell />);

    await user.click(await screen.findByRole("button", { name: /点此输入/ }));
    await user.type(screen.getByLabelText("输入"), "也许要换个角度继续推进？");
    const growthButton = screen.getByRole("button", { name: "画作视角" });
    expect(growthButton).toBeEnabled();
    await user.click(growthButton);

    await waitFor(() => {
      expect(branchGraphStore.getGraph().entryIds).toHaveLength(1);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    const graph = branchGraphStore.getGraph();
    const rootId = graph.entryIds[0];
    const growthNodes = Object.values(graph.nodes).filter((node) => node.meta?.growth?.operator);

    expect(graph.nodes[rootId]).toMatchObject({
      kind: "user",
      text: "也许要换个角度继续推进？",
      meta: { growth: { eventId: expect.stringMatching(/^event_growth_req_/) } }
    });
    expect(growthNodes.length).toBeGreaterThanOrEqual(3);
    expect(growthNodes.map((node) => node.meta?.growth?.operator)).toEqual(
      expect.arrayContaining(["merge_promote"])
    );
    expect(Object.values(graph.edges)).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: expect.stringMatching(/^growth:/) })])
    );
    expect(screen.getByRole("status")).toHaveTextContent("画作视角已生成：只回应当前事件，不写长期记忆。");
  });

  it("writes artwork perspectives under the selected assistant without reordering canonical siblings", async () => {
    const user = userEvent.setup();
    const { rootUserId, thesisId, antithesisId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: thesisId });
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    await user.type(await screen.findByLabelText("输入"), "继续拆小");
    await user.click(screen.getByRole("button", { name: "画作视角" }));

    await waitFor(() => {
      expect(branchGraphStore.getGraph().nodes[rootUserId].children).toEqual([thesisId, antithesisId]);
    });

    const graph = branchGraphStore.getGraph();
    const growthUser = Object.values(graph.nodes).find((node) => node.kind === "user" && node.text === "继续拆小");
    expect(growthUser?.parents).toEqual([thesisId]);
    expect(Object.values(graph.edges)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: thesisId, to: growthUser?.id, reason: "continue" }),
        expect.objectContaining({ from: growthUser?.id, reason: expect.stringMatching(/^growth:/) })
      ])
    );
  });

  it("returns from artwork perspectives to canonical choices without leaving pending state", async () => {
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    await user.type(await screen.findByLabelText("输入"), "换一个角度");
    await user.click(screen.getByRole("button", { name: "画作视角" }));
    await waitFor(() => {
      expect(useDialogueUiStore.getState().focusedNodeId).not.toBe(rootUserId);
    });

    await user.click(
      within(screen.getByTestId("dialogue-sidebar")).getByRole("button", { name: /要不要继续这个项目/ })
    );

    expect(screen.getByTestId("dialogue-decision-context")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /继续推进正方/ })).toBeEnabled();
    expect(useDialogueUiStore.getState().pending).toEqual({ branches: null, synthesis: null });
    expect(screen.getByText("画作视角")).toBeInTheDocument();
  });

  it("locks the /api/branches request body for parent-context continuations", async () => {
    const user = userEvent.setup();
    const { thesisId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: thesisId });
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body || "{}"));
      return new Response(
        JSON.stringify({
          requestId: body.requestId,
          thesis: { text: "拆小", summary: "拆小推进", label: "拆小", stance: "正" },
          antithesis: { text: "降速", summary: "降速观察", label: "降速", stance: "反" }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DialogueShell />);

    await user.type(await screen.findByLabelText("输入"), "下一步怎么拆");
    await user.click(screen.getByRole("button", { name: "生成正 / 反" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/branches", expect.any(Object));
    });
    expect(normalizeRequestId(readFetchBody(fetchMock))).toMatchInlineSnapshot(`
      {
        "contextMessages": [
          {
            "content": "要不要继续这个项目",
            "role": "user",
          },
          {
            "content": "继续：继续推进；暂停：暂停重构",
            "role": "assistant",
          },
        ],
        "requestId": "<requestId>",
        "userText": "下一步怎么拆",
      }
    `);
  });

  it("adds flagged retrieval context to the /api/branches request body", async () => {
    setDialogueWorkspaceRetrievalContextEnabledForTests(true);
    const user = userEvent.setup();
    const { thesisId } = seedPair();
    const relatedRootId = branchGraphStore.createUserNode("下一步怎么拆的参考");
    branchGraphStore.createAssistantPair(relatedRootId, {
      thesis: { text: "先列一张拆分清单", summary: "拆分参考", label: "拆分" },
      antithesis: { text: "先延后拆分", summary: "延后参考", label: "延后" }
    });
    useDialogueUiStore.setState({ focusedNodeId: thesisId });
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body || "{}"));
      return new Response(
        JSON.stringify({
          requestId: body.requestId,
          thesis: { text: "拆小", summary: "拆小推进", label: "拆小", stance: "正" },
          antithesis: { text: "降速", summary: "降速观察", label: "降速", stance: "反" }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DialogueShell />);

    await user.type(await screen.findByLabelText("输入"), "下一步怎么拆");
    await user.click(screen.getByRole("button", { name: "生成正 / 反" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/branches", expect.any(Object));
    });
    expect(normalizeRetrievalContextIds(normalizeRequestId(readFetchBody(fetchMock)))).toMatchInlineSnapshot(`
      {
        "contextMessages": [
          {
            "content": "要不要继续这个项目",
            "role": "user",
          },
          {
            "content": "继续：继续推进；暂停：暂停重构",
            "role": "assistant",
          },
          {
            "content": "相关谱系片段:
      NODE [<nodeId>] kind=assistant branch=antithesis label=延后 summary=延后参考
      NODE [<nodeId>] kind=assistant branch=thesis label=拆分 summary=拆分参考
      NODE [<nodeId>] kind=user label=下一步怎么拆的参考
      EDGE [<nodeId>] --antithesis--> [<nodeId>] confidence=explicit reason=反
      EDGE [<nodeId>] --thesis--> [<nodeId>] confidence=explicit reason=正",
            "role": "system",
          },
        ],
        "requestId": "<requestId>",
        "userText": "下一步怎么拆",
      }
    `);
  });

  it("locks the /api/synthesis request body from the current sibling pair", async () => {
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body || "{}"));
      return new Response(
        JSON.stringify({
          requestId: body.requestId,
          synthesis: { text: "重开主线", summary: "主线重开", label: "重开", stance: "合" }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DialogueShell />);

    const synthesisButtons = await screen.findAllByRole("button", { name: /合流记录/ });
    await user.click(synthesisButtons[0]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/synthesis", expect.any(Object));
    });
    expect(normalizeRequestId(readFetchBody(fetchMock))).toMatchInlineSnapshot(`
      {
        "antithesis": {
          "label": "暂停",
          "stance": "反",
          "summary": "暂停重构",
          "text": "暂停",
        },
        "contextMessages": [
          {
            "content": "要不要继续这个项目",
            "role": "user",
          },
          {
            "content": "继续：继续推进；暂停：暂停重构",
            "role": "assistant",
          },
        ],
        "requestId": "<requestId>",
        "thesis": {
          "label": "继续",
          "stance": "正",
          "summary": "继续推进",
          "text": "继续",
        },
      }
    `);
  });

  it("adds flagged retrieval context to the /api/synthesis request body", async () => {
    setDialogueWorkspaceRetrievalContextEnabledForTests(true);
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    const relatedRootId = branchGraphStore.createUserNode("继续 暂停 的历史参考");
    branchGraphStore.createAssistantPair(relatedRootId, {
      thesis: { text: "继续但压缩范围", summary: "继续参考", label: "继续参考" },
      antithesis: { text: "暂停并复盘", summary: "暂停参考", label: "暂停参考" }
    });
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body || "{}"));
      return new Response(
        JSON.stringify({
          requestId: body.requestId,
          synthesis: { text: "重开主线", summary: "主线重开", label: "重开", stance: "合" }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DialogueShell />);

    const synthesisButtons = await screen.findAllByRole("button", { name: /合流记录/ });
    await user.click(synthesisButtons[0]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/synthesis", expect.any(Object));
    });
    expect(normalizeRetrievalContextIds(normalizeRequestId(readFetchBody(fetchMock)))).toMatchInlineSnapshot(`
      {
        "antithesis": {
          "label": "暂停",
          "stance": "反",
          "summary": "暂停重构",
          "text": "暂停",
        },
        "contextMessages": [
          {
            "content": "要不要继续这个项目",
            "role": "user",
          },
          {
            "content": "继续：继续推进；暂停：暂停重构",
            "role": "assistant",
          },
          {
            "content": "相关谱系片段:
      NODE [<nodeId>] kind=assistant branch=antithesis label=暂停参考 summary=暂停参考
      NODE [<nodeId>] kind=assistant branch=thesis label=继续参考 summary=继续参考
      NODE [<nodeId>] kind=user label=继续 暂停 的历史参考",
            "role": "system",
          },
        ],
        "requestId": "<requestId>",
        "thesis": {
          "label": "继续",
          "stance": "正",
          "summary": "继续推进",
          "text": "继续",
        },
      }
    `);
  });

  it("keeps the empty start focused on the stage prompt until the user opens input", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    await screen.findByTestId("dialogue-stage");
    expect(screen.queryByTestId("dialogue-composer")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "载入示例谱系" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /点此输入/ }));

    await waitFor(() => {
      expect(screen.getByTestId("dialogue-composer")).toBeInTheDocument();
      expect(screen.getByLabelText("输入")).toHaveFocus();
    });
  });

  it("keeps an empty-root branch request visible across stage, lineage, and panel", async () => {
    const user = userEvent.setup();
    const fetchDeferred = createDeferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => fetchDeferred.promise));

    render(<DialogueShell />);

    await user.click(await screen.findByRole("button", { name: /点此输入/ }));
    await user.type(screen.getByLabelText("输入"), "这个方向还值得投入吗");
    await user.click(screen.getByRole("button", { name: "开启新主题" }));

    expect(screen.getByTestId("dialogue-stage-pending-branches")).toHaveTextContent("这个方向还值得投入吗");
    expect(screen.getByTestId("dialogue-sidebar")).toHaveTextContent("正在生成正与反");
    expect(screen.getByTestId("dialogue-panel-pending-branches")).toHaveTextContent("母题已进入舞台");

    fetchDeferred.resolve(
      new Response(
        JSON.stringify({
          requestId: useDialogueUiStore.getState().pending.branches?.requestId,
          thesis: { text: "继续", summary: "继续推进", label: "继续", stance: "正" },
          antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    await waitFor(() => {
      expect(screen.queryByTestId("dialogue-panel-pending-branches")).not.toBeInTheDocument();
      expect(branchGraphStore.getGraph().entryIds).toHaveLength(1);
    });
  });

  it("boots from the active workspace registry instead of the legacy single snapshot key", async () => {
    const graph = seedRegistryWorkspace();
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    expect((await screen.findAllByText("从 registry 恢复")).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("dialogue-boot")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "载入示例谱系" })).not.toBeInTheDocument();
    expect(branchGraphStore.getGraph()).toEqual(graph);
    expect(useDialogueUiStore.getState().workspaceId).toBe("workspace_registry");
    expect(useDialogueUiStore.getState().workspaceSessionId).not.toBe("workspace_registry");
    await waitFor(() => {
      const persisted = JSON.parse(localStorage.getItem(`${SNAPSHOT_KEY_PREFIX}workspace_registry`) || "{}");
      expect(persisted).toMatchObject({
        workspaceId: "workspace_registry",
        focusedNodeId: "user_registry"
      });
      expect(persisted).not.toHaveProperty("workspaceSessionId");
    });
    expect(JSON.parse(localStorage.getItem(REGISTRY_KEY) || "{}").entries).toHaveLength(1);
    expect(localStorage.getItem(ACTIVE_WORKSPACE_KEY)).toBe("workspace_registry");
    expect(localStorage.getItem("anicca_workspace_v2")).toBeNull();
  });

  it("limits the demo workspace action to an explicit demo query", () => {
    expect(isDialogueDemoWorkspaceEnabled({ hostname: "localhost", search: "" })).toBe(false);
    expect(isDialogueDemoWorkspaceEnabled({ hostname: "anicca.app", search: "?demo=1" })).toBe(true);
    expect(isDialogueDemoWorkspaceEnabled({ hostname: "anicca.app", search: "" })).toBe(false);
  });

  it("limits retrieval debug preview to an explicit debug query", () => {
    expect(isDialogueRetrievalDebugPreviewEnabled({ search: "" })).toBe(false);
    expect(isDialogueRetrievalDebugPreviewEnabled({ search: "?retrievalDebug=1" })).toBe(true);
    expect(isDialogueRetrievalDebugPreviewEnabled({ search: "?retrievalDebug=0" })).toBe(false);
  });

  it("renders query-enabled retrieval context preview without changing generation defaults", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/dialogue?retrievalDebug=1");
    const { thesisId } = seedPair();
    const relatedRootId = branchGraphStore.createUserNode("下一步怎么拆的参考");
    branchGraphStore.createAssistantPair(relatedRootId, {
      thesis: { text: "先列一张拆分清单", summary: "拆分参考", label: "拆分" },
      antithesis: { text: "先延后拆分", summary: "延后参考", label: "延后" }
    });
    useDialogueUiStore.setState({ focusedNodeId: thesisId });
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    await user.type(await screen.findByLabelText("输入"), "下一步怎么拆");

    await waitFor(() => {
      expect(screen.getByTestId("dialogue-retrieval-debug")).toHaveTextContent("相关谱系片段:");
    });
    expect(screen.getByTestId("dialogue-retrieval-debug")).toHaveTextContent("拆分参考");
    expect(screen.getByTestId("dialogue-retrieval-debug")).toHaveTextContent("query");
    expect(screen.getByTestId("dialogue-retrieval-debug")).toHaveTextContent("omitted");
    expect(screen.getByTestId("dialogue-retrieval-debug")).toHaveTextContent("coverage exclusion active");
    expect(screen.getByTestId("dialogue-retrieval-debug")).not.toHaveTextContent("要不要继续这个项目");
  });

  it("keeps retrieval debug preview hidden by default", async () => {
    const { thesisId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: thesisId });
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    await screen.findByTestId("dialogue-stage");
    expect(screen.queryByTestId("dialogue-retrieval-debug")).not.toBeInTheDocument();
  });

  it("explains empty retrieval preview results", async () => {
    window.history.replaceState({}, "", "/dialogue?retrievalDebug=1");
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    await waitFor(() => {
      expect(screen.getByTestId("dialogue-retrieval-debug")).toHaveTextContent("无可注入片段");
    });
    expect(screen.getByTestId("dialogue-retrieval-debug")).toHaveTextContent("query");
    expect(screen.getByTestId("dialogue-retrieval-debug")).toHaveTextContent("(empty)");
    expect(screen.getByTestId("dialogue-retrieval-debug")).toHaveTextContent("empty query");
  });

  it("keeps mobile reading and keyboard order aligned as stage, lineage, panel, then composer", async () => {
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    const stage = await screen.findByTestId("dialogue-stage");
    const sidebar = screen.getByTestId("dialogue-sidebar");
    const panel = screen.getByTestId("dialogue-panel");
    const composer = screen.getByTestId("dialogue-composer");

    expect(stage.compareDocumentPosition(sidebar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sidebar.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(panel.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("exports the active workspace through a shell-level action", async () => {
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    vi.stubGlobal("fetch", vi.fn());

    const createObjectURL = vi.fn((blob: Blob) => {
      void blob;
      return "blob:workspace";
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(<DialogueShell />);

    await user.click(await screen.findByRole("button", { name: "更多" }));
    await user.click(screen.getByRole("button", { name: "导出工作区" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const bundleBlob = createObjectURL.mock.calls[0][0] as Blob;
    const bundleText = await bundleBlob.text();
    expect(JSON.parse(bundleText).metadata.title).toBe("Workspace Test Boot");
    expect(clickSpy).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("工作区已导出：Workspace Test Boot");
  });

  it("imports a valid workspace bundle into a new local workspace", async () => {
    vi.stubGlobal("fetch", vi.fn());

    saveWorkspaceRecord({
      id: "workspace_export_source",
      title: "Imported Workspace Source",
      snapshot: {
        schemaVersion: ANICCA_WORKSPACE_SCHEMA_VERSION,
        workspaceId: "workspace_export_source",
        graph: buildRegistryGraph("user_import_source", "imported workspace root"),
        focusedNodeId: "user_import_source",
        composerParentId: "user_import_source",
        stageLayouts: {}
      }
    });

    const sourceRegistry = loadWorkspaceRegistry();
    const sourceEntry = sourceRegistry.entries.find((entry) => entry.id === "workspace_export_source")!;
    const sourceSnapshot = {
      schemaVersion: ANICCA_WORKSPACE_SCHEMA_VERSION,
      workspaceId: "workspace_export_source",
      graph: buildRegistryGraph("user_import_source", "imported workspace root"),
      focusedNodeId: "user_import_source",
      composerParentId: "user_import_source",
      stageLayouts: {}
    } satisfies PersistedWorkspaceSnapshot;
    const file = new File(
      [serializeWorkspaceBundle({ entry: sourceEntry, snapshot: sourceSnapshot })],
      "workspace.json",
      { type: "application/json" }
    );

    render(<DialogueShell />);

    const importInput = await screen.findByTestId("dialogue-import-input");
    expect(importInput).toHaveAttribute("tabindex", "-1");
    expect(importInput).toHaveAttribute("aria-hidden", "true");
    fireEvent.change(importInput, {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(useDialogueUiStore.getState().workspaceId).not.toBe(
        "workspace_export_source"
      );
    });

    expect(branchGraphStore.getGraph().nodes.user_import_source?.text).toBe(
      "imported workspace root"
    );
    expect(useDialogueUiStore.getState().workspaceSessionId).not.toBe(
      "ws_export_source"
    );
    expect(screen.getByRole("status")).toHaveTextContent("工作区已导入：Imported Workspace Source");
  });

  it("shows recoverable copy when an imported bundle is malformed", async () => {
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    const importInput = await screen.findByTestId("dialogue-import-input");
    fireEvent.change(importInput, {
      target: {
        files: [new File(["{bad-json"], "broken.json", { type: "application/json" })]
      }
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("导入文件不是有效 JSON");
      expect(screen.getByRole("alert")).toHaveTextContent(
        "文件内容没有被解析成工作区 bundle。"
      );
    });
  });

  it("stores roundtable artifact durably across autosave and promotes against source lineage", async () => {
    const user = userEvent.setup();
    const { rootUserId, thesisId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const body = JSON.parse(String((init as RequestInit).body || "{}"));
        return new Response(
          JSON.stringify({
            requestId: body.requestId,
            state: {
              topic: "roundtable topic",
              participants: [],
              rounds: [],
              currentQuestion: "q1",
              nextQuestion: "作为追问继续的问题",
              lastCoreTension: "核心张力",
              status: "active"
            }
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      })
    );

    render(<DialogueShell />);

    await user.click(await screen.findByRole("button", { name: "召集圆桌讨论此节点" }));
    expect(await screen.findByTestId("dialogue-roundtable-drawer")).toBeInTheDocument();
    // Trigger autosave on a graph/focus change and ensure artifact survives.
    await user.click(screen.getByTestId(`dialogue-stage-node-${thesisId}`));
    await waitFor(() => {
      expect(loadWorkspaceRecord("workspace_test")?.snapshot.artifacts?.roundtables).toBeTruthy();
    });
    // Change focus away from source to validate promotion rebinds to source lineage.
    await user.click(screen.getByTestId(`dialogue-stage-node-${thesisId}`));
    await user.click(screen.getByRole("button", { name: "带回主线" }));

    const composerInput = screen.getByLabelText("输入");
    expect(composerInput).toHaveValue("作为追问继续的问题");
    await waitFor(() => {
      expect(composerInput).toHaveFocus();
    });
    expect(useDialogueUiStore.getState().focusedNodeId).toBe(rootUserId);
    expect(screen.getByRole("status")).toHaveTextContent("已填入圆桌追问，可以继续生成正 / 反。");
    expect(loadWorkspaceRecord("workspace_test")?.snapshot.artifacts?.roundtables).toBeTruthy();
  });

  it("can reopen the latest saved roundtable artifact for the current node", async () => {
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    const record = loadWorkspaceRecord("workspace_test")!;
    saveWorkspaceRecord({
      id: "workspace_test",
      title: record.entry.title,
      snapshot: {
        ...record.snapshot,
        artifacts: {
          roundtables: {
            roundtable_saved: {
              id: "roundtable_saved",
              topic: "saved topic",
              sourceNodeId: rootUserId,
              createdAt: "2026-04-29T00:00:00.000Z",
              updatedAt: "2026-04-29T00:01:00.000Z",
              state: {
                topic: "saved topic",
                participants: [],
                rounds: [],
                currentQuestion: "q1",
                nextQuestion: "从保存记录继续追问",
                lastCoreTension: "保存下来的张力",
                status: "active"
              }
            }
          }
        }
      }
    });
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    const trigger = await screen.findByRole("button", { name: "查看最近圆桌记录" });
    await user.click(trigger);

    const drawer = await screen.findByTestId("dialogue-roundtable-drawer");
    const heading = screen.getByRole("heading", { name: "圆桌会议剧场" });

    expect(screen.getByRole("region", { name: "圆桌会议剧场" })).toBe(drawer);
    expect(drawer).not.toHaveAttribute("aria-modal");
    expect(drawer).toHaveAttribute("aria-labelledby", "dialogue-roundtable-drawer-title");
    expect(drawer).toHaveAttribute("tabindex", "-1");
    expect(drawer).toHaveFocus();
    expect(heading).toBeInTheDocument();
    expect(drawer).toHaveTextContent("saved topic");
    expect(screen.getByText("核心争议")).toBeInTheDocument();
    expect(screen.getByText("保存下来的张力")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "带回主线" })).toBeEnabled();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByTestId("dialogue-roundtable-drawer")).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it("deepens a saved roundtable in the theater and persists the new round", async () => {
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    seedSavedRoundtableArtifact(rootUserId);
    const deepenDeferred = createDeferred<Response>();
    const fetchMock = vi.fn(() => deepenDeferred.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(<DialogueShell />);

    await user.click(await screen.findByRole("button", { name: "查看最近圆桌记录" }));
    await user.click(await screen.findByRole("button", { name: "深挖一轮" }));

    const pendingButton = screen.getByRole("button", { name: "深挖中..." });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute("aria-busy", "true");
    expect(normalizeRequestId(readFetchBody(fetchMock))).toMatchObject({
      requestId: "<requestId>",
      command: "deepen",
      state: {
        topic: "saved topic",
        nextQuestion: "从保存记录继续追问"
      }
    });

    const requestId = readFetchBody(fetchMock).requestId;
    deepenDeferred.resolve(createDeepenedRoundtableResponse(requestId));

    expect(await screen.findByText("第二层问题")).toBeInTheDocument();
    expect(screen.getByText("责任不能被流程吞掉。")).toBeInTheDocument();
    expect(
      loadWorkspaceRecord("workspace_test")?.snapshot.artifacts?.roundtables?.roundtable_saved.state.nextQuestion
    ).toBe("谁来承担下一步的判断？");
    expect(screen.getByRole("status")).toHaveTextContent("圆桌已深挖一轮");
  });

  it("persists a deepen response without reopening a drawer closed while pending", async () => {
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    seedSavedRoundtableArtifact(rootUserId);
    const deepenDeferred = createDeferred<Response>();
    const fetchMock = vi.fn(() => deepenDeferred.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(<DialogueShell />);

    await user.click(await screen.findByRole("button", { name: "查看最近圆桌记录" }));
    await user.click(await screen.findByRole("button", { name: "深挖一轮" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("dialogue-roundtable-drawer")).not.toBeInTheDocument();

    deepenDeferred.resolve(createDeepenedRoundtableResponse(readFetchBody(fetchMock).requestId));

    await waitFor(() => {
      expect(
        loadWorkspaceRecord("workspace_test")?.snapshot.artifacts?.roundtables?.roundtable_saved.state.nextQuestion
      ).toBe("谁来承担下一步的判断？");
    });
    expect(screen.queryByTestId("dialogue-roundtable-drawer")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("圆桌深挖结果已保存");
  });

  it("persists a deepen response without reopening after bringing the question to the main line", async () => {
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    seedSavedRoundtableArtifact(rootUserId);
    const deepenDeferred = createDeferred<Response>();
    const fetchMock = vi.fn(() => deepenDeferred.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(<DialogueShell />);

    await user.click(await screen.findByRole("button", { name: "查看最近圆桌记录" }));
    await user.click(await screen.findByRole("button", { name: "深挖一轮" }));
    await user.click(screen.getByRole("button", { name: "带回主线" }));
    expect(screen.queryByTestId("dialogue-roundtable-drawer")).not.toBeInTheDocument();
    expect(screen.getByLabelText("输入")).toHaveValue("从保存记录继续追问");

    deepenDeferred.resolve(createDeepenedRoundtableResponse(readFetchBody(fetchMock).requestId));

    await waitFor(() => {
      expect(
        loadWorkspaceRecord("workspace_test")?.snapshot.artifacts?.roundtables?.roundtable_saved.state.nextQuestion
      ).toBe("谁来承担下一步的判断？");
    });
    expect(screen.queryByTestId("dialogue-roundtable-drawer")).not.toBeInTheDocument();
    expect(screen.getByLabelText("输入")).toHaveValue("从保存记录继续追问");
    expect(screen.getByRole("status")).toHaveTextContent("圆桌深挖结果已保存");
  });

  it("persists a deepen response without replacing the drawer or focus after selecting another node", async () => {
    const user = userEvent.setup();
    const { rootUserId, thesisId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    seedSavedRoundtableArtifact(rootUserId);
    const deepenDeferred = createDeferred<Response>();
    const fetchMock = vi.fn(() => deepenDeferred.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(<DialogueShell />);

    await user.click(await screen.findByRole("button", { name: "查看最近圆桌记录" }));
    await user.click(await screen.findByRole("button", { name: "深挖一轮" }));
    await user.click(screen.getByTestId(`dialogue-stage-node-${thesisId}`));
    const composerInput = screen.getByLabelText("输入");
    await waitFor(() => expect(composerInput).toHaveFocus());

    deepenDeferred.resolve(createDeepenedRoundtableResponse(readFetchBody(fetchMock).requestId));

    await waitFor(() => {
      expect(
        loadWorkspaceRecord("workspace_test")?.snapshot.artifacts?.roundtables?.roundtable_saved.state.nextQuestion
      ).toBe("谁来承担下一步的判断？");
    });
    expect(useDialogueUiStore.getState().focusedNodeId).toBe(thesisId);
    expect(screen.getByTestId("dialogue-roundtable-drawer")).not.toHaveTextContent("第二层问题");
    expect(composerInput).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("圆桌深挖结果已保存");
  });

  it("keeps the saved roundtable unchanged when deepen fails", async () => {
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    seedSavedRoundtableArtifact(rootUserId);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: "roundtable_failed", details: "provider_overloaded" }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    render(<DialogueShell />);

    await user.click(await screen.findByRole("button", { name: "查看最近圆桌记录" }));
    await user.click(await screen.findByRole("button", { name: "深挖一轮" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("模型服务负载已满");
    });
    expect(screen.getByTestId("dialogue-roundtable-drawer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "深挖一轮" })).toBeEnabled();
    expect(
      loadWorkspaceRecord("workspace_test")?.snapshot.artifacts?.roundtables?.roundtable_saved.state.nextQuestion
    ).toBe("从保存记录继续追问");
  });

  it("ignores a stale deepen response after switching workspaces", async () => {
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    seedSavedRoundtableArtifact(rootUserId);
    saveWorkspaceRecord({
      id: "workspace_other",
      title: "Other Workspace",
      snapshot: {
        schemaVersion: ANICCA_WORKSPACE_SCHEMA_VERSION,
        workspaceId: "workspace_other",
        graph: buildRegistryGraph("user_other_root", "other workspace root"),
        focusedNodeId: "user_other_root",
        composerParentId: "user_other_root",
        stageLayouts: {}
      }
    });
    const deepenDeferred = createDeferred<Response>();
    const fetchMock = vi.fn(() => deepenDeferred.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(<DialogueShell />);

    await user.click(await screen.findByRole("button", { name: "查看最近圆桌记录" }));
    await user.click(await screen.findByRole("button", { name: "深挖一轮" }));
    await user.click(await screen.findByRole("button", { name: "Other Workspace" }));

    await waitFor(() => {
      expect(useDialogueUiStore.getState().workspaceId).toBe("workspace_other");
    });
    expect(screen.queryByTestId("dialogue-roundtable-drawer")).not.toBeInTheDocument();

    const requestId = readFetchBody(fetchMock).requestId;
    deepenDeferred.resolve(
      new Response(
        JSON.stringify({
          requestId,
          state: {
            topic: "saved topic",
            participants: [],
            rounds: [],
            currentQuestion: "stale",
            nextQuestion: "stale",
            lastCoreTension: "stale",
            status: "active"
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await waitFor(() => {
      expect(screen.getByTestId("dialogue-stage-node-user_other_root")).toBeInTheDocument();
    });
    expect(
      loadWorkspaceRecord("workspace_test")?.snapshot.artifacts?.roundtables?.roundtable_saved.state.nextQuestion
    ).toBe("从保存记录继续追问");
    expect(loadWorkspaceRecord("workspace_other")?.snapshot.artifacts).toBeUndefined();
  });

  it("falls back to the visible roundtable action when drawer return target unmounts", async () => {
    const user = userEvent.setup();
    const { rootUserId, thesisId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    const record = loadWorkspaceRecord("workspace_test")!;
    saveWorkspaceRecord({
      id: "workspace_test",
      title: record.entry.title,
      snapshot: {
        ...record.snapshot,
        artifacts: {
          roundtables: {
            roundtable_saved: {
              id: "roundtable_saved",
              topic: "saved topic",
              sourceNodeId: rootUserId,
              createdAt: "2026-04-29T00:00:00.000Z",
              updatedAt: "2026-04-29T00:01:00.000Z",
              state: {
                topic: "saved topic",
                participants: [],
                rounds: [],
                currentQuestion: "q1",
                nextQuestion: "从保存记录继续追问",
                lastCoreTension: "保存下来的张力",
                status: "active"
              }
            }
          }
        }
      }
    });
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    await user.click(await screen.findByRole("button", { name: "查看最近圆桌记录" }));
    await user.click(screen.getByTestId(`dialogue-stage-node-${thesisId}`));
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByTestId("dialogue-roundtable-drawer")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "召集圆桌讨论此节点" })).toHaveFocus();
  });

  it("renders synthesis history as a convergence record in the sidebar", async () => {
    const { thesisId, antithesisId } = seedPair();
    const synthesisId = branchGraphStore.createSynthesisAssistant([thesisId, antithesisId], {
      text: "保留主线，但拆开节奏。",
      summary: "收束成一次事件记录。",
      label: "收束"
    });
    useDialogueUiStore.setState({ focusedNodeId: synthesisId });
    seedActiveWorkspaceFromCurrentGraph();
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    const sidebar = await screen.findByTestId("dialogue-sidebar");

    expect(within(sidebar).getByText("已合流")).toBeInTheDocument();
    expect(within(sidebar).getByRole("button", { name: "合流记录：收束，来源：继续 / 暂停" })).toBeInTheDocument();
    expect(within(sidebar).getAllByText("收束").length).toBeGreaterThan(0);
    expect(screen.getByText("已发生一次合流")).toBeInTheDocument();
    expect(screen.getByText("来源：继续 / 暂停")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看记录" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "合流过" })).not.toBeInTheDocument();
  });

  it("exposes pending feedback while roundtable generation is running", async () => {
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {}))
    );

    render(<DialogueShell />);

    expect(await screen.findByText("圆桌会作为旁路记录保存，不改变这条谱系。")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "召集圆桌讨论此节点" }));

    const pendingButton = screen.getByRole("button", { name: "圆桌生成中..." });
    const pendingHint = screen.getByText("正在从「要不要继续这个项目」召集圆桌");

    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute("aria-busy", "true");
    expect(pendingButton).toHaveAttribute("aria-describedby", pendingHint.id);
    expect(pendingHint).toHaveAttribute("role", "status");
    expect(pendingHint).toHaveAttribute("aria-live", "polite");
  });

  it("keeps the roundtable pending hint bound to the source node after focus changes", async () => {
    const user = userEvent.setup();
    const { rootUserId, thesisId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {}))
    );

    render(<DialogueShell />);

    await user.click(await screen.findByRole("button", { name: "召集圆桌讨论此节点" }));
    await user.click(screen.getByTestId(`dialogue-stage-node-${thesisId}`));

    const pendingButton = screen.getByRole("button", { name: "圆桌生成中..." });
    const pendingHint = screen.getByText("正在从「要不要继续这个项目」召集圆桌");

    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute("aria-busy", "true");
    expect(pendingButton).toHaveAttribute("aria-describedby", pendingHint.id);
    expect(screen.getByRole("heading", { name: "继续" })).toBeInTheDocument();
    expect(pendingHint).toHaveAttribute("role", "status");
  });

  it("saves roundtable results without opening the drawer after focus moves away", async () => {
    const user = userEvent.setup();
    const { rootUserId, thesisId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    const roundtableDeferred = createDeferred<void>();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init) => {
        const body = JSON.parse(String((init as RequestInit).body || "{}"));
        return roundtableDeferred.promise.then(
          () =>
            new Response(
              JSON.stringify({
                requestId: body.requestId,
                state: {
                  topic: "roundtable topic",
                  participants: [],
                  rounds: [],
                  currentQuestion: "q1",
                  nextQuestion: "q2",
                  lastCoreTension: "t",
                  status: "active"
                }
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" }
              }
            )
        );
      })
    );

    render(<DialogueShell />);

    await user.click(await screen.findByRole("button", { name: "召集圆桌讨论此节点" }));
    await user.click(screen.getByTestId(`dialogue-stage-node-${thesisId}`));
    roundtableDeferred.resolve();

    await waitFor(() => {
      expect(loadWorkspaceRecord("workspace_test")?.snapshot.artifacts?.roundtables).toBeTruthy();
    });

    expect(screen.queryByTestId("dialogue-roundtable-drawer")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("圆桌已保存：要不要继续这个项目");
    expect(useDialogueUiStore.getState().focusedNodeId).toBe(thesisId);
  });

  it("creates a new empty workspace without mutating the previous active graph", async () => {
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    vi.stubGlobal("fetch", vi.fn());
    const previousWorkspaceId = "workspace_test";

    render(<DialogueShell />);

    await user.click(await screen.findByRole("button", { name: "新建工作区" }));

    await waitFor(() => {
      expect(useDialogueUiStore.getState().workspaceId).not.toBe(previousWorkspaceId);
    });

    expect(branchGraphStore.getGraph().entryIds).toEqual([]);
    expect(
      loadWorkspaceRegistry()?.entries.some((entry) => entry.id === previousWorkspaceId)
    ).toBe(true);
  });

  it("switches to another workspace and clears pending runtime state", async () => {
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    saveWorkspaceRecord({
      id: "workspace_other",
      title: "Other Workspace",
      snapshot: {
        schemaVersion: ANICCA_WORKSPACE_SCHEMA_VERSION,
        workspaceId: "workspace_other",
        graph: buildRegistryGraph("user_other_root", "other workspace root"),
        focusedNodeId: "user_other_root",
        composerParentId: "user_other_root",
        stageLayouts: {}
      }
    });
    const priorSessionId = useDialogueUiStore.getState().workspaceSessionId;
    useDialogueUiStore.getState().beginPending("branches", {
      requestId: "req_pending",
      workspaceSessionId: priorSessionId,
      focusSnapshotId: "focus:root",
      composerTargetId: rootUserId
    });
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    await user.click(await screen.findByRole("button", { name: "Other Workspace" }));

    await waitFor(() => {
      expect(useDialogueUiStore.getState().workspaceId).toBe("workspace_other");
    });

    expect(branchGraphStore.getGraph().nodes.user_other_root?.text).toBe("other workspace root");
    expect(useDialogueUiStore.getState().pending.branches).toBeNull();
    expect(useDialogueUiStore.getState().workspaceSessionId).not.toBe(priorSessionId);
  });

  it("ignores stale roundtable responses after workspace switch", async () => {
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    saveWorkspaceRecord({
      id: "workspace_other",
      title: "Other Workspace",
      snapshot: {
        schemaVersion: ANICCA_WORKSPACE_SCHEMA_VERSION,
        workspaceId: "workspace_other",
        graph: buildRegistryGraph("user_other_root", "other workspace root"),
        focusedNodeId: "user_other_root",
        composerParentId: "user_other_root",
        stageLayouts: {}
      }
    });

    const roundtableDeferred = createDeferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => roundtableDeferred.promise));

    render(<DialogueShell />);

    await user.click(await screen.findByRole("button", { name: "召集圆桌讨论此节点" }));
    await user.click(await screen.findByRole("button", { name: "Other Workspace" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "圆桌生成中..." })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "召集圆桌讨论此节点" })).toBeEnabled();

    roundtableDeferred.resolve(
      new Response(
        JSON.stringify({
          requestId: "req_roundtable",
          state: {
            topic: "stale roundtable",
            participants: [],
            rounds: [],
            currentQuestion: "q1",
            nextQuestion: "q2",
            lastCoreTension: "t",
            status: "active"
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    await waitFor(() => {
      expect(useDialogueUiStore.getState().workspaceId).toBe("workspace_other");
    });

    expect(screen.queryByTestId("dialogue-roundtable-drawer")).not.toBeInTheDocument();
    expect(loadWorkspaceRecord("workspace_test")?.snapshot.artifacts).toBeUndefined();
    expect(loadWorkspaceRecord("workspace_other")?.snapshot.artifacts).toBeUndefined();
  });

  it("emits workspace_resumed on boot restore and explicit workspace switch", async () => {
    const user = userEvent.setup();
    const events: DialogueTelemetryEvent[] = [];
    setDialogueTelemetrySink({
      track(event) {
        events.push(event);
      }
    });

    saveWorkspaceRecord({
      id: "workspace_test",
      title: "Workspace Test Boot",
      snapshot: {
        schemaVersion: ANICCA_WORKSPACE_SCHEMA_VERSION,
        workspaceId: "workspace_test",
        graph: buildRegistryGraph("user_boot_root", "boot workspace root"),
        focusedNodeId: "user_boot_root",
        composerParentId: "user_boot_root",
        stageLayouts: {}
      }
    });
    setActiveWorkspaceId("workspace_test");
    saveWorkspaceRecord({
      id: "workspace_other",
      title: "Other Workspace",
      snapshot: {
        schemaVersion: ANICCA_WORKSPACE_SCHEMA_VERSION,
        workspaceId: "workspace_other",
        graph: buildRegistryGraph("user_other_root", "other workspace root"),
        focusedNodeId: "user_other_root",
        composerParentId: "user_other_root",
        stageLayouts: {}
      }
    });
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    await waitFor(() => {
      expect(events[0]).toEqual({
        name: "workspace_resumed",
        payload: {
          source: "boot",
          nodeCount: 1,
          entryCount: 1,
          hasFocus: true,
          hasComposerTarget: true
        }
      });
    });

    await user.click(await screen.findByRole("button", { name: "Other Workspace" }));

    await waitFor(() => {
      expect(events[1]).toEqual({
        name: "workspace_resumed",
        payload: {
          source: "switch",
          nodeCount: 1,
          entryCount: 1,
          hasFocus: true,
          hasComposerTarget: true
        }
      });
    });
  });

  it("renames the active workspace through shell controls", async () => {
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    await user.click(await screen.findByRole("button", { name: "更多" }));
    await user.click(screen.getByRole("button", { name: "重命名工作区" }));
    await user.clear(screen.getByLabelText("工作区名称"));
    await user.type(screen.getByLabelText("工作区名称"), "Renamed Workspace");
    await user.click(screen.getByRole("button", { name: "保存工作区名称" }));

    await waitFor(() => {
      expect(loadWorkspaceRegistry().entries.find((entry) => entry.id === "workspace_test")?.title).toBe(
        "Renamed Workspace"
      );
    });

    expect(screen.getAllByText("Renamed Workspace").length).toBeGreaterThan(0);
  });

  it("emits continuation_created only after branch generation succeeds and lands", async () => {
    const user = userEvent.setup();
    const events: DialogueTelemetryEvent[] = [];
    setDialogueTelemetrySink({
      track(event) {
        events.push(event);
      }
    });

    const { thesisId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: thesisId });
    seedActiveWorkspaceFromCurrentGraph();
    const fetchDeferred = createDeferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => fetchDeferred.promise));

    render(<DialogueShell />);

    await user.type(screen.getByLabelText("输入"), "继续的话下一步做什么");
    await user.click(screen.getByRole("button", { name: "生成正 / 反" }));

    fetchDeferred.resolve(
      new Response(
        JSON.stringify({
          requestId: useDialogueUiStore.getState().pending.branches?.requestId,
          thesis: { text: "拆小目标", summary: "拆小推进", label: "拆小", stance: "正" },
          antithesis: { text: "暂停一周", summary: "先停一周", label: "停一周", stance: "反" }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    await waitFor(() => {
      expect(events.some((event) => event.name === "continuation_created")).toBe(true);
    });

    expect(events.at(-1)).toEqual({
      name: "continuation_created",
      payload: {
        source: "continuation",
        parentKind: "assistant",
        nodeCount: 6,
        entryCount: 1
      }
    });
  });

  it("emits synthesis_created only after synthesis succeeds and lands", async () => {
    const user = userEvent.setup();
    const events: DialogueTelemetryEvent[] = [];
    setDialogueTelemetrySink({
      track(event) {
        events.push(event);
      }
    });

    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    const fetchDeferred = createDeferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => fetchDeferred.promise));

    render(<DialogueShell />);

    await user.click(screen.getByRole("button", { name: /合流记录/ }));
    fetchDeferred.resolve(
      new Response(
        JSON.stringify({
          requestId: useDialogueUiStore.getState().pending.synthesis?.requestId,
          synthesis: {
            text: "保留主线，但拆开节奏。",
            summary: "主线收束",
            label: "收束",
            stance: "合"
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    await waitFor(() => {
      expect(events.some((event) => event.name === "synthesis_created")).toBe(true);
    });

    expect(events.at(-1)).toEqual({
      name: "synthesis_created",
      payload: {
        nodeCount: 4,
        entryCount: 1,
        sourceCount: 2,
        hasLineageParent: true
      }
    });
  });

  it("keeps focus on the generated synthesis after the reveal settles", async () => {
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    const fetchDeferred = createDeferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => fetchDeferred.promise));

    render(<DialogueShell />);

    await user.click(screen.getByRole("button", { name: /合流记录/ }));
    fetchDeferred.resolve(
      new Response(
        JSON.stringify({
          requestId: useDialogueUiStore.getState().pending.synthesis?.requestId,
          synthesis: {
            text: "保留主线，但拆开节奏。",
            summary: "主线收束",
            label: "收束",
            stance: "合"
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    let synthesisId: string | undefined;
    await waitFor(() => {
      synthesisId = Object.values(branchGraphStore.getGraph().nodes).find(
        (node) => node.branchType === "合"
      )?.id;
      expect(synthesisId).toBeTruthy();
      expect(useDialogueUiStore.getState().focusedNodeId).toBe(synthesisId);
    });

    await new Promise((resolve) => setTimeout(resolve, 2400));
    expect(useDialogueUiStore.getState().focusedNodeId).toBe(synthesisId);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "一次正反合流" })).toHaveFocus();
    });
    expect(screen.getAllByText("合流记录").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "这次合流的来源" })).toBeInTheDocument();
    expect(within(screen.getByTestId("dialogue-composer")).getByText("基于这次合流")).toBeInTheDocument();
    expect(within(screen.getByTestId("dialogue-composer")).getByText("收束")).toBeInTheDocument();
  }, 9000);

  it("does not leave orphan child users behind on branch failure", async () => {
    const user = userEvent.setup();
    const events: DialogueTelemetryEvent[] = [];
    setDialogueTelemetrySink({
      track(event) {
        events.push(event);
      }
    });
    const { thesisId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: thesisId });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "branches_failed", details: "openai_api_key_missing" }), {
          status: 502,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    render(<DialogueShell />);

    await user.type(screen.getByLabelText("输入"), "继续的话下一步做什么");
    await user.click(screen.getByRole("button", { name: "生成正 / 反" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("模型服务还没接好");
      expect(screen.getByRole("alert")).toHaveTextContent(
        "当前环境没有配置 OpenAI API key，所以这轮请求没有真正发出去。"
      );
    });

    const graph = branchGraphStore.getGraph();
    expect(graph.nodes[thesisId].children).toEqual([]);
    expect(Object.keys(graph.nodes)).toHaveLength(3);
    expect(events.some((event) => event.name === "continuation_created")).toBe(false);
  });

  it("keeps branch requests alive after focus changes and lands them on the original target", async () => {
    const user = userEvent.setup();
    const events: DialogueTelemetryEvent[] = [];
    setDialogueTelemetrySink({
      track(event) {
        events.push(event);
      }
    });
    const { thesisId, antithesisId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: thesisId });
    const fetchDeferred = createDeferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => fetchDeferred.promise));

    render(<DialogueShell />);

    await user.type(screen.getByLabelText("输入"), "继续的话下一步做什么");
    await user.click(screen.getByRole("button", { name: "生成正 / 反" }));
    await user.click(screen.getByRole("button", { name: /暂停/ }));

    const composer = screen.getByTestId("dialogue-composer");
    expect(within(composer).getByText("正在续写到")).toBeInTheDocument();
    expect(within(composer).getByText("继续")).toBeInTheDocument();
    expect(within(composer).queryByText("暂停")).not.toBeInTheDocument();

    fetchDeferred.resolve(
      new Response(
        JSON.stringify({
          requestId: useDialogueUiStore.getState().pending.branches?.requestId,
          thesis: { text: "拆小目标", summary: "拆小推进", label: "拆小", stance: "正" },
          antithesis: { text: "暂停一周", summary: "先停一周", label: "停一周", stance: "反" }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    await waitFor(() => {
      expect(branchGraphStore.getGraph().nodes[thesisId].children).toHaveLength(1);
    });

    const childUserId = branchGraphStore.getGraph().nodes[thesisId].children[0];
    expect(branchGraphStore.getGraph().nodes[childUserId]?.text).toBe("继续的话下一步做什么");
    expect(useDialogueUiStore.getState().focusedNodeId).toBe(antithesisId);
    expect(screen.getByRole("status")).toHaveTextContent("正反已生成：继续推进、暂缓判断，或留下合流记录。");
    expect(events.some((event) => event.name === "continuation_created")).toBe(true);
  });

  it("does not steal focus when synthesis finishes after the user moves away", async () => {
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    const otherRootId = branchGraphStore.createUserNode("另一个问题");
    branchGraphStore.createAssistantPair(otherRootId, {
      thesis: { text: "转向", summary: "转向推进", label: "转向" },
      antithesis: { text: "放下", summary: "先放下", label: "放下" }
    });
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    const fetchDeferred = createDeferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => fetchDeferred.promise));

    render(<DialogueShell />);

    await user.click(screen.getByRole("button", { name: /合流记录/ }));
    await user.click(within(screen.getByTestId("dialogue-sidebar")).getByRole("button", { name: /另一个问题/ }));

    expect(screen.queryByRole("button", { name: "合流中..." })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /合流记录/ })).toBeDisabled();
    expect(screen.getByText("等待另一条谱系收束完成：继续 / 暂停")).toBeInTheDocument();

    fetchDeferred.resolve(
      new Response(
        JSON.stringify({
          requestId: useDialogueUiStore.getState().pending.synthesis?.requestId,
          synthesis: {
            text: "保留主线，但拆开节奏。",
            summary: "主线收束",
            label: "收束",
            stance: "合"
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    await waitFor(() => {
      expect(Object.values(branchGraphStore.getGraph().nodes).some((node) => node.branchType === "合")).toBe(true);
    });

    expect(useDialogueUiStore.getState().focusedNodeId).toBe(otherRootId);
    expect(screen.getByRole("status")).toHaveTextContent("合流已生成：查看合流记录，或基于它继续追问。");
    expect(screen.getByTestId("dialogue-flow-status")).toHaveTextContent("合流已生成：查看合流记录，或基于它继续追问。");
  });

  it("makes pending states exclusive and exposes synthesis busy feedback", async () => {
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    const fetchDeferred = createDeferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => fetchDeferred.promise));

    render(<DialogueShell />);

    await user.click(screen.getByRole("button", { name: /合流记录/ }));

    expect(useDialogueUiStore.getState().pending.branches).toBeNull();
    expect(useDialogueUiStore.getState().pending.synthesis).not.toBeNull();
    expect(screen.getByRole("button", { name: "合流中..." })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "合流中" })).toBeDisabled();

    fetchDeferred.resolve(
      new Response(
        JSON.stringify({
          requestId: useDialogueUiStore.getState().pending.synthesis?.requestId,
          synthesis: { text: "保留主线，但拆开节奏。", summary: "主线收束", label: "收束", stance: "合" }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    await waitFor(() => {
      expect(useDialogueUiStore.getState().pending.synthesis).toBeNull();
    });
  });
});
