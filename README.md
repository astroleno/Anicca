# 无相 Anicca

> 当前主线入口：`/dialogue`

—— 一个 local-first 的“正 / 反 / 合”对话实验空间。

当前主产品路径已经切到 `/dialogue`：输入一个母题，先生成 `正 / 反` 两条分叉，再在同一条谱系里决定是否收束成 `合`。workspace 会以 local-first graph 形式保存在本地，支持恢复焦点、续写父节点和追踪来源。

`/newframe`、`/raymarching`、`/liquid`、`/mochi` 继续保留为视觉 / shader 实验入口，但不再承担主产品职责。

当前集成状态（2026-04-29）：

- `codex/dialectic-v2-mainline` 已包含 Phase 1 gate、roundtable、visual/ref/docs 和 OS metadata cleanup 相关提交，当前基点是 `2c294fe`。
- Phase 2 Unit 1 已落在隔离分支 `codex/workspace-registry-unit1`，提交为 `7a992bb feat(workspaces): add registry migration foundation`。
- Unit 1 分支已推送到 `origin/codex/workspace-registry-unit1`，但尚未并入 `codex/dialectic-v2-mainline`。
- `codex/workspace-phase2-continuation` 是基于 Unit 1 的 stacked continuation，用来回放并整理上一轮已完成的 workspace Unit 2+ 能力。

---

## 一、核心体验（What）

- **母题进入谱系**：用户输入一句话，它成为一个可继续展开的主题节点。
- **两分形响应**：系统围绕同一母题生成 `正` 与 `反` 两条 assistant 分支。
- **显式收束为合**：只有当同一母题下的 `正 / 反` 都存在时，用户才决定是否生成 `合`。
- **本地恢复工作区**：graph、焦点节点和续写目标会一起持久化，刷新后仍能回到之前的上下文。

美学取向：深色舞台、漂浮光晕、低噪音 chrome，以及把注意力尽量留给 graph 本身。

---

## 二、项目定位（Why）

- 不是效率工具，而是“思考本身”的再体验。
- 强调“无常（Anicca）/ 无相（Formless）/ 无我（Anatta）”。
- 目标是一个可以离线、本地运行、可恢复 workspace 的实验空间。

---

## 三、当前架构（How）

### 3.1 主线栈

- 应用框架：`next@15`（App Router, TypeScript）
- UI：React 18 + CSS Modules
- 状态：`zustand`
- API：`/api/branches`、`/api/synthesis`、`/api/chat`
- 模型接入：OpenAI Responses API
- 本地持久化：`localStorage` workspace registry（Phase 2 Unit 1 分支）；主线合并前仍以 PR 分支状态为准

### 3.2 主线分层

```
┌──────────────────────────────────────────────┐
│                /dialogue 页面                │
│  Hero / Sidebar / Bubble Stage / Panel / Composer │
├──────────────────────────────────────────────┤
│             Dialectic View Model             │
│  breadcrumb / sidebar tree / synthesis affordance │
├──────────────────────────────────────────────┤
│          Local-First Branch Graph            │
│  user / assistant nodes + edges + entryIds   │
├──────────────────────────────────────────────┤
│               API Route Layer                │
│  /api/branches -> 正 / 反   /api/synthesis -> 合 │
├──────────────────────────────────────────────┤
│          Workspace Registry Persistence      │
│  workspaceId / active id / per-workspace snapshot │
└──────────────────────────────────────────────┘
```

### 3.3 实验入口

- `/newframe`：旧 metaball / WebGPU 视觉实验
- `/raymarching`、`/liquid`、`/mochi`：独立 shader / visual playground

这些页面继续保留，但都不再定义主产品 contract。

### 3.4 关键设计哲学

- **local-first graph**：主线真相源是本地图结构，不是临时聊天 transcript。
- **显式谱系**：`正`、`反`、`合` 都以节点和连边存在，`合` 必须保留双来源与 lineage anchor。
- **主线与实验隔离**：`/dialogue` 负责产品路径，shader 页面负责视觉探索。

---

## 四、数据模型（当前 stacked branch contract）

Phase 2 stacked 分支持久化的是一个 local-first workspace registry。`workspaceId` 是稳定的本地持久化身份；`workspaceSessionId` 只在运行时生成，用于网络请求 ownership 和 stale-response 防护，不写入 workspace snapshot。合并到 `codex/dialectic-v2-mainline` 后，这一段成为主线 workspace persistence contract。

持久化拆成三层：

- registry metadata：`anicca_workspace_registry_v1`
- active workspace id：`anicca_workspace_active_v1`
- per-workspace snapshot：`anicca_workspace_snapshot_v1:{workspaceId}`

registry metadata 足够渲染最近工作区列表，不需要启动时读取每个完整 graph blob。

```json
{
  "schemaVersion": "anicca-workspace-registry-v1",
  "entries": [
    {
      "id": "workspace_01",
      "title": "这个方向还值不值得继续投入？",
      "createdAt": "2026-04-29T00:00:00.000Z",
      "updatedAt": "2026-04-29T00:00:00.000Z",
      "lastOpenedAt": "2026-04-29T00:00:00.000Z",
      "entryCount": 1,
      "nodeCount": 4
    }
  ]
}
```

active workspace key 单独保存：

```json
"workspace_01"
```

每个 workspace snapshot 保存 graph、focus 与 composer target：

```json
{
  "schemaVersion": "anicca-workspace-v2",
  "workspaceId": "workspace_01",
  "focusedNodeId": "asst_synthesis_1",
  "composerParentId": "asst_synthesis_1",
  "stageLayouts": {},
  "graph": {
    "version": "anicca-dialectic-v2",
    "entryIds": ["user_root_1"],
    "nodes": {
      "user_root_1": {
        "id": "user_root_1",
        "kind": "user",
        "text": "这个方向还值不值得继续投入？",
        "createdAt": "2026-04-24T03:00:00.000Z",
        "parents": [],
        "children": ["asst_thesis_1", "asst_antithesis_1"]
      },
      "asst_thesis_1": {
        "id": "asst_thesis_1",
        "kind": "assistant",
        "branchType": "正",
        "text": "继续，但把范围切小。",
        "createdAt": "2026-04-24T03:01:00.000Z",
        "parents": ["user_root_1"],
        "children": ["asst_synthesis_1"],
        "meta": {
          "label": "继续",
          "summary": "先缩范围，再推进。"
        }
      },
      "asst_antithesis_1": {
        "id": "asst_antithesis_1",
        "kind": "assistant",
        "branchType": "反",
        "text": "先停一下，别同时铺太开。",
        "createdAt": "2026-04-24T03:02:00.000Z",
        "parents": ["user_root_1"],
        "children": ["asst_synthesis_1"],
        "meta": {
          "label": "暂停",
          "summary": "把摊子收住，再判断。"
        }
      },
      "asst_synthesis_1": {
        "id": "asst_synthesis_1",
        "kind": "assistant",
        "branchType": "合",
        "text": "保留主线，但拆开节奏。",
        "createdAt": "2026-04-24T03:03:00.000Z",
        "parents": ["asst_thesis_1", "asst_antithesis_1"],
        "children": [],
        "meta": {
          "label": "收束",
          "summary": "保留主线，拆开节奏。",
          "sourceNodeIds": ["asst_thesis_1", "asst_antithesis_1"],
          "lineageParentId": "user_root_1"
        }
      }
    },
    "edges": {
      "e1": { "id": "e1", "from": "user_root_1", "to": "asst_thesis_1", "reason": "正" },
      "e2": { "id": "e2", "from": "user_root_1", "to": "asst_antithesis_1", "reason": "反" },
      "e3": { "id": "e3", "from": "asst_thesis_1", "to": "asst_synthesis_1", "reason": "synthesis" },
      "e4": { "id": "e4", "from": "asst_antithesis_1", "to": "asst_synthesis_1", "reason": "synthesis" }
    }
  }
}
```

当前 workspace contract 里最关键的字段：

- `workspaceId`：稳定本地 workspace 身份，用于 registry、active id、per-workspace snapshot 和后续导入导出
- `workspaceSessionId`：运行时 session ownership token；hydrate、创建、导入、切换时重新生成，不跨 reload 持久化
- `focusedNodeId` / `composerParentId`：恢复 UI 焦点与续写目标
- `stageLayouts`：按 focus snapshot 保存 stage pan 和节点位置
- `graph.entryIds`：多个主题入口
- `node.branchType`：仅 assistant 节点使用，取值为 `正 | 反 | 合`
- `meta.sourceNodeIds`：`合` 节点的双来源 assistant
- `meta.lineageParentId`：`合` 节点共享的上游 user anchor

---

## 五、正 / 反 / 合主线流程

1. 用户在 composer 输入母题。
2. `/api/branches` 根据当前 focus 上下文返回结构化 `正 / 反`。
3. 前端在 graph 中创建一个新的 user 节点，并挂上同母题下的两条 assistant 分支。
4. 当同一母题同时拥有 `正` 与 `反` 时，UI 才暴露“生成合”动作。
5. `/api/synthesis` 返回 `合` 后，前端创建一个带 `sourceNodeIds + lineageParentId` 的 synthesis assistant。
6. active workspace snapshot 会把 graph、focus 和 composer target 一起持久化，刷新后通过 registry 恢复。

这条主线的主产品 contract 就是 `正 / 反 / 合`。

---

## 六、界面结构与交互

`/dialogue` 当前是一个舞台优先的主线壳：

- 左侧：谱系树、breadcrumb、当前 focus path
- 中央：bubble stage，用于展示当前节点及其 lineage / source 关系
- 右侧：当前节点详情、来源节点、显式 synthesis affordance
- 底部：persistent composer，可从 root 或当前 assistant 继续展开
- 顶部：workspace bar，支持新建、重命名、切换最近工作区，以及导出/导入当前 bundle

核心交互：

- 输入一句话，生成下一轮 `正 / 反`
- 点击任意节点，更新 focus、panel 和 composer target
- 当 `正 / 反` 成对存在时，显式点击生成 `合`
- 刷新页面后，恢复上一轮 workspace state

---

## 七、实验渲染与视觉探索

当前仓库仍然保留一组实验型视觉入口，用于继续探索液态气泡、raymarching 和 WebGPU 表现：

- `ref/mochi.ts`
- `/newframe`
- `/raymarching`
- `/liquid`
- `/mochi`

这些实验可以继续演化，但默认不直接改写 `/dialogue` 的主产品 contract。

---

## 八、持久化与后续能力

当前已经落地：

- localStorage workspace registry
- per-workspace snapshot
- active workspace id
- legacy `anicca_workspace_v2` snapshot migration
- validated workspace bundle export / import
- workspace bar：create / rename / switch recent workspaces
- derived title 会跟随 root topic 更新，直到用户手动重命名
- no-op telemetry adapter + success-only adoption events:
  - `workspace_resumed`
  - `continuation_created`
  - `synthesis_created`
- imported workspaces receive a fresh local `workspaceId`
- imported workspaces reset local `lastOpenedAt` to import time
- graph version 校验
- runtime-only workspace session regeneration

仍在后续计划中的能力：

- 更强视觉层回接评估
- 可选云同步、分享与部署能力

---

## 九、本地开发与运行

```bash
npm install
npm run dev
```

默认入口：

- `http://localhost:3000/` -> 自动跳转到 `/dialogue`
- `http://localhost:3000/dialogue` -> 正反合主线
- `http://localhost:3000/newframe` -> 旧视觉实验入口

---

## 十、验证门

- `npm test`
- `npm run build`
- `npm run test:visual-dialogue`

主线 rollout 关注的人工检查项：

- `/` 是否正确跳到 `/dialogue`
- `/newframe` 是否有清晰的 legacy handoff
- tablet / mobile 下 shell 是否仍可操作
- stale response 是否被丢弃
- `合` 的 breadcrumb / sidebar / panel / composer 是否保持一致

---

## 十一、路线图

- 阶段一：稳定 `/dialogue` 主线，包括 graph、request matching、workspace restore、ports rollout
- 阶段二：workspace registry foundation，包括 stable `workspaceId`、migration、active workspace boot
- 阶段三：workspace bundle import / export，保持 local-first 且不引入云同步
- 阶段四：在不破坏主线 contract 的前提下评估是否把更强的视觉层重新接回 `/dialogue`
- 阶段五：可选云同步、分享与部署能力

---

## 十二、参考与素材

- `docs/superpowers/specs/2026-04-23-anicca-dialectic-v2-mainline-design.md`
- `docs/superpowers/plans/2026-04-23-anicca-dialectic-v2-mainline.md`
- `docs/superpowers/plans/2026-04-24-anicca-dialectic-v2-backend-implement-plan.md`
- `docs/superpowers/plans/2026-04-24-anicca-dialectic-v2-frontend-implement-plan.md`
- `docs/superpowers/plans/2026-04-24-anicca-dialectic-v2-ports-rollout-implement-plan.md`
- `docs/superpowers/plans/2026-04-25-anicca-dialectic-v2-workspace-phase-implement-plan.md`
- `ref/mochi.ts`

---

## 变更记录

- 2025-10-05：创建 README（汇总项目目标、架构、数据模型、开发指引）。
- 2025-10-12：修复 MetaCanvas 集成问题：
  - 安装并配置 Tailwind CSS（解决样式类失效问题）
  - 优化 WebGL 兼容性（支持 WebGL1/WebGL2 降级）
  - 修复画布尺寸问题（设置固定高度，确保容器可见）
  - 性能优化（降低分辨率、减少噪声计算、限制画布尺寸）
  - 修复 PostCSS 配置错误（使用 @tailwindcss/postcss 插件）
