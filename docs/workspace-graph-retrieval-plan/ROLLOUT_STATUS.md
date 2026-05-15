# Workspace Graph Retrieval Rollout Status

更新日期：2026-05-16

## 当前状态

Phase 0、Phase 1A、Phase 2 已完成。MVP 主链已经打通；Phase 3A/3B 已启动调试可观测性，但 retrieval 仍默认关闭。

1. Phase 0 锁定了父链上下文、DialogueShell request body、API final prompt baseline。
2. Phase 1A 落地了纯 TypeScript retrieval query 层，包括 graph normalization、label/text scoring、BFS subgraph、relation fallback、防坏图和稳定排序。
3. Phase 2 落地了 retrieval context render、workspace context builder，并将 DialogueShell 的 branches/synthesis 请求统一走 `buildWorkspaceContext()`。
4. retrieval flag 默认关闭；关闭时 request body 与 prompt baseline 不漂移。
5. flag 开启时只在 render 非空时追加一条 `retrieval_context` system message。
6. Phase 3A 已新增 `?retrievalDebug=1` 内部 preview，不改变生成主链路。
7. Phase 3B 已在 debug preview 中显示 query、nodes/edges、coverage、omitted、dangling/duplicate 和 notes。

## 收口 Review

Gate 已通过：

```bash
npm test -- src/chat/workspaceContext.test.ts src/features/retrieval/contextRender.test.ts src/features/retrieval/workspaceGraphQuery.test.ts src/components/dialogue/DialogueShell.test.tsx src/app/api/__tests__/dialectic-routes.test.ts src/chat/context.test.ts src/store/branchGraph.test.ts
```

Phase 2 收口结果：7 个测试文件通过，74 条测试通过。

Phase 3A/3B 调试面板 gate：

```bash
npm test -- src/components/dialogue/DialogueShell.test.tsx src/chat/workspaceContext.test.ts src/features/retrieval/contextRender.test.ts src/features/retrieval/workspaceGraphQuery.test.ts src/app/api/__tests__/dialectic-routes.test.ts src/chat/context.test.ts src/store/branchGraph.test.ts
```

结果：7 个测试文件通过，80 条测试通过。

真实 visual smoke 状态：

- `npm run test:visual-dialogue` 已尝试运行。
- 当前缺少 `.next/BUILD_ID` 时脚本会要求先跑 `npm run build`。
- `npm run build` 在 production build 阶段超过 6 分钟无输出进展，已手动终止，未得到可用 visual smoke 结果。
- 因此 Phase 3A browser/visual smoke 仍标记为待补 gate，不作为本次默认开启依据。

Prompt 质量检查：

- branches 使用用户提交文本作为 `queryText`。
- synthesis 使用合成来源节点的 label / summary 构造 `queryText`，不使用空字符串。
- `collectParentContextCoverage()` 的 `coveredNodeIds` 会传给 query 层作为 `excludeNodeIds`，避免 retrieval context 重复父链内容。
- renderer 默认预算为 1800 字符，硬上限为 2400 字符；空 render 不追加 message。
- 输出为可解释的 `NODE` / `EDGE` 行，字段经过 sanitize，控制字符和伪多行注入不会破坏格式。

边界检查：

- `targetId=null`：保留 system prelude 策略，coverage 为空。
- 空 query / 空 graph：返回空 subgraph。
- 坏 graph：重复边、dangling edge、unknown reason、prototype key reason 均有防护测试。
- synthesis queryText：由正反来源 label / summary 拼接，保持和 branches 查询规则分离。

## 下一阶段边界

Phase 3 才进入 UI / 可观测性：

- 相关节点 preview。
- debug panel 或 retrieval 状态展示。
- 可视化“哪些节点进入了上下文”。
- 更细粒度的 flag 或内部开关策略。

在 Phase 3 之前，不做 schema 迁移、不引入 embedding/vector DB、不做跨 workspace 检索、不把 UI preview 混入已完成的 Phase 2 主链。

## 仓库卫生

- `CLAUDE.md` 当前仍是本地未跟踪文件，不纳入仓库。
- `graphify-out/` 当前仍是本地生成物，不纳入仓库。
