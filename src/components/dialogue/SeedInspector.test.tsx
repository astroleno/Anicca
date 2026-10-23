import { fireEvent, render, screen } from "@testing-library/react";
import { SeedInspector } from "./SeedInspector";
import { BranchGraphStore } from "@/store/branchGraph";
import { defaultThinkingSpace } from "@/features/perspectives/model";
import { polarityPerspective } from "@/features/perspectives/polarity";

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
