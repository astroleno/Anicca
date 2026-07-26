import { AniccaNode, BranchType, Graph } from "@/types/anicca";

export type DialogueBreadcrumbItem = {
  id: string;
  label: string;
  kind: AniccaNode["kind"];
  branchType?: BranchType;
};

export type DialogueSidebarItem = {
  id: string;
  parentId: string | null;
  depth: number;
  label: string;
  kind: AniccaNode["kind"];
  branchType?: BranchType;
  displayRole: "node" | "synthesis-event";
  summary?: string;
  isFocused: boolean;
  isOnFocusedPath: boolean;
  sourceLabels: string[];
};

export type DialogueStageNode = {
  id: string;
  label: string;
  preview?: string;
  summary?: string;
  kind: AniccaNode["kind"];
  branchType?: BranchType;
  displayRole?: "node" | "synthesis-record";
  isGrowthPerspective?: boolean;
  relation: "focus" | "ancestor" | "child" | "source";
  // Seed coordinates define the default composition before per-snapshot drag state takes over.
  seedX: number;
  seedY: number;
};

export type DialogueSourceNode = {
  id: string;
  label: string;
  branchType?: BranchType;
  summary?: string;
  text?: string;
};

export type DialogueNodeDetail = {
  id: string;
  label: string;
  kind: AniccaNode["kind"];
  branchType?: BranchType;
  displayRole: "node" | "synthesis-record";
  text?: string;
  summary?: string;
  lineageParentId?: string;
  sourceNodes: DialogueSourceNode[];
};

export type DialogueComposerTarget = {
  nodeId: string | null;
  label: string;
  kind: "assistant" | "root";
  branchType?: BranchType;
  displayRole: "node" | "synthesis-record";
};

export type DialogueSynthesisAction = {
  key: string;
  lineageParentId: string;
  thesisId: string;
  antithesisId: string;
  synthesisId: string | null;
  label: string;
  available: boolean;
};

export type DialogueView = {
  focusNodeId: string | null;
  breadcrumb: DialogueBreadcrumbItem[];
  sidebarItems: DialogueSidebarItem[];
  currentNode: DialogueNodeDetail | null;
  composerTarget: DialogueComposerTarget;
  availableSynthesisActions: DialogueSynthesisAction[];
  focusSnapshotId: string;
  stageNodes: DialogueStageNode[];
};

function branchOrder(branchType?: BranchType): number {
  if (branchType === "正") return 0;
  if (branchType === "反") return 1;
  if (branchType === "合") return 2;
  return 99;
}

function byCreatedAt(graph: Graph, leftId: string, rightId: string): number {
  return graph.nodes[leftId].createdAt.localeCompare(graph.nodes[rightId].createdAt);
}

function getNodeLabel(node: AniccaNode): string {
  if (node.meta?.label) return node.meta.label;
  if (node.branchType) return node.branchType;
  if (node.kind === "user") {
    const firstLine = (node.text || node.meta?.summary || "").trim().split(/\s*\n\s*/)[0] || "";
    if (firstLine) {
      return firstLine.length > 12 ? `${firstLine.slice(0, 12)}…` : firstLine;
    }

    return "主题";
  }
  return "节点";
}

function getNodePreview(node: AniccaNode): string | undefined {
  const text = (node.text || node.meta?.summary || node.meta?.label || "").trim().replace(/\s+/g, " ");
  if (!text) {
    return undefined;
  }

  return text;
}

function getBreadcrumbParentId(graph: Graph, node: AniccaNode): string | null {
  if (node.kind === "assistant" && node.branchType === "合" && node.meta?.lineageParentId) {
    return node.meta.lineageParentId;
  }

  return node.parents[0] || null;
}

function getBreadcrumbIds(graph: Graph, focusNodeId: string | null): string[] {
  if (!focusNodeId || !graph.nodes[focusNodeId]) {
    return [];
  }

  const path: string[] = [];
  let cursor: string | null = focusNodeId;
  const visited = new Set<string>();

  while (cursor && graph.nodes[cursor] && !visited.has(cursor)) {
    visited.add(cursor);
    path.unshift(cursor);
    cursor = getBreadcrumbParentId(graph, graph.nodes[cursor]);
  }

  return path;
}

function getUserDisplayChildren(graph: Graph, userNode: AniccaNode): string[] {
  return userNode.children
    .filter((childId) => graph.nodes[childId]?.kind === "assistant")
    .filter((childId) => graph.nodes[childId]?.branchType !== "合")
    .sort((leftId, rightId) => {
      const left = graph.nodes[leftId];
      const right = graph.nodes[rightId];
      const branchDelta = branchOrder(left.branchType) - branchOrder(right.branchType);
      return branchDelta || byCreatedAt(graph, leftId, rightId);
    });
}

function getSynthesisEventIdsByLineageParent(graph: Graph, lineageParentId: string): string[] {
  return Object.values(graph.nodes)
    .filter(
      (node) =>
        node.kind === "assistant" &&
        node.branchType === "合" &&
        node.meta?.lineageParentId === lineageParentId
    )
    .map((node) => node.id)
    .sort((leftId, rightId) => byCreatedAt(graph, leftId, rightId));
}

function getAssistantDisplayChildren(graph: Graph, assistantNode: AniccaNode): string[] {
  return assistantNode.children
    .filter((childId) => graph.nodes[childId]?.kind === "user")
    .sort((leftId, rightId) => byCreatedAt(graph, leftId, rightId));
}

function getDisplayChildren(graph: Graph, node: AniccaNode): string[] {
  if (node.kind === "user") {
    return getUserDisplayChildren(graph, node);
  }

  if (node.kind === "assistant") {
    return getAssistantDisplayChildren(graph, node);
  }

  return [];
}

function buildSidebarItems(graph: Graph, focusNodeId: string | null, breadcrumbIds: string[]): DialogueSidebarItem[] {
  const items: DialogueSidebarItem[] = [];
  const focusPath = new Set(breadcrumbIds);
  const visited = new Set<string>();

  const walk = (nodeId: string, depth: number, parentId: string | null) => {
    if (visited.has(nodeId) || !graph.nodes[nodeId]) {
      return;
    }

    visited.add(nodeId);
    const node = graph.nodes[nodeId];
    const sourceLabels = node.meta?.sourceNodeIds?.length
      ? node.meta.sourceNodeIds
          .map((sourceId) => graph.nodes[sourceId])
          .filter((source): source is AniccaNode => Boolean(source))
          .map((source) => getNodeLabel(source))
      : [];

    items.push({
      id: node.id,
      parentId,
      depth,
      label: getNodeLabel(node),
      kind: node.kind,
      branchType: node.branchType,
      displayRole: "node",
      summary: node.meta?.summary || (node.kind === "user" ? getNodePreview(node) : undefined),
      isFocused: node.id === focusNodeId,
      isOnFocusedPath: focusPath.has(node.id),
      sourceLabels
    });

    for (const childId of getDisplayChildren(graph, node)) {
      walk(childId, depth + 1, node.id);
    }

    if (node.kind === "user") {
      for (const eventId of getSynthesisEventIdsByLineageParent(graph, node.id)) {
        if (visited.has(eventId)) {
          continue;
        }

        visited.add(eventId);
        const eventNode = graph.nodes[eventId];
        const eventSourceLabels = eventNode.meta?.sourceNodeIds?.length
          ? eventNode.meta.sourceNodeIds
              .map((sourceId) => graph.nodes[sourceId])
              .filter((source): source is AniccaNode => Boolean(source))
              .map((source) => getNodeLabel(source))
          : [];

        items.push({
          id: eventNode.id,
          parentId: node.id,
          depth: depth + 1,
          label: getNodeLabel(eventNode),
          kind: eventNode.kind,
          branchType: eventNode.branchType,
          displayRole: "synthesis-event",
          summary: eventNode.meta?.summary || getNodePreview(eventNode),
          isFocused: eventNode.id === focusNodeId,
          isOnFocusedPath: focusPath.has(eventNode.id),
          sourceLabels: eventSourceLabels
        });

        for (const childId of getAssistantDisplayChildren(graph, eventNode)) {
          walk(childId, depth + 2, eventNode.id);
        }
      }
    }
  };

  for (const rootId of [...graph.entryIds].sort((leftId, rightId) => byCreatedAt(graph, leftId, rightId))) {
    walk(rootId, 0, null);
  }

  return items;
}

function buildCurrentNode(graph: Graph, focusNodeId: string | null): DialogueNodeDetail | null {
  if (!focusNodeId || !graph.nodes[focusNodeId]) {
    return null;
  }

  const node = graph.nodes[focusNodeId];
  const sourceNodes = node.meta?.sourceNodeIds?.length
    ? node.meta.sourceNodeIds
        .map((sourceId) => graph.nodes[sourceId])
        .filter((source): source is AniccaNode => Boolean(source))
        .map((source) => ({
          id: source.id,
          label: getNodeLabel(source),
          branchType: source.branchType,
          summary: source.meta?.summary,
          text: source.text
        }))
    : [];

  return {
    id: node.id,
    label: getNodeLabel(node),
    kind: node.kind,
    branchType: node.branchType,
    displayRole: node.kind === "assistant" && node.branchType === "合" ? "synthesis-record" : "node",
    text: node.text,
    summary: node.meta?.summary,
    lineageParentId: node.meta?.lineageParentId,
    sourceNodes
  };
}

function buildComposerTarget(graph: Graph, focusNodeId: string | null): DialogueComposerTarget {
  if (!focusNodeId || !graph.nodes[focusNodeId]) {
    return {
      nodeId: null,
      label: "新的主题",
      kind: "root",
      displayRole: "node"
    };
  }

  const focusNode = graph.nodes[focusNodeId];
  if (focusNode.kind === "assistant") {
    const isSynthesisRecord = focusNode.branchType === "合";
    return {
      nodeId: focusNode.id,
      label: getNodeLabel(focusNode),
      kind: "assistant",
      branchType: isSynthesisRecord ? undefined : focusNode.branchType,
      displayRole: isSynthesisRecord ? "synthesis-record" : "node"
    };
  }

  const parentAssistantId = focusNode.parents.find((nodeId) => graph.nodes[nodeId]?.kind === "assistant") || null;
  if (!parentAssistantId) {
    return {
      nodeId: null,
      label: "新的主题",
      kind: "root",
      displayRole: "node"
    };
  }

  const parentAssistant = graph.nodes[parentAssistantId];
  const isSynthesisRecord = parentAssistant.branchType === "合";
  return {
    nodeId: parentAssistant.id,
    label: getNodeLabel(parentAssistant),
    kind: "assistant",
    branchType: isSynthesisRecord ? undefined : parentAssistant.branchType,
    displayRole: isSynthesisRecord ? "synthesis-record" : "node"
  };
}

function buildSynthesisActions(graph: Graph): DialogueSynthesisAction[] {
  return Object.values(graph.nodes)
    .filter((node) => node.kind === "user")
    .map((userNode) => {
      const assistants = userNode.children
        .map((childId) => graph.nodes[childId])
        .filter((child): child is AniccaNode => Boolean(child) && child.kind === "assistant");
      const thesis = assistants.find((child) => child.branchType === "正");
      const antithesis = assistants.find((child) => child.branchType === "反");
      if (!thesis || !antithesis) {
        return null;
      }

      const synthesis = Object.values(graph.nodes).find(
        (node) =>
          node.kind === "assistant" &&
          node.branchType === "合" &&
          node.meta?.lineageParentId === userNode.id
      );

      return {
        key: `${userNode.id}:${thesis.id}:${antithesis.id}`,
        lineageParentId: userNode.id,
        thesisId: thesis.id,
        antithesisId: antithesis.id,
        synthesisId: synthesis?.id || null,
        label: `${getNodeLabel(thesis)} / ${getNodeLabel(antithesis)}`,
        available: !synthesis
      };
    })
    .filter((action): action is DialogueSynthesisAction => Boolean(action))
    .sort((left, right) => graph.nodes[left.lineageParentId].createdAt.localeCompare(graph.nodes[right.lineageParentId].createdAt));
}

type StageSeed = {
  x: number;
  y: number;
};

type StageLayoutPreset = {
  focus: StageSeed;
  sourcePositions: StageSeed[];
  childPositions: StageSeed[];
  ancestorStartY: number;
  ancestorStepY: number;
};

function getStageLayoutPreset(focusNode: AniccaNode): StageLayoutPreset {
  if (focusNode.kind === "assistant" && focusNode.branchType === "合") {
    return {
      focus: { x: 50, y: 62 },
      sourcePositions: [
        { x: 30, y: 34 },
        { x: 70, y: 34 }
      ],
      childPositions: [
        { x: 50, y: 82 },
        { x: 36, y: 80 },
        { x: 64, y: 80 }
      ],
      ancestorStartY: 18,
      ancestorStepY: 10
    };
  }

  if (focusNode.kind === "assistant" && focusNode.branchType === "正") {
    return {
      focus: { x: 34, y: 49 },
      sourcePositions: [],
      childPositions: [
        { x: 34, y: 78 },
        { x: 50, y: 84 },
        { x: 24, y: 84 }
      ],
      ancestorStartY: 18,
      ancestorStepY: 10
    };
  }

  if (focusNode.kind === "assistant" && focusNode.branchType === "反") {
    return {
      focus: { x: 66, y: 49 },
      sourcePositions: [],
      childPositions: [
        { x: 66, y: 78 },
        { x: 50, y: 84 },
        { x: 76, y: 84 }
      ],
      ancestorStartY: 18,
      ancestorStepY: 10
    };
  }

  if (focusNode.kind === "user") {
    return {
      focus: { x: 50, y: 40 },
      sourcePositions: [],
      childPositions: [
        { x: 28, y: 70 },
        { x: 72, y: 70 },
        { x: 50, y: 82 }
      ],
      ancestorStartY: 16,
      ancestorStepY: 10
    };
  }

  return {
    focus: { x: 50, y: 50 },
    sourcePositions: [],
    childPositions: [
      { x: 50, y: 80 },
      { x: 34, y: 84 },
      { x: 66, y: 84 }
    ],
    ancestorStartY: 18,
    ancestorStepY: 10
  };
}

function getFallbackChildPosition(index: number, count: number): StageSeed {
  if (count <= 1) {
    return { x: 50, y: 82 };
  }

  if (count === 2) {
    return index === 0 ? { x: 38, y: 82 } : { x: 62, y: 82 };
  }

  const spread = count - 1;
  return {
    x: 22 + (56 / spread) * index,
    y: 84
  };
}

function getGrowthChildPosition(index: number, count: number): StageSeed {
  if (count <= 1) {
    return { x: 50, y: 72 };
  }

  if (count === 2) {
    return index === 0 ? { x: 20, y: 72 } : { x: 80, y: 72 };
  }

  if (count === 3) {
    return [
      { x: 50, y: 65 },
      { x: 20, y: 86 },
      { x: 80, y: 86 }
    ][index];
  }

  if (count === 4) {
    return [
      { x: 20, y: 65 },
      { x: 80, y: 65 },
      { x: 20, y: 88 },
      { x: 80, y: 88 }
    ][index];
  }

  return getFallbackChildPosition(index, count);
}

function buildStageNodes(graph: Graph, focusNodeId: string | null): DialogueStageNode[] {
  if (!focusNodeId || !graph.nodes[focusNodeId]) {
    return [];
  }

  const nodes: DialogueStageNode[] = [];
  const focusNode = graph.nodes[focusNodeId];
  const preset = getStageLayoutPreset(focusNode);
  const breadcrumbIds = getBreadcrumbIds(graph, focusNodeId);
  const ancestorIds = breadcrumbIds.slice(0, -1);

  ancestorIds.forEach((ancestorId, index) => {
    const ancestor = graph.nodes[ancestorId];
    nodes.push({
      id: ancestor.id,
      label: getNodeLabel(ancestor),
      preview: getNodePreview(ancestor),
      summary: ancestor.meta?.summary,
      kind: ancestor.kind,
      branchType: ancestor.branchType,
      isGrowthPerspective: Boolean(ancestor.meta?.growth),
      relation: "ancestor",
      seedX: 50,
      seedY: preset.ancestorStartY + index * preset.ancestorStepY
    });
  });

  nodes.push({
    id: focusNode.id,
    label: getNodeLabel(focusNode),
    preview: getNodePreview(focusNode),
    summary: focusNode.meta?.summary,
    kind: focusNode.kind,
    branchType: focusNode.branchType,
    isGrowthPerspective: Boolean(focusNode.meta?.growth),
    displayRole: focusNode.kind === "assistant" && focusNode.branchType === "合" ? "synthesis-record" : "node",
    relation: "focus",
    seedX: preset.focus.x,
    seedY: preset.focus.y
  });

  if (focusNode.kind === "assistant" && focusNode.branchType === "合" && focusNode.meta?.sourceNodeIds?.length) {
    const sourceNodes = focusNode.meta.sourceNodeIds
      .map((sourceId) => graph.nodes[sourceId])
      .filter((source): source is AniccaNode => Boolean(source))
      .sort((left, right) => branchOrder(left.branchType) - branchOrder(right.branchType));

    sourceNodes.forEach((source, index) => {
      const sourcePosition = preset.sourcePositions[index] || getFallbackChildPosition(index, sourceNodes.length);
      nodes.push({
        id: source.id,
        label: getNodeLabel(source),
        preview: getNodePreview(source),
        summary: source.meta?.summary,
        kind: source.kind,
        branchType: source.branchType,
        isGrowthPerspective: Boolean(source.meta?.growth),
        relation: "source",
        seedX: sourcePosition.x,
        seedY: sourcePosition.y
      });
    });
  }

  const childIds = getDisplayChildren(graph, focusNode);
  const growthChildren = childIds.filter((childId) => {
    const child = graph.nodes[childId];
    return Boolean(child.meta?.growth) && !child.branchType;
  });
  childIds.forEach((childId, index) => {
    const child = graph.nodes[childId];
    let position: StageSeed | null = null;

    if (focusNode.kind === "user") {
      position =
        child.branchType === "正" ? preset.childPositions[0] :
        child.branchType === "反" ? preset.childPositions[1] :
        child.branchType === "合" ? preset.childPositions[2] || null :
        null;
    }

    if (!position && child.meta?.growth && !child.branchType) {
      position = getGrowthChildPosition(growthChildren.indexOf(childId), growthChildren.length);
    }

    if (!position) {
      position = preset.childPositions[index] || getFallbackChildPosition(index, childIds.length);
    }

    nodes.push({
      id: child.id,
      label: getNodeLabel(child),
      preview: getNodePreview(child),
      summary: child.meta?.summary,
      kind: child.kind,
      branchType: child.branchType,
      isGrowthPerspective: Boolean(child.meta?.growth),
      relation: "child",
      seedX: position.x,
      seedY: position.y
    });
  });

  return nodes;
}

export function deriveDialogueView(graph: Graph, requestedFocusNodeId: string | null): DialogueView {
  const focusNodeId = requestedFocusNodeId && graph.nodes[requestedFocusNodeId]
    ? requestedFocusNodeId
    : graph.entryIds[graph.entryIds.length - 1] || null;
  const breadcrumbIds = getBreadcrumbIds(graph, focusNodeId);
  const breadcrumb = breadcrumbIds.map((nodeId) => {
    const node = graph.nodes[nodeId];
    return {
      id: node.id,
      label: getNodeLabel(node),
      kind: node.kind,
      branchType: node.branchType
    };
  });
  const composerTarget = buildComposerTarget(graph, focusNodeId);

  return {
    focusNodeId,
    breadcrumb,
    sidebarItems: buildSidebarItems(graph, focusNodeId, breadcrumbIds),
    currentNode: buildCurrentNode(graph, focusNodeId),
    composerTarget,
    availableSynthesisActions: buildSynthesisActions(graph),
    focusSnapshotId: `focus:${focusNodeId || "root"}|target:${composerTarget.nodeId || "root"}|trail:${breadcrumbIds.join(">")}`,
    stageNodes: buildStageNodes(graph, focusNodeId)
  };
}
