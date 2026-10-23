import { annotatePerspective, normalizeThinkingSpace, type SeedPerspective, type ThinkingAxis, type ThinkingSpace } from "./model";

export type PolarityOrigin = {
  groupId: string;
  axisId: string;
  pole: -1 | 1;
  frame: ThinkingSpace;
};

export function polarityFrame(space: ThinkingSpace, axisId: string, pole: -1 | 1): ThinkingSpace {
  const frame = normalizeThinkingSpace(space);
  if (!frame.axes.some(axis => axis.id === axisId)) throw new Error("polarity_axis_missing");
  return { ...frame, focus: { ...frame.focus, [axisId]: pole } };
}

/** A pole is an explicitly requested lens, not a model's confidence or a thesis stance. */
export function polarityPerspective(space: ThinkingSpace, axisId: string, pole: -1 | 1, coordinates?: unknown): SeedPerspective {
  const annotation = annotatePerspective(polarityFrame(space, axisId, pole), coordinates);
  return { axes: annotation.axes.map(axis => axis.id === axisId
    ? { ...axis, value: pole, selected: pole, source: "viewpoint" as const } : axis) };
}

export function normalizePolarityOrigin(value: unknown): PolarityOrigin | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  if (typeof input.groupId !== "string" || !input.groupId.trim() || input.groupId.length > 160 ||
    typeof input.axisId !== "string" || (input.pole !== -1 && input.pole !== 1) ||
    !input.frame || typeof input.frame !== "object" || !Array.isArray((input.frame as ThinkingSpace).axes)) return undefined;
  const frame = normalizeThinkingSpace(input.frame);
  if (!frame.axes.some(axis => axis.id === input.axisId)) return undefined;
  return { groupId: input.groupId, axisId: input.axisId, pole: input.pole,
    frame: polarityFrame(frame, input.axisId, input.pole) };
}

export function polarityAxis(origin: PolarityOrigin): ThinkingAxis {
  return origin.frame.axes.find(axis => axis.id === origin.axisId)!;
}

export function polarityLabel(value: unknown): string {
  const origin = normalizePolarityOrigin(value);
  if (!origin) return "";
  const axis = polarityAxis(origin);
  return origin.pole < 0 ? axis.negative : axis.positive;
}
