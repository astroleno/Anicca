import type { ThinkingSpace } from "@/features/perspectives/model";
import { defaultThinkingSpace } from "@/features/perspectives/model";

export type Sign = 1 | -1;

/** Johari regions in the panel's terms: x = what I know, y = what others know. */
export const JOHARI_REGIONS: ReadonlyArray<{ label: string; self: Sign; others: Sign }> = [
  { label: "盲区", self: -1, others: 1 },
  { label: "公开区", self: 1, others: 1 },
  { label: "未知区", self: -1, others: -1 },
  { label: "隐藏区", self: 1, others: -1 }
];
const DEFAULT_AXIS_IDS = new Set(defaultThinkingSpace().axes.map(axis => axis.id));
/** A seed counts as leaning toward a pole the same way placement does. */
const LEANS = .4;

export function placed(space: ThinkingSpace, placement: "x" | "y") {
  return space.axes.find(axis => axis.placement === placement);
}

export function lean(value: number | undefined): Sign | 0 {
  return value === undefined || Math.abs(value) < LEANS ? 0 : value > 0 ? 1 : -1;
}

export function isJohari(space: ThinkingSpace) {
  return placed(space, "x")?.id === "johari-self" && placed(space, "y")?.id === "johari-others";
}

/** A space the reader chose (Johari or their own axes), as opposed to the built-in directions. */
export function isChosenSpace(space: ThinkingSpace) {
  return space.axes.some(axis => !DEFAULT_AXIS_IDS.has(axis.id)) || Object.keys(space.focus).length > 0;
}

