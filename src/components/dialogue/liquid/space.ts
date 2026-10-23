import type { DialogueMetaballNode } from "../metaball/model";
import type { StagePoint } from "@/types/anicca";

export type SeedOrbit = { yaw: number; pitch: number };
export type SeedViewDirection = "front" | "back" | "left" | "right" | "top" | "bottom";
export const DEFAULT_SEED_ORBIT: SeedOrbit = { yaw: 0, pitch: 0 };
// Shader Park's camera sits at -2, in a scene scaled by 1.75.
export const SEED_CAMERA_DISTANCE = 2 / 1.75;
export const SEED_WORLD_CAMERA_DISTANCE = 2.4;
export const SEED_ORBIT_LIMIT = { yaw: Math.PI, pitch: Math.PI / 2 };
export const SEED_VIEWS: Record<SeedViewDirection, SeedOrbit> = {
  front: { yaw: 0, pitch: 0 }, back: { yaw: Math.PI, pitch: 0 },
  left: { yaw: -Math.PI / 2, pitch: 0 }, right: { yaw: Math.PI / 2, pitch: 0 },
  top: { yaw: 0, pitch: -Math.PI / 2 }, bottom: { yaw: 0, pitch: Math.PI / 2 }
};

const clamp = (n: number, limit: number) => Math.max(-limit, Math.min(limit, n));
export const wrapSeedYaw = (yaw: number) => ((yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

export function orbitSeedSpace(start: SeedOrbit, dx: number, dy: number): SeedOrbit {
  return { yaw: wrapSeedYaw(start.yaw + dx * .004),
    pitch: clamp(start.pitch + dy * .003, SEED_ORBIT_LIMIT.pitch) };
}

export function seedSpaceDepth(id: string): number {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return ((hash >>> 0) / 0xffffffff - .5) * .28;
}

function rotate([x, y, z]: readonly number[], orbit: SeedOrbit, inverse = false): [number, number, number] {
  const cy = Math.cos(orbit.yaw), sy = Math.sin(orbit.yaw);
  const cp = Math.cos(orbit.pitch), sp = Math.sin(orbit.pitch);
  if (inverse) {
    const ry = cp * y + sp * z, rz = -sp * y + cp * z;
    return [cy * x - sy * rz, ry, sy * x + cy * rz];
  }
  const rx = cy * x + sy * z, rz = -sy * x + cy * z;
  return [rx, cp * y - sp * rz, sp * y + cp * rz];
}

/** A real perspective projection shared by the implicit surface and its DOM target. */
export function projectSpatialSeed(node: DialogueMetaballNode, pivot: readonly [number, number], orbit: SeedOrbit): DialogueMetaballNode {
  const depth = node.spaceDepth ?? seedSpaceDepth(node.id), distance = SEED_WORLD_CAMERA_DISTANCE;
  if (!orbit.yaw && !orbit.pitch) return { ...node, depth: depth * SEED_CAMERA_DISTANCE / distance, spaceScale: 1 };
  const baseline = 1 + depth / distance;
  const [x, y, z] = rotate([(node.center[0] - pivot[0]) * baseline,
    (node.center[1] - pivot[1]) * baseline, depth], orbit);
  const perspective = distance / Math.max(.2, distance + z);
  return { ...node, center: [pivot[0] + x * perspective, pivot[1] + y * perspective],
    radius: node.radius * baseline * perspective, depth: z * SEED_CAMERA_DISTANCE / distance, spaceScale: baseline * perspective };
}

/** Intersect a screen ray with the seed's original depth plane, then undo its baseline perspective. */
export function unprojectSeedPoint(point: readonly [number, number], pivot: readonly [number, number], orbit: SeedOrbit, id: string): [number, number] {
  const distance = SEED_WORLD_CAMERA_DISTANCE, depth = seedSpaceDepth(id);
  const origin = rotate([0, 0, -distance], orbit, true);
  const direction = rotate([point[0] - pivot[0], point[1] - pivot[1], distance], orbit, true);
  const t = (depth - origin[2]) / direction[2];
  const baseline = 1 + depth / distance;
  return [pivot[0] + (origin[0] + direction[0] * t) / baseline,
    pivot[1] + (origin[1] + direction[1] * t) / baseline];
}

export function spatialStagePoint(point: StagePoint, id: string, orbit: SeedOrbit,
  viewport: { width: number; height: number }, renderHeight: number, inverse = false, sceneScale = 1) {
  if (!viewport.width || !viewport.height || (!orbit.yaw && !orbit.pitch && sceneScale === 1)) return point;
  const center: [number, number] = [(point.x / 100 - .5) * viewport.width / renderHeight,
    (.5 - point.y / 100) * viewport.height / renderHeight];
  const result = inverse ? unprojectSeedPoint(center, [0, 0], orbit, id)
    : fitSpatialSeed(projectSpatialSeed({ id, center, radius: 0, color: [0, 0, 0], emphasis: 1, spaceDepth: point.z }, [0, 0], orbit), [0, 0], sceneScale).center;
  return { x: (result[0] * renderHeight / viewport.width + .5) * 100,
    y: (.5 - result[1] * renderHeight / viewport.height) * 100 };
}

/** Camera-facing drag plane has no singularity at exact side/top views. */
export function dragSpatialStagePoint(screen: StagePoint, start: StagePoint, id: string, orbit: SeedOrbit,
  viewport: { width: number; height: number }, renderHeight: number, viewDepth?: number, sceneScale = 1): StagePoint {
  if (!viewport.width || !viewport.height || !renderHeight) return start;
  const distance = SEED_WORLD_CAMERA_DISTANCE, depth = start.z ?? seedSpaceDepth(id);
  const baseline = 1 + depth / distance;
  const origin: [number, number, number] = [(start.x / 100 - .5) * viewport.width / renderHeight * baseline,
    (.5 - start.y / 100) * viewport.height / renderHeight * baseline, depth];
  const plane = viewDepth ?? rotate(origin, orbit)[2];
  const perspective = 1 + plane / distance;
  const fittedScale = sceneScale * perspective / (1 + plane * sceneScale / distance);
  const world = rotate([(screen.x / 100 - .5) / fittedScale * viewport.width / renderHeight * perspective,
    (.5 - screen.y / 100) / fittedScale * viewport.height / renderHeight * perspective, plane], orbit, true);
  const restoredBaseline = 1 + world[2] / distance;
  return { x: (world[0] / restoredBaseline * renderHeight / viewport.width + .5) * 100,
    y: (.5 - world[1] / restoredBaseline * renderHeight / viewport.height) * 100, z: world[2] };
}

/** Release a meeting across the current view, including exact side/top views. */
export function separateSpatialSeeds(positions: Record<string, StagePoint>, ids: string[], orbit: SeedOrbit,
  viewport: { width: number; height: number }, renderHeight: number, sceneScale: number, compact: boolean) {
  const result = { ...positions };
  ids.forEach((id, index) => {
    if (!positions[id]) return;
    const screen = { x: index ? 72 : 28, y: compact ? (index ? 65 : 38) : 53 };
    result[id] = dragSpatialStagePoint(screen, positions[id], id, orbit, viewport, renderHeight, 0, sceneScale);
  });
  return result;
}

/** Uniform 3D scale is equivalent to moving the camera back; contact ratios stay invariant. */
export function fitSpatialSeed(node: DialogueMetaballNode, pivot: readonly [number, number], scale: number): DialogueMetaballNode {
  if (scale === 1) return node;
  const z = node.depth || 0, factor = scale * (1 + z / SEED_CAMERA_DISTANCE) / (1 + z * scale / SEED_CAMERA_DISTANCE);
  return { ...node, center: [pivot[0] + (node.center[0] - pivot[0]) * factor, pivot[1] + (node.center[1] - pivot[1]) * factor],
    radius: node.radius * factor, depth: z * scale, spaceScale: (node.spaceScale || 1) * factor };
}

export function fitSeedScene(nodes: DialogueMetaballNode[], pivot: readonly [number, number], viewport: { width: number; height: number }, renderHeight: number) {
  const x = Math.max(.03, (viewport.width / 2 - 16) / renderHeight), top = Math.max(.03, (viewport.height / 2 - 12) / renderHeight), bottom = Math.max(.03, (viewport.height / 2 - 46) / renderHeight);
  const fits = (scale: number) => nodes.every(node => { const fit = fitSpatialSeed(node, pivot, scale);
    const radius = fit.radius * 1.35;
    return Math.abs(fit.center[0] - pivot[0]) + radius <= x && fit.center[1] - pivot[1] + radius <= top && pivot[1] - fit.center[1] + radius <= bottom;
  });
  if (fits(1)) return 1;
  let low = .08, high = 1;
  for (let i = 0; i < 9; i++) { const middle = (low + high) / 2; if (fits(middle)) low = middle; else high = middle; }
  return low;
}

type SpatialFrame = { base: DialogueMetaballNode[]; rendered: DialogueMetaballNode[]; pivot: [number, number]; height: number; scale: number };
const spatialFrames = new WeakMap<HTMLElement, SpatialFrame>();
export function publishSpatialFrame(host: HTMLElement, frame: SpatialFrame) { spatialFrames.set(host, frame); }
export function readSpatialFrame(host: HTMLElement) { return spatialFrames.get(host); }
export function clearSpatialFrame(host: HTMLElement) { spatialFrames.delete(host); }

export function spatialPairMetrics(a: DialogueMetaballNode, b: DialogueMetaballNode) {
  const az = a.depth || 0, bz = b.depth || 0;
  const af = 1 + az / SEED_CAMERA_DISTANCE, bf = 1 + bz / SEED_CAMERA_DISTANCE;
  return { distance: Math.hypot(a.center[0] * af - b.center[0] * bf, a.center[1] * af - b.center[1] * bf, az - bz),
    radii: a.radius * af + b.radius * bf, depthGap: Math.abs(az - bz) };
}
export function canCaptureSpatialPair(a: DialogueMetaballNode, b: DialogueMetaballNode) {
  const { distance, radii, depthGap } = spatialPairMetrics(a, b);
  return distance <= radii * 1.65 && depthGap <= radii * 1.55;
}
export function spatialPairInContact(a: DialogueMetaballNode, b: DialogueMetaballNode, retained = false) {
  const { distance, radii } = spatialPairMetrics(a, b);
  return distance <= radii * (retained ? 1.16 : 1.08);
}

export function readSeedOrbit(host: HTMLElement): SeedOrbit {
  return { yaw: wrapSeedYaw(Number(host.dataset.spaceYaw) || 0),
    pitch: clamp(Number(host.dataset.spacePitch) || 0, SEED_ORBIT_LIMIT.pitch) };
}
