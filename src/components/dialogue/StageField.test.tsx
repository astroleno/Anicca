import { fireEvent, render, screen } from "@testing-library/react";
import { defaultThinkingSpace, johariThinkingSpace, type ThinkingSpace } from "@/features/perspectives/model";
import type { DialogueStageNode } from "@/features/dialectic/viewModel";
import { StageField } from "./StageField";

const seed = (id: string, x: number, y: number): DialogueStageNode =>
  ({ id, label: id, kind: "assistant", relation: "child", seedX: 50, seedY: 50, spatialCoordinates: { x, y } });

it("stays absent when no thinking direction is laid out on the stage", () => {
  const space: ThinkingSpace = { ...defaultThinkingSpace(), axes: defaultThinkingSpace().axes.map(axis => ({ ...axis, placement: "none" as const })) };
  const { container } = render(<StageField space={space} nodes={[seed("a", 1, 1)]} onFocus={vi.fn()} />);
  expect(container).toBeEmptyDOMElement();
});

it("keeps the built-in directions asleep until a seed is carried", () => {
  const view = render(<StageField space={defaultThinkingSpace()} nodes={[]} onFocus={vi.fn()} />);
  const field = screen.getByTestId("dialogue-stage-field");
  expect(field).toHaveAttribute("data-hidden", "true");
  view.rerender(<StageField space={defaultThinkingSpace()} nodes={[]} carrying onFocus={vi.fn()} />);
  expect(field).not.toHaveAttribute("data-hidden");
  expect(screen.getByRole("button", { name: "下一个想法偏向「整体」" })).toBeInTheDocument();
});

it("names the Johari regions and lets an unexplored one become the next direction", () => {
  const onFocus = vi.fn();
  render(<StageField space={johariThinkingSpace()} nodes={[seed("open", .8, .7)]} onFocus={onFocus} />);
  expect(screen.getByRole("button", { name: "下一个想法从「公开区」展开" })).not.toHaveAttribute("data-unexplored");
  const blind = screen.getByRole("button", { name: "下一个想法从「盲区」展开" });
  expect(blind).toHaveAttribute("data-unexplored", "true");
  fireEvent.click(blind);
  expect(onFocus).toHaveBeenCalledWith({ "johari-self": -1, "johari-others": 1 });
});

it("treats choosing the current region again as letting it go", () => {
  const onFocus = vi.fn();
  const space: ThinkingSpace = { ...johariThinkingSpace(), focus: { "johari-self": -1, "johari-others": -1 } };
  render(<StageField space={space} nodes={[]} onFocus={onFocus} />);
  const unknown = screen.getByRole("button", { name: "下一个想法从「未知区」展开" });
  expect(unknown).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(unknown);
  expect(onFocus).toHaveBeenCalledWith({ "johari-self": 0, "johari-others": 0 });
});

it("does not mark regions unexplored before any seed has been placed by direction", () => {
  render(<StageField space={johariThinkingSpace()} nodes={[{ ...seed("plain", 0, 0), spatialCoordinates: undefined }]} onFocus={vi.fn()} />);
  expect(document.querySelectorAll("[data-unexplored]")).toHaveLength(0);
});

it.each([false, true])("restores the unchanged Johari selection after synthesis (selected: %s)", selected => {
  const space = johariThinkingSpace();
  if (selected) space.focus = { "johari-self": -1, "johari-others": 1 };
  const onFocus = vi.fn();
  const view = render(<StageField space={space} nodes={[]} onFocus={onFocus} />);
  const name = "下一个想法从「盲区」展开";
  expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", String(selected));
  view.rerender(<StageField space={space} nodes={[]} synthesisActive onFocus={onFocus} />);
  expect(screen.queryByTestId("dialogue-stage-field")).not.toBeInTheDocument();
  view.rerender(<StageField space={space} nodes={[]} onFocus={onFocus} />);
  expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", String(selected));
  expect(onFocus).not.toHaveBeenCalled();
});

it("shows the poles of placed custom axes, and rises while a seed is carried", () => {
  const space: ThinkingSpace = { version: 1, focus: {}, axes: [
    { id: "pace", label: "节奏", negative: "慢", positive: "快", placement: "x", evidence: "content" },
    { id: "scope", label: "范围", negative: "个人", positive: "群体", placement: "none", evidence: "content" }
  ] };
  const view = render(<StageField space={space} nodes={[]} onFocus={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "下一个想法偏向「快」" }));
  expect(screen.queryByText("群体")).not.toBeInTheDocument();
  const field = screen.getByTestId("dialogue-stage-field");
  expect(field).not.toHaveAttribute("data-carrying");
  view.rerender(<StageField space={space} nodes={[]} carrying synthesisActive onFocus={vi.fn()} />);
  expect(field).toHaveAttribute("data-carrying", "true");
  view.rerender(<StageField space={space} nodes={[]} hidden onFocus={vi.fn()} />);
  expect(field).toHaveAttribute("data-hidden", "true");
});
