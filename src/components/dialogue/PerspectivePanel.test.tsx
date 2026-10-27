import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { PerspectivePanel } from "./PerspectivePanel";
import { defaultThinkingSpace, type ThinkingSpace } from "@/features/perspectives/model";
import type { SeedViewDirection } from "./liquid/space";

const modalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
});
afterEach(() => {
  if (modalDescriptor) Object.defineProperty(HTMLDialogElement.prototype, "showModal", modalDescriptor);
  else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  vi.unstubAllGlobals();
});

function Harness({ changed = vi.fn(), look = vi.fn(), close = vi.fn() }: { changed?: (space: ThinkingSpace) => void; look?: (direction: SeedViewDirection) => void; close?: () => void }) {
  const [space, setSpace] = useState(defaultThinkingSpace());
  const [draft, setDraft] = useState<ThinkingSpace | null>(null);
  return <PerspectivePanel space={space} draft={draft || space} onDraftChange={setDraft} onDiscardDraft={() => setDraft(null)} topic="如何让自由探索持续生长" suggestions={[]}
    onChange={next => { setSpace(next); changed(next); }} onLook={look} onArrange={vi.fn()} onResetView={vi.fn()} onClose={close} />;
}

it("combines explicit generation poles while free camera choices leave the lens untouched", () => {
  const changed = vi.fn(), look = vi.fn(), close = vi.fn(); render(<Harness changed={changed} look={look} close={close} />);
  fireEvent.click(screen.getByRole("button", { name: "整体" }));
  fireEvent.click(screen.getByRole("button", { name: "群体" }));
  expect(screen.getByText("将从「整体 · 群体」展开")).toBeInTheDocument();
  expect(changed.mock.calls.at(-1)?.[0].focus).toEqual({ scale: 1, concern: 1 });
  expect(look).toHaveBeenLastCalledWith("top");
  const changes = changed.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "从后方观察" }));
  expect(look).toHaveBeenLastCalledWith("back"); expect(close).toHaveBeenCalledOnce(); expect(changed).toHaveBeenCalledTimes(changes);
});

it("reviews a Johari template before saving and keeps its two dimensions user-confirmed", () => {
  const changed = vi.fn(); render(<Harness changed={changed} />);
  fireEvent.click(screen.getByRole("button", { name: "编辑维度" }));
  fireEvent.click(screen.getByRole("button", { name: "乔哈里模板" }));
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getAllByRole("checkbox").every(input => (input as HTMLInputElement).checked)).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "保存维度" }));
  fireEvent.click(screen.getByRole("button", { name: "盲区" }));
  expect(changed.mock.calls.at(-1)?.[0].focus).toEqual({ "johari-self": -1, "johari-others": 1 });
  expect(changed.mock.calls.at(-1)?.[0].axes).toHaveLength(2);
});

it("retries failed suggestions and lets the user edit a proposal before adoption", async () => {
  const changed = vi.fn();
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(new Response(JSON.stringify({ axes: [
    { label: "资源", negative: "节制", positive: "扩张", reason: "看看资源边界" }
  ] }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher); render(<Harness changed={changed} />);
  fireEvent.click(screen.getByRole("button", { name: "请 AI 提醒" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("可以重试");
  fireEvent.click(screen.getByRole("button", { name: "请 AI 提醒" }));
  fireEvent.click(await screen.findByRole("button", { name: "编辑并采用资源维度" }));
  expect(changed).not.toHaveBeenCalled();
  const proposal = within(screen.getByRole("group", { name: "维度 4" }));
  fireEvent.change(proposal.getByLabelText("名称"), { target: { value: "生长节奏" } });
  fireEvent.change(proposal.getByLabelText("放在"), { target: { value: "z" } });
  fireEvent.click(screen.getByRole("button", { name: "保存维度" }));
  const saved = changed.mock.calls.at(-1)?.[0];
  expect(saved.axes.find((axis: { label: string }) => axis.label === "生长节奏")).toMatchObject({ negative: "节制", positive: "扩张", placement: "z" });
  expect(saved.axes.find((axis: { id: string }) => axis.id === "horizon").placement).toBe("none");
  expect(JSON.parse(fetcher.mock.calls[1][1].body).perspective.axes).toHaveLength(3);
});

it("aborts an outstanding suggestion when the workspace panel unmounts and ignores a late response", async () => {
  let reply!: (response: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(resolve => { reply = resolve; })), changed = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const view = render(<Harness changed={changed} />);
  fireEvent.click(screen.getByRole("button", { name: "请 AI 提醒" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  const signal = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal;
  view.unmount(); expect(signal?.aborted).toBe(true);
  await act(async () => { reply(new Response(JSON.stringify({ axes: [{ label: "资源", negative: "节制", positive: "扩张", reason: "不应串入别的工作区" }] }))); });
  expect(changed).not.toHaveBeenCalled();
});

it("keeps multiple adopted suggestions in the working draft without offering duplicates", async () => {
  const changed = vi.fn();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ axes: [
    { label: "资源", negative: "节制", positive: "扩张", reason: "看看资源边界" },
    { label: "责任", negative: "自发", positive: "共担", reason: "看看维护关系" }
  ] }))));
  render(<Harness changed={changed} />);
  fireEvent.click(screen.getByRole("button", { name: "请 AI 提醒" }));
  fireEvent.click(await screen.findByRole("button", { name: "编辑并采用资源维度" }));
  fireEvent.click(screen.getByRole("button", { name: "观察" }));
  expect(screen.queryByRole("button", { name: "编辑并采用资源维度" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "编辑并采用责任维度" }));
  expect(screen.getAllByRole("group")).toHaveLength(5);
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "保存维度" }));
  expect(changed.mock.calls.at(-1)?.[0].axes).toHaveLength(5);
});

it("counts unsaved axes toward the limit when adopting an AI proposal", () => {
  const space = defaultThinkingSpace(), draft = { ...space, axes: Array.from({ length: 24 }, (_, index) => ({
    ...space.axes[0], id: `draft_${index}`, label: `维度${index}`, negative: `一端${index}`, positive: `另一端${index}`
  })) }, changeDraft = vi.fn();
  render(<PerspectivePanel space={space} draft={draft} onDraftChange={changeDraft} onDiscardDraft={vi.fn()} topic="花园的维护"
    suggestions={[{ id: "new", label: "责任", negative: "自发", positive: "共担", reason: "看看维护关系", evidence: "content" }]}
    onChange={vi.fn()} onLook={vi.fn()} onArrange={vi.fn()} onResetView={vi.fn()} onClose={vi.fn()} />);
  const adopt = screen.getByRole("button", { name: "编辑并采用责任维度" }); expect(adopt).toBeDisabled();
  fireEvent.click(adopt); expect(changeDraft).not.toHaveBeenCalled();
});
