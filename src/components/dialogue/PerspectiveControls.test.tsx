import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { defaultThinkingSpace, type ThinkingSpace } from "@/features/perspectives/model";
import { PerspectiveControls } from "./PerspectiveControls";

vi.mock("next/dynamic", async () => {
  const { PerspectivePanel } = await import("./PerspectivePanel");
  return { default: () => PerspectivePanel };
});

function Harness({ workspaceId = "a", changed = vi.fn() }: { workspaceId?: string; changed?: (space: ThinkingSpace) => void }) {
  const [spaces, setSpaces] = useState<Record<string, ThinkingSpace>>({});
  return <PerspectiveControls workspaceId={workspaceId} space={spaces[workspaceId] || defaultThinkingSpace()} topic="共同维护花园" suggestions={[]}
    onChange={next => { changed(next); setSpaces(current => ({ ...current, [workspaceId]: next })); }}
    onLook={vi.fn()} onArrange={vi.fn()} onResetView={vi.fn()} />;
}

beforeEach(() => localStorage.clear());

it("returns focus to the navigation trigger after closing the lazy dialog", async () => {
  render(<Harness />);
  const trigger = screen.getByRole("button", { name: "换个角度" });
  trigger.focus(); fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("button", { name: "关闭思考空间" }));
  await waitFor(() => expect(trigger).toHaveFocus());
});
const openEditor = () => {
  fireEvent.click(screen.getByRole("button", { name: "换个角度" }));
  fireEvent.click(screen.getByRole("button", { name: "编辑维度" }));
};

it("retains edits through observation, closing and workspace switches, then saves with the latest poles", () => {
  const changed = vi.fn(), view = render(<Harness changed={changed} />);
  openEditor(); fireEvent.change(screen.getAllByLabelText("名称")[0], { target: { value: "范围" } });
  fireEvent.click(screen.getByRole("button", { name: "观察" }));
  fireEvent.click(screen.getByRole("button", { name: "整体" }));
  fireEvent.click(screen.getByRole("button", { name: "编辑维度" }));
  expect(screen.getAllByLabelText("名称")[0]).toHaveValue("范围");
  fireEvent.click(screen.getByRole("button", { name: "关闭思考空间" }));
  view.rerender(<Harness workspaceId="b" changed={changed} />); openEditor();
  expect(screen.getAllByLabelText("名称")[0]).toHaveValue("尺度");
  fireEvent.change(screen.getAllByLabelText("名称")[0], { target: { value: "边界" } });
  view.rerender(<Harness workspaceId="a" changed={changed} />); openEditor();
  expect(screen.getAllByLabelText("名称")[0]).toHaveValue("范围");
  fireEvent.click(screen.getByRole("button", { name: "保存维度" }));
  expect(changed.mock.calls.at(-1)?.[0]).toMatchObject({ focus: { scale: 1 }, axes: [{ label: "范围" }, {}, {}] });
});

it("restores unfinished edits after remount and only discards them on explicit cancel", () => {
  const first = render(<Harness />); openEditor();
  fireEvent.change(screen.getAllByLabelText("一端")[0], { target: { value: "" } }); first.unmount();
  render(<Harness />); openEditor(); expect(screen.getAllByLabelText("一端")[0]).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "取消编辑" }));
  fireEvent.click(screen.getByRole("button", { name: "编辑维度" }));
  expect(screen.getAllByLabelText("一端")[0]).toHaveValue("细节");
});
