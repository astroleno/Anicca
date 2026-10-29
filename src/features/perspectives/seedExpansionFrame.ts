import type { AniccaNode } from "@/types/anicca";
import { normalizeThinkingSpace, type ThinkingSpace } from "./model";
import { normalizePolarityOrigin } from "./polarity";

/** The saved generation entrance is distinct from model-scored content coordinates. */
export function resolveSeedExpansionFrame(node: AniccaNode | null | undefined, current: ThinkingSpace, useCurrent = false) {
  const captured = normalizePolarityOrigin(node?.meta?.polarity)?.frame || node?.meta?.fissionFrame;
  const capturedFrame = captured ? normalizeThinkingSpace(captured) : null;
  const currentFrame = normalizeThinkingSpace(current);
  const differs = Boolean(capturedFrame && JSON.stringify(capturedFrame) !== JSON.stringify(currentFrame));
  return {
    frame: capturedFrame && !useCurrent ? capturedFrame : currentFrame,
    capturedFrame,
    differs,
    source: capturedFrame && !useCurrent ? "seed" as const : "current" as const
  };
}
