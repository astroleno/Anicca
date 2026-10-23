import type { DialogueMetaballNode } from "../metaball/model";
import { liquidProximity } from "@/features/dialectic/liquidInteraction";

// Keep the smooth-min denominator finite while leaving unrelated seeds unjoined.
export const RESTING_LIQUID_BLEND = 0.0001;
export const DRAGGED_LIQUID_BLEND = 0.5;

/** Strengthen only the dragged seed and its nearest neighbour, relative to their size. */
export function liquidBlendTargets(nodes: DialogueMetaballNode[], draggedId?: string | null, partnerId?: string | null): number[] {
  const targets = nodes.map(() => RESTING_LIQUID_BLEND);
  const sourceIndex = nodes.findIndex(node => node.id === draggedId);
  if (sourceIndex < 0) return targets;

  const source = nodes[sourceIndex];
  let nearestIndex = -1;
  let nearestGap = Infinity;
  nodes.forEach((node, index) => {
    if (index === sourceIndex) return;
    if (partnerId !== undefined && node.id !== partnerId) return;
    const radiusSum = Math.max(0.001, source.radius + node.radius);
    const gap = (Math.hypot(source.center[0] - node.center[0], source.center[1] - node.center[1]) - radiusSum) / radiusSum;
    if (gap < nearestGap) { nearestGap = gap; nearestIndex = index; }
  });
  if (nearestIndex < 0) return targets;

  const partner = nodes[nearestIndex];
  const { strength: eased } = liquidProximity(Math.hypot(source.center[0]-partner.center[0],source.center[1]-partner.center[1]),source.radius,partner.radius);
  const blend = RESTING_LIQUID_BLEND + (DRAGGED_LIQUID_BLEND - RESTING_LIQUID_BLEND) * eased;
  targets[sourceIndex] = blend;
  targets[nearestIndex] = blend;
  return targets;
}
