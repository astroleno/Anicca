import { AniccaNode, AniccaNodeMeta, BranchType, Edge, Graph, createEmptyGraph } from "@/types/anicca";

type AssistantDraft = {
  text?: string;
  label?: string;
  summary?: string;
  model?: string;
  seedId?: number;
  temperature?: number;
};

type GrowthAssistantDraft = AssistantDraft & {
  growth: NonNullable<AniccaNodeMeta["growth"]>;
  sourceNodeIds?: string[];
  edgeReason?: string;
};

export class BranchGraphStore {
  private graph: Graph = createEmptyGraph();
  private revision = 0;
  private snapshot = {
    graph: this.graph,
    revision: this.revision
  };
  private listeners = new Set<() => void>();

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot() {
    return this.snapshot;
  }

  createUserNode(text: string): string {
    const id = this.generateId("user");
    const node: AniccaNode = {
      id,
      kind: "user",
      text,
      createdAt: new Date().toISOString(),
      parents: [],
      children: []
    };
    this.graph.nodes[id] = node;
    this.graph.entryIds.push(id);
    this.emit();
    return id;
  }

  createChildUserNode(parentAssistantId: string, text: string): string {
    const parent = this.graph.nodes[parentAssistantId];
    if (!parent || parent.kind !== "assistant") {
      throw new Error(`assistant parent not found: ${parentAssistantId}`);
    }

    const id = this.generateId("user");
    const node: AniccaNode = {
      id,
      kind: "user",
      text,
      createdAt: new Date().toISOString(),
      parents: [parentAssistantId],
      children: []
    };
    this.graph.nodes[id] = node;
    parent.children.push(id);
    this.link(parentAssistantId, id, "continue");
    this.emit();
    return id;
  }

  forkNode(baseId: string, opts?: { branchType?: BranchType; seedId?: number; model?: string }): string {
    const base = this.graph.nodes[baseId];
    if (!base) throw new Error(`base node not found: ${baseId}`);
    const id = this.generateId("asst");
    const node: AniccaNode = {
      id,
      kind: "assistant",
      text: "", // 待生成
      createdAt: new Date().toISOString(),
      parents: [baseId],
      children: [],
      branchType: opts?.branchType,
      meta: { seedId: opts?.seedId, model: opts?.model }
    };
    this.graph.nodes[id] = node;
    base.children.push(id);
    this.link(baseId, id);
    this.emit();
    return id;
  }

  mergeNodes(parentIds: string[], note?: string): string {
    if (!parentIds || parentIds.length < 2) throw new Error("merge requires at least two parents");
    parentIds.forEach(pid => { if (!this.graph.nodes[pid]) throw new Error(`parent not found: ${pid}`); });
    const id = this.generateId("merge");
    const node: AniccaNode = {
      id,
      kind: "merge",
      text: note,
      createdAt: new Date().toISOString(),
      parents: [...parentIds],
      children: []
    };
    this.graph.nodes[id] = node;
    for (const pid of parentIds) {
      this.graph.nodes[pid].children.push(id);
      this.link(pid, id, "merge");
    }
    this.emit();
    return id;
  }

  createIndependentAssistant(opts?: { branchType?: BranchType; seedId?: number; model?: string; text?: string }): string {
    const id = this.generateId("asst");
    const node: AniccaNode = {
      id,
      kind: "assistant",
      text: opts?.text ?? "",
      createdAt: new Date().toISOString(),
      parents: [],
      children: [],
      branchType: opts?.branchType,
      meta: { seedId: opts?.seedId, model: opts?.model }
    };
    this.graph.nodes[id] = node;
    this.emit();
    return id;
  }

  createGrowthAssistant(parentIds: string[], draft: GrowthAssistantDraft): string {
    const normalizedParentIds = [...new Set(parentIds)].filter(Boolean);
    if (!normalizedParentIds.length) {
      throw new Error("growth assistant requires at least one parent");
    }
    normalizedParentIds.forEach((parentId) => {
      if (!this.graph.nodes[parentId]) {
        throw new Error(`parent not found: ${parentId}`);
      }
    });

    const id = this.generateId("asst");
    const node: AniccaNode = {
      id,
      kind: "assistant",
      text: draft.text ?? "",
      createdAt: new Date().toISOString(),
      parents: normalizedParentIds,
      children: [],
      meta: this.buildMeta(draft)
    };

    this.graph.nodes[id] = node;
    for (const parentId of normalizedParentIds) {
      this.graph.nodes[parentId].children.push(id);
      this.link(parentId, id, draft.edgeReason || (draft.growth.operator ? `growth:${draft.growth.operator}` : "growth"));
    }
    this.emit();
    return id;
  }

  createAssistantPair(parentUserId: string, opts?: { thesis?: AssistantDraft; antithesis?: AssistantDraft }) {
    const parent = this.graph.nodes[parentUserId];
    if (!parent || parent.kind !== "user") {
      throw new Error(`user parent not found: ${parentUserId}`);
    }

    const thesisId = this.createAssistantNode(parentUserId, "正", opts?.thesis);
    const antithesisId = this.createAssistantNode(parentUserId, "反", opts?.antithesis);
    this.emit();

    return { thesisId, antithesisId };
  }

  createSynthesisAssistant(sourceNodeIds: string[], opts?: AssistantDraft): string {
    if (!Array.isArray(sourceNodeIds) || sourceNodeIds.length !== 2) {
      throw new Error("synthesis requires exactly two source assistants");
    }

    const uniqueSourceIds = [...new Set(sourceNodeIds)];
    if (uniqueSourceIds.length !== 2) {
      throw new Error("synthesis sources must be unique");
    }

    const sourceNodes = uniqueSourceIds
      .map((nodeId) => this.graph.nodes[nodeId])
      .filter((node): node is AniccaNode => Boolean(node));

    if (sourceNodes.length !== 2 || sourceNodes.some((node) => node.kind !== "assistant")) {
      throw new Error("synthesis sources must be assistant nodes");
    }

    const normalizedSourceIds = [...sourceNodes]
      .sort((left, right) => this.branchOrder(left.branchType) - this.branchOrder(right.branchType))
      .map((node) => node.id);

    const normalizedSources = normalizedSourceIds.map((nodeId) => this.graph.nodes[nodeId]);
    if (
      normalizedSources[0].branchType !== "正" ||
      normalizedSources[1].branchType !== "反"
    ) {
      throw new Error("synthesis sources must be one 正 assistant and one 反 assistant");
    }

    const lineageParentId = this.resolveSharedLineageParentId(normalizedSources);
    if (!lineageParentId) {
      throw new Error("synthesis sources must share the same parent user");
    }

    const id = this.generateId("asst");
    const node: AniccaNode = {
      id,
      kind: "assistant",
      text: opts?.text ?? "",
      createdAt: new Date().toISOString(),
      parents: normalizedSourceIds,
      children: [],
      branchType: "合",
      meta: this.buildMeta({
        ...opts,
        sourceNodeIds: normalizedSourceIds,
        lineageParentId
      })
    };

    this.graph.nodes[id] = node;
    for (const sourceId of normalizedSourceIds) {
      this.graph.nodes[sourceId].children.push(id);
      this.link(sourceId, id, "synthesis");
    }
    this.emit();
    return id;
  }

  setNodeText(nodeId: string, text: string) {
    const n = this.graph.nodes[nodeId];
    if (!n) throw new Error(`node not found: ${nodeId}`);
    n.text = text;
    this.emit();
  }

  patchNodeMeta(nodeId: string, patch: Partial<AniccaNodeMeta>) {
    const node = this.graph.nodes[nodeId];
    if (!node) throw new Error(`node not found: ${nodeId}`);
    node.meta = { ...(node.meta || {}), ...patch };
    this.emit();
  }

  getGraph(): Graph {
    return this.graph;
  }

  setGraph(graph: Graph) {
    this.graph = graph;
    this.emit();
  }

  private link(from: string, to: string, reason?: string) {
    const id = this.generateId("e");
    const edge: Edge = { id, from, to, reason };
    this.graph.edges[id] = edge;
  }

  private createAssistantNode(parentUserId: string, branchType: Exclude<BranchType, "合">, draft?: AssistantDraft): string {
    const parent = this.graph.nodes[parentUserId];
    if (!parent || parent.kind !== "user") {
      throw new Error(`user parent not found: ${parentUserId}`);
    }

    const id = this.generateId("asst");
    const node: AniccaNode = {
      id,
      kind: "assistant",
      text: draft?.text ?? "",
      createdAt: new Date().toISOString(),
      parents: [parentUserId],
      children: [],
      branchType,
      meta: this.buildMeta(draft)
    };

    this.graph.nodes[id] = node;
    parent.children.push(id);
    this.link(parentUserId, id, branchType);
    return id;
  }

  private resolveSharedLineageParentId(sourceNodes: AniccaNode[]): string | null {
    const lineageParentIds = sourceNodes.map((node) => {
      const parentId = node.parents[0];
      const parent = parentId ? this.graph.nodes[parentId] : null;
      return parent?.kind === "user" ? parent.id : null;
    });

    if (!lineageParentIds[0] || !lineageParentIds[1] || lineageParentIds[0] !== lineageParentIds[1]) {
      return null;
    }

    return lineageParentIds[0];
  }

  private buildMeta(input?: AssistantDraft & { sourceNodeIds?: string[]; lineageParentId?: string; growth?: AniccaNodeMeta["growth"] }): AniccaNodeMeta | undefined {
    if (!input) {
      return undefined;
    }

    const meta: AniccaNodeMeta = {};
    if (typeof input.label === "string") meta.label = input.label;
    if (typeof input.summary === "string") meta.summary = input.summary;
    if (typeof input.model === "string") meta.model = input.model;
    if (typeof input.seedId === "number") meta.seedId = input.seedId;
    if (typeof input.temperature === "number") meta.temperature = input.temperature;
    if (Array.isArray(input.sourceNodeIds) && input.sourceNodeIds.length) meta.sourceNodeIds = [...input.sourceNodeIds];
    if (typeof input.lineageParentId === "string") meta.lineageParentId = input.lineageParentId;
    if (input.growth) meta.growth = { ...input.growth };
    return Object.keys(meta).length ? meta : undefined;
  }

  private branchOrder(branchType?: BranchType): number {
    if (branchType === "正") return 0;
    if (branchType === "反") return 1;
    if (branchType === "合") return 2;
    return 99;
  }

  private emit() {
    this.revision += 1;
    this.snapshot = {
      graph: this.graph,
      revision: this.revision
    };
    for (const listener of this.listeners) {
      listener();
    }
  }

  private generateId(prefix: string): string {
    const rnd = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${Date.now().toString(36)}_${rnd}`;
  }
}

export const branchGraphStore = new BranchGraphStore();
