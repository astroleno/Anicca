import { BranchGraphStore } from "@/store/branchGraph";
import { COMPOSER_DRAFT_KEY_PREFIX, loadComposerDraft, saveComposerDraft } from "./composerDraft";

beforeEach(() => localStorage.clear());

it("keeps each workspace's exact text, source and inquiry separate", () => {
  const store = new BranchGraphStore(), id = store.createUserNode("收束来自已写片段。自由仍能保留。");
  const first = { text: "  还没写完\n", targetId: id, inquiry: { sourceNodeId: id, quote: "自由仍能保留。", intent: "premise" as const } };
  expect(saveComposerDraft("a", first)).toBe(true);
  saveComposerDraft("b", { text: "另一条思路", targetId: null });
  expect(loadComposerDraft("a", store.getGraph())).toEqual(first);
  expect(loadComposerDraft("b", store.getGraph())?.text).toBe("另一条思路");
  saveComposerDraft("a", { text: "", targetId: id });
  expect(loadComposerDraft("a", store.getGraph())).toBeNull();
  expect(loadComposerDraft("b", store.getGraph())?.text).toBe("另一条思路");
});

it("retains the writing but drops a stale quote or missing target", () => {
  const store = new BranchGraphStore();
  saveComposerDraft("a", { text: "原句已不在，问题仍然保留", targetId: "missing",
    inquiry: { sourceNodeId: "missing", quote: "消失的原句", intent: "counterexample" } });
  expect(loadComposerDraft("a", store.getGraph())).toEqual({ text: "原句已不在，问题仍然保留", targetId: null });
});

it("rejects malformed records and reports actual storage failure without throwing", () => {
  localStorage.setItem(COMPOSER_DRAFT_KEY_PREFIX + "a", "not JSON");
  expect(loadComposerDraft("a", new BranchGraphStore().getGraph())).toBeNull();
  const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
  try { expect(saveComposerDraft("a", { text: "仍在输入框里", targetId: null })).toBe(false); }
  finally { spy.mockRestore(); }
});
