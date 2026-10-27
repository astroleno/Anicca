import { act, fireEvent, render, screen } from "@testing-library/react";
import { SeedReadingContent } from "./SeedReadingContent";

it("prevents interacting with obscured seeds and restores them after reading", () => {
  const stage = document.createElement("div");
  stage.dataset.testid = "dialogue-stage-track";
  stage.inert = false;
  document.body.append(stage);
  const onDismiss = vi.fn();
  const view = render(<SeedReadingContent onDismiss={onDismiss}><button>继续写</button></SeedReadingContent>);
  expect(stage.inert).toBe(true);
  fireEvent.pointerDown(screen.getByRole("button", { name: "继续写" }));
  expect(onDismiss).not.toHaveBeenCalled();
  fireEvent.pointerDown(document.body);
  expect(onDismiss).toHaveBeenCalledOnce();
  view.unmount();
  expect(stage.inert).toBe(false);
  fireEvent.pointerDown(document.body);
  expect(onDismiss).toHaveBeenCalledOnce();
  stage.remove();
});

it("preserves a stage that was already inert", () => {
  const stage = document.createElement("div");
  stage.dataset.testid = "dialogue-stage-track";
  stage.inert = true;
  document.body.append(stage);
  const view = render(<SeedReadingContent onDismiss={vi.fn()}>正文</SeedReadingContent>);
  view.unmount();
  expect(stage.inert).toBe(true);
  stage.remove();
});

it("suspends reading for a covering view without discarding its DOM or handling outside gestures", () => {
  const dismiss = vi.fn();
  const view = render(<SeedReadingContent onDismiss={dismiss}><textarea defaultValue="尚未选完" /></SeedReadingContent>);
  const field = screen.getByRole("textbox");
  view.rerender(<SeedReadingContent suspended onDismiss={dismiss}><textarea defaultValue="尚未选完" /></SeedReadingContent>);
  expect(field).toBeInTheDocument(); expect(field).not.toBeVisible();
  expect(document.getElementById("dialogue-reading-drawer")).toHaveAttribute("inert");
  fireEvent.pointerDown(document.body); expect(dismiss).not.toHaveBeenCalled();
  view.rerender(<SeedReadingContent onDismiss={dismiss}><textarea defaultValue="尚未选完" /></SeedReadingContent>);
  expect(screen.getByRole("textbox")).toBe(field); expect(field).toBeVisible();
});

it("keeps reading open while a thinking-space trigger or modal is used", () => {
  const trigger = document.createElement("button"); trigger.dataset.preserveSeedReading = "";
  const modal = document.createElement("dialog"); modal.setAttribute("open", "");
  const option = document.createElement("button"); modal.append(option);
  document.body.append(trigger, modal);
  const dismiss = vi.fn(), view = render(<SeedReadingContent onDismiss={dismiss}>正文</SeedReadingContent>);
  try {
    fireEvent.pointerDown(trigger); fireEvent.pointerDown(option); fireEvent.pointerDown(modal);
    expect(dismiss).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body); expect(dismiss).toHaveBeenCalledOnce();
  } finally { view.unmount(); trigger.remove(); modal.remove(); }
});

it("allows appearance controls without dismissing reading",()=>{
  const bar=document.createElement("section");bar.dataset.testid="dialogue-workspace-bar";
  const input=document.createElement("input");input.type="radio";bar.append(input);document.body.append(bar);
  const dismiss=vi.fn();const view=render(<SeedReadingContent onDismiss={dismiss}>正文</SeedReadingContent>);
  fireEvent.pointerDown(input);expect(dismiss).not.toHaveBeenCalled();
  fireEvent.pointerDown(document.body);expect(dismiss).toHaveBeenCalledOnce();
  view.unmount();bar.remove();
});

it("releases the stage immediately while keeping outgoing reading inaccessible until its exit completes", async () => {
  const stage = document.createElement("div");
  stage.dataset.testid = "dialogue-stage-track";
  stage.inert = false;
  document.body.append(stage);
  const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
  const animations: { finish(): void; cancel: ReturnType<typeof vi.fn> }[] = [];
  const animate = vi.fn(() => {
    let finish!: () => void;
    const finished = new Promise<void>(resolve => { finish = resolve; });
    const cancel = vi.fn();
    animations.push({ finish, cancel });
    return { finished, cancel };
  });
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
  const dismiss = vi.fn();
  const view = render(<SeedReadingContent open onDismiss={dismiss}><button>继续写</button></SeedReadingContent>);
  try {
    expect(stage.inert).toBe(true);
    view.rerender(<SeedReadingContent open={false} onDismiss={dismiss}><button>继续写</button></SeedReadingContent>);
    expect(stage.inert).toBe(false);
    expect(document.getElementById("dialogue-reading-drawer")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("button", { name: "继续写" })).not.toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(dismiss).not.toHaveBeenCalled();
    await act(async () => { animations.at(-1)!.finish(); });
    expect(document.getElementById("dialogue-reading-drawer")).toBeNull();
  } finally {
    view.unmount();
    if (previous) Object.defineProperty(HTMLElement.prototype, "animate", previous);
    else Reflect.deleteProperty(HTMLElement.prototype, "animate");
    stage.remove();
  }
});

it("ignores a completed old exit when reading is reopened", async () => {
  const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
  const finishes: (() => void)[] = [];
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: vi.fn(() => {
    let finish!: () => void;
    const finished = new Promise<void>(resolve => { finish = resolve; });
    finishes.push(finish);
    return { finished, cancel: vi.fn() };
  }) });
  const dismiss = vi.fn();
  const view = render(<SeedReadingContent open onDismiss={dismiss}>正文</SeedReadingContent>);
  try {
    view.rerender(<SeedReadingContent open={false} onDismiss={dismiss}>正文</SeedReadingContent>);
    const oldExit = finishes.at(-1)!;
    view.rerender(<SeedReadingContent open onDismiss={dismiss}>正文</SeedReadingContent>);
    await act(async () => { oldExit(); });
    expect(document.getElementById("dialogue-reading-drawer")).toHaveAttribute("data-open", "true");
    expect(screen.getByText("正文")).toBeInTheDocument();
  } finally {
    view.unmount();
    if (previous) Object.defineProperty(HTMLElement.prototype, "animate", previous);
    else Reflect.deleteProperty(HTMLElement.prototype, "animate");
  }
});

it("presents keyboard and restored reading immediately while retaining a brief pointer transition", () => {
  const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
  const animate = vi.fn(() => ({ finished: new Promise(() => {}), cancel: vi.fn() }));
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
  const dismiss = vi.fn(), view = render(<SeedReadingContent motion="instant" onDismiss={dismiss}>正文</SeedReadingContent>);
  try {
    expect(animate).not.toHaveBeenCalled(); expect(screen.getByText("正文")).toBeVisible();
    view.rerender(<SeedReadingContent motion="instant" open={false} onDismiss={dismiss}>正文</SeedReadingContent>);
    expect(document.getElementById("dialogue-reading-drawer")).toBeNull();
    view.rerender(<SeedReadingContent motion="soft" onDismiss={dismiss}>正文</SeedReadingContent>);
    expect(animate).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ duration: 160 }));
  } finally {
    view.unmount(); if (previous) Object.defineProperty(HTMLElement.prototype, "animate", previous); else Reflect.deleteProperty(HTMLElement.prototype, "animate");
  }
});
