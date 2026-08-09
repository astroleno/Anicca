import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";

import {
  DialogueMetaballLayer,
  type DialogueMetaballRendererState
} from "./DialogueMetaballLayer";

const rendererMocks = vi.hoisted(() => ({
  create: vi.fn(),
  resize: vi.fn(),
  render: vi.fn(),
  dispose: vi.fn(),
  contextLost: null as (() => void) | null
}));

vi.mock("./metaball/renderer", () => ({
  DIALOGUE_METABALL_SMOOTHNESS: 0.055,
  createDialogueMetaballRenderer: rendererMocks.create
}));

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({})
  } as DOMRect;
}

function Harness({ onStateChange }: { onStateChange: (state: DialogueMetaballRendererState) => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  return (
    <div ref={hostRef} data-testid="host">
      <button
        data-testid="surface"
        data-metaball-surface="root"
        data-metaball-role="user"
        data-metaball-relation="focus"
      >
        Root
      </button>
      <DialogueMetaballLayer hostRef={hostRef} onStateChange={onStateChange} />
    </div>
  );
}

describe("DialogueMetaballLayer", () => {
  let nextFrameId = 0;
  let frames: Map<number, FrameRequestCallback>;
  let reducedMotion = false;
  let webglAvailable = true;

  beforeEach(() => {
    frames = new Map();
    nextFrameId = 0;
    reducedMotion = false;
    webglAvailable = true;
    rendererMocks.resize.mockReset();
    rendererMocks.render.mockReset();
    rendererMocks.dispose.mockReset();
    rendererMocks.contextLost = null;
    rendererMocks.create.mockReset().mockImplementation((_canvas, onContextLost) => {
      rendererMocks.contextLost = onContextLost;
      return {
        resize: rendererMocks.resize,
        render: rendererMocks.render,
        dispose: rendererMocks.dispose
      };
    });

    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      nextFrameId += 1;
      frames.set(nextFrameId, callback);
      return nextFrameId;
    });
    vi.stubGlobal("cancelAnimationFrame", (frameId: number) => {
      frames.delete(frameId);
    });
    vi.stubGlobal("devicePixelRatio", 2);
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)" && reducedMotion,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return (this as HTMLElement).dataset.testid === "host"
        ? rect(100, 50, 800, 600)
        : rect(350, 275, 150, 150);
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() =>
      webglAvailable ? ({} as never) : null
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function runNextFrame(timestamp = 1000) {
    const next = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
    expect(next).toBeDefined();
    frames.delete(next![0]);
    act(() => next![1](timestamp));
  }

  it("renders an aria-hidden canvas and reports ready after its first frame", () => {
    const onStateChange = vi.fn();
    render(<Harness onStateChange={onStateChange} />);

    const canvas = screen.getByTestId("dialogue-metaball-canvas");
    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(onStateChange).toHaveBeenCalledWith("loading");

    runNextFrame();

    expect(rendererMocks.resize).toHaveBeenCalledWith(800, 600, 1.25);
    expect(rendererMocks.render).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "root", radius: 0.125 })],
      1
    );
    expect(onStateChange).toHaveBeenLastCalledWith("ready");
    expect(canvas).toHaveAttribute("data-motion", "animated");
    expect(canvas).toHaveAttribute("data-fused-pairs", "");
  });

  it("freezes shader time while continuing geometry frames for reduced motion", () => {
    reducedMotion = true;
    render(<Harness onStateChange={vi.fn()} />);

    runNextFrame(1000);
    runNextFrame(1600);

    expect(rendererMocks.render).toHaveBeenNthCalledWith(1, expect.any(Array), 0);
    expect(rendererMocks.render).toHaveBeenNthCalledWith(2, expect.any(Array), 0);
    expect(screen.getByTestId("dialogue-metaball-canvas")).toHaveAttribute("data-motion", "reduced");
  });

  it("reports fallback when renderer construction fails", () => {
    const onStateChange = vi.fn();
    rendererMocks.create.mockImplementationOnce(() => {
      throw new Error("WebGL unavailable");
    });

    render(<Harness onStateChange={onStateChange} />);

    expect(onStateChange).toHaveBeenLastCalledWith("fallback");
    expect(frames.size).toBe(0);
  });

  it("reports fallback without constructing Three when WebGL is unavailable", () => {
    const onStateChange = vi.fn();
    webglAvailable = false;

    render(<Harness onStateChange={onStateChange} />);

    expect(rendererMocks.create).not.toHaveBeenCalled();
    expect(onStateChange).toHaveBeenLastCalledWith("fallback");
    expect(frames.size).toBe(0);
  });

  it("reports fallback after context loss and disposes on unmount", () => {
    const onStateChange = vi.fn();
    const { unmount } = render(<Harness onStateChange={onStateChange} />);
    runNextFrame();

    act(() => rendererMocks.contextLost?.());
    unmount();

    expect(onStateChange).toHaveBeenLastCalledWith("fallback");
    expect(rendererMocks.dispose).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
  });
});
