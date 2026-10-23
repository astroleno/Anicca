import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef, type CSSProperties } from "react";

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

function Harness({ onStateChange, caption = false, fallbackOffset }: { onStateChange: (state: DialogueMetaballRendererState) => void; caption?: boolean; fallbackOffset?: number }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  return (
    <div ref={hostRef} data-testid="host">
      <button
        data-testid="surface"
        data-metaball-surface="root"
        data-metaball-role="user"
        data-metaball-relation="focus"
        style={fallbackOffset === undefined ? undefined : { "--stage-label-offset-x": `${fallbackOffset}px` } as CSSProperties}
      >
        {caption ? <span data-seed-caption data-testid="caption"><strong>Root</strong></span> : "Root"}
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
    vi.useFakeTimers();
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
      return ["host", "dialogue-metaball-canvas"].includes((this as HTMLElement).dataset.testid || "")
        ? rect(100, 50, 800, 600)
        : rect(350, 275, 150, 150);
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() =>
      webglAvailable ? ({} as never) : null
    );
  });

  afterEach(() => {
    vi.useRealTimers();
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

    expect(rendererMocks.resize).toHaveBeenCalledWith(800, 600, 0.8);
    expect(rendererMocks.render).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "root", radius: 0.125 })],
      1,
      expect.objectContaining({ draggedId: null })
    );
    expect(onStateChange).toHaveBeenLastCalledWith("ready");
    expect(canvas).toHaveAttribute("data-motion", "animated");
    expect(canvas).toHaveAttribute("data-fused-pairs", "");
  });

  it("preserves a projected caption through a React fallback update and restores the fallback on context loss", () => {
    vi.spyOn(document, "createRange").mockReturnValue({ selectNodeContents: vi.fn(), getBoundingClientRect: () => rect(0, 0, 50, 20) } as unknown as Range);
    const onStateChange = vi.fn(), view = render(<Harness caption fallbackOffset={40} onStateChange={onStateChange} />);
    const caption = screen.getByTestId("caption"), surface = screen.getByTestId("surface");
    Object.defineProperties(caption, { offsetWidth: { value: 140 }, offsetHeight: { value: 28 } });
    runNextFrame();
    const projected = caption.style.transform;
    expect(projected).not.toBe("");
    view.rerender(<Harness caption fallbackOffset={180} onStateChange={onStateChange} />);
    expect(surface.style.getPropertyValue("--stage-label-offset-x")).toBe("180px");
    expect(caption.style.transform).toBe(projected);
    act(() => rendererMocks.contextLost?.());
    expect(caption.style.transform).toBe("");
    expect(surface.style.getPropertyValue("--stage-label-offset-x")).toBe("180px");
  });

  it("does not mistake a changed logical position for its own animation writes in the same frame", async () => {
    render(<Harness onStateChange={vi.fn()} />);
    runNextFrame(1000);
    const surface = screen.getByTestId("surface");
    fireEvent.pointerDown(surface, { pointerId: 81, button: 0 });
    runNextFrame(1016);
    await act(async () => { await Promise.resolve(); });
    act(() => { surface.style.left = "390px"; runNextFrame(1032); });
    const before = vi.mocked(Element.prototype.getBoundingClientRect).mock.calls.length;
    await act(async () => { await Promise.resolve(); });
    runNextFrame(1048);
    expect(vi.mocked(Element.prototype.getBoundingClientRect).mock.calls.length).toBeGreaterThan(before);
  });

  it("stops reduced-motion rendering until geometry changes", () => {
    reducedMotion = true;
    render(<Harness onStateChange={vi.fn()} />);

    runNextFrame(1000);
    expect(frames.size).toBe(0);
    expect(rendererMocks.render).toHaveBeenCalledTimes(1);
    act(() => window.dispatchEvent(new Event("resize")));
    runNextFrame(1600);

    expect(rendererMocks.render).toHaveBeenNthCalledWith(1, expect.any(Array), 0, expect.objectContaining({ draggedId: null }));
    expect(rendererMocks.render).toHaveBeenNthCalledWith(2, expect.any(Array), 0, expect.objectContaining({ draggedId: null }));
    expect(screen.getByTestId("dialogue-metaball-canvas")).toHaveAttribute("data-motion", "reduced");
  });

  it("pauses all near-stage rendering for the overview and resumes the same renderer", async () => {
    render(<Harness onStateChange={vi.fn()} />);
    runNextFrame(0);
    const count = rendererMocks.render.mock.calls.length;
    await act(async () => { screen.getByTestId("host").dataset.spacePaused = "true"; });
    fireEvent.pointerEnter(screen.getByTestId("host"));
    act(() => { window.dispatchEvent(new Event("resize")); vi.advanceTimersByTime(5000); });
    expect(frames.size).toBe(0); expect(rendererMocks.render).toHaveBeenCalledTimes(count);
    await act(async () => { delete screen.getByTestId("host").dataset.spacePaused; });
    runNextFrame(5016);
    expect(rendererMocks.render).toHaveBeenCalledTimes(count + 1);
    expect(rendererMocks.render.mock.lastCall?.[1]).toBe(0);
    act(() => vi.advanceTimersByTime(35));
    runNextFrame(5032);
    expect(rendererMocks.render.mock.lastCall?.[1]).toBe(.016);
    expect(rendererMocks.create).toHaveBeenCalledOnce(); expect(rendererMocks.dispose).not.toHaveBeenCalled();
  });

  it("reuses geometry during idle material animation and releases its timer", () => {
    const { unmount } = render(<Harness onStateChange={vi.fn()} />);
    runNextFrame(1000);
    const geometryReads = vi.mocked(Element.prototype.getBoundingClientRect).mock.calls.length;
    expect(frames.size).toBe(0);
    act(() => vi.advanceTimersByTime(90));
    runNextFrame(1090);
    expect(rendererMocks.render).toHaveBeenCalledTimes(2);
    expect(Element.prototype.getBoundingClientRect).toHaveBeenCalledTimes(geometryReads);
    unmount();
    act(() => vi.advanceTimersByTime(1000));
    expect(frames.size).toBe(0);
    expect(rendererMocks.render).toHaveBeenCalledTimes(2);
  });

  it("prepares pointer intent without measuring geometry", () => {
    render(<Harness onStateChange={vi.fn()} />);
    runNextFrame(0);
    const reads = vi.mocked(Element.prototype.getBoundingClientRect).mock.calls.length;
    fireEvent.pointerEnter(screen.getByTestId("host"));
    runNextFrame(16);
    expect(Element.prototype.getBoundingClientRect).toHaveBeenCalledTimes(reads);
    expect(frames.size).toBe(1);
  });

  it("does not remeasure a cursor-only orbit change and projects motion origins", async () => {
    vi.spyOn(document, "createRange").mockReturnValue({ selectNodeContents: vi.fn(), getBoundingClientRect: () => rect(0, 0, 50, 20) } as unknown as Range);
    render(<Harness caption onStateChange={vi.fn()} />);
    const caption = screen.getByTestId("caption");
    Object.defineProperties(caption, { offsetWidth: { value: 140 }, offsetHeight: { value: 28 } });
    runNextFrame(0);
    await act(async () => { screen.getByTestId("surface").dataset.liquidOrigins = JSON.stringify(["pending-thesis", "source-copy"]); });
    runNextFrame(16);
    expect(rendererMocks.render.mock.lastCall?.[0][0].emergeFrom).toEqual(["pending-thesis", "source-copy"]);
    const reads = vi.mocked(Element.prototype.getBoundingClientRect).mock.calls.length;
    await act(async () => { screen.getByTestId("host").className = "stageTrackPanning"; });
    fireEvent.pointerDown(screen.getByTestId("host")); runNextFrame(32);
    await act(async () => { screen.getByTestId("host").dataset.spaceYaw = ".15"; });
    runNextFrame(48);
    const surface = screen.getByTestId("surface");
    expect(surface.style.width).toBe(""); expect(surface.style.height).toBe("");
    expect(surface.style.transform).toContain("scale(");
    const scale = Number(surface.style.transform.match(/scale\(([^)]+)\)/)?.[1]);
    const counterScale = Number(caption.style.transform.match(/scale\(([^)]+)\)/)?.[1]);
    expect(scale).toBeGreaterThan(0);
    expect(scale * counterScale).toBeCloseTo(1, 8);
    fireEvent.pointerUp(window); runNextFrame(64);
    expect(Element.prototype.getBoundingClientRect).toHaveBeenCalledTimes(reads);
  });

  it("does not wake an idle reduced-motion stage just for pointer intent", () => {
    reducedMotion = true;
    render(<Harness onStateChange={vi.fn()} />); runNextFrame(0);
    fireEvent.pointerEnter(screen.getByTestId("host"));
    expect(frames.size).toBe(0);
  });

  it("keeps the liquid press bound to its original pointer until that pointer releases", () => {
    render(<Harness onStateChange={vi.fn()} />); runNextFrame(0);
    fireEvent.pointerDown(screen.getByTestId("surface"), { pointerId: 61, pointerType: "touch" }); runNextFrame(16);
    expect(rendererMocks.render.mock.lastCall?.[2].draggedId).toBe("root");
    fireEvent.pointerDown(screen.getByTestId("host"), { pointerId: 62, pointerType: "touch" });
    fireEvent.pointerUp(window, { pointerId: 62, pointerType: "touch" }); runNextFrame(32);
    expect(rendererMocks.render.mock.lastCall?.[2].draggedId).toBe("root");
    fireEvent.pointerUp(window, { pointerId: 61, pointerType: "touch" }); runNextFrame(48);
    expect(rendererMocks.render.mock.lastCall?.[2].draggedId).toBeNull();
  });

  it("releases liquid pressure when its pointer capture is lost", () => {
    render(<Harness onStateChange={vi.fn()} />); runNextFrame(0);
    const surface = screen.getByTestId("surface");
    fireEvent.pointerDown(surface, { pointerId: 71, pointerType: "touch" }); runNextFrame(16);
    fireEvent.lostPointerCapture(surface, { pointerId: 72, pointerType: "touch" }); runNextFrame(32);
    expect(rendererMocks.render.mock.lastCall?.[2].draggedId).toBe("root");
    fireEvent.lostPointerCapture(surface, { pointerId: 71, pointerType: "touch" }); runNextFrame(48);
    expect(rendererMocks.render.mock.lastCall?.[2].draggedId).toBeNull();
    fireEvent.pointerDown(surface, { pointerId: 73, pointerType: "touch" }); runNextFrame(64);
    expect(rendererMocks.render.mock.lastCall?.[2].draggedId).toBe("root");
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

  it("does not remeasure its own caption writes or read GPU pixels on the plain ground, and throttles field ink even during geometry changes", async () => {
    const gl = {
      PIXEL_PACK_BUFFER:1,PIXEL_PACK_BUFFER_BINDING:2,STREAM_READ:3,RGBA:4,UNSIGNED_BYTE:5,SYNC_GPU_COMMANDS_COMPLETE:6,
      TIMEOUT_EXPIRED:7,ALREADY_SIGNALED:8,CONDITION_SATISFIED:9,
      createBuffer:vi.fn(()=>({})),bindBuffer:vi.fn(),bufferData:vi.fn(),readPixels:vi.fn(),fenceSync:vi.fn(()=>({})),flush:vi.fn(),
      clientWaitSync:vi.fn(()=>7),getBufferSubData:vi.fn((_target:number,_offset:number,data:Uint8Array)=>data.set([20,20,20,255,20,20,20,255,20,20,20,255])),getParameter:vi.fn(()=>null),deleteSync:vi.fn(),deleteBuffer:vi.fn()
    };
    const { readPixels } = gl;
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(gl as never);
    vi.spyOn(document, "createRange").mockReturnValue({ selectNodeContents: vi.fn(), getBoundingClientRect: () => rect(0, 0, 50, 20) } as unknown as Range);
    const view = render(<Harness caption onStateChange={vi.fn()} />);
    Object.defineProperties(screen.getByTestId("caption"), { offsetWidth: { value: 140 }, offsetHeight: { value: 28 } });
    runNextFrame(1000);
    await act(async () => { await Promise.resolve(); });
    const geometryReads = vi.mocked(Element.prototype.getBoundingClientRect).mock.calls.length;
    act(() => vi.advanceTimersByTime(90)); runNextFrame(1090);
    expect(Element.prototype.getBoundingClientRect).toHaveBeenCalledTimes(geometryReads);
    expect(readPixels).not.toHaveBeenCalled();
    await act(async () => { screen.getByTestId("host").dataset.atmosphere = "true"; });
    runNextFrame(1200); expect(readPixels).toHaveBeenCalledTimes(3);
    fireEvent.pointerDown(screen.getByTestId("surface")); runNextFrame(1216);
    await act(async () => { screen.getByTestId("surface").style.setProperty("--stage-node-drag-x", "2px"); });
    runNextFrame(1232); expect(readPixels).toHaveBeenCalledTimes(3);
    expect(gl.getBufferSubData).not.toHaveBeenCalled();
    expect(readPixels.mock.calls.every(call=>typeof call[6]==="number")).toBe(true);
    gl.clientWaitSync.mockReturnValue(gl.CONDITION_SATISFIED);runNextFrame(1248);
    expect(screen.getByTestId("caption")).toHaveStyle({"--seed-caption-ink":"#fcfbff"});
    runNextFrame(1460); expect(readPixels).toHaveBeenCalledTimes(6);
    await act(async()=>{screen.getByTestId("host").dataset.theme="dark";});
    gl.clientWaitSync.mockReturnValue(gl.TIMEOUT_EXPIRED);runNextFrame(1476);
    expect(screen.getByTestId("caption").style.getPropertyValue("--seed-caption-ink")).toBe("");
    view.unmount();
    expect(gl.deleteBuffer).toHaveBeenCalledOnce();
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
