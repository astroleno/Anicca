import type { Graph, SeedInstances } from "@/types/anicca";
import { seedConceptId } from "@/features/dialectic/seedInstances";

export const READING_STATE_KEY_PREFIX = "anicca_reading_v1:";
export type ReadingPosition = { scrollTop: number; anchor?: { offset: number; top: number } };
export type WorkspaceReadingState = { activeId: string | null; positions: Record<string, ReadingPosition> };

export function loadReadingState(workspaceId: string, graph: Graph, instances: SeedInstances): WorkspaceReadingState {
  const empty = { activeId: null, positions: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(READING_STATE_KEY_PREFIX + workspaceId) || "null");
    if (raw?.version !== 1 || !raw.positions || typeof raw.positions !== "object" || Array.isArray(raw.positions)) return empty;
    const positions: Record<string, ReadingPosition> = {};
    for (const [id, value] of Object.entries(raw.positions).slice(-1000)) {
      const position = value as Partial<ReadingPosition> | null;
      if (!Object.prototype.hasOwnProperty.call(graph.nodes, id) || !position || typeof position.scrollTop !== "number" || !Number.isFinite(position.scrollTop)) continue;
      const anchor = position.anchor;
      positions[id] = { scrollTop: Math.max(0, Math.min(10_000_000, position.scrollTop)),
        ...(anchor && Number.isInteger(anchor.offset) && anchor.offset >= 0 && anchor.offset < (graph.nodes[id].text?.length || 0)
          && Number.isFinite(anchor.top) && Math.abs(anchor.top) <= 10_000 ? { anchor } : {}) };
    }
    return { activeId: typeof raw.activeId === "string" && seedConceptId(graph, instances, raw.activeId) ? raw.activeId : null, positions };
  } catch { return empty; }
}

export function saveReadingState(workspaceId: string, state: WorkspaceReadingState): boolean {
  try {
    localStorage.setItem(READING_STATE_KEY_PREFIX + workspaceId, JSON.stringify({ version: 1, ...state }));
    return true;
  } catch { return false; }
}
