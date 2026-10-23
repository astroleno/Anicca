import { act, fireEvent, render, screen } from "@testing-library/react";
import { DialogueComposer } from "./DialogueComposer";

it("distinguishes a continuation from a new thought, and freezes its target while pending", () => {
  const onResetTarget = vi.fn();
  const props = { target: { nodeId: "seed-a", label: "身体识路", kind: "assistant" as const, displayRole: "node" as const },
    value: "补充", disabled: false, pendingAction: null, errorState: null, onChange: vi.fn(), onSubmit: vi.fn(), onResetTarget };
  const view = render(<DialogueComposer {...props} />);
  expect(screen.getByLabelText("续写对象")).toHaveTextContent("基于「身体识路」");
  fireEvent.click(screen.getByRole("button", { name: "写新想法" }));
  expect(onResetTarget).toHaveBeenCalledOnce();
  view.rerender(<DialogueComposer {...props} disabled pendingAction="branches" />);
  expect(screen.getByLabelText("续写对象")).toHaveTextContent("本次基于「身体识路」");
  expect(screen.getByRole("button", { name: "写新想法" })).toBeDisabled();
  view.rerender(<DialogueComposer {...props} target={{ nodeId: null, label: "新的想法", kind: "root", displayRole: "node" }} />);
  expect(screen.getByLabelText("续写对象")).toHaveTextContent("独立的新想法");
  expect(screen.getByRole("textbox", { name: "输入" })).toHaveValue("补充");
});

it("shows elapsed time without inventing server progress and releases the timer", () => {
  vi.useFakeTimers();
  try {
    const cancel = vi.fn();
    const { unmount } = render(<DialogueComposer target={{ nodeId: null, label: "新的想法", kind: "root", displayRole: "node" }}
      value="保留我的想法" disabled pendingAction="branches" errorState={null} onChange={vi.fn()} onSubmit={vi.fn()} onCancel={cancel} />);
    expect(screen.getByLabelText("已用时间")).toHaveTextContent("0 秒");
    act(() => vi.advanceTimersByTime(12000));
    expect(screen.getByLabelText("已用时间")).toHaveTextContent("12 秒");
    expect(screen.getByText("还在生成，可以继续写下一个想法")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "输入" })).toHaveValue("保留我的想法");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(cancel).toHaveBeenCalledOnce();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
