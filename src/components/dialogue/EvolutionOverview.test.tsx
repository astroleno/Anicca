import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { evolutionFixture } from "../../../tests/evolutionFixture";
import { EvolutionOverview } from "./EvolutionOverview";

function canvasHarness() {
  let width = 600, height = 500, resize: ResizeObserverCallback;
  let nextId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const text = vi.fn();
  const context = new Proxy({ fillText: text, measureText: (value: string) => ({ width: value.length * 12 }),
    createRadialGradient: () => ({ addColorStop: vi.fn() }) }, {
    get: (target, key) => target[key as keyof typeof target] || vi.fn()
  });
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(context as never);
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON() {} }));
  vi.stubGlobal("ResizeObserver", class { constructor(callback: ResizeObserverCallback) { resize = callback; } observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++nextId, callback); return nextId; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  const flush = () => { act(() => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(performance.now() + 400)); }); };
  return { flush, frames,
    resize: (w: number, h: number) => { width = w; height = h; act(() => resize([], {} as ResizeObserver)); flush(); },
    label: (label: string) => { const draw = [...text.mock.calls].reverse().find(call => call[0] === label); expect(draw).toBeDefined(); return { x: draw![1] as number, y: draw![2] as number }; }
  };
}

describe("evolution overview", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("keeps the current world point centered when the viewport changes", () => {
    const c = canvasHarness(), f = evolutionFixture();
    render(<EvolutionOverview graph={f.graph} initialNodeId={f.synthesis} theme="light" onEnter={() => {}} onDismiss={() => {}} />);
    c.flush();
    fireEvent.click(screen.getByRole("button", { name: "群体收益" })); c.flush();
    const before = c.label("群体收益");
    c.resize(400, 350);
    const after = c.label("群体收益");
    expect(after.x - before.x).toBeCloseTo(-100);
    expect(after.y - before.y).toBeCloseTo(-75);
    c.resize(600, 500);
    expect(c.label("群体收益")).toEqual(before);
  });

  it("ignores tap jitter and clears interrupted pan ownership before the next gesture", () => {
    const c = canvasHarness(), f = evolutionFixture();
    render(<EvolutionOverview graph={f.graph} initialNodeId={f.synthesis} theme="light" onEnter={() => {}} onDismiss={() => {}} />);
    c.flush();
    fireEvent.click(screen.getByRole("button", { name: "群体收益" })); c.flush();
    const canvas = screen.getByRole("img"), before = c.label("群体收益");
    canvas.setPointerCapture = vi.fn(); canvas.releasePointerCapture = vi.fn(); canvas.hasPointerCapture = () => true;
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 90, clientX: 40, clientY: 50 });
    fireEvent.pointerMove(canvas, { pointerId: 90, clientX: 42, clientY: 51 }); c.flush();
    expect(c.label("群体收益")).toEqual(before);
    fireEvent.pointerMove(canvas, { pointerId: 90, clientX: 60, clientY: 50 }); c.flush();
    const moved = c.label("群体收益");
    expect(moved.x - before.x).toBeCloseTo(20);
    fireEvent.blur(window);
    fireEvent.pointerMove(canvas, { pointerId: 90, clientX: 140, clientY: 50 }); c.flush();
    expect(c.label("群体收益")).toEqual(moved);
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 91, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(canvas, { pointerId: 91, clientX: 70, clientY: 50 }); c.flush();
    expect(c.label("群体收益").x - moved.x).toBeCloseTo(20);
  });

  it("retains keyboard control after blank-space focus loss and keeps background fields out of focus", () => {
    const f = evolutionFixture(), dismiss = vi.fn();
    render(<><input data-testid="outside" /><EvolutionOverview graph={f.graph} initialNodeId={f.synthesis} theme="light" onEnter={() => {}} onDismiss={dismiss} /></>);
    const external = screen.getByTestId("outside");
    const first = screen.getByRole("button", { name: "返回种子" });
    first.blur(); fireEvent.keyDown(window, { key: "Tab" }); expect(first).toHaveFocus();
    const last = within(screen.getByTestId("evolution-overview")).getAllByRole("button").filter(button => !(button as HTMLButtonElement).disabled).at(-1)!;
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true }); expect(last).toHaveFocus();
    external.focus(); expect(first).toHaveFocus();
    first.blur(); fireEvent.keyDown(window, { key: "Escape" }); expect(dismiss).toHaveBeenCalledOnce();
  });

  it("steps through both source paths, supports seeking and enters the original concept without changing graph", () => {
    const f = evolutionFixture(), before = JSON.stringify(f.graph), onEnter = vi.fn();
    render(<EvolutionOverview graph={f.graph} initialNodeId={f.synthesis} theme="light" onEnter={onEnter} onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "回放来路" }));
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("是否继续投入这个项目");
    expect(screen.getByRole("button", { name: "播放" })).toBeEnabled();
    expect(screen.getByRole("slider", { name: "回放进度" })).toHaveAttribute("max", "5");
    fireEvent.click(screen.getByRole("button", { name: "下一幕" }));
    expect(screen.getByRole("heading", { level: 3 }).textContent).toMatch(/个体成本|群体收益/);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "5" } });
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("兼顾两端");
    const sources = screen.getByText("共同来源").parentElement!;
    expect(within(sources).getByRole("button", { name: "群体收益" })).toBeVisible();
    expect(within(sources).getByRole("button", { name: "一周实验" })).toBeVisible();
    expect(JSON.stringify(f.graph)).toBe(before); expect(onEnter).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "进入种子" })); expect(onEnter).toHaveBeenCalledWith(f.synthesis);
  });

  it("searches a saved polarity and filters it separately from ordinary fission", () => {
    const f = evolutionFixture();
    render(<EvolutionOverview graph={f.graph} initialNodeId={f.synthesis} theme="light" onEnter={() => {}} onDismiss={() => {}} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "关切 个体" } });
    expect(screen.getByText("找到 1 个想法")).toBeVisible();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "fission" } });
    expect(screen.getByText("找到 0 个想法")).toBeVisible();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "polarity" } });
    fireEvent.click(screen.getByRole("button", { name: /个体成本.*沿「关切」展开/ }));
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("个体成本");
  });

  it("pauses autoplay for manual steps, finishes once, and cancels its timer when unmounted", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    const f = evolutionFixture();
    const { unmount } = render(<EvolutionOverview graph={f.graph} initialNodeId={f.synthesis} theme="dark" onEnter={() => {}} onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "回放来路" }));
    act(() => { vi.advanceTimersByTime(2100); });
    expect(screen.getByRole("slider")).toHaveValue("1");
    fireEvent.click(screen.getByRole("button", { name: "下一幕" }));
    expect(screen.getByRole("button", { name: "播放" })).toBeVisible();
    act(() => { vi.advanceTimersByTime(4200); }); expect(screen.getByRole("slider")).toHaveValue("2");
    fireEvent.change(screen.getByRole("slider"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "播放" }));
    act(() => { vi.advanceTimersByTime(2100); });
    expect(screen.getByRole("button", { name: "重播" })).toBeVisible();
    unmount(); expect(vi.getTimerCount()).toBe(0);
  });
});
