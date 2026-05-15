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
    expect(view.currentNode).toMatchObject({
      id: synthesisId,
      displayRole: "synthesis-record",
      branchType: "合"
    });
    expect(view.composerTarget).toMatchObject({
      nodeId: synthesisId,
      label: "重开",
      displayRole: "synthesis-record"
    });
    expect(view.composerTarget.branchType).toBeUndefined();
    expect(view.currentNode?.sourceNodes.map((node) => node.id)).toEqual([thesisId, antithesisId]);
    expect(view.sidebarItems.find((item) => item.id === synthesisId)?.parentId).toBe(rootUserId);
    expect(view.sidebarItems.find((item) => item.id === synthesisId)?.displayRole).toBe("synthesis-event");
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

  it("derives stable short labels and full previews for user nodes from their text", () => {
    const store = new BranchGraphStore();
    const rootUserId = store.createUserNode("这个方向还值不值得继续投入？");
    const { thesisId } = store.createAssistantPair(rootUserId, {
      thesis: { text: "继续", summary: "继续推进", label: "继续" },
      antithesis: { text: "暂停", summary: "暂停重构", label: "暂停" }
    });
    const followupId = store.createChildUserNode(thesisId, "如果继续，最小可验证范围是什么？");

    const view = deriveDialogueView(store.getGraph(), followupId);

    expect(view.breadcrumb.map((item) => item.label)).toEqual([
      "这个方向还值不值得继续投…",
      "继续",
      "如果继续，最小可验证范围…"
    ]);
    expect(view.sidebarItems.find((item) => item.id === rootUserId)?.label).toBe("这个方向还值不值得继续投…");
    expect(view.sidebarItems.find((item) => item.id === followupId)?.label).toBe("如果继续，最小可验证范围…");
    expect(view.sidebarItems.find((item) => item.id === rootUserId)?.summary).toBe("这个方向还值不值得继续投入？");
    expect(view.stageNodes.find((node) => node.id === followupId)).toMatchObject({
      label: "如果继续，最小可验证范围…",
      preview: "如果继续，最小可验证范围是什么？"
    });
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

    expect(byId[rootUserId]).toMatchObject({ relation: "ancestor", seedX: 50, seedY: 18 });
    expect(byId[thesisId]).toMatchObject({
      relation: "source",
      seedX: 30,
      seedY: 34,
      preview: "继续",
      summary: "继续推进"
    });
    expect(byId[antithesisId]).toMatchObject({ relation: "source", seedX: 70, seedY: 34 });
    expect(byId[synthesisId]).toMatchObject({
      relation: "focus",
      displayRole: "synthesis-record",
      seedX: 50,
      seedY: 62,
      preview: "主线收束",
      summary: "主线收束"
    });
  });

  it("does not render synthesis as a permanent third stage child when its parent user is focused", () => {
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

    const rootView = deriveDialogueView(store.getGraph(), rootUserId);
    const synthesisView = deriveDialogueView(store.getGraph(), synthesisId);

    expect(rootView.stageNodes.map((node) => node.id)).toEqual([rootUserId, thesisId, antithesisId]);
    expect(rootView.sidebarItems.some((item) => item.id === synthesisId)).toBe(true);
    expect(
      rootView.sidebarItems
        .filter((item) => item.parentId === rootUserId && item.displayRole === "node")
        .map((item) => item.id)
    ).toEqual([thesisId, antithesisId]);
    expect(rootView.sidebarItems.find((item) => item.id === synthesisId)).toMatchObject({
      parentId: rootUserId,
      displayRole: "synthesis-event"
    });
    expect(synthesisView.stageNodes.map((node) => node.id)).toContain(synthesisId);
  });

  it("keeps continuations created from synthesis records visible in the sidebar", () => {
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
    const followupId = store.createChildUserNode(synthesisId, "如果按这个节奏推进，第一周只做什么？");

    const rootView = deriveDialogueView(store.getGraph(), rootUserId);

    expect(rootView.sidebarItems.map((item) => item.id)).toContain(followupId);
    expect(rootView.sidebarItems.find((item) => item.id === followupId)).toMatchObject({
      parentId: synthesisId,
      displayRole: "node"
    });
  });
});
