import { defaultThinkingSpace } from "@/features/perspectives/model";
import { loadPerspectiveDraft, savePerspectiveDraft, PERSPECTIVE_DRAFT_KEY_PREFIX } from "./perspectiveDraft";

beforeEach(() => localStorage.clear());

it("preserves incomplete input across reloads without applying or normalizing it", () => {
  const draft = defaultThinkingSpace();
  draft.axes[0].label = "  "; draft.axes[0].negative = ""; draft.axes[0].positive = "";
  expect(savePerspectiveDraft("a", draft)).toBe(true);
  savePerspectiveDraft("b", defaultThinkingSpace());
  expect(loadPerspectiveDraft("a")).toEqual(draft);
  savePerspectiveDraft("a", null);
  expect(loadPerspectiveDraft("a")).toBeNull();
  expect(loadPerspectiveDraft("b")?.axes[0].label).toBe("尺度");
});

it("rejects corrupt records and keeps storage errors non-fatal", () => {
  localStorage.setItem(PERSPECTIVE_DRAFT_KEY_PREFIX + "a", JSON.stringify({ version: 1, axes: [{ id: "__proto__" }] }));
  expect(loadPerspectiveDraft("a")).toBeNull();
  const fail = vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("full"); });
  try { expect(savePerspectiveDraft("a", defaultThinkingSpace())).toBe(false); } finally { fail.mockRestore(); }
});
