import type { DialogueSynthesisAction, DialogueStageNode } from "@/features/dialectic/viewModel";
import type { StagePoint } from "@/types/anicca";
import { liquidProximity } from "./liquidInteraction";

export type PositionedDialogueNode = {
  node: DialogueStageNode;
  position: StagePoint;
};

export type SynthesisGestureCandidate = {
  action: DialogueSynthesisAction;
  draggedNodeId: string;
  counterpartNodeId: string;
  distancePx: number;
  surfaceGap: number;
};

export function findSynthesisGestureCandidate(input: {
  draggedNodeId: string;
  draggedPosition: StagePoint;
  nodes: PositionedDialogueNode[];
  action: DialogueSynthesisAction | null;
  viewport: { width: number; height: number };
  thresholdPx?: number;
  radii?: Readonly<Record<string, number>>;
  phase?: "approach" | "contact";
  retainedCounterpartId?: string | null;
  resolveAction?: (left: string, right: string) => DialogueSynthesisAction | null;
  isEligible?: (counterpartId: string) => boolean;
}): SynthesisGestureCandidate | null {
  if (input.resolveAction) {
    return input.nodes.flatMap(({ node }) => {
      const action = input.resolveAction!(input.draggedNodeId, node.id);
      const candidate = action ? findSynthesisGestureCandidate({ ...input, action, resolveAction: undefined }) : null;
      return candidate ? [candidate] : [];
    }).sort((left, right) => {
      if (left.counterpartNodeId === input.retainedCounterpartId) return -1;
      if (right.counterpartNodeId === input.retainedCounterpartId) return 1;
      return left.surfaceGap - right.surfaceGap || left.distancePx - right.distancePx;
    })[0] || null;
  }
  const { action } = input;
  if (!action?.available || input.viewport.width <= 0 || input.viewport.height <= 0) {
    return null;
  }

  const pair = action.sourceInstanceIds || [action.thesisId, action.antithesisId];
  if (!pair.includes(input.draggedNodeId)) {
    return null;
  }

  const counterpartNodeId =
    input.draggedNodeId === pair[0] ? pair[1] : pair[0];
  if (input.isEligible && !input.isEligible(counterpartNodeId)) return null;
  const counterpart = input.nodes.find(({ node }) => node.id === counterpartNodeId);
  if (!counterpart) {
    return null;
  }

  const distancePx = Math.hypot(
    ((input.draggedPosition.x - counterpart.position.x) / 100) * input.viewport.width,
    ((input.draggedPosition.y - counterpart.position.y) / 100) * input.viewport.height
  );
  const fallbackRadius = Math.min(input.viewport.width, input.viewport.height) * .1;
  const proximity = liquidProximity(distancePx,
    input.radii?.[input.draggedNodeId] ?? fallbackRadius,
    input.radii?.[counterpartNodeId] ?? fallbackRadius,
    input.retainedCounterpartId === counterpartNodeId);
  if (input.thresholdPx !== undefined ? distancePx > input.thresholdPx
    : input.phase === "approach" ? proximity.strength <= 0 : !proximity.contact) {
    return null;
  }

  return {
    action,
    draggedNodeId: input.draggedNodeId,
    counterpartNodeId,
    distancePx,
    surfaceGap: proximity.gap
  };
}
