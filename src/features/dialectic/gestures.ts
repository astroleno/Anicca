import type { DialogueSynthesisAction, DialogueStageNode } from "@/features/dialectic/viewModel";
import type { StagePoint } from "@/types/anicca";

export type PositionedDialogueNode = {
  node: DialogueStageNode;
  position: StagePoint;
};

export type SynthesisGestureCandidate = {
  action: DialogueSynthesisAction;
  draggedNodeId: string;
  counterpartNodeId: string;
  distancePx: number;
};

export function findSynthesisGestureCandidate(input: {
  draggedNodeId: string;
  draggedPosition: StagePoint;
  nodes: PositionedDialogueNode[];
  action: DialogueSynthesisAction | null;
  viewport: { width: number; height: number };
  thresholdPx?: number;
  resolveAction?: (left: string, right: string) => DialogueSynthesisAction | null;
}): SynthesisGestureCandidate | null {
  if (input.resolveAction) {
    return input.nodes.flatMap(({ node }) => {
      const action = input.resolveAction!(input.draggedNodeId, node.id);
      const candidate = action ? findSynthesisGestureCandidate({ ...input, action, resolveAction: undefined }) : null;
      return candidate ? [candidate] : [];
    }).sort((left, right) => left.distancePx - right.distancePx)[0] || null;
  }
  const { action } = input;
  if (!action?.available || input.viewport.width <= 0 || input.viewport.height <= 0) {
    return null;
  }

  const pair = [action.thesisId, action.antithesisId];
  if (!pair.includes(input.draggedNodeId)) {
    return null;
  }

  const counterpartNodeId =
    input.draggedNodeId === action.thesisId ? action.antithesisId : action.thesisId;
  const counterpart = input.nodes.find(({ node }) => node.id === counterpartNodeId);
  if (!counterpart) {
    return null;
  }

  const distancePx = Math.hypot(
    ((input.draggedPosition.x - counterpart.position.x) / 100) * input.viewport.width,
    ((input.draggedPosition.y - counterpart.position.y) / 100) * input.viewport.height
  );
  const thresholdPx = input.thresholdPx ?? Math.min(176, Math.max(112, input.viewport.width * 0.15));
  if (distancePx > thresholdPx) {
    return null;
  }

  return {
    action,
    draggedNodeId: input.draggedNodeId,
    counterpartNodeId,
    distancePx
  };
}
