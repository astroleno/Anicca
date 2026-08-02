# Workspace Graph Retrieval Implementation Plan

## 目标概述

把 Anicca 当前的“父系近 5 轮上下文回溯”升级为一个可解释、local-first、适合正 / 反 / 合谱系的 workspace graph retrieval 层。

这个计划借鉴 graphify-7 的图检索模式：先找到相关节点，再沿图边扩展局部子图，最后按受控预算渲染成模型可读上下文。但不迁移 graphify-7 的 Python / NetworkX / tree-sitter 文件抽取管线。

最终效果：

1. `buildParentContext()` 继续保留现有 lineage 上下文，保证主线行为稳定。
2. 新增 `WorkspaceGraphQuery` 层，支持在当前 workspace graph 内检索相关节点和关系。
3. API 请求上下文从“只沿父链”变成“父链 + 相关子图摘要”的组合。
4. 后续可以在 UI 中暴露“相关节点”“未收束分歧”“可继续追问”等洞察，但第一阶段不做重 UI。

## 背景与证据

### Anicca 当前状态

- 主产品路径是 `/dialogue`，核心真相源是 local-first graph。
- 当前 graph contract 在 `src/types/anicca.ts`：`Graph.nodes`、`Graph.edges`、`entryIds`、`sourceNodeIds`、`lineageParentId`。
- 当前图写入集中在 `src/store/branchGraph.ts`：创建 user、正/反 assistant、合节点。
- 当前上下文构造集中在 `src/chat/context.ts`：`buildParentContext(targetId, systemPrelude, branchFilter, graph)`。
- 当前 API route 不持有 graph，只消费前端传入的 `contextMessages`，见 `src/app/api/branches/route.ts` 与 `src/app/api/synthesis/route.ts`。
- workspace 通过 localStorage registry 和 per-workspace snapshot 持久化，见 `src/lib/persist/workspaces.ts`。

当前缺口：

- 只能沿当前 focus 的父链回溯，不支持在当前 workspace 内找相关节点。
- 不支持跨 `entryIds` 的主题关联。
- 不支持按相关性、边类型或明确字符预算构造上下文。
- `Edge.reason` 太薄，不足以表达检索所需的关系类型、来源和可信度。

### graphify-7 可借鉴部分

graphify-7 的核心链路是：

```text
detect -> extract -> build -> cluster -> analyze -> report/export -> query/MCP
```

对 Anicca 有价值的是最后的 query 形状，而不是前面的文件抽取：

- `_score_nodes()`：exact / prefix / substring / source 打分找种子节点。
- `_bfs()` / `_dfs()`：从种子节点扩展局部子图。
- `_subgraph_to_text()`：按预算渲染 `NODE ... EDGE ...` 文本。
- `query_graph` / `get_node` / `get_neighbors` / `shortest_path`：读图 primitive。
- `context_filter`：只作为“可限制遍历范围”的启发；Anicca 不移植 graphify-7 heuristic，改用产品域 `relations`。
- `god_nodes` / communities / surprising connections：适合后续 workspace 洞察层。

不应迁移的部分：

- Python / NetworkX runtime。
- tree-sitter 文件抽取。
- 面向代码库的 `GRAPH_REPORT.md` 报告语义。
- 默认信任 LLM inferred edges。
- 一开始引入 embedding / vector DB。

## 设计原则

1. Local-first：生成链路使用提交时捕获的 in-memory `graph`、`graphRevision`、`workspaceSessionId`；localStorage 只用于 boot、export 和显式跨 workspace 搜索。
2. 谱系优先：显式父子、正反、合流来源关系优先于推断关系。
3. 可解释：每段注入上下文都能追溯到 node id、edge reason 和来源路径。
4. 渐进增强：第一版只做轻量 TS 查询层，不上向量库、数据库或离线社区检测。
5. 不破坏主线：`buildParentContext()` 的现有输出保持兼容，新检索作为补充上下文。
6. Agent-native primitive：MVP 先提供 `getNode`、`findByLabelOrText`、`queryWorkspaceGraph`，`getNeighbors` / `shortestPath` 作为 Phase 1B 扩展。

## 非目标

- 不实现跨用户或云端记忆。
- 不把 `graphify-out/graph.json` 当作产品内用户数据索引。
- 不默认跨 workspace 检索。
- 不引入 Python 服务或独立检索进程。
- 不做完整 GraphRAG、embedding、vector database。
- 不让模型推断的思想关系直接进入核心上下文，除非标注来源和置信度。

## MVP Scope

MVP 截止到 Phase 2：

1. Phase 0：锁定现有父链上下文行为。
2. Phase 1A：实现最小 workspace graph view、节点打分、BFS 查询。
3. Phase 2：安全渲染相关子图，并以默认关闭的方式接入 context builder。

Phase 3 是 MVP 后的主线启用与最小 UI；Phase 4/5 是 Deferred roadmap，不进入第一轮实施和测试门槛。

## 推荐架构

```text
/dialogue UI
  |
  | focus/composer target + queryText + captured graph/revision/session
  v
Context Builder
  |-- buildParentContext()       当前谱系上下文
  |-- queryWorkspaceGraph()      新增相关子图上下文
  |
  v
contextMessages
  |
  v
/api/branches, /api/synthesis
```

新增模块建议：

```text
src/features/retrieval/
  workspaceGraphQuery.ts
  workspaceGraphQuery.test.ts
  contextRender.ts
  contextRender.test.ts
  types.ts
```

未来可选模块：

```text
src/features/retrieval/
  workspaceInsights.ts
  workspaceInsights.test.ts
```

## 数据模型扩展

### 阶段一最小数据模型

第一阶段不强制迁移历史 snapshot，只在运行时把现有 graph 规范化成 retrieval graph view。

新增 retrieval 类型，避免直接改变核心 contract：

```typescript
export type RetrievalRelation =
  | "lineage"
  | "thesis"
  | "antithesis"
  | "synthesis"
  | "continuation"
  // Reserved for post-MVP provenance/search; MVP normalization must not emit it.
  | "source"
  | "merge"
  | "artifact";

export type RetrievalConfidence = "explicit" | "derived" | "inferred";

export type RetrievalNode = {
  id: string;
  label: string;
  text: string;
  summary?: string;
  kind: "user" | "assistant" | "merge";
  branchType?: "正" | "反" | "合";
  createdAt: string;
};

export type RetrievalEdge = {
  id: string;
  from: string;
  to: string;
  relation: RetrievalRelation;
  confidence: RetrievalConfidence;
  reason?: string;
};

export type RetrievalNodeMatch = {
  node: RetrievalNode;
  score: number;
  rank: number;
  bestMatch: "exact" | "prefix" | "substring";
  matchedFields: Array<"label" | "summary" | "text" | "branchType">;
};

export type RetrievalClampedOptions = {
  depth: number;
  maxDepth: number;
  maxNodes: number;
  maxEdges: number;
  seedLimit: number;
  maxQueryChars: number;
  relations: RetrievalRelation[];
  direction: "in" | "out" | "both";
};

export type RetrievalSubgraph = {
  nodes: RetrievalNode[];
  edges: RetrievalEdge[];
  seedNodeIds: string[];
  seedMatches: RetrievalNodeMatch[];
  clampedOptions: RetrievalClampedOptions;
  omitted: {
    matches: number;
    nodes: number;
    edges: number;
    excludedNodes: number;
    danglingEdges: number;
    duplicateEdges: number;
  };
  warnings: string[];
};

export type RetrievalGraphView = {
  nodes: Record<string, RetrievalNode>;
  edges: RetrievalEdge[];
  warnings: string[];
};
```

Canonical mapping：

| Source | Canonical relation | Direction | Traversable | Rendered | Dedup key | Notes |
|---|---|---|---|---|---|---|
| `Edge.reason === "正"` or user parent -> assistant `branchType="正"` | `thesis` | user -> assistant | yes | yes | `from/to/relation` | Explicit 正 branch |
| `Edge.reason === "反"` or user parent -> assistant `branchType="反"` | `antithesis` | user -> assistant | yes | yes | `from/to/relation` | Explicit 反 branch |
| `Edge.reason === "continue"` or assistant parent -> user child | `continuation` | assistant -> user | yes | yes | `from/to/relation` | Continuation path |
| `Edge.reason === "synthesis"` or assistant parent -> assistant `branchType="合"` | `synthesis` | source assistant -> synthesis assistant | yes | yes | `from/to/relation` | Canonical source-of-truth for 合 traversal |
| `meta.sourceNodeIds` on 合 node | `synthesis` | source assistant -> synthesis assistant | only as backfill | yes when canonical edge is missing | `from/to/synthesis` | MVP creates `confidence="derived"` synthesis edges; `source` relation is deferred/internal only |
| `meta.lineageParentId` on 合 node | `lineage` anchor | synthesis assistant -> lineage parent user | no by default | no | `from/to/lineage` | Used by parent-context reconstruction, not rendered as a normal graph edge in MVP |
| `Edge.reason === "merge"` or legacy `kind="merge"` path | `merge` | original edge direction | no by default | only when explicitly included | `from/to/merge` | Legacy compatibility; do not mislabel merge nodes as synthesis |

Source precedence:

1. `graph.edges` is the canonical source of relationships. If an edge has valid endpoints, normalize it first and mark confidence as `explicit`.
2. `parents` / `children` means the persisted `AniccaNode.parents` / `AniccaNode.children` fields on each node. They are consistency/backfill inputs only, not a new contract and not a temporary adjacency derived from `graph.edges`. Use them when an expected edge is missing, mark confidence as `derived`, and never let them override a normalized `graph.edges` relation.
3. `meta.sourceNodeIds` on 合 nodes only backfills missing `relation="synthesis"` edges with `confidence="derived"`. It must not emit `relation="source"` in MVP.
4. `entryIds` define workspace entry points, not retrieval edges.
5. Unknown `Edge.reason` values are skipped in MVP unless both endpoints are valid and a deterministic mapping exists; record a warning rather than guessing.
6. `RetrievalEdge.id` is the original `Edge.id` when present; backfilled edges use a stable derived id such as `derived:<relation>:<from>:<to>`.

Reason fallback rules:

- Known `Edge.reason` values map directly: `正 -> thesis`、`反 -> antithesis`、`continue -> continuation`、`synthesis -> synthesis`、`merge -> merge`。
- Missing `reason` or unknown `reason` may only fall back when endpoints are unambiguous:
  - `from.kind === "user"` and `to.kind === "assistant"` with `to.branchType === "正"` -> `thesis` with `confidence="derived"`。
  - `from.kind === "user"` and `to.kind === "assistant"` with `to.branchType === "反"` -> `antithesis` with `confidence="derived"`。
  - `from.kind === "assistant"` and `to.kind === "user"` and `to.parents` contains `from` -> `continuation` with `confidence="derived"`。
  - `from.kind === "assistant"` and `to.kind === "assistant"` with `to.branchType === "合"` and `to.parents` or `to.meta.sourceNodeIds` contains `from` -> `synthesis` with `confidence="derived"`。
  - `to.kind === "merge"` and `to.parents` contains `from` -> `merge` with `confidence="derived"`。
- All other missing/unknown reason edges are skipped with a warning; `forkNode()` edges without reason are only included when one of the endpoint rules above applies.

Direction rules:

- Traversal may use `direction: "in" | "out" | "both"`, defaulting to `both`.
- Rendering always preserves original canonical `from -> to`; even when traversal enters through an incoming edge, output must not reverse edge direction.
- The retrieval graph view must de-duplicate edges before traversal and before render.
- Empty or whitespace-only query returns an empty `RetrievalSubgraph` with `seedMatches=[]`; no fallback to all nodes.
- Match sorting is deterministic: higher `score`, then `exact > prefix > substring`, then field priority `label > summary > text > branchType`, then `node.id` ascending.
- `RetrievalSubgraph.nodes` is pre-sorted for render: seed nodes by `seedMatches.rank`, then BFS distance from nearest seed, then `score`, then `node.id`.
- `RetrievalSubgraph.edges` is pre-sorted for render: edges incident to seed nodes first, then explicit before derived, then relation order `thesis/antithesis/synthesis/continuation/source/merge/artifact/lineage`, then `edge.id`.
- When node/edge/char clamps omit content, increment `omitted.nodes` / `omitted.edges`; renderer must preserve seed nodes before spending budget on non-seed nodes.

### Post-MVP 可选核心 contract 扩展

在 MVP Phase 0-2 稳定后，再考虑扩展持久化 `Edge`。这不是 Phase 2 的任务，也不进入首轮 schema 变更：

```typescript
export interface Edge {
  id: string;
  from: string;
  to: string;
  reason?: string;
  relation?: RetrievalRelation;
  confidence?: RetrievalConfidence;
}
```

迁移策略：

- legacy edge 没有 `relation` 时，从 `reason` 推导。
- 无法按 Phase 1A fallback rules 推导时保留原数据、不写新 relation，并记录迁移 warning；不要默认写成 `lineage`。
- 不立即 bump workspace schema，除非需要把新字段持久化为正式 contract。

## 阶段计划

## Phase 0: 基线锁定

目标：确认现有上下文行为不被新检索层破坏。

涉及文件：

- `src/chat/context.ts`
- `src/chat/context.test.ts`
- `src/store/branchGraph.ts`
- `src/store/branchGraph.test.ts`

任务：

- [ ] 补充或确认 `buildParentContext()` 的测试覆盖：普通 assistant 父链、合节点 source summary、最多 5 轮、branchFilter。
- [ ] 给现有 fixture 增加多 entry graph，作为后续跨 entry 检索测试基础。
- [ ] 记录当前 `buildParentContext()` 完整 `messages` inline snapshot，覆盖普通 branches 和 synthesis source summary。
- [ ] 冻结测试时间或规范化 `createdAt`，避免 `new Date()` 造成 snapshot 抖动。
- [ ] 记录 `/api/branches` 与 `/api/synthesis` 在 retrieval disabled 时的 request body / final prompt snapshot，避免 Phase 2 改动造成 prompt drift。

验收：

- [ ] `npm test -- src/chat/context.test.ts src/store/branchGraph.test.ts` 通过。
- [ ] 新增 retrieval 前，现有 `/api/branches` 和 `/api/synthesis` 请求上下文格式不变。

## Phase 1A: WorkspaceGraphQuery 最小层

目标：实现只读 graph view、节点打分和 BFS 查询，不改变 UI 和 API 行为。

新增文件：

- `src/features/retrieval/types.ts`
- `src/features/retrieval/workspaceGraphQuery.ts`
- `src/features/retrieval/workspaceGraphQuery.test.ts`

核心 API：

```typescript
export function normalizeGraphForRetrieval(graph: Graph): RetrievalGraphView;

export function getNode(graph: Graph, nodeId: string): RetrievalNode | null;

export function findByLabelOrText(
  graph: Graph,
  query: string,
  options?: {
    limit?: number;
    maxQueryChars?: number;
  }
): RetrievalNodeMatch[];

export function queryWorkspaceGraph(
  graph: Graph,
  query: string,
  options?: {
    depth?: number;
    maxDepth?: number;
    maxNodes?: number;
    maxEdges?: number;
    seedLimit?: number;
    maxQueryChars?: number;
    relations?: RetrievalRelation[];
    direction?: "in" | "out" | "both";
    excludeNodeIds?: string[];
  }
): RetrievalSubgraph;
```

算法：

- 词项来源：query split、中文连续文本用 substring match，不做分词依赖。
- 打分字段：`meta.label` > `meta.summary` > `text` > `branchType`。
- 打分级别：exact > prefix > substring，与 graphify-7 的 `_score_nodes()` 保持同一精神。
- 默认种子：top 3 matches。
- 默认深度：2。
- 默认 relations：`thesis`、`antithesis`、`synthesis`、`continuation`。`source`、`merge`、`artifact`、`lineage` 默认不参与生成上下文遍历。
- 硬上限：`maxDepth <= 2`、`maxNodes <= 20`、`maxEdges <= 40`、`seedLimit <= 3`、`maxQueryChars <= 500`。
- 默认方向：`direction="both"`，但输出保留原始 `from/to`。
- 遍历边：优先从 `graph.edges` 规范化；`parents` / `children` / `sourceNodeIds` 只做缺边 backfill。
- `excludeNodeIds` 在 query 入口统一生效：从 seed candidate、BFS enqueue/expand、最终 nodes/render 中全部排除；incident edges 不返回并计入 `omitted.edges`，排除节点计入 `omitted.excludedNodes`。
- MVP 返回 BFS discovery edges，而不是 selected nodes 的 induced edges。也就是说，只有实际把节点带入子图的发现边会进入 `RetrievalSubgraph.edges`。
- graphify-7 的 heuristic `context_filter` 不移植；Anicca 用产品域 `relations` 作为 scope/filter。未来若需要别名或 UI 过滤，另加 `resolveRelationFilters()`，不进 Phase 1A。
- 坏 graph 防护：缺失 `nodes/edges/parents/children/sourceNodeIds` 时按空集合处理；dangling ids 跳过并计入 `warnings/omitted.danglingEdges`；BFS 使用 visited set 防循环。

任务：

- [ ] 实现 retrieval graph view，不修改原 graph。
- [ ] 实现 `normalizeGraphForRetrieval()`，覆盖坏 snapshot、dangling parent、坏 `sourceNodeIds`、重复 edge、循环 graph。
- [ ] 实现 canonical edge mapping、direction handling、edge dedup。
- [ ] 实现 `findByLabelOrText()`。
- [ ] 实现 BFS 子图查询，内部支持 relation filter、direction、excludeNodeIds。
- [ ] 覆盖测试：空 query、空 graph、单 entry、多 entry、合节点、merge legacy、无 reason edge、unknown reason edge、坏 snapshot、循环防护、relation filter、direction、excludeNodeIds、BFS discovery edges、edge dedup、match 排序、omitted counts。

验收：

- [ ] `queryWorkspaceGraph(graph, "投入")` 可以命中 user 原文和相关正/反/合节点。
- [ ] 查询不会修改 `graph`。
- [ ] 合节点能通过 canonical `synthesis` edge 找回正反来源；`sourceNodeIds` 只作为缺边 backfill，不重复渲染。
- [ ] `graph.edges` 与 `parents/children` 冲突时以 `graph.edges` 为准，并记录 warning。
- [ ] 未显式传 `relations` 时只遍历 `thesis/antithesis/synthesis/continuation`。
- [ ] `excludeNodeIds` 不会出现在 seed matches、BFS 返回节点或 rendered edges 中。
- [ ] 返回边集合是 BFS discovery edges；同一 selected node set 不额外补 induced edges。
- [ ] legacy `merge` relation 不会被误标成 `synthesis`。
- [ ] 多 entry graph 能跨 entry 命中，但默认只返回相关子图，不全量展开。
- [ ] 超过 depth/node/edge 上限的输入会被 clamp，不会产生失控上下文。

## Phase 1B: Query Primitive 扩展（Post-MVP）

目标：在 Phase 1A 稳定后再补完整图查询 primitive。

候选 API：

```typescript
export type RetrievalPath = {
  nodeIds: string[];
  edges: RetrievalEdge[];
  hops: number;
  clampedOptions: {
    maxHops: number;
    relations: RetrievalRelation[];
    direction: "in" | "out" | "both";
  };
};

export function getNeighbors(
  graph: Graph,
  nodeId: string,
  options?: {
    relations?: RetrievalRelation[];
    direction?: "in" | "out" | "both";
  }
): RetrievalEdge[];

export function shortestPath(
  graph: Graph,
  sourceId: string,
  targetId: string,
  options?: {
    maxHops?: number;
    relations?: RetrievalRelation[];
    direction?: "in" | "out" | "both";
  }
): RetrievalPath | null;
```

Deferred tasks:

- [ ] 暴露 public `getNeighbors()`。
- [ ] 增加 DFS mode。
- [ ] 增加 `shortestPath()`，`maxHops <= 8`。
- [ ] 增加同名/近分 ambiguity diagnostics。

## Phase 2: Context Render 与 buildParentContext 集成

目标：把相关子图渲染成稳定、可解释、可控长度的 context message。

新增文件：

- `src/features/retrieval/contextRender.ts`
- `src/features/retrieval/contextRender.test.ts`
- `src/chat/workspaceContext.ts`
- `src/chat/workspaceContext.test.ts`

渲染格式建议：

```text
相关谱系片段:
NODE [asst_1] branch=thesis label=继续 summary=先缩范围，再推进
NODE [asst_2] branch=antithesis label=暂停 summary=把摊子收住
EDGE [user_1] --thesis--> [asst_1]
EDGE [user_1] --antithesis--> [asst_2]
EDGE [asst_1] --synthesis--> [asst_3]
```

核心 API：

```typescript
export function sanitizeRetrievalField(
  value: unknown,
  options?: { maxChars?: number; singleLine?: boolean }
): string;

export function renderRetrievalContext(
  subgraph: RetrievalSubgraph,
  options?: {
    charBudget?: number;
    maxCharBudget?: number;
    includeEdges?: boolean;
    includeFullTextForSeedNodes?: boolean;
  }
): string;
```

Coverage API:

```typescript
export type ParentContextCoverage = {
  coveredNodeIds: string[];
  sourceNodeIds: string[];
  coveredEdgeIds: string[];
};

export function collectParentContextCoverage(input: {
  targetId?: string | null;
  branchFilter?: BranchType;
  graph: Graph;
}): ParentContextCoverage;

export type WorkspaceBuiltContext = BuiltContext & {
  coverage: ParentContextCoverage;
  retrieval?: {
    subgraph: RetrievalSubgraph;
    message?: Message;
  };
};
```

安全规则：

- 所有 `id/label/summary/text/relation/confidence/reason` 在拼接进 prompt 前必须经过 `sanitizeRetrievalField()`。
- 默认移除控制字符，折叠空白；除非明确允许，多行字段要压成单行。
- 字段硬上限建议：`id <= 80`、`label <= 40`、`summary <= 120`、`reason <= 80`、`seed full text <= 360`、非 seed text 默认不渲染。
- `charBudget` 是真实字符预算，不叫 `tokenBudget`；如果未来暴露 token budget，必须固定换算规则并测试。
- MVP 硬上限：`charBudget <= maxCharBudget <= 2400`；调用方传入更大的值必须被 clamp。
- 输出必须保证 seed nodes 优先保留，最终字符串不超过 `charBudget`。
- `EDGE` 行只使用 canonical English relation display：`thesis/antithesis/synthesis/continuation/source/merge/artifact/lineage`，不混用 `正/反`。

集成策略：

- `buildParentContext()` 不直接承担检索职责。
- 新增 `buildWorkspaceContext()` 组合父链上下文和 retrieval context。
- 第一版只在前端调用 API 前组合 `contextMessages`。
- API route 继续保持 stateless，不读取 localStorage 或 graph。
- 新母题提交时 `targetId` 可能是 `null`；此时跳过父链上下文，但仍可用 `queryText + graph` 执行 retrieval。
- retrieval 默认自动排除已由父链上下文覆盖的节点，避免同一 lineage 被渲染两遍。
- 父链覆盖集合不能从 `messages` 文本反推；必须由 `collectParentContextCoverage()` 从 graph 结构直接计算。
- `collectParentContextCoverage()` 必须覆盖所有实际进入 parent messages 的节点：当前 target、每轮 parent user、当前 assistant、被 `collectRoundAssistantSummary()` 渲染的 sibling assistant children，以及合节点 `sourceNodeIds`。
- `buildWorkspaceContext()` 内部固定追加在 parent messages 之后：`{ id: "retrieval_context", role: "system", content, createdAt }`。测试中冻结时间或注入 clock，避免 snapshot 抖动。
- `retrieval_context` 固定 id 只在 `buildWorkspaceContext()` 单元测试层断言；`DialogueShell` fetch body 与 API final prompt snapshot 只断言 `{ role, content }` 和最终文本，不要求消息 id 透传。
- branches 的 `queryText` 来自当前 user draft/input；synthesis 的 `queryText` 由 `thesis.summary + antithesis.summary + lineage parent text` 在调用方构造。

建议新 API：

```typescript
export function buildWorkspaceContext(input: {
  targetId?: string | null;
  queryText: string;
  systemPrelude: string;
  branchFilter?: BranchType;
  graph: Graph;
  graphRevision?: number;
  workspaceSessionId?: string;
  retrieval?: {
    enabled: boolean;
    depth?: number;
    maxDepth?: number;
    maxNodes?: number;
    maxEdges?: number;
    charBudget?: number;
    maxCharBudget?: number;
    relations?: RetrievalRelation[];
    direction?: "in" | "out" | "both";
  };
}): WorkspaceBuiltContext;
```

任务：

- [ ] 新增 `sanitizeRetrievalField()`，覆盖控制字符、换行、超长字段、prompt-injection-like 输入。
- [ ] 新增 `renderRetrievalContext()`，实现硬 `charBudget/maxCharBudget` clamp。
- [ ] 新增 `collectParentContextCoverage()`，直接返回父链 user、当前 assistant、已渲染 sibling assistant、合来源 source ids 和覆盖 edge ids。
- [ ] 新增 `buildWorkspaceContext()`，内部调用 `buildParentContext()` 和 `queryWorkspaceGraph()`。
- [ ] `targetId` 为空时只跳过父链，不跳过 retrieval。
- [ ] 从 `collectParentContextCoverage()` 收集 `targetId`、父链 user、父链 assistant、已渲染 sibling assistant、source assistant ids，传给 `excludeNodeIds`。
- [ ] 默认禁用 retrieval，通过显式参数开启。
- [ ] 在 `DialogueShell.handleSubmit()` 和 `handleGenerateSynthesis()` 中先接入但保持关闭，测试不影响现有行为。
- [ ] 开启实验开关后，将 retrieval context 作为固定 id 的额外 system message 注入。

验收：

- [ ] retrieval disabled 时，`contextMessages` 与 Phase 0 快照一致。
- [ ] retrieval enabled 时，新增上下文只包含提交时捕获的 in-memory graph 节点。
- [ ] `charBudget/maxCharBudget` 生效，长文本被截断，种子节点优先保留。
- [ ] 用户输入或模型输出中的控制字符、伪 `NODE/EDGE` 行、换行注入不会破坏渲染格式。
- [ ] 新母题提交没有 `targetId` 时，仍能基于 `queryText` 检索同 workspace 相关节点。
- [ ] retrieval 不重复渲染父链已覆盖的节点。
- [ ] `/api/branches` 与 `/api/synthesis` 不需要知道 retrieval graph 的存在。
- [ ] `buildWorkspaceContext()` disabled 与 `buildParentContext()` 的 messages 等价；enabled diff 只新增 `retrieval_context` system message。

## Phase 3: 主线启用与 UI 最小反馈（Post-MVP）

目标：在 `/dialogue` 主线中启用相关子图上下文，并给用户一点可见反馈。

涉及文件：

- `src/components/dialogue/DialogueShell.tsx`
- `src/components/dialogue/ConversationPanel.tsx`

启用策略：

- branches 请求：`queryText` 使用当前 user input。
- synthesis 请求：`queryText` 使用 `thesis.summary + antithesis.summary + lineage parent text`。
- relation filter 默认包含 `thesis`、`antithesis`、`synthesis`、`continuation`；`source`、`merge`、`artifact`、`lineage` 默认不进入生成上下文。
- depth 默认 2，`charBudget` 默认 1800-2700。

UI 最小反馈：

- 在当前节点详情区展示“相关节点”列表，最多 3 个。
- 每个相关节点显示 label / branchType / summary。
- 点击相关节点只切换 focus，不触发生成。

Ownership：

- 不在 `deriveDialogueView()` 内部计算 `relatedNodes`，因为它当前只接收 `graph + focus`，不知道 draft/query。
- `DialogueShell` 按 `graph revision + focus + queryText` memoize 相关节点，然后作为 prop 传给 `ConversationPanel` 或详情组件。
- 如果未来要放入 view model，必须先显式扩展 `deriveDialogueView()` 输入签名。

任务：

- [ ] 在 `DialogueShell.handleSubmit()` 开启 retrieval context。
- [ ] 在 `handleGenerateSynthesis()` 开启 retrieval context。
- [ ] 在 `DialogueShell` 计算 `relatedNodes`，避免把 draft-aware 查询塞进 view model。
- [ ] 在 `ConversationPanel` 或当前详情区展示相关节点列表。
- [ ] 给移动端布局确认不会撑破 panel。

验收：

- [ ] 从一个新母题继续追问时，父链上下文仍然存在。
- [ ] 当 workspace 有多个 entry 时，相关节点可以帮助模型引用同工作区其它母题。
- [ ] 相关节点 UI 不影响正/反/合生成动作。
- [ ] 没有相关节点时 UI 不显示空态说明文本。

## Deferred Phase 4: Workspace Insights 洞察层

目标：把 graphify-7 的 god nodes / surprising connections 思路转译为 Anicca 语义，用于工作区复盘，不进入 MVP，也不进入首版生成链路。

新增文件：

- `src/features/retrieval/workspaceInsights.ts`
- `src/features/retrieval/workspaceInsights.test.ts`

候选洞察：

- 核心母题：degree 高、被多轮 continuation 回到的 user 节点。
- 未收束分歧：有正/反但没有合的 user 节点。
- 桥接合流：合节点连接了多个后续 continuation 或被多次作为 parent。
- 长期悬置：创建时间较早、没有 children、summary 存在的 assistant 节点。
- 可继续追问：有高相关度但不在当前父链上的节点。

任务：

- [ ] 实现 `getCoreNodes(graph)`。
- [ ] 实现 `getUnresolvedDialectics(graph)`。
- [ ] 实现 `getBridgeSynthesisNodes(graph)`。
- [ ] 增加一个纯函数 `buildWorkspaceReview(graph)`，输出结构化洞察对象。
- [ ] 暂不接 UI，先用于测试和后续复盘页。

验收：

- [ ] 小 graph 不报噪音，大 graph 能输出有限洞察。
- [ ] 洞察只基于显式结构，不使用 LLM inferred edges。
- [ ] 输出对象可被后续 UI 或 prompt 复用。

## Deferred Phase 5: 可选跨 Workspace 检索

目标：在用户显式选择后，支持跨 workspace 搜索，但不默认进入生成上下文。不进入 MVP。

前置条件：

- Phase 1-4 稳定。
- workspace registry 中至少能安全加载多个 snapshot。
- UI 明确展示检索作用域。

任务：

- [ ] 新增 `queryWorkspaceRegistry()`，只读多个 workspace snapshot。
- [ ] 支持 scope：`activeOnly`、`recentN`、`selectedWorkspaceIds`。
- [ ] 跨 workspace 结果必须标注 workspace title 和 workspace id。
- [ ] 默认只用于搜索 UI，不自动注入 prompt。

验收：

- [ ] 用户能看见并控制跨 workspace 作用域。
- [ ] 不会把其它 workspace 内容静默带进当前生成请求。

## 实施顺序建议

MVP 推荐按以下顺序落地：

1. Phase 0：测试锁现状。
2. Phase 1A：retrieval graph view + scoring + BFS。
3. Phase 2：渲染和上下文组合，默认关闭。

MVP 后：

4. Phase 1B：补 `getNeighbors`、DFS、`shortestPath`。
5. Phase 3：主线启用 + 最小 UI。
6. Deferred Phase 4：洞察层。
7. Deferred Phase 5：跨 workspace。

每个 phase 完成后独立提交，避免把数据模型、上下文注入和 UI 变更混在一起。

## 测试计划

单元测试：

- `src/features/retrieval/workspaceGraphQuery.test.ts`
- `src/features/retrieval/contextRender.test.ts`
- `src/chat/context.test.ts`
- `src/chat/workspaceContext.test.ts`
- `src/lib/persist/workspaces.test.ts`
- `src/lib/io/workspaceBundle.test.ts`

集成测试：

- `src/components/dialogue/DialogueShell.test.tsx`
- `src/app/api/__tests__/dialectic-routes.test.ts`

Snapshot 断言：

- `buildParentContext()` 完整 `messages` inline snapshot，包括 synthesis source summary。
- `buildWorkspaceContext()` retrieval disabled 与 parent-only messages 等价。
- `buildWorkspaceContext()` retrieval enabled 只追加 `{ id: "retrieval_context", role: "system" }`，并断言 seed 优先和 `charBudget/maxCharBudget`。
- `DialogueShell` 对 `/api/branches` 与 `/api/synthesis` 的 fetch body inline snapshot 只断言 retrieval message 的 `{ role, content }`，不依赖 message id。
- API route final prompt snapshot 断言最终文本不发生隐式漂移。

手动验证：

1. 创建一个 workspace，输入母题 A，生成正/反/合。
2. 创建母题 B，内容与 A 部分相关。
3. 在 B 下继续追问，确认 retrieval context 包含 A 中相关摘要，而不是整段历史。
4. 生成合，确认合节点仍只接受同一母题的正/反来源，不被相关节点污染 sourceNodeIds。
5. 提交新母题时没有 `targetId`，确认仍基于 `queryText` 命中同 workspace 相关节点。
6. 刷新页面，确认 active workspace 恢复后检索仍可用，但生成链路仍使用提交瞬间捕获的 in-memory graph。

命令：

```bash
npm test -- src/chat/context.test.ts src/store/branchGraph.test.ts
npm test -- src/chat/workspaceContext.test.ts
npm test -- src/features/retrieval/workspaceGraphQuery.test.ts
npm test -- src/features/retrieval/contextRender.test.ts
npm test -- src/components/dialogue/DialogueShell.test.tsx src/app/api/__tests__/dialectic-routes.test.ts
npm test -- src/lib/persist/workspaces.test.ts src/lib/io/workspaceBundle.test.ts
```

Deferred tests:

- `src/features/retrieval/workspaceInsights.test.ts`

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 检索上下文压过当前焦点 | 父链上下文永远先于 retrieval context；retrieval `charBudget` 默认较小 |
| 相关节点误导模型生成 | 只使用 explicit/derived 结构边；不把 inferred 边作为默认上下文 |
| 上下文变长导致输出不稳定 | `renderRetrievalContext()` 必须有 `charBudget`、节点上限和边上限 |
| prompt 注入进入检索上下文 | 所有字段通过 `sanitizeRetrievalField()`；测试控制字符、换行和伪 `NODE/EDGE` 输入 |
| localStorage snapshot 与生成时 graph 不一致 | 生成链路只使用提交时捕获的 in-memory graph/revision/session；localStorage 只负责 boot/export |
| 坏 snapshot 进入 retrieval | `normalizeGraphForRetrieval()` 对缺集合、dangling ids、重复 edge 和循环 graph 做跳过/去重/警告 |
| UI 复杂度膨胀 | Phase 3 只展示最多 3 个相关节点，不做完整搜索面板 |
| 跨 workspace 隐私/语境混乱 | Deferred Phase 5 必须显式 scope，默认 active workspace only |

## 验收总标准

- [ ] 当前正 / 反 / 合主流程不回退。
- [ ] 当前父链上下文行为可通过测试锁定。
- [ ] 新增检索层是纯函数、可测试、无副作用。
- [ ] retrieval disabled 时没有 prompt 行为变化。
- [ ] retrieval enabled 时模型上下文包含可解释的相关子图摘要。
- [ ] retrieval context 所有字段已消毒并受硬上限约束。
- [ ] 不引入 Python runtime、vector DB 或外部服务。

## 后续开放问题

1. 是否需要给 `Edge` 正式扩展 `relation/confidence` 并持久化？
2. 相关节点 UI 应放在右侧详情区，还是 workspace bar 的搜索入口？
3. 是否需要为 `roundtable` artifacts 建立 `artifact` relation？
4. 是否需要给每次生成记录 `retrievalNodeIds` 和 `retrievalEdgeIds`，用于回放与审计？
5. 跨 workspace 检索是否应该作为一个独立用户动作，而不是生成前自动注入？

## 一句话结论

Anicca 应该借 graphify-7 的“图上查找相关局部结构”能力，但用 TypeScript 在现有 local-first workspace graph 上轻量实现。第一版目标不是 RAG，而是把上下文从单线父链扩展为“父链 + 可解释相关子图”。
