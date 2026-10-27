import { BranchGraphStore } from "@/store/branchGraph";
import { loadReadingState, saveReadingState, READING_STATE_KEY_PREFIX } from "./readingState";

beforeEach(() => localStorage.clear());

it("restores an instance and exact text anchor, isolates workspaces and retains closed read positions", () => {
  const store = new BranchGraphStore(), id = store.createUserNode("每个想法都能继续展开。"), instance = { id: "copy", conceptId: id, ordinal: 1, createdAt: "2026-10-28" };
  const state = { activeId: "copy", positions: { [id]: { scrollTop: 640, anchor: { offset: 4, top: 16 } } } };
  saveReadingState("a", state);
  expect(loadReadingState("a", store.getGraph(), { copy: instance })).toEqual(state);
  expect(loadReadingState("b", store.getGraph(), {}).activeId).toBeNull();
  saveReadingState("a", { ...state, activeId: null });
  expect(loadReadingState("a", store.getGraph(), { copy: instance })).toEqual({ ...state, activeId: null });
});

it("ignores invalid nodes and anchors in older or malformed storage", () => {
  const store = new BranchGraphStore(), id = store.createUserNode("短文");
  localStorage.setItem(READING_STATE_KEY_PREFIX + "a", JSON.stringify({ version: 1, activeId: "gone", positions: {
    gone: { scrollTop: 10 }, [id]: { scrollTop: 20, anchor: { offset: 999, top: 16 } }
  } }));
  expect(loadReadingState("a", store.getGraph(), {})).toEqual({ activeId: null, positions: { [id]: { scrollTop: 20 } } });
  localStorage.setItem(READING_STATE_KEY_PREFIX + "a", "broken");
  expect(loadReadingState("a", store.getGraph(), {})).toEqual({ activeId: null, positions: {} });
});
