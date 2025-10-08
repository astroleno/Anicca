import { AniccaNode, BranchType, Edge, Graph, NodeKind, createEmptyGraph } from "@/types/anicca";

// 内存态分支图存储与基本操作（最小 MVP）

export class BranchGraphStore {
  private graph: Graph = createEmptyGraph();

  // 创建用户节点
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
    return id;
  }

  // 在 baseId 下 fork 一个 assistant 分支
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
    return id;
  }

  // 创建合并节点并连接多个父分支
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
    return id;
  }

  // 创建独立 assistant（无父节点，用于“独立开始正/反”）
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
    return id;
  }

  // 读/写节点文本
  setNodeText(nodeId: string, text: string) {
    const n = this.graph.nodes[nodeId];
    if (!n) throw new Error(`node not found: ${nodeId}`);
    n.text = text;
  }

  getGraph(): Graph {
    return this.graph;
  }

  setGraph(graph: Graph) {
    this.graph = graph;
  }

  // 私有：连边
  private link(from: string, to: string, reason?: string) {
    const id = this.generateId("e");
    const edge: Edge = { id, from, to, reason };
    this.graph.edges[id] = edge;
  }

  private generateId(prefix: string): string {
    const rnd = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${Date.now().toString(36)}_${rnd}`;
  }
}

export const branchGraphStore = new BranchGraphStore();


