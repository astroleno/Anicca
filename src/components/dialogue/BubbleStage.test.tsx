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

  it("keeps full node meaning in the accessible name when the visual label is short", () => {
    const nodes: DialogueStageNode[] = [
      {
        id: "thesis",
        label: "继续",
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

    expect(screen.getByRole("button", { name: /继续，但是把范围切小一点。.*正方.*下游节点.*先缩范围/ })).toBeInTheDocument();
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
    expect(layout.nodePositions).toEqual({});
    expect(layout.compact?.nodePositions["growth-merge"]).toEqual({ x: 60, y: 82 });
    expect(merge.style.getPropertyValue("--stage-node-drag-x")).toBe("0px");
    expect(merge.style.getPropertyValue("--stage-node-drag-y")).toBe("0px");
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

    expect(screen.getByText("写下母题，让正反开始生成。")).toBeInTheDocument();
  });

  it("lets the empty theme node act as the primary input target", () => {
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

    fireEvent.click(screen.getByRole("button", { name: /主题/ }));

    expect(onPrimaryAction).toHaveBeenCalledWith(null);
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

    expect(screen.getByText("正反已生成。")).toBeInTheDocument();
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

    expect(screen.getByTestId("dialogue-stage-pending-branches")).toHaveTextContent("正在让问题分岔");
    expect(screen.getByTestId("dialogue-stage-pending-thesis")).toBeInTheDocument();
    expect(screen.getByTestId("dialogue-stage-pending-antithesis")).toBeInTheDocument();
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
    expect(screen.getByTestId("dialogue-stage-pending-synthesis-node")).toBeInTheDocument();
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
    expect(screen.getByTestId("dialogue-stage-hint")).toHaveTextContent("已留下合流记录。");
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
