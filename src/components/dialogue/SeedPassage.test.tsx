import { fireEvent, render, screen } from "@testing-library/react";
import { SeedPassage } from "./SeedPassage";

const text = "自由探索可以持续。每条伏线都需要认领吗？";
it("offers a keyboard and touch path to ask about one exact sentence", () => {
  const onInquiry = vi.fn();
  render(<SeedPassage nodeId="seed" text={text} className="body" busy={false} onInquiry={onInquiry} />);
  fireEvent.click(screen.getByRole("button", { name: "选一句追问" }));
  fireEvent.click(screen.getByRole("button", { name: "每条伏线都需要认领吗？" }));
  fireEvent.click(screen.getByRole("button", { name: "找反例" }));
  expect(onInquiry).toHaveBeenCalledExactlyOnceWith({ sourceNodeId: "seed", quote: "每条伏线都需要认领吗？", intent: "counterexample" });
});

it("accepts selection inside the passage and ignores selection in another region", () => {
  const onInquiry = vi.fn();
  const view = render(<><p data-testid="outside">另一颗种子的文字</p><SeedPassage nodeId="seed" text={text} className="body" busy={false} onInquiry={onInquiry} /></>);
  const selection = window.getSelection()!;
  const range = document.createRange();
  range.selectNodeContents(screen.getByTestId("outside")); selection.removeAllRanges(); selection.addRange(range);
  fireEvent(document, new Event("selectionchange"));
  expect(screen.queryByRole("button", { name: "追问前提" })).not.toBeInTheDocument();
  const passage = view.container.querySelector('[data-seed-passage] p')!.firstChild!;
  range.setStart(passage, 0); range.setEnd(passage, 9); selection.removeAllRanges(); selection.addRange(range);
  fireEvent(document, new Event("selectionchange"));
  fireEvent.click(screen.getByRole("button", { name: "追问前提" }));
  expect(onInquiry).toHaveBeenCalledWith({ sourceNodeId: "seed", quote: text.slice(0, 9), intent: "premise" });
  selection.removeAllRanges();
});
