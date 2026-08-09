export const MAX_DIALOGUE_METABALLS = 8;

export type MetaballRole =
  | "user"
  | "thesis"
  | "antithesis"
  | "synthesis"
  | "growth"
  | "neutral"
  | "pending";

export type MetaballRelation = "focus" | "source" | "child" | "ancestor" | "decorative";

export type MetaballHostRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type MetaballSurfaceRect = {
  id: string;
  role: MetaballRole;
  relation: MetaballRelation;
  left: number;
  top: number;
  width: number;
  height: number;
};

export type DialogueMetaballNode = {
  id: string;
  center: [number, number];
  radius: number;
  color: [number, number, number];
  emphasis: number;
};

export type PackedMetaballUniforms = {
  count: number;
  centers: number[];
  radii: number[];
  colors: number[];
  emphasis: number[];
};

const RELATION_PRIORITY: Record<MetaballRelation, number> = {
  focus: 0,
  source: 1,
  child: 2,
  ancestor: 3,
  decorative: 4
};

const RELATION_EMPHASIS: Record<MetaballRelation, number> = {
  focus: 1,
  source: 0.9,
  child: 0.94,
  ancestor: 0.76,
  decorative: 0.68
};

const ROLE_COLORS: Record<MetaballRole, [number, number, number]> = {
  user: [0.82, 0.86, 0.9],
  thesis: [0.18, 0.82, 0.62],
  antithesis: [0.93, 0.38, 0.55],
  synthesis: [0.94, 0.72, 0.34],
  growth: [0.48, 0.66, 0.94],
  neutral: [0.7, 0.73, 0.78],
  pending: [0.7, 0.73, 0.78]
};

function rankSurface(surface: MetaballSurfaceRect, index: number) {
  return {
    surface,
    index,
    relationPriority: RELATION_PRIORITY[surface.relation],
    pendingPenalty: surface.role === "pending" ? 1 : 0
  };
}

export function projectMetaballSurfaces(
  host: MetaballHostRect,
  surfaces: MetaballSurfaceRect[]
): DialogueMetaballNode[] {
  if (host.height <= 0) return [];

  const hostCenterX = host.left + host.width / 2;
  const hostCenterY = host.top + host.height / 2;

  return surfaces
    .filter((surface) => surface.width > 0 && surface.height > 0)
    .map(rankSurface)
    .sort(
      (a, b) =>
        a.relationPriority - b.relationPriority ||
        a.pendingPenalty - b.pendingPenalty ||
        a.index - b.index
    )
    .slice(0, MAX_DIALOGUE_METABALLS)
    .map(({ surface }) => {
      const surfaceCenterX = surface.left + surface.width / 2;
      const surfaceCenterY = surface.top + surface.height / 2;

      return {
        id: surface.id,
        center: [
          (surfaceCenterX - hostCenterX) / host.height,
          (hostCenterY - surfaceCenterY) / host.height
        ],
        radius: Math.max(surface.width, surface.height) / 2 / host.height,
        color: [...ROLE_COLORS[surface.role]],
        emphasis: RELATION_EMPHASIS[surface.relation]
      };
    });
}

export function computeFusedPairs(nodes: DialogueMetaballNode[], smoothness: number): string[] {
  const pairs: string[] = [];

  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const left = nodes[leftIndex];
      const right = nodes[rightIndex];
      const distance = Math.hypot(left.center[0] - right.center[0], left.center[1] - right.center[1]);

      if (distance <= left.radius + right.radius + smoothness * 2) {
        pairs.push(`${left.id}::${right.id}`);
      }
    }
  }

  return pairs;
}

export function packMetaballUniforms(nodes: DialogueMetaballNode[]): PackedMetaballUniforms {
  const centers = Array(MAX_DIALOGUE_METABALLS * 2).fill(0) as number[];
  const radii = Array(MAX_DIALOGUE_METABALLS).fill(0) as number[];
  const colors = Array(MAX_DIALOGUE_METABALLS * 3).fill(0) as number[];
  const emphasis = Array(MAX_DIALOGUE_METABALLS).fill(0) as number[];
  const count = Math.min(nodes.length, MAX_DIALOGUE_METABALLS);

  for (let index = 0; index < count; index += 1) {
    const node = nodes[index];
    centers[index * 2] = node.center[0];
    centers[index * 2 + 1] = node.center[1];
    radii[index] = node.radius;
    colors[index * 3] = node.color[0];
    colors[index * 3 + 1] = node.color[1];
    colors[index * 3 + 2] = node.color[2];
    emphasis[index] = node.emphasis;
  }

  return { count, centers, radii, colors, emphasis };
}
