import type { DialogueStageNode } from "@/features/dialectic/viewModel";

const COMPACT_STAGE_MAX_WIDTH = 640;
export const MIN_SYNTHESIS_TARGET = 44;

export function isCompactStageWidth(width: number) {
  return width > 0 && width <= COMPACT_STAGE_MAX_WIDTH;
}

const DIAMETER_RATIO = { focus: 1, source: .7, distant: .45 };

export function synthesisStageSeedSize(role: DialogueStageNode["sourceRole"], width: number, count: number) {
  const tier = role === "result" ? "focus" : role === "source" ? "source" : "distant";
  const dense = count > 4;
  const focusDiameter = isCompactStageWidth(width) ? (dense ? 84 : 116) : (dense ? 148 : 216);
  return { tier, diameter: focusDiameter * DIAMETER_RATIO[tier] };
}
