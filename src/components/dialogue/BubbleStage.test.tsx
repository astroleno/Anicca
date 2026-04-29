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

describe("BubbleStage", () => {
  beforeEach(() => {
    resetStageStore();
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

  it("does not pan the empty-state decorative cluster", () => {
    render(<BubbleStage layoutKey="focus:empty" nodes={[]} focusNodeId={null} onSelect={vi.fn()} />);

    mockViewportRect(screen.getByTestId("dialogue-stage-viewport"));
    const track = screen.getByTestId("dialogue-stage-track");

    fireEvent.pointerDown(track, { button: 0, pointerId: 3, clientX: 140, clientY: 110 });
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 176, clientY: 84 });
    fireEvent.pointerUp(window, { pointerId: 3, clientX: 176, clientY: 84 });

    expect(useDialogueUiStore.getState().stageLayouts["focus:empty"]).toBeUndefined();
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

    expect(screen.getByText("拖动节点只是整理舞台；是否生成合由同一母题下的正反成对关系决定。")).toBeInTheDocument();
  });
});
