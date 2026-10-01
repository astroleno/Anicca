import { act, fireEvent, render, screen } from "@testing-library/react";
import { DialogueComposer } from "./DialogueComposer";

it("shows elapsed time without inventing server progress and releases the timer", () => {
  vi.useFakeTimers();
  try {
    const cancel = vi.fn();
    const { unmount } = render(<DialogueComposer target={{ nodeId: null, label: "新的想法", kind: "root", displayRole: "node" }}
      value="保留我的想法" disabled pendingAction="branches" errorState={null} onChange={vi.fn()} onSubmit={vi.fn()} onCancel={cancel} />);
    expect(screen.getByLabelText("已用时间")).toHaveTextContent("0 秒");
    act(() => vi.advanceTimersByTime(12000));
    expect(screen.getByLabelText("已用时间")).toHaveTextContent("12 秒");
    expect(screen.getByRole("status")).toHaveTextContent("仍在等待模型返回");
    expect(screen.getByRole("textbox", { name: "输入" })).toHaveValue("保留我的想法");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(cancel).toHaveBeenCalledOnce();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
