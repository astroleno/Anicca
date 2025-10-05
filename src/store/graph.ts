// DAG 与导入导出骨架：
// - 定义最小类型
// - 暴露 create/commit/fork 的空实现（带日志）
// - 导出/导入 JSON 的基本壳（后续以 zod 校验替换）

export type NodeId = string;
export type BranchId = string;

export type ThoughtNode = {
  id: NodeId;
  parentIds: NodeId[];
  type: 'thought' | 'reply' | 'system';
  prompt: string;
  mode: 'main' | 'flow' | 'anti' | 'mute';
  params: Record<string, unknown>;
  summary?: string;
  diff?: Record<string, unknown>;
  thumb?: string; // dataURL 或 thumbs/ 路径
  metrics?: Record<string, number>;
};

export type Branch = { id: BranchId; name: string; headId: NodeId };

export type Project = {
  version: string;
  projectId: string;
  createdAt: number;
  nodes: ThoughtNode[];
  branches: Branch[];
};

export function createEmptyProject(): Project {
  return {
    version: '0.1.0',
    projectId: crypto.randomUUID?.() ?? String(Date.now()),
    createdAt: Date.now(),
    nodes: [],
    branches: [],
  };
}

export function commitNode(project: Project, node: Omit<ThoughtNode, 'id'>): Project {
  try {
    const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const next: ThoughtNode = { id, ...node } as ThoughtNode;
    const nodes = [...project.nodes, next];
    return { ...project, nodes };
  } catch (err) {
    console.error('[graph] commitNode error:', err);
    return project;
  }
}

export function forkBranch(project: Project, fromBranchId: BranchId, name: string): Project {
  try {
    const from = project.branches.find(b => b.id === fromBranchId);
    if(!from) return project;
    const b: Branch = { id: crypto.randomUUID?.() ?? `${Date.now()}`, name, headId: from.headId };
    return { ...project, branches: [...project.branches, b] };
  } catch (err) {
    console.error('[graph] forkBranch error:', err);
    return project;
  }
}

export function exportJSON(project: Project): string {
  try { return JSON.stringify(project, null, 2); } catch (err){ console.error('[graph] exportJSON error:', err); return '{}'; }
}

export function importJSON(text: string): Project | null {
  try {
    const obj = JSON.parse(text);
    // TODO: 后续替换为 zod 校验，给出详细错误
    if (!obj || !Array.isArray(obj.nodes) || !Array.isArray(obj.branches)) return null;
    return obj as Project;
  } catch (err) {
    console.error('[graph] importJSON error:', err);
    return null;
  }
}


