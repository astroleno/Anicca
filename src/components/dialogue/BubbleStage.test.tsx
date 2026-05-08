import { fireEvent, render, screen } from "@testing-library/react";
import { BubbleStage } from "@/components/dialogue/BubbleStage";
import { useDialogueUiStore } from "@/features/dialectic/store";
import { DialogueStageNode } from "@/features/dialectic/viewModel";

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

function stubPointerMode(pointer: "fine" | "coarse") {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query === "(pointer: coarse)" ? pointer === "coarse" : false,
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

describe("BubbleStage", () => {
  beforeEach(() => {
    resetStageStore();
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

    expect(useDialogueUiStore.getState().stageLayouts["focus:root"].nodePositions.root).toEqual({
      x: 60,
      y: 60
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("persists stage pan independently from node positions", () => {
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

    expect(useDialogueUiStore.getState().stageLayouts["focus:root"]).toEqual({
      pan: { x: 36, y: -26 },
      nodePositions: {}
    });
  });

  it("does not start stage pan from touch scroll gestures on the track", () => {
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
    fireEvent.pointerUp(window, { pointerId: 8, pointerType: "touch", clientX: 140, clientY: 190 });

    expect(useDialogueUiStore.getState().stageLayouts["focus:root"]).toBeUndefined();
  });

  it("does not drag nodes from touch scroll gestures", () => {
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

    expect(useDialogueUiStore.getState().stageLayouts["focus:root"]).toBeUndefined();
  });

  it("does not pan the empty-state decorative cluster", () => {
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

    expect(screen.getByText("给它一个母题，它会先长出正与反；生成后可整理舞台布局。")).toBeInTheDocument();
  });

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

    expect(screen.getByText("点选节点查看正与反。")).toBeInTheDocument();
  });

  it("describes dragging as stage organization rather than synthesis logic", () => {
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

    expect(screen.getByText("整理舞台只影响布局；是否记录合流由同一母题下的正反成对关系决定。")).toBeInTheDocument();
  });

  it("renders lineage connectors between focus and visible related nodes", () => {
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

    expect(screen.getByTestId("dialogue-stage-relations")).toBeInTheDocument();
    expect(screen.getByTestId("dialogue-stage-relation-root-thesis")).toBeInTheDocument();
    expect(screen.getByTestId("dialogue-stage-relation-root-antithesis")).toBeInTheDocument();
  });

  it("renders a non-node convergence trace when synthesis already happened offstage", () => {
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

    expect(screen.getByTestId("dialogue-stage-convergence-mark-thesis")).toBeInTheDocument();
    expect(screen.getByTestId("dialogue-stage-convergence-mark-antithesis")).toBeInTheDocument();
    expect(screen.getByTestId("dialogue-stage-convergence-dot")).toBeInTheDocument();
    expect(screen.getByTestId("dialogue-stage-hint")).toHaveTextContent("已记录一次正反合流");
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
    expect(screen.getByTestId("dialogue-stage-relation-thesis-synthesis")).toHaveAttribute(
      "data-event-state",
      "synthesis-reveal"
    );
    expect(screen.getByTestId("dialogue-stage-relation-thesis-synthesis")).toHaveAttribute(
      "data-line-role",
      "source"
    );
    expect(screen.getByTestId("dialogue-stage-relation-thesis-synthesis")).toHaveAttribute(
      "data-branch-type",
      "正"
    );
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

    expect(useDialogueUiStore.getState().stageLayouts["focus:low"].nodePositions["low-node"]).toEqual({
      x: 50,
      y: 84
    });
  });
});
