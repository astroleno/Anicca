import { fireEvent, render, screen } from "@testing-library/react";
import { SeedInspector } from "./SeedInspector";
import { BranchGraphStore } from "@/store/branchGraph";
import { defaultThinkingSpace } from "@/features/perspectives/model";
import { polarityPerspective } from "@/features/perspectives/polarity";

it("shows grounded recurrence and offers its source instead of claiming another discovery", () => {
  const store = new BranchGraphStore(), root = store.createUserNode("只认领真正有张力的伏线。");
  const { thesisId } = store.createAssistantPair(root, { thesis: { text: "只把有张力的线索升格为债。", change: "新增了有张力的区分。",
    novelty: { status: "revisit", sourceId: root, reason: "两处都主张有选择地认领伏线。", sourceEvidence: "只认领真正有张力的伏线", resultEvidence: "只把有张力的线索升格为债" } } });
  const pick = vi.fn();
  render(<SeedInspector graph={store.getGraph()} nodeId={thesisId} combining={false} busy={false}
    onClose={vi.fn()} onWrite={vi.fn()} onCombine={vi.fn()} onPick={pick} onSplit={vi.fn()} onExpandPolarity={vi.fn()} />);
  expect(screen.getByLabelText("与此前想法的联系")).toHaveTextContent("与此前相近");
  expect(screen.queryByText("新增了有张力的区分。")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /回看/ })); expect(pick).toHaveBeenCalledWith(root);
  fireEvent.click(screen.getByRole("button", { name: "换个角度展开" }));
  expect(screen.getByRole("group", { name: "沿哪条维度展开" })).toBeInTheDocument();
});

it("reveals a stored change and lets a deferred meeting continue without manufacturing a seed", () => {
  const store = new BranchGraphStore(), a = store.createUserNode("邮编"), b = store.createUserNode("薄荷");
  const change = "把区域分类与个别叶片的光感分别理解。";
  store.patchNodeMeta(a, { change });
  store.deferSynthesis({ id: "meeting", sourceNodeIds: [a, b], createdAt: new Date().toISOString(),
    reason: "一个描述投递区域，一个探索画面的光感，当前尚无具体联系。", question: "你想把区域结构带入画面吗？" });
  const onContinue = vi.fn();
  render(<SeedInspector graph={store.getGraph()} nodeId={a} combining={false} busy={false}
    onClose={vi.fn()} onWrite={vi.fn()} onCombine={vi.fn()} onPick={vi.fn()} onSplit={vi.fn()} onContinueDeferred={onContinue} />);
  expect(screen.getByLabelText("这一步的理解变化")).toHaveTextContent(change);
  fireEvent.click(screen.getByText("暂存的相遇 · 1"));
  fireEvent.click(screen.getByRole("button", { name: "补充联系" }));
  expect(onContinue).toHaveBeenCalledExactlyOnceWith("meeting");
  expect(Object.keys(store.getGraph().nodes)).toHaveLength(2);
});

it("opens the original source when an encounter's copy has since been removed", () => {
  const store = new BranchGraphStore(), a = store.createUserNode("邮编"), b = store.createUserNode("薄荷");
  store.deferSynthesis({ id: "meeting", sourceNodeIds: [a, b], sourceInstanceIds: ["removed-copy", b], createdAt: new Date().toISOString(),
    reason: "一个描述投递区域，一个探索画面的光感，当前尚无具体联系。", question: "你想把区域结构带入画面吗？" });
  const onPick = vi.fn();
  render(<SeedInspector graph={store.getGraph()} nodeId={a} activeDeferredId="meeting" combining={false} busy={false}
    onClose={vi.fn()} onWrite={vi.fn()} onCombine={vi.fn()} onPick={onPick} onSplit={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "邮编" }));
  expect(onPick).toHaveBeenCalledExactlyOnceWith(a);
});

it("distinguishes ordinary fission from axis expansion and leaves the global lens untouched", () => {
  const store = new BranchGraphStore(), id = store.createUserNode("让探索持续下去");
  const space = defaultThinkingSpace(); space.focus.horizon = 1;
  const onSplit = vi.fn(), onExpand = vi.fn();
  render(<SeedInspector graph={store.getGraph()} nodeId={id} space={space} combining={false} busy={false}
    onClose={vi.fn()} onWrite={vi.fn()} onCombine={vi.fn()} onPick={vi.fn()} onSplit={onSplit} onExpandPolarity={onExpand} />);
  fireEvent.click(screen.getByRole("button", { name: "沿极性展开" }));
  expect(onExpand).not.toHaveBeenCalled(); expect(onSplit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("radio", { name: /关切/ }));
  expect(screen.getByText("其余角度保持：长远")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "沿「关切」展开" }));
  expect(onExpand).toHaveBeenCalledExactlyOnceWith("concern", space);
  expect(space.focus).toEqual({ horizon: 1 });
  fireEvent.click(screen.getByRole("button", { name: "返回种子阅读" }));
  fireEvent.click(screen.getByRole("button", { name: "正反裂变" }));
  expect(onSplit).toHaveBeenCalledExactlyOnceWith(space);
});

it("continues from the endpoint's captured frame until the user explicitly selects the current one", () => {
  const store = new BranchGraphStore(), root = store.createUserNode("怎样一起创作？"), frame = defaultThinkingSpace();
  frame.focus.horizon = 1;
  const pair = store.createPolarityPair(root, { groupId: "group", axisId: "concern", frame,
    negative: { text: "从个体看", perspective: polarityPerspective(frame, "concern", -1) },
    positive: { text: "从群体看", perspective: polarityPerspective(frame, "concern", 1) } });
  const current = defaultThinkingSpace(); current.focus.concern = 1;
  const onSplit = vi.fn();
  render(<SeedInspector graph={store.getGraph()} nodeId={pair.negativeId} space={current} combining={false} busy={false}
    onClose={vi.fn()} onWrite={vi.fn()} onCombine={vi.fn()} onPick={vi.fn()} onSplit={onSplit} onExpandPolarity={vi.fn()} />);
  expect(screen.getByText("从「个体 · 长远」继续")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "正反裂变" }));
  expect(onSplit.mock.calls[0][0].focus).toEqual({ concern: -1, horizon: 1 });
  fireEvent.click(screen.getByRole("button", { name: "改用当前角度" }));
  fireEvent.click(screen.getByRole("button", { name: "正反裂变" }));
  expect(onSplit.mock.calls[1][0].focus).toEqual({ concern: 1 });
});

it("closes the inline axis choice with Escape without dismissing the reading parent", () => {
  const store = new BranchGraphStore(), root = store.createUserNode("问题"), escape = vi.fn();
  window.addEventListener("keydown", escape);
  const view = render(<SeedInspector graph={store.getGraph()} nodeId={root} combining={false} busy={false}
    onClose={vi.fn()} onWrite={vi.fn()} onCombine={vi.fn()} onPick={vi.fn()} onSplit={vi.fn()} onExpandPolarity={vi.fn()} />);
  try {
    fireEvent.click(screen.getByRole("button", { name: "沿极性展开" }));
    fireEvent.keyDown(screen.getByRole("radio", { name: /尺度/ }), { key: "Escape" });
    expect(screen.queryByRole("group", { name: "沿哪条维度展开" })).not.toBeInTheDocument();
    expect(escape).not.toHaveBeenCalled();
  } finally { view.unmount(); window.removeEventListener("keydown", escape); }
});
