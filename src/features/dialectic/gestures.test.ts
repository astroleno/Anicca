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

  it("uses the same measured surfaces for approach, contact, and retained release",()=>{
    const input={draggedNodeId:"thesis",draggedPosition:{x:55,y:60},nodes,action,
      viewport:{width:800,height:600},radii:{thesis:50,antithesis:50}};
    expect(findSynthesisGestureCandidate(input)).toBeNull(); // 120px, outside new contact.
    expect(findSynthesisGestureCandidate({...input,phase:"approach"})).not.toBeNull();
    expect(findSynthesisGestureCandidate({...input,retainedCounterpartId:"antithesis"})).not.toBeNull();
    expect(findSynthesisGestureCandidate({...input,draggedPosition:{x:54,y:60},retainedCounterpartId:"antithesis"})).toBeNull();
  });

  it("chooses the closest liquid surface when the nearer centre belongs to a much smaller seed",()=>{
    const placed=[{node:node("source","正"),position:{x:40,y:50}},
      {node:node("tiny","反"),position:{x:50,y:50}}, {node:node("large","反"),position:{x:58,y:50}}];
    const result=findSynthesisGestureCandidate({draggedNodeId:"source",draggedPosition:{x:40,y:50},nodes:placed,
      action:null,viewport:{width:800,height:600},phase:"approach",radii:{source:50,tiny:10,large:80},
      resolveAction:(left,right)=>left===right?null:{...action,key:`${left}:${right}`,thesisId:left,antithesisId:right}});
    expect(result?.counterpartNodeId).toBe("large");
  });
});
