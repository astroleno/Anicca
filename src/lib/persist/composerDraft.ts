import type { Graph } from "@/types/anicca";
import { readInquiryTarget, type InquiryTarget } from "@/features/dialectic/inquiry";

export const COMPOSER_DRAFT_KEY_PREFIX = "anicca_composer_draft_v1:";
export type ComposerDraft = { text: string; targetId: string | null; inquiry?: InquiryTarget; connectionId?: string };

export function loadComposerDraft(workspaceId: string, graph: Graph): ComposerDraft | null {
  try {
    const raw = JSON.parse(localStorage.getItem(COMPOSER_DRAFT_KEY_PREFIX + workspaceId) || "null");
    if (!raw || raw.version !== 1 || typeof raw.text !== "string" || raw.text.length > 2000) return null;
    const inquiry = readInquiryTarget(raw.inquiry, graph);
    const connection = typeof raw.connectionId === "string" ? graph.deferredSyntheses?.[raw.connectionId] : undefined;
    return { text: raw.text, targetId: inquiry?.sourceNodeId || (typeof raw.targetId === "string" && graph.nodes[raw.targetId] ? raw.targetId : null),
      ...(inquiry ? { inquiry } : {}),
      ...(connection && !connection.resolvedNodeId && connection.sourceNodeIds.every(id => graph.nodes[id]) ? { connectionId: connection.id } : {}) };
  } catch { return null; }
}

/** A small journal independent of graph snapshots, so typing cost stays bounded. */
export function saveComposerDraft(workspaceId: string, draft: ComposerDraft): boolean {
  if (!workspaceId) return false;
  try {
    const key = COMPOSER_DRAFT_KEY_PREFIX + workspaceId;
    if (!draft.text && !draft.inquiry && !draft.connectionId) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify({ version: 1, ...draft, text: draft.text.slice(0, 2000) }));
    return true;
  } catch { return false; }
}
