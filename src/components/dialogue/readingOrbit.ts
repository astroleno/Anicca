import type { DialogueStageNode } from "@/features/dialectic/viewModel";
import type { ThinkingSpace } from "@/features/perspectives/model";
import { isChosenSpace, isJohari, JOHARI_REGIONS, lean as leanToward, placed, type Sign } from "./thinkingField";

export type ReadingOrbitRole = "main" | "satellite" | "rest";
export type ReadingOrbitPlace = { role: ReadingOrbitRole; x?: number; y?: number };
/** Wide stages keep satellites in the gutters beside the text; narrow ones gather them above it. */
export type ReadingOrbitLayout = "sides" | "row";
export type ReadingInvitation = { label: string; self: Sign; others: Sign; x: number; y: number };

type Side = "left" | "right";

const MAIN = { sides: { x: 50, y: 46 }, row: { x: 50, y: 54 } } as const;
const SIDE_X: Record<Side, number> = { left: 18, right: 82 };
const SIDE_Y = [28, 50, 72] as const;
const ROW_Y = 14;
const ROW_SPACING = 21;
const ROW_LIMIT = 4;
/** Unexplored Johari regions wait in the stage corners, clear of the satellites and the text. */
const INVITATION = { x: { left: 20, right: 80 }, y: { top: 14, bottom: 84 } } as const;
/** Where a thought comes from reads before where it went. */
const RANK: Record<DialogueStageNode["relation"], number> = { source: 0, ancestor: 1, focus: 2, child: 3 };

/** 正 leans left and 反 leans right, so opposites stay opposite while the reader moves between them. */
function dialecticLean(node: DialogueStageNode) {
  return node.branchType === "正" ? -1 : node.branchType === "反" ? 1 : 0;
}

/** In a chosen thinking space a seed sits on the side and height its own direction points to. */
function directedSpace(space: ThinkingSpace | null | undefined) {
  return space && isChosenSpace(space) && (placed(space, "x") || placed(space, "y")) ? space : null;
}

function placeInGutters(others: readonly DialogueStageNode[], directed: boolean) {
  const slots: Record<Side, (DialogueStageNode | null)[]> = { left: [null, null, null], right: [null, null, null] };
  const wants = others.map(node => {
    const coords = directed ? node.spatialCoordinates : undefined;
    const x = coords ? leanToward(coords.x) : dialecticLean(node);
    const y = coords ? leanToward(coords.y) : 0;
    return { node, side: x < 0 ? "left" as const : x > 0 ? "right" as const : undefined,
      row: coords ? (y > 0 ? 0 : y < 0 ? 2 : 1) : undefined };
  });
  const filled = (side: Side) => slots[side].filter(Boolean).length;
  // Directions claim their sides first; the rest balance the gutters.
  for (const want of [...wants.filter(want => want.side), ...wants.filter(want => !want.side)]) {
    const first: Side = want.side ?? (filled("left") <= filled("right") ? "left" : "right");
    for (const side of [first, first === "left" ? "right" : "left"] as const) {
      const rows = [0, 1, 2].sort((a, b) => want.row === undefined ? a - b : Math.abs(a - want.row) - Math.abs(b - want.row));
      const row = rows.find(index => !slots[side][index]);
      if (row !== undefined) { slots[side][row] = want.node; break; }
    }
  }
  const places: Record<string, ReadingOrbitPlace> = {};
  for (const side of ["left", "right"] as const) {
    // Without a chosen direction height means lineage: sources above, continuations below.
    const column = directed ? slots[side] : slots[side].filter(Boolean).sort((a, b) => others.indexOf(a!) - others.indexOf(b!));
    column.forEach((node, index) => { if (node) places[node.id] = { role: "satellite", x: SIDE_X[side], y: SIDE_Y[index] }; });
  }
  return places;
}

/**
 * While reading, one seed is the main drop behind the text and its nearest relations orbit it as
 * small satellites. Choosing a satellite makes it the main drop; the liquid carries the exchange.
 * When the reader has chosen a thinking space, satellites sit where their own direction points.
 */
export function arrangeReadingOrbit(nodes: readonly DialogueStageNode[], focusId: string | null | undefined,
  layout: ReadingOrbitLayout, space?: ThinkingSpace | null): Record<string, ReadingOrbitPlace> | null {
  const main = nodes.find(node => node.id === focusId) || nodes.find(node => node.relation === "focus");
  if (!main) return null;
  const directed = Boolean(directedSpace(space));
  const places: Record<string, ReadingOrbitPlace> = { [main.id]: { role: "main", ...MAIN[layout] } };
  const others = nodes.filter(node => node !== main)
    .map((node, index) => ({ node, index }))
    .sort((a, b) => RANK[a.node.relation] - RANK[b.node.relation] || a.index - b.index)
    .map(({ node }) => node);

  if (layout === "row") {
    const across = (node: DialogueStageNode) => directed && node.spatialCoordinates?.x !== undefined ? node.spatialCoordinates.x : dialecticLean(node);
    const chosen = others.slice(0, ROW_LIMIT)
      .map((node, index) => ({ node, index }))
      .sort((a, b) => across(a.node) - across(b.node) || a.index - b.index);
    chosen.forEach(({ node }, index) => {
      places[node.id] = { role: "satellite", x: 50 + (index - (chosen.length - 1) / 2) * ROW_SPACING, y: ROW_Y };
    });
  } else Object.assign(places, placeInGutters(others, directed));
  for (const node of others) places[node.id] ||= { role: "rest" };
  return places;
}

/**
 * Johari regions no thought has leaned into yet, placed in the stage corner they point to, so the
 * reader can aim the next thought there without leaving the passage.
 */
export function readingInvitations(space: ThinkingSpace | null | undefined, nodes: readonly DialogueStageNode[],
  layout: ReadingOrbitLayout): ReadingInvitation[] {
  if (layout !== "sides" || !space || !isJohari(space)) return [];
  const directed = nodes.filter(node => node.spatialCoordinates);
  if (!directed.length) return [];
  return JOHARI_REGIONS.filter(region => !directed.some(node =>
    leanToward(node.spatialCoordinates?.x) === region.self && leanToward(node.spatialCoordinates?.y) === region.others))
    .map(region => ({ ...region,
      x: region.self < 0 ? INVITATION.x.left : INVITATION.x.right,
      y: region.others > 0 ? INVITATION.y.top : INVITATION.y.bottom }));
}
