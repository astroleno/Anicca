import { BranchGraphStore } from "@/store/branchGraph";
import { deriveDialogueView } from "@/features/dialectic/viewModel";

describe("deriveDialogueView", () => {
  it("uses lineageParentId for synthesis breadcrumb and source projection", () => {
    const store = new BranchGraphStore();
    const rootUserId = store.createUserNode("要不要继续");
    const { thesisId, antithesisId } = store.createAssistantPair(rootUserId, {
      thesis: { text: "继续", summary: "继续推进", label: "继续" },
      antithesis: { text: "暂停", summary: "暂停重构", label: "暂停" }
    });
    const synthesisId = store.createSynthesisAssistant([thesisId, antithesisId], {
      text: "重开主线",
      summary: "主线重开",
      label: "重开"
    });

    const view = deriveDialogueView(store.getGraph(), synthesisId);

    expect(view.breadcrumb.map((item) => item.id)).toEqual([rootUserId, synthesisId]);
    expect(view.currentNode?.sourceNodes.map((node) => node.id)).toEqual([thesisId, antithesisId]);
    expect(view.sidebarItems.find((item) => item.id === synthesisId)?.parentId).toBe(rootUserId);
  });

  it("derives composer target from non-root user parent assistant", () => {
    const store = new BranchGraphStore();
    const rootUserId = store.createUserNode("要不要继续");
    const { thesisId } = store.createAssistantPair(rootUserId, {
      thesis: { text: "继续", summary: "继续推进", label: "继续" },
      antithesis: { text: "暂停", summary: "暂停重构", label: "暂停" }
    });
    const childUserId = store.createChildUserNode(thesisId, "如果继续");

    const childView = deriveDialogueView(store.getGraph(), childUserId);
    const rootView = deriveDialogueView(store.getGraph(), rootUserId);

    expect(childView.composerTarget).toMatchObject({ nodeId: thesisId, kind: "assistant", branchType: "正" });
    expect(rootView.composerTarget).toMatchObject({ nodeId: null, kind: "root" });
  });

  it("binds synthesis action to a fixed thesis/antithesis pair", () => {
    const store = new BranchGraphStore();
    const rootUserId = store.createUserNode("要不要继续");
    const { thesisId, antithesisId } = store.createAssistantPair(rootUserId, {
      thesis: { text: "继续", summary: "继续推进", label: "继续" },
      antithesis: { text: "暂停", summary: "暂停重构", label: "暂停" }
    });

    const view = deriveDialogueView(store.getGraph(), rootUserId);
    expect(view.availableSynthesisActions).toEqual([
      {
        key: `${rootUserId}:${thesisId}:${antithesisId}`,
        lineageParentId: rootUserId,
        thesisId,
        antithesisId,
        synthesisId: null,
        label: "继续 / 暂停",
        available: true
      }
    ]);
  });

  it("uses a non-overlapping preset for synthesis focus layouts", () => {
    const store = new BranchGraphStore();
    const rootUserId = store.createUserNode("要不要继续");
    const { thesisId, antithesisId } = store.createAssistantPair(rootUserId, {
      thesis: { text: "继续", summary: "继续推进", label: "继续" },
      antithesis: { text: "暂停", summary: "暂停重构", label: "暂停" }
    });
    const synthesisId = store.createSynthesisAssistant([thesisId, antithesisId], {
      text: "主线收束",
      summary: "主线收束",
      label: "收束"
    });

    const view = deriveDialogueView(store.getGraph(), synthesisId);
    const byId = Object.fromEntries(view.stageNodes.map((node) => [node.id, node]));

    expect(byId[rootUserId]).toMatchObject({ relation: "ancestor", seedX: 50, seedY: 22 });
    expect(byId[thesisId]).toMatchObject({ relation: "source", seedX: 30, seedY: 34 });
    expect(byId[antithesisId]).toMatchObject({ relation: "source", seedX: 70, seedY: 34 });
    expect(byId[synthesisId]).toMatchObject({ relation: "focus", seedX: 50, seedY: 56 });
  });
});
