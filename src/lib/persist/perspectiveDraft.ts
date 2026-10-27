import type { ThinkingAxis, ThinkingSpace } from "@/features/perspectives/model";

export const PERSPECTIVE_DRAFT_KEY_PREFIX = "anicca_perspective_draft_v1:";

// Drafts deliberately allow blank or equal poles: only Save validates a frame.
export function loadPerspectiveDraft(workspaceId: string): ThinkingSpace | null {
  try {
    const saved = JSON.parse(localStorage.getItem(PERSPECTIVE_DRAFT_KEY_PREFIX + workspaceId) || "null");
    if (saved?.version !== 1 || !Array.isArray(saved.axes) || saved.axes.length > 24) return null;
    const ids = new Set<string>();
    const axes: ThinkingAxis[] = [];
    for (const axis of saved.axes) {
      if (!axis || typeof axis.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(axis.id)
        || ["__proto__", "constructor", "prototype"].includes(axis.id) || ids.has(axis.id)
        || typeof axis.label !== "string" || typeof axis.negative !== "string" || typeof axis.positive !== "string"
        || !["x", "y", "z", "none"].includes(axis.placement)
        || !["content", "self-report"].includes(axis.evidence)) return null;
      ids.add(axis.id);
      axes.push({ id: axis.id, label: axis.label.slice(0, 24), negative: axis.negative.slice(0, 32),
        positive: axis.positive.slice(0, 32), placement: axis.placement, evidence: axis.evidence });
    }
    return { version: 1, axes, focus: {} };
  } catch { return null; }
}

export function savePerspectiveDraft(workspaceId: string, draft: ThinkingSpace | null): boolean {
  try {
    if (draft) localStorage.setItem(PERSPECTIVE_DRAFT_KEY_PREFIX + workspaceId, JSON.stringify({ ...draft, focus: {} }));
    else localStorage.removeItem(PERSPECTIVE_DRAFT_KEY_PREFIX + workspaceId);
    return true;
  } catch { return false; }
}
