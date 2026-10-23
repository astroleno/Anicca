import { parseStrictJsonObject } from "@/lib/openai/parseStrictJsonObject";
import { annotatePerspective, normalizeAxisSuggestions, type ThinkingSpace } from "./model";

/** Only the two optional sidecars are removed; unknown content keys stay strict. */
export function perspectiveEnvelope(output: string, space?: ThinkingSpace) {
  const parsed = space ? parseStrictJsonObject(output) : null;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { content: output, spatial: {} as Record<string, unknown>, suggestions: [] };
  const { spatial, suggestedAxes, ...content } = parsed as Record<string, unknown>;
  return { content: JSON.stringify(content), spatial: spatial && typeof spatial === "object" && !Array.isArray(spatial) ? spatial as Record<string, unknown> : {},
    suggestions: normalizeAxisSuggestions(suggestedAxes, space?.axes) };
}

export function responsePerspective(space: ThinkingSpace | undefined, coordinates?: unknown) {
  return space?.axes.length ? { perspective: annotatePerspective(space, coordinates) } : {};
}
