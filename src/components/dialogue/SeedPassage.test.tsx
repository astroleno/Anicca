import { fireEvent, render, screen } from "@testing-library/react";
import { SeedPassage } from "./SeedPassage";

const text = "自由探索可以持续。每条伏线都需要认领吗？";
it("offers a keyboard and touch path to ask about one exact sentence", () => {
  const onInquiry = vi.fn();
  render(<SeedPassage nodeId="seed" text={text} className="body" busy={false} onInquiry={onInquiry} />);
  fireEvent.click(screen.getByRole("button", { name: "选一句追问" }));
  fireEvent.click(screen.getByRole("button", { name: "每条伏线都需要认领吗？" }));
  fireEvent.click(screen.getByRole("button", { name: "找反例" }));
  expect(onInquiry).toHaveBeenCalledExactlyOnceWith({ sourceNodeId: "seed", quote: "每条伏线都需要认领吗？", quoteStart: text.indexOf("每条"), intent: "counterexample" });
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
  expect(onInquiry).toHaveBeenCalledWith({ sourceNodeId: "seed", quote: text.slice(0, 9), quoteStart: 0, intent: "premise" });
  selection.removeAllRanges();
});

it("keeps the question at the exact quote and preserves the surrounding passage", () => {
  const target = { sourceNodeId: "seed", quote: "每条伏线都需要认领吗？", intent: "premise" as const };
  const selectionChanged = vi.fn();
  const view = render(<SeedPassage nodeId="seed" text={`${text}还可以继续探索。`} className="body" busy={false}
    onInquiry={vi.fn()} inquiryTarget={target} inquiryComposer={<textarea aria-label="问题" defaultValue="哪些线索值得保留？" />}
    onSelectionChange={selectionChanged} />);
  expect(screen.getByLabelText("本次追问的原句")).toHaveTextContent(target.quote);
  expect(screen.getByLabelText("围绕选句继续")).toContainElement(screen.getByRole("textbox", { name: "问题" }));
  const passage = view.container.querySelector("[data-seed-passage]")!;
  expect(passage.children[0]).toHaveTextContent("自由探索可以持续。");
  expect(passage.children[2]).toHaveTextContent("还可以继续探索。");
  expect(selectionChanged).toHaveBeenLastCalledWith(true);
  expect(screen.queryByRole("button", { name: "追问前提" })).not.toBeInTheDocument();
});

it("anchors the second repeated sentence and keeps that position after remount", () => {
  const quote = "相同的句子。", before = `开头。${quote}中间的不同语境。`, text = `${before}${quote}结尾。`;
  const onInquiry = vi.fn();
  const view = render(<SeedPassage nodeId="seed" text={text} className="body" busy={false} onInquiry={onInquiry} />);
  fireEvent.click(screen.getByRole("button", { name: "选一句追问" }));
  fireEvent.click(screen.getAllByRole("button", { name: quote })[1]);
  expect(view.container.querySelector("[data-seed-passage]")!.firstElementChild).toHaveTextContent(before);
  fireEvent.click(screen.getByRole("button", { name: "追问前提" }));
  const target = { sourceNodeId: "seed", quote, quoteStart: before.length, intent: "premise" as const };
  expect(onInquiry).toHaveBeenCalledExactlyOnceWith(target);
  view.unmount();
  const restored = render(<SeedPassage nodeId="seed" text={text} className="body" busy={false} onInquiry={onInquiry}
    inquiryTarget={target} inquiryComposer={<textarea aria-label="问题" />} />);
  expect(restored.container.querySelector("[data-seed-passage]")!.firstElementChild).toHaveTextContent(before);
  expect(screen.getByLabelText("本次追问的原句")).toHaveAttribute("data-passage-start", String(before.length));
});

it("maps native selection to its actual source offset, including whitespace and split passages", () => {
  const quote = "相同的句子。", text = `🌱开头。${quote}\n  ${quote}结尾。`, onInquiry = vi.fn();
  const view = render(<SeedPassage nodeId="seed" text={text} className="body" busy={false} onInquiry={onInquiry} />);
  const selection = window.getSelection()!;
  const select = (node: Node, start: number, end: number) => {
    const range = document.createRange(); range.setStart(node, start); range.setEnd(node, end);
    selection.removeAllRanges(); selection.addRange(range); fireEvent(document, new Event("selectionchange"));
  };
  try {
    // First selection splits the passage around its first occurrence.
    select(view.container.querySelector("[data-seed-passage] p")!.firstChild!, text.indexOf(quote), text.indexOf(quote) + quote.length);
    const after = view.container.querySelector("[data-seed-passage]")!.lastElementChild!.firstChild!;
    select(after, 0, 3 + quote.length);
    expect(view.container.querySelector("[data-seed-passage]")!.firstElementChild?.textContent).toBe(text.slice(0, text.lastIndexOf(quote)));
    fireEvent.click(screen.getByRole("button", { name: "找反例" }));
    expect(onInquiry).toHaveBeenCalledExactlyOnceWith({ sourceNodeId: "seed", quote, quoteStart: text.lastIndexOf(quote), intent: "counterexample" });
  } finally { selection.removeAllRanges(); }
});

it("keeps a replacement quote's new position in an existing inquiry", () => {
  const quote = "相同的句子。", text = `开头。${quote}中间。${quote}`, onInquiry = vi.fn();
  render(<SeedPassage nodeId="seed" text={text} className="body" busy={false} onInquiry={onInquiry}
    inquiryTarget={{ sourceNodeId: "seed", quote, quoteStart: text.indexOf(quote), intent: "premise" }} />);
  fireEvent.click(screen.getByRole("button", { name: "换一句追问" }));
  fireEvent.click(screen.getAllByRole("button", { name: quote })[1]);
  expect(onInquiry).toHaveBeenCalledExactlyOnceWith({ sourceNodeId: "seed", quote, quoteStart: text.lastIndexOf(quote), intent: "premise" });
});
