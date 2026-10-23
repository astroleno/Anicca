import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DialogueShell,
  isDialogueDemoWorkspaceEnabled,
  isDialogueRetrievalDebugPreviewEnabled,
  setDialogueWorkspaceRetrievalContextEnabledForTests
} from "@/components/dialogue/DialogueShell";
import { useDialogueUiStore } from "@/features/dialectic/store";
import { seedLabel } from "@/features/dialectic/seeds";
import { defaultThinkingSpace } from "@/features/perspectives/model";
import { polarityPerspective } from "@/features/perspectives/polarity";
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
import { loadComposerDraft } from "@/lib/persist/composerDraft";

function resetWorkspace(focusedNodeId: string | null = null) {
  branchGraphStore.setGraph(createEmptyGraph());
  useDialogueUiStore.setState({
    workspaceId: "workspace_test",
    workspaceSessionId: "ws_test",
    focusedNodeId,
    composerParentId: null,
    stageLayouts: {},
    stagePreview: null,
    seedInstances: {},
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
      stageLayouts: state.stageLayouts,
      thinkingSpace: state.thinkingSpace
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

function createDeepenedRoundtableResponse(
  requestId: string,
  options: { guidingQuestion?: string; nextQuestion?: string } = {}
) {
  const guidingQuestion = options.guidingQuestion || "第二层问题";
  const nextQuestion = options.nextQuestion || "谁来承担下一步的判断？";
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
            guidingQuestion,
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
            nextQuestion
          }
        ],
        currentQuestion: nextQuestion,
        nextQuestion,
        lastCoreTension: "流程效率与责任归属",
        status: "active"
      }
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

async function openReadingDrawer(user: ReturnType<typeof userEvent.setup>) {
  const id = useDialogueUiStore.getState().focusedNodeId || branchGraphStore.getGraph().entryIds[0];
  await user.click(screen.getByTestId(`dialogue-stage-node-${id}`));
  await waitFor(() => expect(document.getElementById("dialogue-reading-drawer")).toHaveAttribute("data-open", "true"));
}

async function openMore(user: ReturnType<typeof userEvent.setup>) {
  const more = screen.getByRole("button", { name: "更多" });
  if (more.getAttribute("aria-expanded") !== "true") await user.click(more);
}

async function moreAction(user: ReturnType<typeof userEvent.setup>, title: string) {
  await openMore(user);
  await user.click(await screen.findByRole("button", { name: title }));
}

async function openLineageDrawer(user: ReturnType<typeof userEvent.setup>) {
  await openMore(user);
  await user.click(screen.getByRole("button", { name: /所有种子/ }));
  expect(document.getElementById("dialogue-lineage-drawer")).toHaveAttribute("data-open", "true");
}

async function selectWorkspace(user: ReturnType<typeof userEvent.setup>, title: string) {
  await moreAction(user, title);
}

async function synthesizePair(user: ReturnType<typeof userEvent.setup>) {
  const graph = branchGraphStore.getGraph();
  const root = graph.nodes[graph.entryIds[0]];
  const left = root.children.find(id => graph.nodes[id].branchType === "正")!;
  const right = root.children.find(id => graph.nodes[id].branchType === "反")!;
  await user.click(screen.getByTestId(`dialogue-stage-node-${left}`));
  await user.click(await screen.findByRole("button", { name: "组合" }));
  await user.click(within(screen.getByTestId("dialogue-panel")).getByRole("button", {
    name: `反${seedLabel(graph, right)}`
  }));
  await waitFor(() => expect(document.getElementById("dialogue-reading-drawer")).toBeNull());
}

describe("DialogueShell", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.unstubAllGlobals();
    setDialogueWorkspaceRetrievalContextEnabledForTests(false);
    resetDialogueTelemetrySinkForTests();
    window.history.replaceState({}, "", "/dialogue");
    resetWorkspace();
  });

  it("flushes the last keystroke on leaving and restores both draft and continuation target", async () => {
    const { thesisId } = seedPair(); useDialogueUiStore.setState({ focusedNodeId: thesisId, composerParentId: thesisId });
    seedActiveWorkspaceFromCurrentGraph(); vi.stubGlobal("fetch", vi.fn());
    const rendered = render(<DialogueShell />);
    const input = await screen.findByRole("textbox", { name: "输入" });
    fireEvent.change(input, { target: { value: "我还没想完，先保留这个问题。" } });
    fireEvent(window, new Event("pagehide"));
    expect(loadComposerDraft("workspace_test", branchGraphStore.getGraph())).toMatchObject({ text: "我还没想完，先保留这个问题。", targetId: thesisId });
    rendered.unmount(); render(<DialogueShell />);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "输入" })).toHaveValue("我还没想完，先保留这个问题。"));
    expect(useDialogueUiStore.getState().composerParentId).toBe(thesisId);
  });

  it("keeps separate workspace drafts and can quietly save a seed without generation", async () => {
    const { rootUserId } = seedPair(); useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph(); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup(); render(<DialogueShell />);
    fireEvent.change(screen.getByRole("textbox", { name: "输入" }), { target: { value: "第一个工作区的未决想法" } });
    await moreAction(user, "新建工作区");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "输入" })).toHaveValue(""));
    fireEvent.change(screen.getByRole("textbox", { name: "输入" }), { target: { value: "第二个工作区先留下" } });
    await selectWorkspace(user, "Workspace Test Boot");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "输入" })).toHaveValue("第一个工作区的未决想法"));
    fireEvent.click(screen.getByRole("button", { name: "先记下" }));
    expect(Object.values(branchGraphStore.getGraph().nodes).some(node => node.text === "第一个工作区的未决想法" && node.kind === "user")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent(window, new Event("pagehide"));
    expect(loadComposerDraft("workspace_test", branchGraphStore.getGraph())).toBeNull();
  });

  it("restores a quoted inquiry, commits one response and preserves newer writing", async () => {
    const root = branchGraphStore.createUserNode("自由探索可以持续。每条伏线都需要认领吗？");
    const frame = defaultThinkingSpace(); frame.focus.concern = -1;
    branchGraphStore.patchNodeMeta(root, { fissionFrame: frame });
    useDialogueUiStore.setState({ focusedNodeId: root }); seedActiveWorkspaceFromCurrentGraph();
    const pending = createDeferred<Response>(); const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() => pending.promise); vi.stubGlobal("fetch", fetchMock);
    const rendered = render(<DialogueShell />);
    fireEvent.click(screen.getByTestId(`dialogue-stage-node-${root}`));
    fireEvent.click(await screen.findByRole("button", { name: "选一句追问" }));
    fireEvent.click(screen.getByRole("button", { name: "自由探索可以持续。" }));
    fireEvent.click(screen.getByRole("button", { name: "追问前提" }));
    fireEvent.change(screen.getByRole("textbox", { name: "输入" }), { target: { value: "什么条件让探索能持续？" } });
    rendered.unmount(); render(<DialogueShell />);
    expect(await screen.findByLabelText("本次追问的原句")).toHaveTextContent("自由探索可以持续。");
    expect(screen.getByRole("textbox", { name: "输入" })).toHaveValue("什么条件让探索能持续？");
    fireEvent.click(screen.getByRole("button", { name: "追问" }));
    const request = readFetchBody(fetchMock, 0);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/inquiry");
    expect(request.origin).toMatchObject({ sourceNodeId: root, quote: "自由探索可以持续。", question: "什么条件让探索能持续？" });
    expect(request.perspective.focus).toEqual({ concern: -1 });
    fireEvent.change(screen.getByRole("textbox", { name: "输入" }), { target: { value: "等待时想到的另一个问题" } });
    pending.resolve(new Response(JSON.stringify({ requestId: request.requestId, inquiry: { text: "自由探索需要允许暂时不收束。", summary: "保留未决", label: "暂不收束", change: "澄清探索所需的暂缓判断空间。" } }), { status: 200 }));
    await waitFor(() => expect(Object.keys(branchGraphStore.getGraph().nodes)).toHaveLength(3));
    expect(screen.getByRole("textbox", { name: "输入" })).toHaveValue("等待时想到的另一个问题");
    expect(Object.values(branchGraphStore.getGraph().nodes).filter(node => node.kind === "assistant")).toHaveLength(1);
  });

  it("cancels a quoted inquiry without adding late results or losing its question", async () => {
    const root = branchGraphStore.createUserNode("这条前提值得继续追问。"); useDialogueUiStore.setState({ focusedNodeId: root }); seedActiveWorkspaceFromCurrentGraph();
    const pending = createDeferred<Response>(), fetchMock = vi.fn(() => pending.promise); vi.stubGlobal("fetch", fetchMock);
    render(<DialogueShell />); fireEvent.click(screen.getByTestId(`dialogue-stage-node-${root}`));
    fireEvent.click(await screen.findByRole("button", { name: "选一句追问" })); fireEvent.click(within(screen.getByLabelText("选择要追问的原句")).getByRole("button", { name: "这条前提值得继续追问。" }));
    fireEvent.click(screen.getByRole("button", { name: "找反例" })); fireEvent.click(screen.getByRole("button", { name: "追问" }));
    const body = readFetchBody(fetchMock, 0); fireEvent.click(screen.getByRole("button", { name: "取消" }));
    pending.resolve(new Response(JSON.stringify({ requestId: body.requestId, inquiry: { text: "迟到回答", summary: "迟到", label: "迟到", change: "这是已经被取消的追问结果。" } }), { status: 200 }));
    await waitFor(() => expect(useDialogueUiStore.getState().pending.branches).toBeNull());
    expect(Object.keys(branchGraphStore.getGraph().nodes)).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "输入" })).toHaveValue("什么具体情形会让这句话不成立？");
  });

  it("keeps a memory copy across workspace switches when device draft storage fails", async () => {
    seedPair(); seedActiveWorkspaceFromCurrentGraph();
    const write = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
      if (key.startsWith("anicca_composer_draft_v1:")) throw new Error("storage unavailable");
      write(key, value);
    });
    const user = userEvent.setup(); render(<DialogueShell />);
    fireEvent.change(screen.getByRole("textbox", { name: "输入" }), { target: { value: "还不能丢掉的草稿" } });
    await moreAction(user, "新建工作区");
    await selectWorkspace(user, "Workspace Test Boot");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "输入" })).toHaveValue("还不能丢掉的草稿"));
    expect(screen.getByText("草稿暂时未能保存，请先保留这段文字。")).toBeInTheDocument();
  });

  it("creates shared instances without generation and can hide one without deleting the concept", async () => {
    const { thesisId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: thesisId });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<DialogueShell />);
    fireEvent.click(screen.getByTestId(`dialogue-stage-node-${thesisId}`));
    fireEvent.click(await screen.findByRole("button", { name: "分身" }));
    const first = Object.keys(useDialogueUiStore.getState().seedInstances)[0];
    expect(await screen.findByTestId(`dialogue-stage-node-${first}`)).toHaveAttribute("data-seed-concept", thesisId);
    fireEvent.click(screen.getByTestId(`dialogue-stage-node-${first}`));
    fireEvent.click(await screen.findByRole("button", { name: "分身" }));
    const second = Object.keys(useDialogueUiStore.getState().seedInstances).find(id => id !== first)!;
    expect(await screen.findByTestId(`dialogue-stage-node-${second}`)).toHaveAttribute("data-seed-instance", "2");
    expect(Object.keys(branchGraphStore.getGraph().nodes)).toHaveLength(3);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId(`dialogue-stage-node-${first}`));
    fireEvent.click(await screen.findByRole("button", { name: "收起这个分身" }));
    await waitFor(() => expect(screen.queryByTestId(`dialogue-stage-node-${first}`)).not.toBeInTheDocument());
    expect(screen.getByTestId(`dialogue-stage-node-${second}`)).toHaveAttribute("data-seed-instance", "2");
    expect(branchGraphStore.getGraph().nodes[thesisId].text).toBe("继续");
    expect(loadWorkspaceRecord("workspace_test")?.snapshot.seedInstances).toMatchObject({ [second]: { conceptId: thesisId } });
  });

  it("expands one axis into stance-free poles, then performs ordinary fission within a selected endpoint", async () => {
    const { rootUserId } = seedPair(), frame = defaultThinkingSpace(); frame.focus.horizon = 1;
    useDialogueUiStore.setState({ focusedNodeId: rootUserId, thinkingSpace: frame });
    seedActiveWorkspaceFromCurrentGraph();
    const fetchMock = vi.fn(async (url, init) => {
      const body = JSON.parse(init.body);
      const result = url === "/api/polarities" ? { requestId: body.requestId, axis: body.perspective.axes.find((axis: { id: string }) => axis.id === body.axisId),
        negative: { text: "个人的探索空间", summary: "保留个人节奏", label: "个人节奏", perspective: polarityPerspective(body.perspective, body.axisId, -1) },
        positive: { text: "共同的探索空间", summary: "保留共同问题", label: "共同问题", perspective: polarityPerspective(body.perspective, body.axisId, 1) } }
        : { requestId: body.requestId, thesis: { text: "深化个人节奏", summary: "深化", label: "自定节奏", stance: "正" },
          antithesis: { text: "质疑节奏前提", summary: "质疑", label: "节奏前提", stance: "反" } };
      return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<DialogueShell />);
    fireEvent.click(screen.getByTestId(`dialogue-stage-node-${rootUserId}`));
    fireEvent.click(await screen.findByRole("button", { name: "沿极性展开" }));
    fireEvent.click(screen.getByRole("radio", { name: /关切/ }));
    fireEvent.click(screen.getByRole("button", { name: "沿「关切」展开" }));
    await waitFor(() => expect(Object.values(branchGraphStore.getGraph().nodes).filter(node => node.meta?.polarity)).toHaveLength(2));
    const pole = Object.values(branchGraphStore.getGraph().nodes).find(node => node.meta?.polarity?.pole === -1)!;
    expect(fetchMock.mock.calls[0][0]).toBe("/api/polarities");
    expect(pole.branchType).toBeUndefined();
    expect(screen.getByTestId(`dialogue-stage-node-${pole.id}`)).toHaveAttribute("data-expansion-kind", "polarity");
    expect(screen.getByTestId("dialogue-expansion-context")).toHaveTextContent("个体 ↔ 群体");
    fireEvent.click(screen.getByTestId(`dialogue-stage-node-${pole.id}`));
    fireEvent.click(await screen.findByRole("button", { name: "正反裂变" }));
    await waitFor(() => expect(branchGraphStore.getGraph().nodes[pole.id].children).toHaveLength(2));
    expect(readFetchBody(fetchMock, 1).perspective.focus).toEqual({ concern: -1, horizon: 1 });
    expect(screen.getByTestId("dialogue-expansion-context")).toHaveTextContent("正反裂变");
    expect(useDialogueUiStore.getState().thinkingSpace.focus).toEqual({ horizon: 1 });
  });

  it("retries polarity expansion with its original axis snapshot after global definitions change", async () => {
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId, thinkingSpace: defaultThinkingSpace() });
    seedActiveWorkspaceFromCurrentGraph();
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      if (fetchMock.mock.calls.length === 1) return new Response(JSON.stringify({ requestId: body.requestId, error: "invalid_model_output" }), { status: 502 });
      return new Response(JSON.stringify({ requestId: body.requestId, axis: body.perspective.axes.find((axis: { id: string }) => axis.id === body.axisId),
        negative: { text: "个体继续探索", summary: "个人节奏", label: "个人节奏", perspective: polarityPerspective(body.perspective, body.axisId, -1) },
        positive: { text: "群体继续探索", summary: "共同问题", label: "共同问题", perspective: polarityPerspective(body.perspective, body.axisId, 1) } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock); render(<DialogueShell />);
    fireEvent.click(screen.getByTestId(`dialogue-stage-node-${rootUserId}`));
    fireEvent.click(await screen.findByRole("button", { name: "沿极性展开" }));
    fireEvent.click(screen.getByRole("radio", { name: /关切/ }));
    fireEvent.click(screen.getByRole("button", { name: "沿「关切」展开" }));
    const retry = await screen.findByRole("button", { name: "重试" });
    const changed = defaultThinkingSpace(); changed.axes[1].negative = "另一种新含义";
    useDialogueUiStore.getState().setThinkingSpace(changed);
    fireEvent.click(retry);
    await waitFor(() => expect(Object.values(branchGraphStore.getGraph().nodes).filter(node => node.meta?.polarity)).toHaveLength(2));
    expect(readFetchBody(fetchMock, 1).perspective).toEqual(readFetchBody(fetchMock, 0).perspective);
    expect(readFetchBody(fetchMock, 1).perspective.axes[1].negative).toBe("个体");
    expect(useDialogueUiStore.getState().thinkingSpace.axes[1].negative).toBe("另一种新含义");
  });

  it("retains the opposite pole in a crowded scene and keeps the selected alias visible while reading", async () => {
    const root = branchGraphStore.createUserNode("共同探索"), frame = defaultThinkingSpace();
    const pair = branchGraphStore.createPolarityPair(root, { groupId: "crowded", axisId: "concern", frame,
      negative: { text: "个体观察", label: "个人节奏", perspective: polarityPerspective(frame, "concern", -1) },
      positive: { text: "群体观察", label: "共同问题", perspective: polarityPerspective(frame, "concern", 1) } });
    branchGraphStore.createAssistantPair(pair.negativeId, { thesis: { text: "深化", label: "深化个人" }, antithesis: { text: "质疑", label: "质疑个人" } });
    branchGraphStore.createSynthesisAssistant([pair.negativeId, pair.positiveId], { text: "新的理解", label: "新的理解" });
    const copies = Array.from({ length: 3 }, () => useDialogueUiStore.getState().addSeedInstance(pair.negativeId));
    useDialogueUiStore.setState({ focusedNodeId: pair.negativeId, thinkingSpace: frame });
    render(<DialogueShell />);
    expect(screen.getByTestId(`dialogue-stage-node-${pair.positiveId}`)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId(`dialogue-stage-node-${copies[0]}`));
    await screen.findByRole("button", { name: "正反裂变" });
    expect(screen.getByTestId(`dialogue-stage-node-${copies[0]}`)).toHaveAttribute("data-seed-attention", "0.65");
    expect(screen.getByTestId(`dialogue-stage-node-${pair.positiveId}`)).toBeInTheDocument();
  });

  it("keeps reading and its focus when thinking-space settings are opened and closed", async () => {
    const user = userEvent.setup(), { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    render(<DialogueShell />);
    await openReadingDrawer(user);
    await user.click(screen.getByRole("button", { name: "换个角度" }));
    const dialog = await screen.findByRole("dialog", { name: "换个角度看" });
    await user.click(within(dialog).getByRole("button", { name: "群体" }));
    await user.click(within(dialog).getByRole("button", { name: "关闭思考空间" }));
    expect(document.getElementById("dialogue-reading-drawer")).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("dialogue-stage-track").inert).toBe(true);
    expect(screen.getByRole("button", { name: "换个角度" })).toHaveFocus();
  });

  it("combines a chosen instance, unfolds its actual sources and collapses without losing the result", async () => {
    const { thesisId, antithesisId } = seedPair();
    const instance = useDialogueUiStore.getState().addSeedInstance(thesisId);
    useDialogueUiStore.setState({ focusedNodeId: thesisId });
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      return new Response(JSON.stringify({ requestId: body.requestId,
        synthesis: { text: "调整节奏，再继续。", summary: "保留探索与边界", label: "调整节奏", stance: "合" } }),
      { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<DialogueShell />);
    fireEvent.click(screen.getByTestId(`dialogue-stage-node-${instance}`));
    fireEvent.click(await screen.findByRole("button", { name: "组合" }));
    fireEvent.click(within(screen.getByTestId("dialogue-panel")).getByRole("button", { name: "反暂停" }));
    await waitFor(() => expect(useDialogueUiStore.getState().pending.synthesis).toBeNull());
    const result = Object.values(branchGraphStore.getGraph().nodes).find(node => node.branchType === "合")!;
    expect(result.meta?.sourceInstanceIds).toEqual([instance, antithesisId]);
    expect(readFetchBody(fetchMock).sources[0].text).toBe("继续");
    const originalLayout = structuredClone(useDialogueUiStore.getState().stageLayouts);
    fireEvent.click(screen.getByTestId(`dialogue-stage-node-${result.id}`));
    fireEvent.click(await screen.findByRole("button", { name: "展开来源" }));
    expect(await screen.findByTestId("dialogue-source-context")).toHaveTextContent("调整节奏");
    expect(screen.getByTestId(`dialogue-stage-node-${instance}`)).toHaveAttribute("data-source-role", "source");
    expect(screen.getByTestId(`dialogue-stage-node-${antithesisId}`)).toHaveAttribute("data-source-role", "source");
    expect(screen.getByTestId(`dialogue-stage-node-${result.id}`)).toHaveAttribute("data-source-role", "result");
    expect(useDialogueUiStore.getState().stageLayouts).toEqual(originalLayout);
    expect(useDialogueUiStore.getState().stagePreview).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "收起来源" }));
    expect(screen.queryByTestId("dialogue-source-context")).not.toBeInTheDocument();
    expect(useDialogueUiStore.getState().stagePreview).toBeNull();
    expect(useDialogueUiStore.getState().stageLayouts).toEqual(originalLayout);
    expect(branchGraphStore.getGraph().nodes[result.id]).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the workspace quiet and exposes actions only after selecting a seed", async () => {
    const user = userEvent.setup();
    const { rootUserId, thesisId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    render(<DialogueShell />);
    expect(screen.getByPlaceholderText("写下一个想法…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成" })).toBeDisabled();
    expect(screen.queryByText("主决策")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "正反裂变" })).not.toBeInTheDocument();
    await user.click(screen.getByTestId(`dialogue-stage-node-${thesisId}`));
    expect(await screen.findByRole("button", { name: "正反裂变" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "组合" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "继续写" })).toBeEnabled();
  });

  it("moves focus into lineage and returns to More through either close path", async () => {
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    render(<DialogueShell />);
    await openLineageDrawer(user);
    await waitFor(() => expect(screen.getByRole("button", { name: "收起谱系" })).toHaveFocus());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("button", { name: "更多" })).toHaveFocus());
    await openLineageDrawer(user);
    await user.click(screen.getByRole("button", { name: "收起谱系" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "更多" })).toHaveFocus());
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "演化全景" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("link", { name: "直接输入想法" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "输入" })).toHaveFocus());
  });

  it("announces generation through the same mounted status region from start to completion", async () => {
    const user = userEvent.setup();
    const result = createDeferred<Response>();
    const fetchMock = vi.fn(() => result.promise);
    vi.stubGlobal("fetch", fetchMock);
    render(<DialogueShell />);
    const status = screen.getByRole("status");
    await user.type(screen.getByRole("textbox", { name: "输入" }), "留下探索的空间");
    await user.click(screen.getByRole("button", { name: "生成" }));
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("正在展开正反两种视角");
    result.resolve(new Response(JSON.stringify({ requestId: readFetchBody(fetchMock).requestId,
      thesis: { text: "保留探索", summary: "保留探索", label: "探索", stance: "正" },
      antithesis: { text: "邀请停留", summary: "邀请停留", label: "邀请", stance: "反" }
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await waitFor(() => expect(status).toHaveTextContent("正反已生成"));
    expect(screen.getByRole("status")).toBe(status);
  });

  it("loads a demo workspace from the empty-state action", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/dialogue?demo=1");
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    await user.click(await screen.findByRole("button", { name: "载入示例谱系" }));

    expect(await screen.findByTestId("dialogue-stage-node-user_root_1")).toBeInTheDocument();
    expect(screen.getByTestId("dialogue-stage-node-asst_synthesis_1")).toBeInTheDocument();
    expect(useDialogueUiStore.getState().focusedNodeId).toBe("user_root_1");
    expect(branchGraphStore.getGraph().entryIds).toEqual(["user_root_1"]);
  });

  it.each([false, true])("preserves a later draft and input focus on branch success (retry=%s)", async retry => {
    const user = userEvent.setup();
    const first = createDeferred<Response>(), second = createDeferred<Response>();
    const fetchMock = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    vi.stubGlobal("fetch", fetchMock);
    render(<DialogueShell />);
    const input = screen.getByRole("textbox", { name: "输入" });
    await user.type(input, "想法 A");
    await user.click(screen.getByRole("button", { name: "生成" }));
    expect(input).toBeEnabled();
    await user.clear(input);
    await user.type(input, "下一颗想法 B");
    const response = (requestId: string) => new Response(JSON.stringify({ requestId,
      thesis: { text: "推进 A", label: "推进", summary: "继续推进", stance: "正" },
      antithesis: { text: "检验 A", label: "检验", summary: "检验前提", stance: "反" }
    }), { status: 200, headers: { "Content-Type": "application/json" } });
    if (retry) {
      first.resolve(new Response(JSON.stringify({ error: "branches_failed" }), { status: 502 }));
      await user.click(await screen.findByRole("button", { name: "重试" }));
      expect(readFetchBody(fetchMock, 1).userText).toBe("想法 A");
      await user.click(input);
      second.resolve(response(readFetchBody(fetchMock, 1).requestId));
    } else first.resolve(response(readFetchBody(fetchMock).requestId));
    await waitFor(() => expect(branchGraphStore.getGraph().entryIds).toHaveLength(1));
    const graph = branchGraphStore.getGraph();
    expect(graph.nodes[graph.entryIds[0]].text).toBe("想法 A");
    expect(input).toHaveValue("下一颗想法 B");
    expect(input).toHaveFocus();
    expect(document.getElementById("dialogue-reading-drawer")).toBeNull();
  });

  it("runs the artwork perspective command locally without calling the branch route", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<DialogueShell />);

    await user.click(await screen.findByRole("button", { name: /点此输入/ }));
    await user.type(screen.getByLabelText("输入"), "也许要换个角度继续推进？");
    await openMore(user);
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
    useDialogueUiStore.setState({ focusedNodeId: thesisId, composerParentId: thesisId });
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    await user.type(await screen.findByLabelText("输入"), "继续拆小");
    await moreAction(user, "画作视角");

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
    await moreAction(user, "画作视角");
    await waitFor(() => {
      expect(useDialogueUiStore.getState().focusedNodeId).not.toBe(rootUserId);
    });

    await openLineageDrawer(user);
    await user.click(
      within(screen.getByTestId("dialogue-sidebar")).getByRole("button", { name: /要不要继续这个项目/ })
    );

    expect(screen.getByTestId("dialogue-composer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "正反裂变" })).toBeEnabled();
    expect(useDialogueUiStore.getState().pending).toEqual({ branches: null, synthesis: null });
    await openMore(user);
    expect(screen.getByText("画作视角")).toBeInTheDocument();
  });

  it("locks the /api/branches request body for parent-context continuations", async () => {
    const user = userEvent.setup();
    const { thesisId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: thesisId, composerParentId: thesisId });
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
    await user.click(screen.getByRole("button", { name: "生成" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/branches", expect.any(Object));
    });
    const body = readFetchBody(fetchMock);
    expect(body).toMatchObject({ requestId: expect.any(String), userText: "下一步怎么拆" });
    expect(body.contextMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "user", content: "要不要继续这个项目" }),
      expect.objectContaining({ role: "assistant", content: expect.stringContaining("继续推进") })
    ]));
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
    useDialogueUiStore.setState({ focusedNodeId: thesisId, composerParentId: thesisId });
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
    await user.click(screen.getByRole("button", { name: "生成" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/branches", expect.any(Object));
    });
    const body = readFetchBody(fetchMock);
    expect(body.userText).toBe("下一步怎么拆");
    expect(body.contextMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "system", content: expect.stringContaining("拆分参考") })
    ]));
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

    await synthesizePair(user);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/synthesis", expect.any(Object));
    });
    const body = readFetchBody(fetchMock);
    expect(body).toMatchObject({ requestId: expect.any(String), rootInput: "继续\n\n暂停",
      sources: [
        { id: expect.any(String), text: "继续", summary: "继续推进", label: "继续", stance: "正" },
        { id: expect.any(String), text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
      ] });
    expect(body.sources[0].id).not.toBe(body.sources[1].id);
    expect(body.contextMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({ content: expect.stringContaining("要不要继续这个项目") })
    ]));
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

    await synthesizePair(user);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/synthesis", expect.any(Object));
    });
    const body = readFetchBody(fetchMock);
    expect(body.sources).toHaveLength(2);
    expect(body.contextMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "system", content: expect.stringContaining("继续参考") }),
      expect.objectContaining({ role: "assistant", content: expect.stringMatching(/\[反 .*\] 暂停$/) })
    ]));
  });

  it("keeps the empty composer available and focuses it from the stage prompt", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    await screen.findByTestId("dialogue-stage");
    expect(screen.getByTestId("dialogue-composer")).toBeInTheDocument();
    expect(screen.getByLabelText("输入")).not.toHaveFocus();
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
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(screen.getByTestId("dialogue-stage-pending-branches")).toHaveTextContent("这个方向还值得投入吗");
    expect(screen.getByTestId("dialogue-sidebar")).toHaveTextContent("正在生成正与反");
    expect(screen.getByTestId("dialogue-composer")).toHaveAttribute("aria-busy", "true");

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
    useDialogueUiStore.setState({ focusedNodeId: thesisId, composerParentId: thesisId });
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
    useDialogueUiStore.setState({ focusedNodeId: thesisId, composerParentId: thesisId });
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
    await userEvent.click(screen.getByTestId(`dialogue-stage-node-${rootUserId}`));
    const panel = await screen.findByTestId("dialogue-panel");
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

    await openReadingDrawer(user);
    await moreAction(user, "召集圆桌讨论此节点");
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

    await openReadingDrawer(user);
    await openMore(user);
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
    await waitFor(() => expect(screen.getByRole("button", { name: "更多" })).toHaveFocus());
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

    await openReadingDrawer(user);
    await moreAction(user, "查看最近圆桌记录");
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

    await openReadingDrawer(user);
    await moreAction(user, "查看最近圆桌记录");
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

    await openReadingDrawer(user);
    await moreAction(user, "查看最近圆桌记录");
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

  it("refreshes a visible drawer without stealing focus and bases the next deepen on persisted state", async () => {
    const user = userEvent.setup();
    const { rootUserId, thesisId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    seedSavedRoundtableArtifact(rootUserId);
    const firstDeepenDeferred = createDeferred<Response>();
    const secondDeepenDeferred = createDeferred<Response>();
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => firstDeepenDeferred.promise)
      .mockImplementationOnce(() => secondDeepenDeferred.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(<DialogueShell />);

    await openReadingDrawer(user);
    await moreAction(user, "查看最近圆桌记录");
    await user.click(await screen.findByRole("button", { name: "深挖一轮" }));
    await user.click(screen.getByTestId(`dialogue-stage-node-${thesisId}`));
    await waitFor(() => expect(useDialogueUiStore.getState().focusedNodeId).toBe(thesisId));
    const composerInput = screen.getByLabelText("输入");
    await user.click(composerInput);
    await waitFor(() => expect(composerInput).toHaveFocus());

    firstDeepenDeferred.resolve(createDeepenedRoundtableResponse(readFetchBody(fetchMock).requestId));

    await waitFor(() => {
      expect(
        loadWorkspaceRecord("workspace_test")?.snapshot.artifacts?.roundtables?.roundtable_saved.state.nextQuestion
      ).toBe("谁来承担下一步的判断？");
    });
    expect(useDialogueUiStore.getState().focusedNodeId).toBe(thesisId);
    expect(screen.getByTestId("dialogue-roundtable-drawer")).toHaveTextContent("第二层问题");
    expect(composerInput).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("圆桌深挖结果已保存");

    await user.click(screen.getByRole("button", { name: "深挖一轮" }));
    expect(readFetchBody(fetchMock, 1)).toMatchObject({
      command: "deepen",
      state: {
        currentQuestion: "谁来承担下一步的判断？",
        nextQuestion: "谁来承担下一步的判断？",
        rounds: [expect.objectContaining({ guidingQuestion: "第二层问题" })]
      }
    });

    secondDeepenDeferred.resolve(
      createDeepenedRoundtableResponse(readFetchBody(fetchMock, 1).requestId, {
        guidingQuestion: "第三层问题",
        nextQuestion: "如何验证下一步判断？"
      })
    );
    expect(await screen.findByText("第三层问题")).toBeInTheDocument();
  });

  it("refreshes deepen content without taking focus from the composer on the same source node", async () => {
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    seedActiveWorkspaceFromCurrentGraph();
    seedSavedRoundtableArtifact(rootUserId);
    const deepenDeferred = createDeferred<Response>();
    const fetchMock = vi.fn(() => deepenDeferred.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(<DialogueShell />);

    await openReadingDrawer(user);
    await moreAction(user, "查看最近圆桌记录");
    await user.click(await screen.findByRole("button", { name: "深挖一轮" }));
    const composerInput = screen.getByLabelText("输入");
    await user.click(composerInput);
    expect(composerInput).toHaveFocus();

    deepenDeferred.resolve(createDeepenedRoundtableResponse(readFetchBody(fetchMock).requestId));

    expect(await screen.findByText("第二层问题")).toBeInTheDocument();
    expect(composerInput).toHaveFocus();
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

    await openReadingDrawer(user);
    await moreAction(user, "查看最近圆桌记录");
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

    await openReadingDrawer(user);
    await moreAction(user, "查看最近圆桌记录");
    await user.click(await screen.findByRole("button", { name: "深挖一轮" }));
    await selectWorkspace(user, "Other Workspace");

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

    await openReadingDrawer(user);
    await moreAction(user, "查看最近圆桌记录");
    await user.click(screen.getByTestId(`dialogue-stage-node-${thesisId}`));
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByTestId("dialogue-roundtable-drawer")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "更多" })).toHaveFocus();
  });

  it("renders synthesis history as a convergence record in the sidebar", async () => {
    const { thesisId, antithesisId } = seedPair();
    const synthesisId = branchGraphStore.createSynthesisAssistant([thesisId, antithesisId], {
      text: "保留主线，但拆开节奏。",
      summary: "收束成一次事件记录。",
      label: "收束"
    });
    useDialogueUiStore.setState({ focusedNodeId: synthesisId, composerParentId: synthesisId });
    seedActiveWorkspaceFromCurrentGraph();
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    const sidebar = await screen.findByTestId("dialogue-sidebar");

    expect(within(sidebar).getByText("已合流")).toBeInTheDocument();
    expect(within(sidebar).getByRole("button", { name: "合流记录：收束，来源：继续 / 暂停" })).toBeInTheDocument();
    expect(within(sidebar).getAllByText("收束").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByTestId(`dialogue-stage-node-${synthesisId}`));
    expect(await screen.findByLabelText("合的来源")).toHaveTextContent("继续");
    expect(screen.getByRole("button", { name: "正反裂变" })).toBeEnabled();
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

    await openReadingDrawer(user);
    await moreAction(user, "召集圆桌讨论此节点");

    await openMore(user);
    const pendingButton = screen.getByRole("button", { name: "圆桌生成中…" });
    const pendingHint = screen.getByText("正在从「要不要继续这个项目」召集圆桌");

    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute("aria-busy", "true");
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

    await openReadingDrawer(user);
    await moreAction(user, "召集圆桌讨论此节点");
    await user.click(screen.getByTestId(`dialogue-stage-node-${thesisId}`));

    await waitFor(() => expect(useDialogueUiStore.getState().focusedNodeId).toBe(thesisId));
    await openMore(user);
    const pendingButton = screen.getByRole("button", { name: "圆桌生成中…" });
    const pendingHint = screen.getByText("正在从「要不要继续这个项目」召集圆桌");

    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute("aria-busy", "true");
    expect(useDialogueUiStore.getState().focusedNodeId).toBe(thesisId);
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

    await openReadingDrawer(user);
    await moreAction(user, "召集圆桌讨论此节点");
    await user.click(screen.getByTestId(`dialogue-stage-node-${thesisId}`));
    await waitFor(() => expect(useDialogueUiStore.getState().focusedNodeId).toBe(thesisId));
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

    await moreAction(user, "新建工作区");

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

    await selectWorkspace(user, "Other Workspace");

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

    await openReadingDrawer(user);
    await moreAction(user, "召集圆桌讨论此节点");
    await selectWorkspace(user, "Other Workspace");

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "圆桌生成中..." })).not.toBeInTheDocument();
    });
    await openMore(user);
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

    await selectWorkspace(user, "Other Workspace");

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
    useDialogueUiStore.setState({ focusedNodeId: thesisId, composerParentId: thesisId });
    seedActiveWorkspaceFromCurrentGraph();
    const fetchDeferred = createDeferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => fetchDeferred.promise));

    render(<DialogueShell />);

    await user.type(screen.getByLabelText("输入"), "继续的话下一步做什么");
    await user.click(screen.getByRole("button", { name: "生成" }));

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

  it("preserves a deferred meeting, accepts a user bridge, and saves the resulting change", async () => {
    const user = userEvent.setup();
    const { rootUserId, thesisId, antithesisId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId }); seedActiveWorkspaceFromCurrentGraph();
    const reply = createDeferred<Response>();
    const fetchMock = vi.fn(() => reply.promise); vi.stubGlobal("fetch", fetchMock);
    render(<DialogueShell />);
    await synthesizePair(user);
    const requestId = useDialogueUiStore.getState().pending.synthesis!.requestId;
    reply.resolve(new Response(JSON.stringify({ requestId, outcome: "deferred", deferred: {
      reason: "两个方向目前各有理由，但还没有说明它们可以共享的具体关系。", question: "你希望它们围绕哪一个具体问题相遇？"
    } })));
    await screen.findByTestId("deferred-encounter");
    expect(Object.keys(branchGraphStore.getGraph().nodes)).toHaveLength(3);
    expect(branchGraphStore.getGraph().deferredSyntheses?.[requestId].sourceNodeIds).toEqual([thesisId, antithesisId]);
    await user.click(screen.getByRole("button", { name: "补充联系" }));
    fireEvent.change(screen.getByRole("textbox", { name: "输入" }), { target: { value: "在同一作品里保留探索与收束的不同阶段。" } });
    const second = createDeferred<Response>(); fetchMock.mockImplementation(() => second.promise);
    await user.click(screen.getByRole("button", { name: "再试一次" }));
    expect(readFetchBody(fetchMock, 1).connectionInput).toBe("在同一作品里保留探索与收束的不同阶段。");
    expect(readFetchBody(fetchMock, 1).sources.map((item: { id: string }) => item.id)).toEqual([thesisId, antithesisId]);
    second.resolve(new Response(JSON.stringify({ requestId: useDialogueUiStore.getState().pending.synthesis!.requestId,
      synthesis: { text: "在同一作品里安排不同的探索阶段。", summary: "不同阶段共享作品", label: "阶段共存", stance: "合", change: "把相斥的路线改成同一作品内的不同阶段。" } })));
    await waitFor(() => expect(Object.keys(branchGraphStore.getGraph().nodes)).toHaveLength(4));
    const result = Object.values(branchGraphStore.getGraph().nodes).find(node => node.branchType === "合")!;
    expect(result.meta?.connectionInput).toBe("在同一作品里保留探索与收束的不同阶段。");
    expect(branchGraphStore.getGraph().deferredSyntheses?.[requestId].resolvedNodeId).toBe(result.id);
    await user.click(await screen.findByRole("button", { name: "阅读推演" }));
    expect(await screen.findByLabelText("这一步的理解变化")).toHaveTextContent("把相斥的路线");
  });

  it("does not save a deferred result arriving after cancellation", async () => {
    const user = userEvent.setup(); const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId }); seedActiveWorkspaceFromCurrentGraph();
    const reply = createDeferred<Response>(); vi.stubGlobal("fetch", vi.fn(() => reply.promise));
    render(<DialogueShell />); await synthesizePair(user);
    const requestId = useDialogueUiStore.getState().pending.synthesis!.requestId;
    await user.click(screen.getByRole("button", { name: "取消" }));
    reply.resolve(new Response(JSON.stringify({ requestId, outcome: "deferred", deferred: {
      reason: "两个方向目前各有理由，但还没有说明它们可以共享的具体关系。", question: "你希望它们怎样相遇？"
    } })));
    await waitFor(() => expect(useDialogueUiStore.getState().pendingAction).toBeNull());
    expect(branchGraphStore.getGraph().deferredSyntheses).toBeUndefined();
    expect(screen.queryByTestId("deferred-encounter")).not.toBeInTheDocument();
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

    await synthesizePair(user);
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

    await synthesizePair(user);
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
    expect(document.getElementById("dialogue-reading-drawer")).toBeNull();
    await openReadingDrawer(user);
    expect(screen.getByLabelText("合的来源")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("补充你的想法…")).toBeInTheDocument();
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
    useDialogueUiStore.setState({ focusedNodeId: thesisId, composerParentId: thesisId });
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
    await user.click(screen.getByRole("button", { name: "生成" }));

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
    expect(screen.getByRole("textbox", { name: "输入" })).toHaveValue("继续的话下一步做什么");
    const failedBody = readFetchBody(vi.mocked(fetch));
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ requestId: body.requestId,
        thesis: { text: "重新尝试", summary: "尝试", label: "尝试", stance: "正" },
        antithesis: { text: "检查前提", summary: "检查", label: "检查", stance: "反" }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    await user.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(Object.keys(branchGraphStore.getGraph().nodes)).toHaveLength(6));
    expect(readFetchBody(vi.mocked(fetch), 1).userText).toBe(failedBody.userText);
    expect(branchGraphStore.getGraph().nodes[thesisId].children).toHaveLength(1);
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
    useDialogueUiStore.setState({ focusedNodeId: thesisId, composerParentId: thesisId });
    const fetchDeferred = createDeferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => fetchDeferred.promise));

    render(<DialogueShell />);

    await user.type(screen.getByLabelText("输入"), "继续的话下一步做什么");
    await user.click(screen.getByRole("button", { name: "生成" }));
    await openLineageDrawer(user);
    await user.click(within(screen.getByTestId("dialogue-sidebar")).getByRole("button", { name: /暂停/ }));

    const composer = screen.getByTestId("dialogue-composer");
    expect(composer).toHaveAttribute("aria-busy", "true");
    expect(within(composer).getByText(/基于「继续」/)).toBeInTheDocument();
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
    expect(screen.getByRole("status")).toHaveTextContent("正反已生成。");
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

    await synthesizePair(user);
    await openLineageDrawer(user);
    await user.click(within(screen.getByTestId("dialogue-sidebar")).getByRole("button", { name: /另一个问题/ }));

    expect(screen.queryByRole("button", { name: "合流中..." })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "合成中…" })).toBeDisabled();
    expect(screen.getByTestId("dialogue-stage-pending-synthesis")).toHaveTextContent("继续 / 暂停");

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
    expect(screen.getByRole("status")).toHaveTextContent("合流已生成，继续从这里想。");
    // The live status announces completion; a second floating copy would
    // overlap the lowest seed label on a narrow stage.
    expect(screen.queryByTestId("dialogue-flow-status")).not.toBeInTheDocument();
  });

  it("makes pending states exclusive and exposes synthesis busy feedback", async () => {
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    const fetchDeferred = createDeferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => fetchDeferred.promise));

    render(<DialogueShell />);

    await synthesizePair(user);

    expect(useDialogueUiStore.getState().pending.branches).toBeNull();
    expect(useDialogueUiStore.getState().pending.synthesis).not.toBeNull();
    expect(screen.getByTestId("dialogue-composer")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "合成中…" })).toBeDisabled();

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
