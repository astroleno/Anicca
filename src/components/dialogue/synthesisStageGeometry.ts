import type { StagePoint } from "@/types/anicca";

const COMPACT_STAGE_MAX_WIDTH = 640;
export const MIN_SYNTHESIS_TARGET = 44;

export function isCompactStageWidth(width: number) {
  return width > 0 && width <= COMPACT_STAGE_MAX_WIDTH;
}

const DIAMETER_RATIO = { focus: 1, source: .7, distant: .45 };

export function synthesisStageGeometry(
  rect: { width: number; height: number; insets: { top: number; bottom: number } },
  ids: readonly string[], focusId: string, sourceIds: readonly string[]
) {
  const { width, height, insets } = rect;
  const top = Math.min(insets.top, height * .3);
  const bottom = Math.min(insets.bottom, height * .3);
  const availableHeight = Math.max(1, height - top - bottom);
  const diameter = Math.min(216, width * .36, availableHeight * .51,
    Math.max(48, .77 * Math.sqrt(width * availableHeight / ids.length)));
  const focusY = Math.min(availableHeight * .68,
    Math.max(availableHeight * .52, availableHeight - diameter / 2 - 47));
  const distantSlots = [[16, .11], [84, .11], [50, .10], [14, .66], [86, .66]];
  const directSources = sourceIds.slice(0, 2);
  let distant = 0;
  return Object.fromEntries(ids.map(id => {
    const sourceIndex = directSources.indexOf(id);
    const tier = id === focusId ? "focus" : sourceIndex >= 0 ? "source" : "distant";
    const [x, y] = tier === "focus" ? [50, focusY / availableHeight] :
      tier === "source" ? [sourceIndex === 0 ? 27 : 73, .35] : distantSlots[distant++] || [50, .10];
    const center: StagePoint = { x, y: (top + y * availableHeight) / height * 100, z: 0 };
    return [id, { tier, center, diameter: diameter * DIAMETER_RATIO[tier] }];
  }));
}
