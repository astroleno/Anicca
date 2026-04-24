import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DialogueShell } from "@/components/dialogue/DialogueShell";
import { useDialogueUiStore } from "@/features/dialectic/store";
import { branchGraphStore } from "@/store/branchGraph";
import { createEmptyGraph } from "@/types/anicca";

function resetWorkspace(focusedNodeId: string | null = null) {
  branchGraphStore.setGraph(createEmptyGraph());
  useDialogueUiStore.setState({
    workspaceSessionId: "ws_test",
    focusedNodeId,
    composerParentId: null,
    errorMessage: null,
    pendingAction: null,
    pending: {
      branches: null,
      synthesis: null
    }
  });
  localStorage.clear();
}

function seedPair() {
  const rootUserId = branchGraphStore.createUserNode("要不要继续这个项目");
  const { thesisId, antithesisId } = branchGraphStore.createAssistantPair(rootUserId, {
    thesis: { text: "继续", summary: "继续推进", label: "继续" },
    antithesis: { text: "暂停", summary: "暂停重构", label: "暂停" }
  });
  return { rootUserId, thesisId, antithesisId };
}

describe("DialogueShell", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetWorkspace();
  });

  it("shows composer and synthesis affordance from the derived view model", async () => {
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });
    vi.stubGlobal("fetch", vi.fn());

    render(<DialogueShell />);

    expect(await screen.findByText("生成合")).toBeInTheDocument();
    expect(screen.getByText("将续写到")).toBeInTheDocument();
    expect(screen.getByText("新的主题")).toBeInTheDocument();
  });

  it("does not leave orphan child users behind on branch failure", async () => {
    const user = userEvent.setup();
    const { thesisId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: thesisId });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "invalid_model_output" }), {
          status: 502,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    render(<DialogueShell />);

    await user.type(screen.getByLabelText("输入"), "继续的话下一步做什么");
    await user.click(screen.getByRole("button", { name: "生成正 / 反" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("这轮生成没能收束成可用结果，请再试一次。");
    });

    const graph = branchGraphStore.getGraph();
    expect(graph.nodes[thesisId].children).toEqual([]);
    expect(Object.keys(graph.nodes)).toHaveLength(3);
  });

  it("discards stale branch responses after focus changes", async () => {
    const user = userEvent.setup();
    const { thesisId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: thesisId });

    let resolveFetch: ((value: Response) => void) | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          })
      )
    );

    render(<DialogueShell />);

    await user.type(screen.getByLabelText("输入"), "继续的话下一步做什么");
    await user.click(screen.getByRole("button", { name: "生成正 / 反" }));
    await user.click(screen.getByRole("button", { name: /暂停/ }));

    resolveFetch?.(
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
      expect(branchGraphStore.getGraph().nodes[thesisId].children).toEqual([]);
    });
  });

  it("makes pending states exclusive and exposes synthesis busy feedback", async () => {
    const user = userEvent.setup();
    const { rootUserId } = seedPair();
    useDialogueUiStore.setState({ focusedNodeId: rootUserId });

    let resolveFetch: ((value: Response) => void) | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          })
      )
    );

    render(<DialogueShell />);

    await user.click(screen.getByRole("button", { name: "生成合" }));

    expect(useDialogueUiStore.getState().pending.branches).toBeNull();
    expect(useDialogueUiStore.getState().pending.synthesis).not.toBeNull();
    expect(screen.getByRole("button", { name: "收束中..." })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "等待收束完成" })).toBeDisabled();

    resolveFetch?.(
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
