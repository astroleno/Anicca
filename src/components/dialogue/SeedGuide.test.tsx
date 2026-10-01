import { fireEvent, render, screen } from "@testing-library/react";
import { SeedGuide } from "./SeedGuide";

it("teaches writing, splitting and combining once, and can be reopened", () => {
  localStorage.clear();
  const first = render(<SeedGuide empty requested={0} pending={false} />);
  expect(screen.getByText("写下一个想法")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  expect(screen.getByText("每颗想法都能继续生长")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  expect(screen.getByText("把任意两颗想法放在一起")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "开始探索" }));
  first.unmount();
  const second = render(<SeedGuide empty requested={0} pending={false} />);
  expect(screen.queryByLabelText("三步开始")).not.toBeInTheDocument();
  second.rerender(<SeedGuide empty requested={1} pending={false} />);
  expect(screen.getByLabelText("三步开始")).toBeInTheDocument();
});
