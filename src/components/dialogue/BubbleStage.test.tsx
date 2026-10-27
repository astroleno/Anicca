import { act, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BubbleStage } from "@/components/dialogue/BubbleStage";
import { useDialogueUiStore } from "@/features/dialectic/store";
import { DialogueStageNode } from "@/features/dialectic/viewModel";
import { spatialStagePoint, publishSpatialFrame } from "./liquid/space";

const metaballLayerMock = vi.hoisted(() => ({
  state: "ready" as "loading" | "ready" | "fallback"
}));

vi.mock("./DialogueMetaballLayer", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    DialogueMetaballLayer: ({
      onStateChange
    }: {
      onStateChange(state: "loading" | "ready" | "fallback"): void;
    }) => {
      React.useEffect(() => {
        onStateChange(metaballLayerMock.state);
      }, [onStateChange]);

      return React.createElement("canvas", {
        "aria-hidden": "true",
        "data-testid": "dialogue-metaball-canvas"
      });
    }
  };
});

function resetStageStore() {
  useDialogueUiStore.setState({
    workspaceSessionId: "ws_test",
    focusedNodeId: null,
    composerParentId: null,
    stageLayouts: {},
    errorState: null,
    pendingAction: null,
    pending: {
      branches: null,
      synthesis: null
    }
  });
}

function mockViewportRect(element: HTMLElement) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      width: 400,
      height: 300,
      top: 0,
      left: 0,
      right: 400,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({})
    })
  });
}

function stubPointerMode(pointer: "fine" | "coarse", narrow = false) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query === "(pointer: coarse)" ? pointer === "coarse" : query === "(max-width: 980px)" ? narrow : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  );
}

function mockTouchFrames() {
  let id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
  vi.stubGlobal("cancelAnimationFrame", (frameId: number) => frames.delete(frameId));
  return (timestamp = performance.now()) => act(() => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(timestamp)); });
}

describe("BubbleStage", () => {
  it("uses a two-finger slide for view rotation while leaving seed positions unchanged", () => {
    const nextTouchFrame = mockTouchFrames();
    render(<BubbleStage layoutKey="two-finger-orbit" nodes={[{ id: "a", label: "a", kind: "user", relation: "focus", seedX: 50, seedY: 50 }]} focusNodeId="a" onSelect={vi.fn()} />);
    const track = screen.getByTestId("dialogue-stage-track"), before = structuredClone(useDialogueUiStore.getState().stageLayouts["two-finger-orbit"]);
    fireEvent.pointerDown(track, { pointerType: "touch", pointerId: 101, clientX: 100, clientY: 150 });
    fireEvent.pointerDown(track, { pointerType: "touch", pointerId: 102, clientX: 300, clientY: 150 });
    fireEvent.pointerMove(window, { pointerId: 101, clientX: 130, clientY: 160 });
    fireEvent.pointerMove(window, { pointerId: 102, clientX: 330, clientY: 160 });
    nextTouchFrame();
    expect(Number(track.dataset.spaceYaw)).toBeCloseTo(.24);
    expect(Number(track.dataset.spacePitch)).toBeCloseTo(.06);
    expect(Number(track.dataset.spaceZoom)).toBeCloseTo(1);
    fireEvent.pointerMove(window, { pointerId: 101, clientX: 90, clientY: 160 });
    fireEvent.pointerMove(window, { pointerId: 102, clientX: 370, clientY: 160 });
    nextTouchFrame();
    expect(track).toHaveAttribute("data-space-touch-mode", "rotate");
    expect(Number(track.dataset.spaceZoom)).toBeCloseTo(1);
    fireEvent.pointerUp(window, { pointerId: 102 });
    const yaw = track.dataset.spaceYaw;
    fireEvent.pointerMove(window, { pointerId: 101, clientX: 380, clientY: 240 });
    expect(track.dataset.spaceYaw).toBe(yaw);
    fireEvent.pointerUp(window, { pointerId: 101 });
    expect(useDialogueUiStore.getState().stageLayouts["two-finger-orbit"]).toEqual(before);
  });

  it("pinches the shared view without rotating it and restores both scale and angle through reset", () => {
    const nextTouchFrame = mockTouchFrames();
    render(<BubbleStage layoutKey="pinch" nodes={[{ id: "a", label: "a", kind: "user", relation: "focus", seedX: 50, seedY: 50 }]} focusNodeId="a" onSelect={vi.fn()} />);
    const track = screen.getByTestId("dialogue-stage-track");
    fireEvent.pointerDown(track, { pointerType: "touch", pointerId: 103, clientX: 100, clientY: 150 });
    fireEvent.pointerDown(track, { pointerType: "touch", pointerId: 104, clientX: 300, clientY: 150 });
    fireEvent.pointerMove(window, { pointerId: 103, clientX: 80, clientY: 150 });
    fireEvent.pointerMove(window, { pointerId: 104, clientX: 320, clientY: 150 });
    nextTouchFrame();
    expect(Number(track.dataset.spaceZoom)).toBeCloseTo(1.2);
    expect(Number(track.dataset.spaceYaw)).toBeCloseTo(0);
    fireEvent.pointerMove(window, { pointerId: 103, clientX: -2000, clientY: 150 });
    nextTouchFrame();
    expect(Number(track.dataset.spaceZoom)).toBe(1.8);
    expect(Number(track.dataset.spaceYaw)).toBeCloseTo(0);
    expect(track).toHaveAttribute("data-space-touch-mode", "zoom");
    fireEvent.pointerUp(window, { pointerId: 103 }); fireEvent.pointerUp(window, { pointerId: 104 });
    fireEvent.click(screen.getByRole("button", { name: "复位三维视角" }));
    expect(track).toHaveAttribute("data-space-zoom", "1");
    expect(track).toHaveAttribute("data-space-yaw", "0");
  });

  it("keeps view control through an old seed capture loss and ignores a third finger", () => {
    const nextTouchFrame = mockTouchFrames();
    render(<BubbleStage layoutKey="capture-transfer" nodes={[{ id: "a", label: "a", kind: "user", relation: "focus", seedX: 50, seedY: 50 }]} focusNodeId="a" onSelect={vi.fn()} />);
    const track = screen.getByTestId("dialogue-stage-track"), seed = screen.getByTestId("dialogue-stage-node-a");
    fireEvent.pointerDown(seed, { button: 0, pointerType: "touch", pointerId: 121, clientX: 100, clientY: 150 });
    fireEvent.pointerDown(track, { pointerType: "touch", pointerId: 122, clientX: 300, clientY: 150 });
    fireEvent.lostPointerCapture(seed, { pointerType: "touch", pointerId: 121 });
    fireEvent.pointerDown(track, { pointerType: "touch", pointerId: 123, clientX: 200, clientY: 50 });
    fireEvent.pointerUp(window, { pointerId: 123 });
    expect(track).toHaveAttribute("data-space-navigating", "true");
    fireEvent.pointerMove(window, { pointerId: 121, clientX: 130, clientY: 150 });
    fireEvent.pointerMove(window, { pointerId: 122, clientX: 330, clientY: 150 });
    nextTouchFrame();
    expect(Number(track.dataset.spaceYaw)).toBeCloseTo(.24);
    fireEvent.pointerUp(window, { pointerId: 122 });
    expect(track).toHaveAttribute("data-space-navigating", "true");
    fireEvent.pointerUp(window, { pointerId: 121 });
    expect(track).not.toHaveAttribute("data-space-navigating");
    expect(useDialogueUiStore.getState().stageLayouts["capture-transfer"].nodePositions.a).toEqual({ x: 50, y: 50 });
  });

  it("ends two-finger navigation on overview and permits a fresh pinch after returning", () => {
    const nextTouchFrame = mockTouchFrames();
    const props = { layoutKey: "pinch-overview", nodes: [{ id: "a", label: "a", kind: "user" as const, relation: "focus" as const, seedX: 50, seedY: 50 }], focusNodeId: "a", onSelect: vi.fn() };
    const { rerender } = render(<BubbleStage {...props} />);
    const track = screen.getByTestId("dialogue-stage-track");
    fireEvent.pointerDown(track, { pointerType: "touch", pointerId: 105, clientX: 100, clientY: 150 });
    fireEvent.pointerDown(track, { pointerType: "touch", pointerId: 106, clientX: 300, clientY: 150 });
    fireEvent.pointerMove(window, { pointerId: 105, clientX: 80, clientY: 150 });
    nextTouchFrame();
    rerender(<BubbleStage {...props} suspended />);
    const zoom = track.dataset.spaceZoom;
    expect(track).not.toHaveAttribute("data-space-navigating");
    fireEvent.pointerMove(window, { pointerId: 106, clientX: 400, clientY: 150 });
    expect(track.dataset.spaceZoom).toBe(zoom);
    rerender(<BubbleStage {...props} />);
    fireEvent.pointerDown(track, { pointerType: "touch", pointerId: 107, clientX: 100, clientY: 150 });
    fireEvent.pointerDown(track, { pointerType: "touch", pointerId: 108, clientX: 300, clientY: 150 });
    fireEvent.pointerMove(window, { pointerId: 107, clientX: 80, clientY: 150 });
    fireEvent.pointerMove(window, { pointerId: 108, clientX: 320, clientY: 150 });
    nextTouchFrame();
    expect(Number(track.dataset.spaceZoom)).toBeGreaterThan(Number(zoom));
  });

  it("allows one-finger-stationary pinching after resolving ambiguous initial movement", () => {
    const nextTouchFrame = mockTouchFrames();
    render(<BubbleStage layoutKey="stationary-pinch" nodes={[{ id: "a", label: "a", kind: "user", relation: "focus", seedX: 50, seedY: 50 }]} focusNodeId="a" onSelect={vi.fn()} />);
    const track = screen.getByTestId("dialogue-stage-track");
    fireEvent.pointerDown(track, { pointerType: "touch", pointerId: 131, clientX: 100, clientY: 150 });
    fireEvent.pointerDown(track, { pointerType: "touch", pointerId: 132, clientX: 300, clientY: 150 });
    fireEvent.pointerMove(window, { pointerId: 132, clientX: 350, clientY: 150 });
    nextTouchFrame(1000);
    expect(Number(track.dataset.spaceZoom)).toBe(1);
    nextTouchFrame(1100);
    expect(Number(track.dataset.spaceZoom)).toBe(1.25);
    expect(Number(track.dataset.spaceYaw)).toBe(0);
  });

  it("updates the caption boundary when the external context appears and disappears", async () => {
    const nodes: DialogueStageNode[] = [{ id: "seed", label: "想法", kind: "user", relation: "focus", seedX: 50, seedY: 50 }];
    const scene = (context: boolean) => <div data-testid="dialogue-shell">
      <BubbleStage layoutKey="caption-context" nodes={nodes} focusNodeId="seed" onSelect={vi.fn()} />
      {context ? <p data-testid="caption-context" data-stage-label-chrome="top" /> : null}
    </div>;
    const { rerender } = render(scene(true));
    mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
    const context = screen.getByTestId("caption-context");
    Object.defineProperty(context, "getBoundingClientRect", { value: () => ({ top: 0, bottom: 80, width: 400, height: 80 }) });
    act(() => { context.textContent = "沿极性展开 · 个体 ↔ 群体"; });
    await waitFor(() => expect(screen.getByTestId("dialogue-stage-track")).toHaveAttribute("data-label-inset-top", "80"));
    const layout = structuredClone(useDialogueUiStore.getState().stageLayouts["caption-context"]);
    rerender(scene(false));
    await waitFor(() => expect(screen.getByTestId("dialogue-stage-track")).toHaveAttribute("data-label-inset-top", "0"));
    expect(useDialogueUiStore.getState().stageLayouts["caption-context"]).toEqual(layout);
  });

  it("hands each arriving pole its own preview and keeps the selected instance as its origin", () => {
    render(<BubbleStage layoutKey="arrival-origins" focusNodeId="source-copy" onSelect={vi.fn()}
      arrivals={{ sourceId: "source-copy", firstId: "individual", secondId: "group" }} eventNodeId="fusion"
      nodes={[
        { id: "source-copy", conceptId: "canonical", label: "分身", kind: "assistant", relation: "focus", sourceRole: "source", seedX: 25, seedY: 30 },
        { id: "other", label: "另一来源", kind: "assistant", relation: "child", sourceRole: "source", seedX: 75, seedY: 30 },
        { id: "individual", label: "个体", kind: "assistant", relation: "child", seedX: 25, seedY: 65 },
        { id: "group", label: "群体", kind: "assistant", relation: "child", seedX: 75, seedY: 65 },
        { id: "fusion", label: "合", kind: "assistant", branchType: "合", relation: "child", seedX: 50, seedY: 50 }
      ]} />);
    expect(JSON.parse(screen.getByTestId("dialogue-stage-node-individual").dataset.liquidOrigins!)).toEqual(["pending-thesis", "source-copy"]);
    expect(JSON.parse(screen.getByTestId("dialogue-stage-node-group").dataset.liquidOrigins!)).toEqual(["pending-antithesis", "source-copy"]);
    expect(JSON.parse(screen.getByTestId("dialogue-stage-node-fusion").dataset.liquidOrigins!)).toEqual(["pending-synthesis", "source-copy", "other"]);
  });

  it("does not turn temporary depth avoidance into the saved depth of a dragged instance", () => {
    const z = .06 * 2.4 / (2 / 1.75);
    render(<BubbleStage layoutKey="instance-depth" nodes={[
      { id: "copy", conceptId: "concept", label: "共享概念", kind: "user", relation: "child", seedX: 30, seedY: 50, seedZ: z }
    ]} focusNodeId="copy" onSelect={vi.fn()} />);
    mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
    const node = { id: "copy", center: [-.2, 0] as [number, number], depth: .06, radius: .1, color: [1,1,1] as [number,number,number], emphasis: 1 };
    publishSpatialFrame(screen.getByTestId("dialogue-stage-track"), { base: [node], rendered: [{ ...node, depth: .6 }], pivot: [0,0], height: 300, scale: 1 });
    fireEvent.pointerDown(screen.getByTestId("dialogue-stage-node-copy"), { button: 0, pointerId: 81, clientX: 120, clientY: 150 });
    fireEvent.pointerMove(window, { pointerId: 81, clientX: 170, clientY: 150 });
    fireEvent.pointerUp(window, { pointerId: 81, clientX: 170, clientY: 150 });
    expect(useDialogueUiStore.getState().stageLayouts["instance-depth"].nodePositions.copy.z).toBeCloseTo(z);
  });

  it.each([false,true])("requires a fresh physical dwell after separation, renewed=%s",renewed=>{
    vi.useFakeTimers();
    try {
      const action={key:"a:b",lineageParentId:"",thesisId:"a",antithesisId:"b",synthesisId:null,label:"a / b",available:true},run=vi.fn();
      render(<BubbleStage layoutKey="physical-dwell" nodes={[
        {id:"a",label:"a",kind:"assistant",branchType:"正",relation:"child",seedX:28,seedY:70},
        {id:"b",label:"b",kind:"assistant",branchType:"反",relation:"child",seedX:72,seedY:70}
      ]} focusNodeId="a" onSelect={vi.fn()} synthesisAction={action} onProposeSynthesis={run}/>);
      mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
      fireEvent.pointerDown(screen.getByTestId("dialogue-stage-node-a"),{button:0,pointerId:91,clientX:112,clientY:210});
      fireEvent.pointerMove(window,{pointerId:91,clientX:240,clientY:210});
      const a={id:"a",center:[.133333,-.2] as [number,number],depth:0,radius:.1,color:[1,1,1] as [number,number,number],emphasis:1};
      const b={...a,id:"b",center:[.293333,-.2] as [number,number]};
      const frame={base:[a,b],rendered:[a,b],pivot:[0,0] as [number,number],height:300,scale:1};
      const host=screen.getByTestId("dialogue-stage-track");publishSpatialFrame(host,frame);
      act(()=>vi.advanceTimersByTime(400));expect(screen.getByTestId("dialogue-synthesis-bridge-preview")).toHaveAttribute("data-armed","true");
      publishSpatialFrame(host,{...frame,rendered:[{...a,depth:-.6},b]});
      act(()=>vi.advanceTimersByTime(40));expect(screen.getByTestId("dialogue-synthesis-bridge-preview")).toHaveAttribute("data-armed","false");
      publishSpatialFrame(host,frame);act(()=>vi.advanceTimersByTime(renewed?400:40));
      fireEvent.pointerUp(window,{pointerId:91,clientX:240,clientY:210});
      fireEvent.pointerUp(window,{pointerId:91,clientX:240,clientY:210});
      expect(run).toHaveBeenCalledTimes(renewed?1:0);
    }finally{vi.useRealTimers();}
  });

  it("passes the seed's saved polarity into its material, independently of current placement",()=>{
    render(<BubbleStage layoutKey="polarity-colors" nodes={[-1,1].map((value,index)=>({
      id:`pole-${index}`,label:"同一角色",kind:"assistant" as const,branchType:"正" as const,relation:"child" as const,seedX:30+index*40,seedY:50,
      perspective:{axes:[{id:"scale",label:"尺度",negative:"细节",positive:"整体",value,source:"model" as const}]}
    }))} focusNodeId={null} onSelect={vi.fn()}/>);
    const negative=screen.getByTestId("dialogue-stage-node-pole-0"),positive=screen.getByTestId("dialogue-stage-node-pole-1");
    expect(Number(negative.dataset.seedHueShift)).toBeCloseTo(-Number(positive.dataset.seedHueShift));
    expect(negative.dataset.seedHueShift).not.toBe(positive.dataset.seedHueShift);
    expect(positive).toHaveAttribute("data-seed-polarity-strength","1");
  });
  it.each(["quick", "away", "cancel", "blur", "escape"])("does not synthesize on %s", mode => {
    vi.useFakeTimers();
    try {
      const action = { key: "a:b", lineageParentId: "", thesisId: "a", antithesisId: "b", synthesisId: null, label: "a / b", available: true };
      const run = vi.fn();
      render(<BubbleStage layoutKey="cancel-pair" nodes={[
        { id: "a", label: "a", kind: "user", relation: "child", seedX: 25, seedY: 50 },
        { id: "b", label: "b", kind: "user", relation: "child", seedX: 75, seedY: 50 }
      ]} focusNodeId="a" onSelect={vi.fn()} resolveSynthesisAction={() => action} onProposeSynthesis={run} />);
      mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
      fireEvent.pointerDown(screen.getByTestId("dialogue-stage-node-a"), { button: 0, pointerId: 1, clientX: 100, clientY: 150 });
      fireEvent.pointerMove(window, { pointerId: 1, clientX: 280, clientY: 150 });
      if (mode !== "quick") act(() => vi.advanceTimersByTime(400));
      if (mode === "away") fireEvent.pointerMove(window, { pointerId: 1, clientX: 100, clientY: 150 });
      if (mode === "cancel") fireEvent.pointerCancel(window, { pointerId: 1 });
      if (mode === "blur") fireEvent.blur(window);
      if (mode === "escape") fireEvent.keyDown(window, { key: "Escape" });
      fireEvent.pointerUp(window, { pointerId: 1, clientX: mode === "away" ? 100 : 280, clientY: 150 });
      act(() => vi.advanceTimersByTime(400));
      expect(run).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("places both pair captions from the first contact without requiring a second pointer move", () => {
    const action = { key: "a:b", lineageParentId: "", thesisId: "a", antithesisId: "b", synthesisId: null, label: "a / b", available: true };
    render(<BubbleStage layoutKey="first-pair-caption" nodes={[
      { id: "a", label: "a", kind: "user", relation: "child", seedX: 25, seedY: 50 },
      { id: "b", label: "b", kind: "user", relation: "child", seedX: 75, seedY: 50 }
    ]} focusNodeId="a" onSelect={vi.fn()} resolveSynthesisAction={() => action} />);
    mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
    const source = screen.getByTestId("dialogue-stage-node-a");
    Object.defineProperty(source, "offsetHeight", { configurable: true, value: 104 });
    Object.defineProperty(screen.getByTestId("dialogue-stage-node-b"), "offsetHeight", { configurable: true, value: 100 });
    fireEvent.pointerDown(source, { button: 0, pointerId: 1, clientX: 100, clientY: 150 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 280, clientY: 150 });
    expect(screen.getByTestId("dialogue-synthesis-pair-label").style.getPropertyValue("--pair-caption-offset")).toBe("70px");
    fireEvent.pointerCancel(window, { pointerId: 1 });
  });

  it("double click splits once without opening the reading card; keyboard activation still reads", () => {
    vi.useFakeTimers();
    try {
      const read = vi.fn(), split = vi.fn();
      render(<BubbleStage layoutKey="double" nodes={[{ id: "a", label: "a", kind: "user", relation: "focus", seedX: 50, seedY: 50 }]}
        focusNodeId="a" onSelect={read} onSplit={split} />);
      const node = screen.getByTestId("dialogue-stage-node-a");
      fireEvent.click(node, { detail: 1 });
      fireEvent.click(node, { detail: 2 });
      fireEvent.doubleClick(node);
      act(() => vi.advanceTimersByTime(300));
      expect(read).not.toHaveBeenCalled();
      expect(split).toHaveBeenCalledExactlyOnceWith("a");
      fireEvent.click(node, { detail: 0 });
      expect(read).toHaveBeenCalledExactlyOnceWith("a");
    } finally { vi.useRealTimers(); }
  });
  beforeEach(() => {
    resetStageStore();
    metaballLayerMock.state = "ready";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("persists dragged node positions into the focus snapshot layout", () => {
    const nodes: DialogueStageNode[] = [
      {
        id: "root",
        label: "主题",
        kind: "user",
        relation: "focus",
        seedX: 50,
        seedY: 50
      }
    ];
    const onSelect = vi.fn();

    render(<BubbleStage layoutKey="focus:root" nodes={nodes} focusNodeId="root" onSelect={onSelect} />);

    mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
    const node = screen.getByTestId("dialogue-stage-node-root");

    fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 200, clientY: 150 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 240, clientY: 180 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 240, clientY: 180 });
    fireEvent.click(node);

    expect(useDialogueUiStore.getState().stageLayouts["focus:root"].nodePositions.root).toMatchObject({
      x: 60,
      y: 60,
      z: expect.any(Number)
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("requires dwell and release before requesting synthesis once", () => {
    vi.useFakeTimers();
    try {
    const nodes: DialogueStageNode[] = [
      {
        id: "thesis",
        label: "继续",
        kind: "assistant",
        branchType: "正",
        relation: "child",
        seedX: 28,
        seedY: 70
      },
      {
        id: "antithesis",
        label: "暂停",
        kind: "assistant",
        branchType: "反",
        relation: "child",
        seedX: 72,
        seedY: 70
      }
    ];
    const synthesisAction = {
      key: "pair:root",
      lineageParentId: "root",
      thesisId: "thesis",
      antithesisId: "antithesis",
      synthesisId: null,
      label: "继续 / 暂停",
      available: true
    };
    const onProposeSynthesis = vi.fn();

    render(
      <BubbleStage
        layoutKey="focus:root"
        nodes={nodes}
        focusNodeId="root"
        onSelect={vi.fn()}
        synthesisAction={synthesisAction}
        onProposeSynthesis={onProposeSynthesis}
      />
    );

    mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
    const thesis = screen.getByTestId("dialogue-stage-node-thesis");
    fireEvent.pointerDown(thesis, { button: 0, pointerId: 11, clientX: 112, clientY: 210 });
    fireEvent.pointerMove(window, { pointerId: 11, clientX: 240, clientY: 210 });

    expect(screen.getByTestId("dialogue-synthesis-bridge-preview")).toBeInTheDocument();
    expect(screen.getByTestId("dialogue-synthesis-pair-label")).toHaveTextContent(/继续.*暂停/);
    expect(thesis).toHaveAttribute("data-label-handoff", "true");
    expect(screen.getByTestId("dialogue-stage-node-antithesis")).toHaveAttribute("data-label-handoff", "true");
    expect(thesis).toHaveAccessibleName(/继续.*正方/);
    expect(onProposeSynthesis).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(319));
    expect(screen.getByTestId("dialogue-synthesis-bridge-preview")).toHaveAttribute("data-armed", "false");
    expect(onProposeSynthesis).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId("dialogue-synthesis-bridge-preview")).toHaveAttribute("data-armed", "true");

    fireEvent.pointerUp(window, { pointerId: 11, clientX: 240, clientY: 210 });

    expect(screen.queryByTestId("dialogue-synthesis-bridge-preview")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dialogue-synthesis-pair-label")).not.toBeInTheDocument();
    expect(thesis).not.toHaveAttribute("data-label-handoff");
    expect(onProposeSynthesis).toHaveBeenCalledWith(synthesisAction);
    expect(onProposeSynthesis).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("dialogue-synthesis-proposal")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts the accessible name with the visible title and describes the full meaning separately", () => {
    const nodes: DialogueStageNode[] = [
      {
        id: "thesis",
        label: "缩小范围",
        preview: "继续，但是把范围切小一点。",
        summary: "先缩范围，再推进。",
        kind: "assistant",
        branchType: "正",
        relation: "child",
        seedX: 50,
        seedY: 50
      }
    ];

    render(<BubbleStage layoutKey="focus:root" nodes={nodes} focusNodeId="thesis" onSelect={vi.fn()} />);

    const button = screen.getByRole("button", { name: /^缩小范围，正方，.*下游节点/ });
    expect(button).toHaveAccessibleDescription("继续，但是把范围切小一点。；先缩范围，再推进。");
  });

  it("marks a growth stage and preserves its lower growth layout seed", () => {
    const nodes: DialogueStageNode[] = [
      {
        id: "growth-root",
        label: "主题",
        kind: "user",
        relation: "focus",
        isGrowthPerspective: true,
        seedX: 50,
        seedY: 40
      },
      {
        id: "growth-lower",
        label: "合并",
        kind: "assistant",
        relation: "child",
        isGrowthPerspective: true,
        seedX: 80,
        seedY: 88
      }
    ];

    render(<BubbleStage layoutKey="focus:growth" nodes={nodes} focusNodeId="growth-root" onSelect={vi.fn()} />);

    expect(screen.getByTestId("dialogue-stage")).toHaveAttribute("data-layout", "growth");
    expect(screen.getByTestId("dialogue-stage-node-growth-lower")).toHaveStyle({ top: "88%" });
  });

  it("uses compact Growth seeds and reserves a third mobile row for five children", () => {
    stubPointerMode("coarse", true);
    const nodes: DialogueStageNode[] = [
      {
        id: "growth-root",
        label: "主题",
        kind: "user",
        relation: "focus",
        isGrowthPerspective: true,
        seedX: 50,
        seedY: 40
      },
      ...["one", "two", "three", "four", "merge"].map((id, index) => ({
        id,
        label: id,
        kind: "assistant" as const,
        relation: "child" as const,
        isGrowthPerspective: true,
        seedX: 20 + index * 10,
        seedY: 65,
        compactSeedX: index === 4 ? 50 : index % 2 === 0 ? 20 : 80,
        compactSeedY: 62 + Math.floor(index / 2) * 13
      }))
    ];

    render(<BubbleStage layoutKey="focus:growth-dense" nodes={nodes} focusNodeId="growth-root" onSelect={vi.fn()} />);

    expect(screen.getByTestId("dialogue-stage")).toHaveAttribute("data-growth-compact-rows", "3");
    expect(screen.getByTestId("dialogue-stage-node-merge")).toHaveStyle({ left: "50%", top: "88%" });
  });

  it("does not let an imported wide Growth position override the compact seed", () => {
    stubPointerMode("coarse", true);
    useDialogueUiStore.setState({
      stageLayouts: {
        "focus:growth-import": {
          pan: { x: 18, y: -12 },
          nodePositions: {
            "growth-merge": { x: 80, y: 65 }
          }
        }
      }
    });
    const nodes: DialogueStageNode[] = [
      {
        id: "growth-root",
        label: "主题",
        kind: "user",
        relation: "focus",
        isGrowthPerspective: true,
        seedX: 50,
        seedY: 40
      },
      {
        id: "growth-merge",
        label: "合并",
        kind: "assistant",
        relation: "child",
        isGrowthPerspective: true,
        seedX: 80,
        seedY: 65,
        compactSeedX: 50,
        compactSeedY: 88
      }
    ];

    render(<BubbleStage layoutKey="focus:growth-import" nodes={nodes} focusNodeId="growth-root" onSelect={vi.fn()} />);

    expect(screen.getByTestId("dialogue-stage-node-growth-merge")).toHaveStyle({ left: "50%", top: "88%" });
  });

  it("stores narrow Growth drags separately from the wide layout", () => {
    stubPointerMode("coarse", true);
    const nodes: DialogueStageNode[] = [
      {
        id: "growth-root",
        label: "主题",
        kind: "user",
        relation: "focus",
        isGrowthPerspective: true,
        seedX: 50,
        seedY: 40
      },
      {
        id: "growth-merge",
        label: "合并",
        kind: "assistant",
        relation: "child",
        isGrowthPerspective: true,
        seedX: 80,
        seedY: 65,
        compactSeedX: 50,
        compactSeedY: 88
      }
    ];

    render(<BubbleStage layoutKey="focus:growth-compact-drag" nodes={nodes} focusNodeId="growth-root" onSelect={vi.fn()} />);

    mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
    const merge = screen.getByTestId("dialogue-stage-node-growth-merge");
    fireEvent.pointerDown(merge, { button: 0, pointerId: 10, clientX: 200, clientY: 264 });
    fireEvent.pointerMove(window, { pointerId: 10, clientX: 240, clientY: 246 });
    fireEvent.pointerUp(window, { pointerId: 10, clientX: 240, clientY: 246 });

    const layout = useDialogueUiStore.getState().stageLayouts["focus:growth-compact-drag"] as {
      nodePositions: Record<string, { x: number; y: number }>;
      compact?: { nodePositions: Record<string, { x: number; y: number }> };
    };
    expect(layout.nodePositions["growth-merge"]).toEqual({ x: 80, y: 65 });
    expect(layout.compact?.nodePositions["growth-merge"]).toMatchObject({ x: 60, y: 82, z: expect.any(Number) });
    expect(merge.style.getPropertyValue("--stage-node-drag-x")).toBe("0px");
    expect(merge.style.getPropertyValue("--stage-node-drag-y")).toBe("0px");
  });

  it("orbits the scene without changing saved node positions and restores the view", () => {
    const nodes: DialogueStageNode[] = [
      {
        id: "root",
        label: "主题",
        kind: "user",
        relation: "focus",
        seedX: 50,
        seedY: 50
      }
    ];

    render(<BubbleStage layoutKey="focus:root" nodes={nodes} focusNodeId="root" onSelect={vi.fn()} />);

    mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
    const track = screen.getByTestId("dialogue-stage-track");

    fireEvent.pointerDown(track, { button: 0, pointerId: 2, clientX: 140, clientY: 110 });
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 176, clientY: 84 });
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 176, clientY: 84 });

    expect(useDialogueUiStore.getState().stageLayouts["focus:root"]).toMatchObject({
      pan: { x: 0, y: 0 },
      nodePositions: { root: { x: 50, y: 50 } }
    });
    expect(Number(track.dataset.spaceYaw)).toBeCloseTo(.144);
    expect(Number(track.dataset.spacePitch)).toBeCloseTo(-.078);
    fireEvent.click(screen.getByRole("button", {name:"复位三维视角"}));
    expect(track).toHaveAttribute("data-space-yaw", "0");
    expect(track).toHaveAttribute("data-space-pitch", "0");
  });

  it("pans blank space with one finger without rotating or moving saved seeds", () => {
    const nodes: DialogueStageNode[] = [
      {
        id: "root",
        label: "主题",
        kind: "user",
        relation: "focus",
        seedX: 50,
        seedY: 50
      }
    ];

    render(<BubbleStage layoutKey="focus:root" nodes={nodes} focusNodeId="root" onSelect={vi.fn()} />);

    mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
    const track = screen.getByTestId("dialogue-stage-track");

    fireEvent.pointerDown(track, { button: 0, pointerId: 8, pointerType: "touch", clientX: 140, clientY: 110 });
    fireEvent.pointerMove(window, { pointerId: 8, pointerType: "touch", clientX: 140, clientY: 190 });
    expect(track).toHaveAttribute("data-space-pan-y", "80");
    expect(track.style.getPropertyValue("--stage-touch-pan-y")).toBe("80px");
    fireEvent.pointerUp(window, { pointerId: 8, pointerType: "touch", clientX: 140, clientY: 190 });

    expect(useDialogueUiStore.getState().stageLayouts["focus:root"].pan).toEqual({ x: 0, y: 0 });
    expect(useDialogueUiStore.getState().stageLayouts["focus:root"].nodePositions.root).toEqual({ x: 50, y: 50 });
    expect(track).toHaveAttribute("data-space-yaw", "0");
    expect(track).toHaveAttribute("data-space-zoom", "1");
    fireEvent.keyDown(track, { key: "Home" });
    expect(track).toHaveAttribute("data-space-pan-y", "0");
  });

  it("hands a pan over to two-finger rotation without a jump and keeps blank space reachable", () => {
    const nextTouchFrame = mockTouchFrames();
    render(<BubbleStage layoutKey="pan-handoff" nodes={[{ id: "a", label: "a", kind: "user", relation: "focus", seedX: 50, seedY: 50 }]} focusNodeId="a" onSelect={vi.fn()} />);
    const track = screen.getByTestId("dialogue-stage-track"), viewport = screen.getByTestId("dialogue-stage-viewport");
    mockViewportRect(viewport);
    fireEvent.pointerDown(track, { button: 0, pointerType: "touch", pointerId: 141, clientX: 100, clientY: 150 });
    fireEvent.pointerMove(window, { pointerId: 141, clientX: 130, clientY: 170 });
    expect(track).toHaveAttribute("data-space-pan-x", "30");
    fireEvent.pointerDown(track, { button: 0, pointerType: "touch", pointerId: 142, clientX: 300, clientY: 170 });
    expect(track).toHaveAttribute("data-space-pan-x", "30");
    fireEvent.pointerMove(window, { pointerId: 141, clientX: 160, clientY: 180 });
    fireEvent.pointerMove(window, { pointerId: 142, clientX: 330, clientY: 180 }); nextTouchFrame();
    expect(Number(track.dataset.spaceYaw)).toBeCloseTo(.24);
    expect(track).toHaveAttribute("data-space-pan-x", "30");
    fireEvent.pointerUp(window, { pointerId: 142 });
    fireEvent.pointerMove(window, { pointerId: 141, clientX: 300, clientY: 240 });
    expect(track).toHaveAttribute("data-space-pan-x", "30");
    fireEvent.pointerUp(window, { pointerId: 141 });
    fireEvent.pointerDown(viewport, { button: 0, pointerType: "touch", pointerId: 143, clientX: 10, clientY: 50 });
    fireEvent.pointerMove(window, { pointerId: 143, clientX: -30, clientY: 80 });
    fireEvent.pointerUp(window, { pointerId: 143, clientX: -30, clientY: 80 });
    expect(track).toHaveAttribute("data-space-pan-x", "-10");
    expect(track).toHaveAttribute("data-space-pan-y", "50");
    expect(useDialogueUiStore.getState().stageLayouts["pan-handoff"].nodePositions.a).toEqual({ x: 50, y: 50 });
  });

  it("resets a mobile camera request without rearranging persisted seeds", () => {
    const props = { layoutKey: "mobile-reset", nodes: [{ id: "a", label: "a", kind: "user" as const, relation: "focus" as const, seedX: 37, seedY: 61 }], focusNodeId: "a", onSelect: vi.fn() };
    const { rerender } = render(<BubbleStage {...props} />);
    const track = screen.getByTestId("dialogue-stage-track"); mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
    fireEvent.pointerDown(track, { button: 0, pointerId: 181, pointerType: "touch", clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 181, pointerType: "touch", clientX: -700, clientY: -100 });
    fireEvent.pointerUp(window, { pointerId: 181, pointerType: "touch", clientX: -700, clientY: -100 });
    expect(track).toHaveAttribute("data-space-pan-x", "-800");
    const saved = structuredClone(useDialogueUiStore.getState().stageLayouts["mobile-reset"]);
    rerender(<BubbleStage {...props} cameraView={{ direction: "reset", revision: 1 }} />);
    expect(track).toHaveAttribute("data-space-pan-x", "0"); expect(track).toHaveAttribute("data-space-pan-y", "0");
    expect(track).toHaveAttribute("data-space-yaw", "0"); expect(track).toHaveAttribute("data-space-pitch", "0"); expect(track).toHaveAttribute("data-space-zoom", "1");
    expect(useDialogueUiStore.getState().stageLayouts["mobile-reset"]).toEqual(saved);
  });

  it("cancels an unfinished pan with Escape and ends it safely when reading covers the stage", () => {
    const props = { layoutKey: "cancel-pan", nodes: [{ id: "a", label: "a", kind: "user" as const, relation: "focus" as const, seedX: 50, seedY: 50 }], focusNodeId: "a", onSelect: vi.fn() };
    const { rerender } = render(<BubbleStage {...props} />);
    const track = screen.getByTestId("dialogue-stage-track");
    mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
    fireEvent.pointerDown(track, { button: 0, pointerType: "touch", pointerId: 144, clientX: 100, clientY: 150 });
    fireEvent.pointerMove(window, { pointerId: 144, clientX: 140, clientY: 180 });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(track).toHaveAttribute("data-space-pan-x", "0");
    fireEvent.pointerUp(window, { pointerId: 144 });
    fireEvent.pointerDown(track, { button: 0, pointerType: "touch", pointerId: 145, clientX: 100, clientY: 150 });
    fireEvent.pointerMove(window, { pointerId: 145, clientX: 140, clientY: 180 });
    rerender(<BubbleStage {...props} suspended />);
    fireEvent.pointerMove(window, { pointerId: 145, clientX: 200, clientY: 250 });
    expect(track).toHaveAttribute("data-space-pan-x", "40");
    rerender(<BubbleStage {...props} />);
    fireEvent.keyDown(track, { key: "Home" });
    expect(track).toHaveAttribute("data-space-pan-x", "0");
  });

  it("keeps a dragged seed under the pointer after the camera rotates", () => {
    const node: DialogueStageNode = { id: "spatial-drag", label: "种子", kind: "user", relation: "focus", seedX: 50, seedY: 50 };
    render(<BubbleStage layoutKey="spatial-drag" nodes={[node]} focusNodeId={node.id} onSelect={vi.fn()} />);
    const viewport = screen.getByTestId("dialogue-stage-viewport"), track = screen.getByTestId("dialogue-stage-track");
    mockViewportRect(viewport); mockViewportRect(track);
    fireEvent.keyDown(track, {key:"ArrowRight"}); fireEvent.keyDown(track, {key:"ArrowRight"});
    fireEvent.keyDown(track, {key:"ArrowUp"});
    const orbit = { yaw:Number(track.dataset.spaceYaw), pitch:Number(track.dataset.spacePitch) };
    const start = spatialStagePoint({x:50,y:50}, node.id, orbit, {width:400,height:300}, 300);
    const button = screen.getByTestId(`dialogue-stage-node-${node.id}`);
    vi.spyOn(button,"getBoundingClientRect").mockReturnValue({x:start.x*4-50,y:start.y*3-50,
      left:start.x*4-50,top:start.y*3-50,right:start.x*4+50,bottom:start.y*3+50,width:100,height:100,toJSON:()=>({})});
    fireEvent.pointerDown(button, {button:0,pointerId:11,clientX:start.x*4,clientY:start.y*3});
    fireEvent.pointerMove(window, {pointerId:11,clientX:start.x*4+40,clientY:start.y*3+18});
    fireEvent.keyDown(track,{key:"Home"});
    expect(Number(track.dataset.spaceYaw)).toBe(orbit.yaw);
    fireEvent.pointerUp(window, {pointerId:11,clientX:start.x*4+40,clientY:start.y*3+18});
    const saved = useDialogueUiStore.getState().stageLayouts["spatial-drag"].nodePositions[node.id];
    const screenPosition = spatialStagePoint(saved,node.id,orbit,{width:400,height:300},300);
    expect(screenPosition.x*4).toBeCloseTo(start.x*4+40,6);
    expect(screenPosition.y*3).toBeCloseTo(start.y*3+18,6);
    const beforeReset = {...saved};
    fireEvent.keyDown(track,{key:"Home"});
    expect(track).toHaveAttribute("data-space-yaw","0");
    expect(useDialogueUiStore.getState().stageLayouts["spatial-drag"].nodePositions[node.id]).toEqual(beforeReset);
  });

  it("drags a seed vertically with one finger without waiting for pickup", () => {
    const nodes: DialogueStageNode[] = [
      {
        id: "root",
        label: "主题",
        kind: "user",
        relation: "focus",
        seedX: 50,
        seedY: 50
      }
    ];

    render(<BubbleStage layoutKey="focus:root" nodes={nodes} focusNodeId="root" onSelect={vi.fn()} />);

    mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
    const node = screen.getByTestId("dialogue-stage-node-root");

    fireEvent.pointerDown(node, { button: 0, pointerId: 9, pointerType: "touch", clientX: 200, clientY: 150 });
    fireEvent.pointerMove(window, { pointerId: 9, pointerType: "touch", clientX: 200, clientY: 230 });
    fireEvent.pointerUp(window, { pointerId: 9, pointerType: "touch", clientX: 200, clientY: 230 });

    expect(useDialogueUiStore.getState().stageLayouts["focus:root"].nodePositions.root.y).toBeCloseTo(76.6666667);
  });

  it("lets touch users drag immediately, dwell and release to combine without a visible progress bar", () => {
    vi.useFakeTimers();
    try {
      const action = { key: "a:b", lineageParentId: "", thesisId: "a", antithesisId: "b", synthesisId: null, label: "a / b", available: true };
      const nodes: DialogueStageNode[] = [
        { id: "a", label: "a", kind: "assistant", branchType: "正", relation: "child", seedX: 25, seedY: 50 },
        { id: "b", label: "b", kind: "assistant", branchType: "正", relation: "child", seedX: 75, seedY: 50 }
      ];
      const preview = vi.fn();
      render(<BubbleStage layoutKey="touch" nodes={nodes} focusNodeId="a" onSelect={vi.fn()}
        resolveSynthesisAction={() => action} onProposeSynthesis={preview} />);
      mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
      const seed = screen.getByTestId("dialogue-stage-node-a");
      fireEvent.pointerDown(seed, { button: 0, pointerId: 12, pointerType: "touch", clientX: 100, clientY: 150 });
      fireEvent.pointerMove(window, { pointerId: 12, pointerType: "touch", clientX: 280, clientY: 150 });
      expect(screen.getByTestId("dialogue-synthesis-bridge-preview")).toBeInTheDocument();
      expect(screen.queryByTestId("dialogue-physical-dwell")).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(320));
      fireEvent.pointerUp(window, { pointerId: 12, pointerType: "touch", clientX: 280, clientY: 150 });
      expect(preview).toHaveBeenCalledWith(action);
      expect(useDialogueUiStore.getState().stageLayouts.touch.nodePositions.a.x).toBe(70);
    } finally { vi.useRealTimers(); }
  });

  it("cancels a held touch without changing the seed position", () => {
    vi.useFakeTimers();
    try {
      render(<BubbleStage layoutKey="touch-cancel" nodes={[{ id: "a", label: "a", kind: "user", relation: "focus", seedX: 50, seedY: 50 }]} focusNodeId="a" onSelect={vi.fn()} />);
      const seed = screen.getByTestId("dialogue-stage-node-a");
      fireEvent.pointerDown(seed, { button: 0, pointerId: 13, pointerType: "touch", clientX: 100, clientY: 150 });
      fireEvent.pointerCancel(window, { pointerId: 13, pointerType: "touch" });
      act(() => vi.advanceTimersByTime(500));
      expect(useDialogueUiStore.getState().stageLayouts["touch-cancel"].nodePositions.a).toEqual({ x: 50, y: 50 });
    } finally { vi.useRealTimers(); }
  });

  it("keeps the current angle after capture loss and accepts a new rotation", () => {
    render(<BubbleStage layoutKey="lost-orbit" nodes={[{ id: "a", label: "a", kind: "user", relation: "focus", seedX: 50, seedY: 50 }]} focusNodeId="a" onSelect={vi.fn()} />);
    mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
    const track = screen.getByTestId("dialogue-stage-track");
    fireEvent.pointerDown(track, { button: 0, pointerId: 85, pointerType: "mouse", clientX: 100, clientY: 150 });
    fireEvent.pointerMove(window, { pointerId: 85, clientX: 160, clientY: 150 });
    const yaw = Number(track.dataset.spaceYaw);
    fireEvent.lostPointerCapture(track, { pointerId: 85 });
    fireEvent.pointerMove(window, { pointerId: 85, clientX: 250, clientY: 150 });
    expect(Number(track.dataset.spaceYaw)).toBe(yaw);
    fireEvent.pointerDown(track, { button: 0, pointerId: 86, pointerType: "mouse", clientX: 100, clientY: 150 });
    fireEvent.pointerMove(window, { pointerId: 86, clientX: 140, clientY: 150 });
    fireEvent.pointerUp(window, { pointerId: 86, clientX: 140, clientY: 150 });
    expect(Number(track.dataset.spaceYaw)).toBeGreaterThan(yaw);
  });

  it("cancels pickup when the browser releases the touch capture", () => {
    vi.useFakeTimers();
    try {
      render(<BubbleStage layoutKey="lost-hold" nodes={[{ id: "a", label: "a", kind: "user", relation: "focus", seedX: 50, seedY: 50 }]} focusNodeId="a" onSelect={vi.fn()} />);
      const seed = screen.getByTestId("dialogue-stage-node-a");
      fireEvent.pointerDown(seed, { button: 0, pointerId: 81, pointerType: "touch", clientX: 200, clientY: 150 });
      fireEvent.lostPointerCapture(seed, { pointerId: 81, pointerType: "touch" });
      expect(seed).not.toHaveAttribute("data-touch-holding");
      act(() => vi.advanceTimersByTime(400));
      fireEvent.pointerMove(window, { pointerId: 81, pointerType: "touch", clientX: 250, clientY: 150 });
      fireEvent.pointerUp(window, { pointerId: 81, pointerType: "touch", clientX: 250, clientY: 150 });
      expect(useDialogueUiStore.getState().stageLayouts["lost-hold"].nodePositions.a).toEqual({ x: 50, y: 50 });
    } finally { vi.useRealTimers(); }
  });

  it("cancels an armed fusion on capture loss and lets a fresh gesture start", () => {
    vi.useFakeTimers();
    try {
      const action = { key: "a:b", lineageParentId: "", thesisId: "a", antithesisId: "b", synthesisId: null, label: "a / b", available: true };
      const nodes: DialogueStageNode[] = [
        { id: "a", label: "a", kind: "assistant", branchType: "正", relation: "child", seedX: 25, seedY: 50 },
        { id: "b", label: "b", kind: "assistant", branchType: "反", relation: "child", seedX: 75, seedY: 50 }
      ];
      const propose = vi.fn();
      render(<BubbleStage layoutKey="lost-fusion" nodes={nodes} focusNodeId="a" onSelect={vi.fn()} resolveSynthesisAction={() => action} onProposeSynthesis={propose} />);
      mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
      const seed = screen.getByTestId("dialogue-stage-node-a");
      fireEvent.pointerDown(seed, { button: 0, pointerId: 82, pointerType: "touch", clientX: 100, clientY: 150 });
      act(() => vi.advanceTimersByTime(350));
      fireEvent.pointerMove(window, { pointerId: 82, pointerType: "touch", clientX: 280, clientY: 150 });
      act(() => vi.advanceTimersByTime(320));
      expect(screen.getByTestId("dialogue-synthesis-bridge-preview")).toBeInTheDocument();
      fireEvent.lostPointerCapture(seed, { pointerId: 83, pointerType: "touch" });
      expect(screen.getByTestId("dialogue-synthesis-bridge-preview")).toBeInTheDocument();
      fireEvent.lostPointerCapture(seed, { pointerId: 82, pointerType: "touch" });
      expect(screen.queryByTestId("dialogue-synthesis-bridge-preview")).not.toBeInTheDocument();
      fireEvent.pointerUp(window, { pointerId: 82, pointerType: "touch", clientX: 280, clientY: 150 });
      expect(propose).not.toHaveBeenCalled();
      expect(useDialogueUiStore.getState().stageLayouts["lost-fusion"].nodePositions.a).toEqual({ x: 25, y: 50 });
      fireEvent.pointerDown(seed, { button: 0, pointerId: 84, pointerType: "touch", clientX: 100, clientY: 150 });
      act(() => vi.advanceTimersByTime(350));
      fireEvent.pointerMove(window, { pointerId: 84, pointerType: "touch", clientX: 150, clientY: 150 });
      fireEvent.pointerUp(window, { pointerId: 84, pointerType: "touch", clientX: 150, clientY: 150 });
      expect(useDialogueUiStore.getState().stageLayouts["lost-fusion"].nodePositions.a.x).toBe(37.5);
    } finally { vi.useRealTimers(); }
  });

  it("picks up a delayed touch immediately without a hold indicator", () => {
    vi.useFakeTimers();
    const clock = vi.spyOn(performance, "now").mockReturnValue(1000);
    try {
      const nodes: DialogueStageNode[] = [{ id: "a", label: "a", kind: "user", relation: "focus", seedX: 50, seedY: 50 }];
      render(<BubbleStage layoutKey="delayed-touch" nodes={nodes} focusNodeId="a" onSelect={vi.fn()} />);
      mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
      const seed = screen.getByTestId("dialogue-stage-node-a");
      const event = createEvent.pointerDown(seed, { button: 0, pointerId: 55, pointerType: "touch", clientX: 200, clientY: 150 });
      Object.defineProperty(event, "timeStamp", { value: 880 });
      fireEvent(seed, event);
      expect(seed).not.toHaveAttribute("data-touch-holding");
      fireEvent.pointerMove(window, { pointerId: 55, pointerType: "touch", clientX: 260, clientY: 150 });
      fireEvent.pointerUp(window, { pointerId: 55, pointerType: "touch", clientX: 260, clientY: 150 });
      expect(useDialogueUiStore.getState().stageLayouts["delayed-touch"].nodePositions.a.x).toBe(65);
    } finally { clock.mockRestore(); vi.useRealTimers(); }
  });

  it("still cancels a quick release when a delayed touch's pickup deadline has already passed", () => {
    vi.useFakeTimers();
    const clock = vi.spyOn(performance, "now").mockReturnValue(1000);
    try {
      const nodes: DialogueStageNode[] = [{ id: "a", label: "a", kind: "user", relation: "focus", seedX: 50, seedY: 50 }];
      render(<BubbleStage layoutKey="late-tap" nodes={nodes} focusNodeId="a" onSelect={vi.fn()} />);
      mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
      const seed = screen.getByTestId("dialogue-stage-node-a"), event = createEvent.pointerDown(seed, { button: 0, pointerId: 56, pointerType: "touch", clientX: 200, clientY: 150 });
      Object.defineProperty(event, "timeStamp", { value: 500 }); fireEvent(seed, event);
      fireEvent.pointerUp(window, { pointerId: 56, pointerType: "touch", clientX: 200, clientY: 150 });
      act(() => vi.advanceTimersByTime(500));
      fireEvent.pointerMove(window, { pointerId: 56, pointerType: "touch", clientX: 300, clientY: 150 });
      fireEvent.pointerUp(window, { pointerId: 56, pointerType: "touch", clientX: 300, clientY: 150 });
      expect(seed).not.toHaveAttribute("data-touch-holding");
      expect(useDialogueUiStore.getState().stageLayouts["late-tap"].nodePositions.a).toEqual({ x: 50, y: 50 });
    } finally { clock.mockRestore(); vi.useRealTimers(); }
  });

  it("cancels an unfinished seed drag when a second finger takes over, without accidental synthesis", () => {
    vi.useFakeTimers();
    try {
      const action = { key: "a:b", lineageParentId: "", thesisId: "a", antithesisId: "b", synthesisId: null, label: "a / b", available: true };
      const nodes: DialogueStageNode[] = [
        { id: "a", label: "a", kind: "assistant", branchType: "正", relation: "child", seedX: 25, seedY: 50 },
        { id: "b", label: "b", kind: "assistant", branchType: "反", relation: "child", seedX: 75, seedY: 50 }
      ];
      render(<BubbleStage layoutKey="touch-owner" nodes={nodes} focusNodeId="a" onSelect={vi.fn()} resolveSynthesisAction={() => action} />);
      mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
      const first = screen.getByTestId("dialogue-stage-node-a"), second = screen.getByTestId("dialogue-stage-node-b");
      fireEvent.pointerDown(first, { button: 0, pointerId: 41, pointerType: "touch", clientX: 100, clientY: 150 });
      fireEvent.pointerDown(second, { button: 0, pointerId: 42, pointerType: "touch", clientX: 300, clientY: 150 });
      expect(screen.getByTestId("dialogue-stage-track")).toHaveAttribute("data-space-navigating", "true");
      expect(first.className).not.toContain("stageNodeDragging");
      fireEvent.pointerUp(window, { pointerId: 42, pointerType: "touch" });
      act(() => vi.advanceTimersByTime(350));
      fireEvent.pointerMove(window, { pointerId: 41, pointerType: "touch", clientX: 280, clientY: 150 });
      expect(screen.queryByTestId("dialogue-synthesis-bridge-preview")).not.toBeInTheDocument();
      fireEvent.pointerCancel(window, { pointerId: 41, pointerType: "touch" });
      expect(useDialogueUiStore.getState().stageLayouts["touch-owner"].nodePositions.a).toEqual({ x: 25, y: 50 });
    } finally { vi.useRealTimers(); }
  });

  it("freezes the current orbit when the overview opens and accepts a fresh gesture on return", () => {
    const nodes: DialogueStageNode[] = [{ id: "a", label: "a", kind: "user", relation: "focus", seedX: 50, seedY: 50 }];
    const props = { layoutKey: "orbit-overview", nodes, focusNodeId: "a", onSelect: vi.fn() };
    const { rerender } = render(<BubbleStage {...props} />);
    mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
    const track = screen.getByTestId("dialogue-stage-track");
    fireEvent.pointerDown(track, { button: 0, pointerId: 51, clientX: 40, clientY: 40 });
    fireEvent.pointerMove(window, { pointerId: 51, clientX: 80, clientY: 50 });
    const yaw = track.dataset.spaceYaw, pitch = track.dataset.spacePitch;
    rerender(<BubbleStage {...props} suspended />);
    fireEvent.pointerMove(window, { pointerId: 51, clientX: 140, clientY: 90 });
    expect(track.dataset.spaceYaw).toBe(yaw); expect(track.dataset.spacePitch).toBe(pitch);
    fireEvent.pointerUp(window, { pointerId: 51, clientX: 140, clientY: 90 });
    rerender(<BubbleStage {...props} />);
    fireEvent.pointerDown(track, { button: 0, pointerId: 52, clientX: 40, clientY: 40 });
    fireEvent.pointerMove(window, { pointerId: 52, clientX: 60, clientY: 40 });
    fireEvent.pointerUp(window, { pointerId: 52, clientX: 60, clientY: 40 });
    expect(Number(track.dataset.spaceYaw)).toBeCloseTo(Number(yaw) + .08);
  });

  it("cancels a pending touch pickup when the overview opens", () => {
    vi.useFakeTimers();
    try {
      const nodes: DialogueStageNode[] = [{ id: "a", label: "a", kind: "user", relation: "focus", seedX: 50, seedY: 50 }];
      const props = { layoutKey: "hold-overview", nodes, focusNodeId: "a", onSelect: vi.fn() };
      const { rerender } = render(<BubbleStage {...props} />);
      mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
      const seed = screen.getByTestId("dialogue-stage-node-a");
      fireEvent.pointerDown(seed, { button: 0, pointerId: 53, pointerType: "touch", clientX: 200, clientY: 150 });
      act(() => vi.advanceTimersByTime(100));
      rerender(<BubbleStage {...props} suspended />);
      expect(seed).not.toHaveAttribute("data-touch-holding");
      act(() => vi.advanceTimersByTime(400));
      fireEvent.pointerMove(window, { pointerId: 53, pointerType: "touch", clientX: 300, clientY: 150 });
      fireEvent.pointerUp(window, { pointerId: 53, pointerType: "touch", clientX: 300, clientY: 150 });
      expect(useDialogueUiStore.getState().stageLayouts["hold-overview"].nodePositions.a).toEqual({ x: 50, y: 50 });
    } finally { vi.useRealTimers(); }
  });

  it("cancels an armed fusion instead of submitting it underneath the overview", () => {
    vi.useFakeTimers();
    try {
      const action = { key: "a:b", lineageParentId: "", thesisId: "a", antithesisId: "b", synthesisId: null, label: "a / b", available: true };
      const nodes: DialogueStageNode[] = [
        { id: "a", label: "a", kind: "assistant", branchType: "正", relation: "child", seedX: 25, seedY: 50 },
        { id: "b", label: "b", kind: "assistant", branchType: "反", relation: "child", seedX: 75, seedY: 50 }
      ];
      const submit = vi.fn(), props = { layoutKey: "fusion-overview", nodes, focusNodeId: "a", onSelect: vi.fn(), resolveSynthesisAction: () => action, onProposeSynthesis: submit };
      const { rerender } = render(<BubbleStage {...props} />);
      mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
      fireEvent.pointerDown(screen.getByTestId("dialogue-stage-node-a"), { button: 0, pointerId: 54, pointerType: "touch", clientX: 100, clientY: 150 });
      act(() => vi.advanceTimersByTime(350));
      fireEvent.pointerMove(window, { pointerId: 54, pointerType: "touch", clientX: 280, clientY: 150 });
      act(() => vi.advanceTimersByTime(320));
      expect(screen.getByTestId("dialogue-synthesis-bridge-preview")).toHaveAttribute("data-armed", "true");
      rerender(<BubbleStage {...props} suspended />);
      fireEvent.pointerUp(window, { pointerId: 54, pointerType: "touch", clientX: 280, clientY: 150 });
      expect(submit).not.toHaveBeenCalled(); expect(screen.queryByTestId("dialogue-synthesis-bridge-preview")).not.toBeInTheDocument();
      expect(useDialogueUiStore.getState().stageLayouts["fusion-overview"].nodePositions.a).toEqual({ x: 25, y: 50 });
    } finally { vi.useRealTimers(); }
  });

  it("releases a touch drag when the page is hidden without persisting an unfinished position", () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    try {
      const nodes: DialogueStageNode[] = [{ id: "a", label: "a", kind: "user", relation: "focus", seedX: 50, seedY: 50 }];
      render(<BubbleStage layoutKey="touch-hidden" nodes={nodes} focusNodeId="a" onSelect={vi.fn()} />);
      mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
      fireEvent.pointerDown(screen.getByTestId("dialogue-stage-node-a"), { button: 0, pointerId: 57, pointerType: "touch", clientX: 200, clientY: 150 });
      act(() => vi.advanceTimersByTime(350));
      fireEvent.pointerMove(window, { pointerId: 57, pointerType: "touch", clientX: 260, clientY: 150 });
      visibility.mockReturnValue(true); fireEvent(document, new Event("visibilitychange"));
      visibility.mockReturnValue(false); fireEvent(document, new Event("visibilitychange"));
      fireEvent.pointerUp(window, { pointerId: 57, pointerType: "touch", clientX: 260, clientY: 150 });
      expect(useDialogueUiStore.getState().stageLayouts["touch-hidden"].nodePositions.a).toEqual({ x: 50, y: 50 });
    } finally { visibility.mockRestore(); vi.useRealTimers(); }
  });

  it("does not pan an empty stage", () => {
    render(<BubbleStage layoutKey="focus:empty" nodes={[]} focusNodeId={null} onSelect={vi.fn()} />);

    mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
    const track = screen.getByTestId("dialogue-stage-track");

    fireEvent.pointerDown(track, { button: 0, pointerId: 3, clientX: 140, clientY: 110 });
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 176, clientY: 84 });
    fireEvent.pointerUp(window, { pointerId: 3, clientX: 176, clientY: 84 });

    expect(useDialogueUiStore.getState().stageLayouts["focus:empty"]).toBeUndefined();
  });

  it("uses layout language for the empty-state hint", () => {
    stubPointerMode("fine");
    render(<BubbleStage layoutKey="focus:empty" nodes={[]} focusNodeId={null} onSelect={vi.fn()} />);

    expect(screen.getByText("在下方输入一个想法，看它分裂为正与反")).toBeInTheDocument();
  });

  it("focuses input from a quiet empty prompt without showing illustrative seeds", () => {
    const onPrimaryAction = vi.fn();

    render(
      <BubbleStage
        layoutKey="focus:empty"
        nodes={[]}
        focusNodeId={null}
        onSelect={vi.fn()}
        onPrimaryAction={onPrimaryAction}
      />
    );

    const root = screen.getByRole("button", { name: "点此输入一个想法" });
    fireEvent.click(root);

    expect(onPrimaryAction).toHaveBeenCalledWith(null);
    expect(root).not.toHaveAttribute("data-metaball-surface");
    expect(screen.queryByTestId("dialogue-empty-stage-thesis")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dialogue-empty-stage-antithesis")).not.toBeInTheDocument();
  });

  it.each(["ready", "fallback"] as const)(
    "keeps DOM interaction and accessible names available in %s renderer state",
    async (rendererState) => {
      metaballLayerMock.state = rendererState;
      const nodes: DialogueStageNode[] = [
        {
          id: "root",
          label: "主题",
          preview: "要不要继续这个项目？",
          kind: "user",
          relation: "focus",
          seedX: 50,
          seedY: 50
        }
      ];

      render(<BubbleStage layoutKey="focus:root" nodes={nodes} focusNodeId="root" onSelect={vi.fn()} />);

      const track = screen.getByTestId("dialogue-stage-track");
      const root = screen.getByRole("button", { name: /^主题，/ });
      expect(root).toHaveAccessibleDescription("要不要继续这个项目？");
      await waitFor(() => expect(track).toHaveAttribute("data-metaball-renderer", rendererState));
      expect(root).toBeEnabled();
      expect(root.className).toContain("stageNode");
      expect(screen.getByTestId("dialogue-metaball-canvas")).toBeInTheDocument();
    }
  );

  it("uses tap-and-scroll language for coarse pointers", () => {
    stubPointerMode("coarse");
    const nodes: DialogueStageNode[] = [
      {
        id: "root",
        label: "主题",
        kind: "user",
        relation: "focus",
        seedX: 50,
        seedY: 40
      },
      {
        id: "thesis",
        label: "继续",
        kind: "assistant",
        branchType: "正",
        relation: "child",
        seedX: 28,
        seedY: 70
      },
      {
        id: "antithesis",
        label: "暂停",
        kind: "assistant",
        branchType: "反",
        relation: "child",
        seedX: 72,
        seedY: 70
      }
    ];

    render(<BubbleStage layoutKey="focus:root" nodes={nodes} focusNodeId="root" onSelect={vi.fn()} />);

    expect(screen.getByText("点选液滴查看正与反。")).toBeInTheDocument();
  });

  it("describes the visual fusion behavior without implying graph synthesis", () => {
    const nodes: DialogueStageNode[] = [
      {
        id: "root",
        label: "主题",
        kind: "user",
        relation: "focus",
        seedX: 50,
        seedY: 40
      },
      {
        id: "thesis",
        label: "继续",
        kind: "assistant",
        branchType: "正",
        relation: "child",
        seedX: 28,
        seedY: 70
      },
      {
        id: "antithesis",
        label: "暂停",
        kind: "assistant",
        branchType: "反",
        relation: "child",
        seedX: 72,
        seedY: 70
      }
    ];

    render(<BubbleStage layoutKey="focus:root" nodes={nodes} focusNodeId="root" onSelect={vi.fn()} />);

    expect(screen.getByText("拖动两颗想法靠近，稍停后松手合成；移开可取消。")).toBeInTheDocument();
  });

  it("renders semantic metaball surfaces without stage relationship lines", async () => {
    const nodes: DialogueStageNode[] = [
      {
        id: "root",
        label: "主题",
        kind: "user",
        relation: "focus",
        seedX: 50,
        seedY: 40
      },
      {
        id: "thesis",
        label: "继续",
        kind: "assistant",
        branchType: "正",
        relation: "child",
        seedX: 28,
        seedY: 70
      },
      {
        id: "antithesis",
        label: "暂停",
        kind: "assistant",
        branchType: "反",
        relation: "child",
        seedX: 72,
        seedY: 70
      }
    ];

    render(<BubbleStage layoutKey="focus:root" nodes={nodes} focusNodeId="root" onSelect={vi.fn()} />);

    expect(screen.queryByTestId("dialogue-stage-relations")).not.toBeInTheDocument();
    expect(screen.getByTestId("dialogue-stage-track").querySelector("svg")).toBeNull();
    expect(await screen.findByTestId("dialogue-metaball-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("dialogue-stage-node-root")).toHaveAttribute("data-metaball-role", "user");
    expect(screen.getByTestId("dialogue-stage-node-thesis")).toHaveAttribute("data-metaball-role", "thesis");
    expect(screen.getByTestId("dialogue-stage-node-antithesis")).toHaveAttribute(
      "data-metaball-role",
      "antithesis"
    );
  });

  it("renders in-stage pending feedback while branches are generating", () => {
    const nodes: DialogueStageNode[] = [
      {
        id: "root",
        label: "主题",
        preview: "这个方向还值不值得继续投入？",
        kind: "user",
        relation: "focus",
        seedX: 50,
        seedY: 40
      }
    ];

    render(
      <BubbleStage
        layoutKey="focus:root"
        nodes={nodes}
        focusNodeId="root"
        onSelect={vi.fn()}
        pendingPreview={{ kind: "branches", anchorNodeId: "root", prompt: "下一步怎么拆？" }}
      />
    );

    expect(screen.getByTestId("dialogue-stage-pending-branches")).toHaveTextContent("正在深化主张、质疑前提");
    expect(screen.getByTestId("dialogue-stage-pending-branches").querySelector("svg")).toBeNull();
    expect(screen.getByTestId("dialogue-stage-pending-thesis")).toHaveAttribute(
      "data-metaball-role",
      "thesis"
    );
    expect(screen.getByTestId("dialogue-stage-pending-antithesis")).toHaveAttribute(
      "data-metaball-role",
      "antithesis"
    );
  });

  it("keeps the empty start affordance hidden while a root branch request is pending", () => {
    render(
      <BubbleStage
        layoutKey="empty"
        nodes={[]}
        focusNodeId={null}
        onSelect={vi.fn()}
        onPrimaryAction={vi.fn()}
        pendingPreview={{ kind: "branches", anchorNodeId: null, prompt: "时间应该怎样被使用？" }}
      />
    );

    expect(screen.getByTestId("dialogue-stage-pending-branches")).toHaveTextContent("时间应该怎样被使用？");
    expect(screen.getByTestId("dialogue-stage-pending-root")).toHaveAttribute(
      "data-metaball-surface",
      "empty-root"
    );
    expect(screen.queryByRole("button", { name: /点此输入/ })).not.toBeInTheDocument();
  });

  it("renders in-stage pending feedback while synthesis is converging", () => {
    const nodes: DialogueStageNode[] = [
      {
        id: "root",
        label: "主题",
        kind: "user",
        relation: "focus",
        seedX: 50,
        seedY: 40
      },
      {
        id: "thesis",
        label: "继续",
        kind: "assistant",
        branchType: "正",
        relation: "child",
        seedX: 28,
        seedY: 70
      },
      {
        id: "antithesis",
        label: "暂停",
        kind: "assistant",
        branchType: "反",
        relation: "child",
        seedX: 72,
        seedY: 70
      }
    ];

    render(
      <BubbleStage
        layoutKey="focus:root"
        nodes={nodes}
        focusNodeId="root"
        onSelect={vi.fn()}
        pendingPreview={{
          kind: "synthesis",
          thesisId: "thesis",
          antithesisId: "antithesis",
          label: "继续 / 暂停"
        }}
      />
    );

    expect(screen.getByTestId("dialogue-stage-pending-synthesis")).toHaveTextContent("正在收束");
    expect(screen.getByTestId("dialogue-stage-pending-synthesis").querySelector("svg")).toBeNull();
    expect(screen.getByTestId("dialogue-stage-pending-synthesis-node")).toHaveAttribute(
      "data-metaball-role",
      "synthesis"
    );
  });

  it("keeps an accessible convergence record without an offstage trace", () => {
    const nodes: DialogueStageNode[] = [
      {
        id: "root",
        label: "主题",
        kind: "user",
        relation: "focus",
        seedX: 50,
        seedY: 40
      },
      {
        id: "thesis",
        label: "继续",
        kind: "assistant",
        branchType: "正",
        relation: "child",
        seedX: 28,
        seedY: 70
      },
      {
        id: "antithesis",
        label: "暂停",
        kind: "assistant",
        branchType: "反",
        relation: "child",
        seedX: 72,
        seedY: 70
      }
    ];

    render(
      <BubbleStage
        layoutKey="focus:root"
        nodes={nodes}
        focusNodeId="root"
        convergenceEventId="synthesis"
        onSelect={vi.fn()}
      />
    );

    expect(screen.queryByTestId("dialogue-stage-convergence-mark-thesis")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dialogue-stage-convergence-mark-antithesis")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dialogue-stage-convergence-dot")).not.toBeInTheDocument();
    expect(screen.getByTestId("dialogue-stage-hint")).toHaveTextContent("合流记录已保留。");
    expect(screen.queryByText("合流 1 次")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dialogue-stage-node-synthesis")).not.toBeInTheDocument();
  });

  it("marks newly revealed synthesis as an event state instead of a normal record", () => {
    const nodes: DialogueStageNode[] = [
      {
        id: "thesis",
        label: "继续",
        kind: "assistant",
        branchType: "正",
        relation: "source",
        seedX: 30,
        seedY: 34
      },
      {
        id: "antithesis",
        label: "暂停",
        kind: "assistant",
        branchType: "反",
        relation: "source",
        seedX: 70,
        seedY: 34
      },
      {
        id: "synthesis",
        label: "收束",
        kind: "assistant",
        branchType: "合",
        displayRole: "synthesis-record",
        relation: "focus",
        seedX: 50,
        seedY: 56
      }
    ];

    render(
      <BubbleStage
        layoutKey="focus:synthesis"
        nodes={nodes}
        focusNodeId="synthesis"
        eventNodeId="synthesis"
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByTestId("dialogue-stage-node-synthesis")).toHaveAttribute(
      "data-event-state",
      "synthesis-reveal"
    );
    expect(screen.getByTestId("dialogue-stage-node-synthesis")).toHaveAttribute(
      "data-display-role",
      "synthesis-record"
    );
    expect(screen.getByTestId("dialogue-stage-node-synthesis")).toHaveAttribute(
      "data-metaball-role",
      "synthesis"
    );
    expect(screen.getByTestId("dialogue-stage-node-thesis")).toHaveAttribute(
      "data-metaball-relation",
      "source"
    );
    expect(screen.queryByTestId("dialogue-stage-relations")).not.toBeInTheDocument();
  });

  it("clamps default and dragged node positions away from the bottom edge", () => {
    const nodes: DialogueStageNode[] = [
      {
        id: "low-node",
        label: "主题",
        kind: "user",
        relation: "child",
        seedX: 50,
        seedY: 90
      }
    ];

    render(<BubbleStage layoutKey="focus:low" nodes={nodes} focusNodeId="low-node" onSelect={vi.fn()} />);

    const viewport = screen.getByTestId("dialogue-stage-viewport");
    mockViewportRect(viewport);
    const node = screen.getByTestId("dialogue-stage-node-low-node");

    expect(node).toHaveStyle({ top: "84%" });

    fireEvent.pointerDown(node, { button: 0, pointerId: 4, clientX: 200, clientY: 150 });
    fireEvent.pointerMove(window, { pointerId: 4, clientX: 200, clientY: 450 });
    fireEvent.pointerUp(window, { pointerId: 4, clientX: 200, clientY: 450 });

    expect(useDialogueUiStore.getState().stageLayouts["focus:low"].nodePositions["low-node"]).toMatchObject({
      x: 50,
      y: 84,
      z: expect.any(Number)
    });
  });
});
