import { fireEvent, render, screen, within } from "@testing-library/react";
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

it("opens polarity directly from a stage request and returns to peer primary operations", () => {
  const store = new BranchGraphStore(), id = store.createUserNode("共同维护花园");
  const onCombine = vi.fn();
  render(<SeedInspector graph={store.getGraph()} nodeId={id} combining={false} busy={false} polarityRequest={1}
    onClose={vi.fn()} onWrite={vi.fn()} onCombine={onCombine} onPick={vi.fn()} onSplit={vi.fn()} onExpandPolarity={vi.fn()} />);
  expect(screen.getByTestId("dialogue-panel")).toHaveAttribute("data-mode", "polarity");
  expect(screen.getByRole("heading", { name: "沿极性展开" })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("heading", { name: "沿极性展开" }), { key: "Escape" });
  const primary = screen.getByRole("group", { name: "种子基本操作" });
  expect(within(primary).getAllByRole("button").map(button => button.textContent)).toEqual(["推演正反", "极性分裂", "组合"]);
  expect(screen.getByRole("button", { name: "极性分裂" })).toHaveFocus();
  fireEvent.click(within(primary).getByRole("button", { name: "组合" }));
  expect(onCombine).toHaveBeenCalledOnce();
});

it("distinguishes ordinary fission from axis expansion and leaves the global lens untouched", () => {
  const store = new BranchGraphStore(), id = store.createUserNode("让探索持续下去");
  const space = defaultThinkingSpace(); space.focus.horizon = 1;
  const onSplit = vi.fn(), onExpand = vi.fn();
  render(<SeedInspector graph={store.getGraph()} nodeId={id} space={space} combining={false} busy={false}
    onClose={vi.fn()} onWrite={vi.fn()} onCombine={vi.fn()} onPick={vi.fn()} onSplit={onSplit} onExpandPolarity={onExpand} />);
  expect(screen.getByRole("button", { name: "推演正反" })).toHaveAccessibleDescription("推进判断，检验前提");
  expect(screen.getByRole("button", { name: "极性分裂" })).toHaveAccessibleDescription("换观察位置，看见两端");
  fireEvent.click(screen.getByRole("button", { name: "极性分裂" }));
  expect(onExpand).not.toHaveBeenCalled(); expect(onSplit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("radio", { name: /关切/ }));
  expect(screen.getByText("其余角度保持：长远")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "沿「关切」展开" }));
  expect(onExpand).toHaveBeenCalledExactlyOnceWith("concern", space);
  expect(space.focus).toEqual({ horizon: 1 });
  fireEvent.click(screen.getByRole("button", { name: "返回种子阅读" }));
  fireEvent.click(screen.getByRole("button", { name: "推演正反" }));
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
  fireEvent.click(screen.getByRole("button", { name: "推演正反" }));
  expect(onSplit.mock.calls[0][0].focus).toEqual({ concern: -1, horizon: 1 });
  fireEvent.click(screen.getByRole("button", { name: "改用当前角度" }));
  fireEvent.click(screen.getByRole("button", { name: "推演正反" }));
  expect(onSplit.mock.calls[1][0].focus).toEqual({ concern: 1 });
});

it("keeps identical unconstrained observation frames quiet", () => {
  const store = new BranchGraphStore(), id = store.createUserNode("继续保留协商的余地。"), frame = defaultThinkingSpace();
  store.patchNodeMeta(id, { fissionFrame: frame });
  render(<SeedInspector graph={store.getGraph()} nodeId={id} space={frame} combining={false} busy={false}
    onClose={vi.fn()} onWrite={vi.fn()} onCombine={vi.fn()} onPick={vi.fn()} onSplit={vi.fn()} onExpandPolarity={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "改用当前角度" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "极性分裂" })).toBeEnabled();
});

it.each(["heading", "return", "radio"])("closes the inline axis choice from %s with Escape without dismissing the reading parent", target => {
  const store = new BranchGraphStore(), root = store.createUserNode("问题"), escape = vi.fn();
  window.addEventListener("keydown", escape);
  const view = render(<SeedInspector graph={store.getGraph()} nodeId={root} combining={false} busy={false}
    onClose={vi.fn()} onWrite={vi.fn()} onCombine={vi.fn()} onPick={vi.fn()} onSplit={vi.fn()} onExpandPolarity={vi.fn()} />);
  try {
    fireEvent.click(screen.getByRole("button", { name: "极性分裂" }));
    const control = target === "heading" ? screen.getByRole("heading", { name: "沿极性展开" })
      : target === "return" ? screen.getByRole("button", { name: "返回种子阅读" })
      : screen.getByRole("radio", { name: /尺度/ });
    control.focus();
    fireEvent.keyDown(control, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "沿哪条维度展开" })).not.toBeInTheDocument();
    expect(screen.getByTestId("dialogue-panel")).toHaveAttribute("data-mode", "read");
    expect(screen.getByRole("button", { name: "极性分裂" })).toHaveFocus();
    expect(escape).not.toHaveBeenCalled();
  } finally { view.unmount(); window.removeEventListener("keydown", escape); }
});

it("offers this round's other endpoint before unrelated history without combining automatically", () => {
  const store = new BranchGraphStore(), root = store.createUserNode("一起创作的条件是什么？");
  const pair = store.createAssistantPair(root, { thesis: { text: "留出自由" }, antithesis: { text: "认领承诺" } });
  store.createUserNode("另一段暂时无关的想法");
  const pick = vi.fn();
  render(<SeedInspector graph={store.getGraph()} nodeId={pair.thesisId} companionId={pair.antithesisId} combining busy={false}
    onClose={vi.fn()} onWrite={vi.fn()} onCombine={vi.fn()} onPick={pick} onSplit={vi.fn()} />);
  const choices = within(screen.getByRole("group", { name: "选择组合对象" }));
  expect(choices.getAllByRole("button")[0]).toHaveTextContent("认领承诺");
  expect(choices.getByText("本轮另一端")).toBeInTheDocument();
  expect(pick).not.toHaveBeenCalled();
  fireEvent.click(choices.getAllByRole("button")[0]);
  expect(pick).toHaveBeenCalledExactlyOnceWith(pair.antithesisId);
});

it("restores a reading position and keeps it when returning from axis selection", () => {
  const store = new BranchGraphStore(), root = store.createUserNode("可以保留不同的写作节奏。");
  const remember = vi.fn();
  const view = render(<SeedInspector graph={store.getGraph()} nodeId={root} combining={false} busy={false}
    getReadingPosition={() => ({ scrollTop: 120 })} onRememberPosition={remember}
    onClose={vi.fn()} onWrite={vi.fn()} onCombine={vi.fn()} onPick={vi.fn()} onSplit={vi.fn()} onExpandPolarity={vi.fn()} />);
  const panel = screen.getByTestId("dialogue-panel");
  expect(panel.scrollTop).toBe(120);
  panel.scrollTop = 92; fireEvent.scroll(panel);
  fireEvent.click(screen.getByRole("button", { name: "极性分裂" }));
  expect(panel.scrollTop).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "返回种子阅读" }));
  expect(panel.scrollTop).toBe(92);
  expect(screen.getByRole("button", { name: "极性分裂" })).toHaveFocus();
  view.unmount();
  expect(remember).toHaveBeenLastCalledWith(root, { scrollTop: 92 });
});

it("distinguishes an unmatched query and clears it without choosing a partner", () => {
  const store = new BranchGraphStore(), root = store.createUserNode("共同维护花园"), other = store.createUserNode("为开放用途留出空间"), pick = vi.fn();
  render(<SeedInspector graph={store.getGraph()} nodeId={root} combining busy={false}
    onClose={vi.fn()} onWrite={vi.fn()} onCombine={vi.fn()} onPick={pick} onSplit={vi.fn()} />);
  fireEvent.change(screen.getByRole("textbox", { name: "搜索种子" }), { target: { value: "不匹配词" } });
  expect(screen.getByRole("status")).toHaveTextContent("没有找到匹配的种子");
  expect(screen.queryByText(/还没有可组合/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "清空搜索" }));
  expect(screen.getByRole("textbox", { name: "搜索种子" })).toHaveValue("");
  expect(within(screen.getByRole("group", { name: "选择组合对象" })).getAllByRole("button")).toHaveLength(1);
  expect(store.getGraph().nodes[other]).toBeDefined(); expect(pick).not.toHaveBeenCalled();
});
