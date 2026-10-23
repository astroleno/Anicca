import { AniccaNode, AniccaNodeMeta, BranchType, Edge, Graph, createEmptyGraph } from "@/types/anicca";
import { normalizeSeedPerspective, normalizeThinkingSpace } from "@/features/perspectives/model";
import { normalizePolarityOrigin, polarityFrame, type PolarityOrigin } from "@/features/perspectives/polarity";
import type { ThinkingSpace } from "@/features/perspectives/model";
import { readUnderstandingChange, readDeferredDraft, deferredSyntheses, type DeferredSynthesis } from "@/features/dialectic/meaning";
import { readInquiryOrigin, inquiryLabel, type InquiryOrigin } from "@/features/dialectic/inquiry";
import { readNovelty, type NoveltyAssessment } from "@/features/dialectic/novelty";

type AssistantDraft = {
  text?: string;
  label?: string;
  summary?: string;
  model?: string;
  seedId?: number;
  temperature?: number;
  perspective?: AniccaNodeMeta["perspective"];
  sourceInstanceIds?: string[];
  polarity?: PolarityOrigin;
  fissionFrame?: ThinkingSpace;
  change?: string;
  connectionInput?: string;
  inquiry?: InquiryOrigin;
  novelty?: NoveltyAssessment;
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

  createUserNode(text: string, perspective?: AniccaNodeMeta["perspective"]): string {
    const id = this.generateId("user");
    const node: AniccaNode = {
      id,
      kind: "user",
      text,
      createdAt: new Date().toISOString(),
      parents: [],
      children: []
    };
    if (perspective) node.meta = { perspective: normalizeSeedPerspective(perspective) };
    this.graph.nodes[id] = node;
    this.graph.entryIds.push(id);
    this.emit();
    return id;
  }

  createChildUserNode(parentAssistantId: string, text: string, perspective?: AniccaNodeMeta["perspective"]): string {
    const parent = this.graph.nodes[parentAssistantId];
    if (!parent) {
      throw new Error(`parent not found: ${parentAssistantId}`);
    }

    const id = this.generateId("user");
    const node: AniccaNode = {
      id,
      kind: "user",
      text,
      createdAt: new Date().toISOString(),
      parents: [parentAssistantId],
      children: [],
      ...(perspective ? { meta: { perspective: normalizeSeedPerspective(perspective) } } : {})
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

  createAssistantPair(parentUserId: string, opts?: { thesis?: AssistantDraft; antithesis?: AssistantDraft; frame?: ThinkingSpace }) {
    const parent = this.graph.nodes[parentUserId];
    if (!parent) {
      throw new Error(`parent not found: ${parentUserId}`);
    }

    const thesisId = this.createAssistantNode(parentUserId, "正", { ...opts?.thesis, fissionFrame: opts?.frame });
    const antithesisId = this.createAssistantNode(parentUserId, "反", { ...opts?.antithesis, fissionFrame: opts?.frame });
    this.emit();

    return { thesisId, antithesisId };
  }

  createInquiry(origin: InquiryOrigin, draft: AssistantDraft) {
    const captured = readInquiryOrigin(origin, this.graph);
    if (!captured || !draft.text?.trim()) throw new Error("inquiry requires an existing quote and a response");
    const questionId = this.generateId("user");
    this.graph.nodes[questionId] = { id: questionId, kind: "user", text: captured.question,
      parents: [captured.sourceNodeId], children: [], createdAt: new Date().toISOString(),
      meta: { inquiry: captured, label: `${inquiryLabel(captured.intent)} · ${captured.quote.slice(0, 12)}` } };
    this.graph.nodes[captured.sourceNodeId].children.push(questionId);
    this.link(captured.sourceNodeId, questionId, "inquiry");
    const responseId = this.createAssistantNode(questionId, undefined, { ...draft, inquiry: captured });
    this.emit();
    return { questionId, responseId };
  }

  createPolarityPair(parentId: string, input: {
    groupId: string; axisId: string; frame: ThinkingSpace;
    negative: AssistantDraft; positive: AssistantDraft;
  }) {
    if (!this.graph.nodes[parentId]) throw new Error(`parent not found: ${parentId}`);
    // Validate and capture both frames before changing the graph: no half-pair commits.
    const negativeFrame = polarityFrame(input.frame, input.axisId, -1);
    const positiveFrame = polarityFrame(input.frame, input.axisId, 1);
    const negativeId = this.createAssistantNode(parentId, undefined, { ...input.negative,
      polarity: { groupId: input.groupId, axisId: input.axisId, pole: -1, frame: negativeFrame } });
    const positiveId = this.createAssistantNode(parentId, undefined, { ...input.positive,
      polarity: { groupId: input.groupId, axisId: input.axisId, pole: 1, frame: positiveFrame } });
    this.emit();
    return { negativeId, positiveId };
  }

  createSynthesisAssistant(sourceNodeIds: string[], opts?: AssistantDraft): string {
    if (!Array.isArray(sourceNodeIds) || sourceNodeIds.length !== 2) {
      throw new Error("synthesis requires exactly two sources");
    }

    const uniqueSourceIds = [...new Set(sourceNodeIds)];
    if (uniqueSourceIds.length !== 2) {
      throw new Error("synthesis sources must be unique");
    }

    const sourceNodes = uniqueSourceIds
      .map((nodeId) => this.graph.nodes[nodeId])
      .filter((node): node is AniccaNode => Boolean(node));

    if (sourceNodes.length !== 2) {
      throw new Error("synthesis sources must exist");
    }

    const normalizedSourceIds = [...sourceNodes]
      .sort((left, right) => this.branchOrder(left.branchType) - this.branchOrder(right.branchType))
      .map((node) => node.id);

    const normalizedSources = normalizedSourceIds.map((nodeId) => this.graph.nodes[nodeId]);
    const lineageParentId = this.resolveSharedLineageParentId(normalizedSources);

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
        sourceInstanceIds: opts?.sourceInstanceIds?.length === sourceNodeIds.length
          ? normalizedSourceIds.map(sourceId => opts.sourceInstanceIds![sourceNodeIds.indexOf(sourceId)]) : undefined,
        sourceNodeIds: normalizedSourceIds,
        lineageParentId: lineageParentId || undefined
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

  deferSynthesis(input: DeferredSynthesis): string {
    const draft = readDeferredDraft({ reason: input.reason, question: input.question });
    if (!draft || input.sourceNodeIds.length !== 2 || new Set(input.sourceNodeIds).size !== 2 ||
      input.sourceNodeIds.some(id => !this.graph.nodes[id]) || !input.id) throw new Error("invalid deferred synthesis");
    this.graph.deferredSyntheses = { ...this.graph.deferredSyntheses, [input.id]: {
      ...input, ...draft, sourceNodeIds: [...input.sourceNodeIds],
      ...(input.sourceInstanceIds ? { sourceInstanceIds: [...input.sourceInstanceIds] } : {})
    } };
    this.emit();
    return input.id;
  }

  resolveDeferredSynthesis(id: string, resultId: string) {
    const encounter = deferredSyntheses(this.graph).find(item => item.id === id);
    const result = this.graph.nodes[resultId];
    if (!encounter || result?.branchType !== "合" || !encounter.sourceNodeIds.every(source => result.parents.includes(source))) return;
    this.graph.deferredSyntheses![id] = { ...encounter, resolvedNodeId: resultId };
    this.emit();
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

  private createAssistantNode(parentUserId: string, branchType: Exclude<BranchType, "合"> | undefined, draft?: AssistantDraft): string {
    const parent = this.graph.nodes[parentUserId];
    if (!parent) {
      throw new Error(`parent not found: ${parentUserId}`);
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
    this.link(parentUserId, id, draft?.inquiry ? "inquiry" : draft?.polarity ? "polarity" : branchType);
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
    const change = readUnderstandingChange(input.change);
    if (change) meta.change = change;
    const inquiry = readInquiryOrigin(input.inquiry, this.graph);
    if (inquiry) meta.inquiry = inquiry;
    const novelty = readNovelty(input.novelty);
    if (novelty) meta.novelty = novelty;
    if (typeof input.connectionInput === "string" && input.connectionInput.trim()) meta.connectionInput = input.connectionInput.trim().slice(0, 2000);
    if (typeof input.model === "string") meta.model = input.model;
    if (typeof input.seedId === "number") meta.seedId = input.seedId;
    if (typeof input.temperature === "number") meta.temperature = input.temperature;
    if (Array.isArray(input.sourceNodeIds) && input.sourceNodeIds.length) meta.sourceNodeIds = [...input.sourceNodeIds];
    if (Array.isArray(input.sourceInstanceIds) && input.sourceInstanceIds.length) meta.sourceInstanceIds = [...input.sourceInstanceIds];
    if (typeof input.lineageParentId === "string") meta.lineageParentId = input.lineageParentId;
    if (input.growth) meta.growth = { ...input.growth };
    if (input.perspective) meta.perspective = normalizeSeedPerspective(input.perspective);
    if (input.polarity) meta.polarity = normalizePolarityOrigin(input.polarity);
    if (input.fissionFrame) meta.fissionFrame = normalizeThinkingSpace(input.fissionFrame);
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
