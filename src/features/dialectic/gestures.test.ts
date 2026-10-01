import { findSynthesisGestureCandidate } from "./gestures";
import type { DialogueStageNode, DialogueSynthesisAction } from "./viewModel";

const action: DialogueSynthesisAction = {
  key: "root:t:a",
  lineageParentId: "root",
  thesisId: "thesis",
  antithesisId: "antithesis",
  synthesisId: null,
  label: "继续 / 暂停",
  available: true
};

function node(id: string, branchType: "正" | "反"): DialogueStageNode {
  return {
    id,
    label: id,
    kind: "assistant",
    branchType,
    relation: "child",
    seedX: branchType === "正" ? 30 : 70,
    seedY: 60
  };
}

describe("synthesis gestures", () => {
  const nodes = [
    { node: node("thesis", "正"), position: { x: 30, y: 60 } },
    { node: node("antithesis", "反"), position: { x: 70, y: 60 } }
  ];

  it("proposes only the canonical same-lineage pair inside the threshold", () => {
    expect(findSynthesisGestureCandidate({
      draggedNodeId: "thesis",
      draggedPosition: { x: 58, y: 60 },
      nodes,
      action,
      viewport: { width: 800, height: 600 }
    })).toEqual(expect.objectContaining({ counterpartNodeId: "antithesis" }));
  });

  it("does not propose unrelated, distant, or already synthesized nodes", () => {
    expect(findSynthesisGestureCandidate({
      draggedNodeId: "other",
      draggedPosition: { x: 70, y: 60 },
      nodes,
      action,
      viewport: { width: 800, height: 600 }
    })).toBeNull();
    expect(findSynthesisGestureCandidate({
      draggedNodeId: "thesis",
      draggedPosition: { x: 30, y: 60 },
      nodes,
      action,
      viewport: { width: 800, height: 600 }
    })).toBeNull();
    expect(findSynthesisGestureCandidate({
      draggedNodeId: "thesis",
      draggedPosition: { x: 58, y: 60 },
      nodes,
      action: { ...action, available: false },
      viewport: { width: 800, height: 600 }
    })).toBeNull();
  });
});
