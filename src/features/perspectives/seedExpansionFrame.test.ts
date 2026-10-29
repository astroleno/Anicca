import { BranchGraphStore } from "@/store/branchGraph";
import { defaultThinkingSpace } from "./model";
import { polarityPerspective } from "./polarity";
import { resolveSeedExpansionFrame } from "./seedExpansionFrame";

it("keeps generated branches on their captured entrance and permits an explicit override", () => {
  const store = new BranchGraphStore(), root = store.createUserNode("怎样行动？");
  const saved = defaultThinkingSpace(); saved.focus.horizon = 1;
  const current = defaultThinkingSpace(); current.focus.concern = -1;
  const pair = store.createAssistantPair(root, { frame: saved });
  for (const id of [pair.thesisId, pair.antithesisId]) {
    const node = store.getGraph().nodes[id];
    expect(resolveSeedExpansionFrame(node, current)).toMatchObject({ frame: saved, differs: true, source: "seed" });
    expect(resolveSeedExpansionFrame(node, current, true)).toMatchObject({ frame: current, source: "current" });
  }
  expect(store.getGraph().nodes[pair.thesisId].meta?.fissionFrame).toEqual(saved);
});

it("preserves a polarity endpoint and lets legacy nodes use the current entrance without modifying them", () => {
  const store = new BranchGraphStore(), root = store.createUserNode("怎样行动？"), frame = defaultThinkingSpace();
  const pair = store.createPolarityPair(root, { groupId: "g", axisId: "concern", frame,
    negative: { text: "个人", perspective: polarityPerspective(frame, "concern", -1) },
    positive: { text: "共同", perspective: polarityPerspective(frame, "concern", 1) } });
  expect(resolveSeedExpansionFrame(store.getGraph().nodes[pair.negativeId], frame).frame.focus.concern).toBe(-1);
  const legacy = store.getGraph().nodes[root], before = JSON.stringify(legacy);
  expect(resolveSeedExpansionFrame(legacy, frame)).toMatchObject({ frame, capturedFrame: null, differs: false });
  expect(JSON.stringify(legacy)).toBe(before);
  expect(resolveSeedExpansionFrame(null, frame).frame).toEqual(frame);
});
