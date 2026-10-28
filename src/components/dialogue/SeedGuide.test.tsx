import { render, screen, fireEvent, act } from "@testing-library/react";
import { SeedGuide } from "./SeedGuide";

const initial = { empty: true, requested: 0, pending: false, reading: false, combining: false, completed: false, onStart: vi.fn() };
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
it("follows actual exploration and hides while generating, without requiring a tour", () => {
  const view = render(<SeedGuide {...initial} />);
  expect(screen.getByText("写下一个想法，让它生出正与反")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "写下想法" }));
  expect(initial.onStart).toHaveBeenCalledOnce();
  view.rerender(<SeedGuide {...initial} pending />);
  expect(screen.queryByLabelText("探索提示")).not.toBeInTheDocument();
  view.rerender(<SeedGuide {...initial} empty={false} />);
  expect(screen.getByText("点一颗读读；拖动空白，转动视角")).toBeInTheDocument();
  view.rerender(<SeedGuide {...initial} empty={false} reading />);
  expect(screen.getByText("继续写、裂变或组合，从这里接着想")).toBeInTheDocument();
  view.rerender(<SeedGuide {...initial} empty={false} reading combining />);
  expect(screen.getByText("再选一颗种子，寻找新的联系")).toBeInTheDocument();
  view.rerender(<SeedGuide {...initial} empty={false} completed />);
  expect(screen.queryByLabelText("探索提示")).not.toBeInTheDocument();
  expect(localStorage.getItem("anicca:seed-guide:v1")).toBe("done");
  view.rerender(<SeedGuide {...initial} empty={false} completed reading requested={1} />);
  expect(screen.getByText("继续写、裂变或组合，从这里接着想")).toBeInTheDocument();
});

it("matches the stage's primary input capability and updates when that capability changes", () => {
  const listeners = new Set<() => void>();
  const media = { matches: true, addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener) };
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  try {
    const view = render(<SeedGuide {...initial} empty={false} />);
    expect(screen.getByText("点一颗读读；拖空白平移 · 拖球合成 · 双指转动与缩放")).toBeInTheDocument();
    act(() => { media.matches = false; listeners.forEach(listener => listener()); });
    expect(screen.getByText("点一颗读读；拖动空白，转动视角")).toBeInTheDocument();
    view.unmount(); expect(listeners.size).toBe(0);
  } finally { vi.unstubAllGlobals(); }
});

it("preserves dismissal across remounts and reopens at the current action", () => {
  const view = render(<SeedGuide {...initial} />);
  fireEvent.click(screen.getByRole("button", { name: "关闭提示" }));
  view.unmount();
  const next = render(<SeedGuide {...initial} empty={false} reading />);
  expect(screen.queryByLabelText("探索提示")).not.toBeInTheDocument();
  next.rerender(<SeedGuide {...initial} empty={false} reading requested={1} />);
  expect(screen.getByText("继续写、裂变或组合，从这里接着想")).toBeInTheDocument();
});

it("remains dismissible when browser storage is unavailable", () => {
  const get = vi.spyOn(localStorage, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  const set = vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  try {
    render(<SeedGuide {...initial} />);
    fireEvent.click(screen.getByRole("button", { name: "关闭提示" }));
    expect(screen.queryByLabelText("探索提示")).not.toBeInTheDocument();
  } finally { get.mockRestore(); set.mockRestore(); }
});
const props = { empty: false, requested: 0, pending: false, reading: false, combining: false, completed: false, onStart: vi.fn() };
it("temporarily yields to a result context without marking the first-visit guide dismissed", () => {
  const view = render(<SeedGuide {...props} />);
  expect(screen.getByLabelText("探索提示")).toBeInTheDocument();
  view.rerender(<SeedGuide {...props} suspended />);
  expect(screen.queryByLabelText("探索提示")).not.toBeInTheDocument();
  expect(localStorage.getItem("anicca:seed-guide:v1")).toBeNull();
  view.rerender(<SeedGuide {...props} />);
  expect(screen.getByLabelText("探索提示")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "关闭提示" }));
  view.rerender(<SeedGuide {...props} suspended />); view.rerender(<SeedGuide {...props} />);
  expect(screen.queryByLabelText("探索提示")).not.toBeInTheDocument();
  expect(localStorage.getItem("anicca:seed-guide:v1")).toBe("done");
});
