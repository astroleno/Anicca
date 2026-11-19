import type { DialogueStageNode } from "@/features/dialectic/viewModel";

export type ReadingOrbitRole = "main" | "satellite" | "rest";
export type ReadingOrbitPlace = { role: ReadingOrbitRole; x?: number; y?: number };
/** Wide stages keep satellites in the gutters beside the text; narrow ones gather them above it. */
export type ReadingOrbitLayout = "sides" | "row";

const MAIN = { sides: { x: 50, y: 46 }, row: { x: 50, y: 54 } } as const;
const SIDE_X = { left: 18, right: 82 } as const;
const SIDE_Y = [28, 50, 72] as const;
const ROW_Y = 14;
const ROW_SPACING = 21;
const ROW_LIMIT = 4;
/** Where a thought comes from reads before where it went. */
const RANK: Record<DialogueStageNode["relation"], number> = { source: 0, ancestor: 1, focus: 2, child: 3 };

/** 正 leans left and 反 leans right, so opposites stay opposite while the reader moves between them. */
function lean(node: DialogueStageNode) {
  return node.branchType === "正" ? -1 : node.branchType === "反" ? 1 : 0;
}

/**
 * While reading, one seed is the main drop behind the text and its nearest relations orbit it as
 * small satellites. Choosing a satellite makes it the main drop; the liquid carries the exchange.
 */
export function arrangeReadingOrbit(nodes: readonly DialogueStageNode[], focusId: string | null | undefined,
  layout: ReadingOrbitLayout): Record<string, ReadingOrbitPlace> | null {
  const main = nodes.find(node => node.id === focusId) || nodes.find(node => node.relation === "focus");
  if (!main) return null;
  const places: Record<string, ReadingOrbitPlace> = { [main.id]: { role: "main", ...MAIN[layout] } };
  const others = nodes.filter(node => node !== main)
    .map((node, index) => ({ node, index }))
    .sort((a, b) => RANK[a.node.relation] - RANK[b.node.relation] || a.index - b.index)
    .map(({ node }) => node);

  if (layout === "row") {
    const chosen = others.slice(0, ROW_LIMIT)
      .map((node, index) => ({ node, index }))
      .sort((a, b) => lean(a.node) - lean(b.node) || a.index - b.index);
    chosen.forEach(({ node }, index) => {
      places[node.id] = { role: "satellite", x: 50 + (index - (chosen.length - 1) / 2) * ROW_SPACING, y: ROW_Y };
    });
  } else {
    const sides = { left: [] as DialogueStageNode[], right: [] as DialogueStageNode[] };
    // Opposites claim their sides first; the rest balance the gutters.
    for (const node of [...others.filter(node => lean(node)), ...others.filter(node => !lean(node))]) {
      const preferred = lean(node) < 0 ? "left" : lean(node) > 0 ? "right"
        : sides.left.length <= sides.right.length ? "left" : "right";
      const side = sides[preferred].length < SIDE_Y.length ? preferred : preferred === "left" ? "right" : "left";
      if (sides[side].length < SIDE_Y.length) sides[side].push(node);
    }
    for (const side of ["left", "right"] as const) {
      sides[side].sort((a, b) => others.indexOf(a) - others.indexOf(b))
        .forEach((node, index) => { places[node.id] = { role: "satellite", x: SIDE_X[side], y: SIDE_Y[index] }; });
    }
  }
  for (const node of others) places[node.id] ||= { role: "rest" };
  return places;
}
