import { createEmptyGraph } from "@/types/anicca";
import { defaultThinkingSpace } from "@/features/perspectives/model";
import { BranchGraphStore } from "@/store/branchGraph";
import {
  commitBranchesResult,
  commitSynthesisResult,
  DialogueController,
  ownsPendingResponse
} from "./controller";

describe("DialogueController", () => {
  it("guards response ownership by request and workspace session", () => {
    const pending = {
      requestId: "req_1",
      workspaceSessionId: "ws_1",
      focusSnapshotId: "focus_1",
      composerTargetId: null
    };

    expect(ownsPendingResponse(pending, "req_1", "ws_1")).toBe(true);
    expect(ownsPendingResponse(pending, "req_2", "ws_1")).toBe(false);
    expect(ownsPendingResponse(pending, "req_1", "ws_2")).toBe(false);
  });

  it("commits a complete branch pair and synthesis without deleting sources", () => {
    const store = new BranchGraphStore();
    store.setGraph(createEmptyGraph());
    const frame = defaultThinkingSpace(); frame.focus.horizon = 1;
    const branch = commitBranchesResult(store, {
      frame,
      targetAssistantId: null,
      userText: "是否继续",
      response: {
        requestId: "req_1",
        thesis: { text: "继续", summary: "推进", label: "继续", stance: "正" },
        antithesis: { text: "暂停", summary: "暂停", label: "暂停", stance: "反" }
      }
    });
    const synthesisId = commitSynthesisResult(store, {
      thesisId: branch.thesisId,
      antithesisId: branch.antithesisId,
      response: {
        requestId: "req_2",
        synthesis: { text: "拆开节奏", summary: "收束", label: "分段", stance: "合" }
      }
    });

    const graph = store.getGraph();
    expect(graph.nodes[branch.thesisId]).toBeDefined();
    expect(graph.nodes[branch.antithesisId]).toBeDefined();
    expect(graph.nodes[branch.thesisId].meta?.fissionFrame).toEqual(frame);
    expect(graph.nodes[branch.antithesisId].meta?.fissionFrame).toEqual(frame);
    expect(graph.nodes[synthesisId].meta?.sourceNodeIds).toEqual([
      branch.thesisId,
      branch.antithesisId
    ]);
  });

  it("aborts in-flight work when the workspace changes", async () => {
    const controller = new DialogueController();
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")));
    }));
    const request = controller.generateBranches({
      requestId: "req_1",
      userText: "是否继续",
      contextMessages: []
    }, { fetchImpl });

    controller.cancelAll();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });

  it("cancels polarity expansion through the same exclusive pending slot without committing partial work", async () => {
    const controller = new DialogueController();
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")));
    }));
    const request = controller.generatePolarity({ requestId: "pole_cancel", userText: "问题", axisId: "scale",
      perspective: defaultThinkingSpace(), contextMessages: [] }, { fetchImpl });
    controller.cancel("branches");
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/polarities");
  });
});
