# 无相 Anicca

[![Quality](https://github.com/astroleno/Anicca/actions/workflows/quality.yml/badge.svg)](https://github.com/astroleno/Anicca/actions/workflows/quality.yml)

> 当前主线入口：`/dialogue`

—— 一个 local-first 的“正 / 反 / 合”对话实验空间。

当前主产品路径是 `/dialogue`：写一个想法，生成 `正 / 反`；任意两颗不同的 seed 都可以组合成 `合`，每颗 seed 都可以直接裂变出新的 `正 / 反`。workspace 以 local-first graph 保存在本地，支持恢复焦点、继续写和追踪双来源。

视觉实验集中在 `/labs`，旧的 `/newframe`、`/raymarching`、`/liquid`、`/mochi` 地址会跳转到对应实验页。

当前集成状态（2026-10-01）：

- `0.1.0` release tag 已指向 mainline closeout `14acf489`。
- Phase 2 workspace registry + import/export + create/rename/switch + telemetry 已关闭。
- `/` 与 `/dialogue` 已切换到浅色液态主界面：全屏舞台、按需阅读/谱系面板与常驻底部输入。
- `/dialogue` 已接入从仓库内参考源码迁移的 Shader Park 液态材质，并保留 DOM 语义层、资源清理、reduced-motion 与 WebGL fallback。
- 想法、正、反、合均可直接裂变，或作为补充输入的父节点；同角色、跨主题也可组合。拖动靠近、稍停后松手发起合成，也可在卡片中选“组合”再选另一颗。
- 常驻界面保留种子舞台与一个输入框；历史、工作区和圆桌等放入“更多”。舞台最多绘制 8 颗种子，完整历史仍保留。
- 液态层空闲时降频、交互时恢复帧刷新，并复用几何数据；reduced-motion 下仅在场景变化时重绘。
- 材质保留 `ref/sketch1638178` 的八步近似与粉彩色场；按压、拖动和新种子出现使用同一弹簧状态驱动液体与 DOM，不用严格表面裁剪替换原作的柔边效果。
- 等待时显示真实已用时间，可阅读、继续写和取消；失败可重试原操作，结果保留后来写的草稿。初次空工作区提供可关闭的三步提示，“更多”可重新打开。
- 触屏长按液滴后拖动；出现“松手合成”再释放会调用模型，移开取消。桌面单击就地阅读、双击裂变；已有种子位置持久化，新种子靠近来源落位。画面不再包含鼠标跟随球。
- Roundtable 已作为 opt-in sidecar 并入对话场，具备持久化、深挖、错误恢复与 stale-response 防护。
- GitHub Actions 已覆盖 lint、双 TypeScript、全量 Vitest、production build 与 Chromium visual smoke。

---

## 一、核心体验（What）

- **母题进入谱系**：用户输入一句话，它成为一个可继续展开的主题节点。
- **两分形响应**：系统围绕同一母题生成 `正` 与 `反` 两条 assistant 分支。
- **自由组合为合**：任意两颗不同 seed 均可组合，保留双方角色与来源，不伪装成一正一反。
- **就地阅读与直接裂变**：单击打开种子旁的阅读卡片，桌面双击直接生成正反；触屏保留卡片里的“裂变”按钮。
- **连续思考**：拖动靠近，稍停出现“松手合成”后释放；移开取消。等待时可阅读、写下一颗想法或取消请求，结果不会打开面板，也不会清除后来写的草稿。
- **本地恢复工作区**：graph、焦点节点和续写目标会一起持久化，刷新后仍能回到之前的上下文。

美学取向：浅色流动背景、半透明柔边种子、克制的界面 chrome 与充分留白，把注意力留给当前思考及其关系。

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
- 模型接入：OpenAI Responses / Chat Completions；正反合链路可单独配置兼容服务
- 本地持久化：`localStorage` workspace registry（已在 mainline 生效）

### 3.2 主线分层

```
┌──────────────────────────────────────────────┐
│                /dialogue 页面                │
│  Liquid Stage / On-demand Drawers / Composer       │
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

- `/labs/newframe`：metaball / WebGPU 视觉实验
- `/labs/raymarching`、`/labs/liquid`、`/labs/mochi`：独立 shader / visual playground

这些页面继续保留，但都不再定义主产品 contract。实验导航可回到目录和主对话页。场景只在挂载时初始化，拖动更新现有数据；退出时释放程序、材质、纹理、订阅和动画。WebGPU 异步初始化可取消，静态画布仅按需重绘。

### 3.4 关键设计哲学

- **local-first graph**：主线真相源是本地图结构，不是临时聊天 transcript。
- **显式谱系**：`正`、`反`、`合` 都以节点和连边存在，`合` 必须保留双来源与 lineage anchor。
- **主线与实验隔离**：`/dialogue` 负责产品路径，shader 页面负责视觉探索。

---

## 四、数据模型（当前 mainline contract）

当前主线持久化的是 local-first workspace registry。`workspaceId` 是稳定的本地持久化身份；`workspaceSessionId` 只在运行时生成，用于网络请求 ownership 和 stale-response 防护，不写入 workspace snapshot。

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
- `meta.sourceNodeIds`：`合` 节点的两颗来源 seed，角色不限
- `meta.lineageParentId`：可选的共同上游 user anchor；跨主题不强造共同母题

---

## 五、正 / 反 / 合主线流程

1. 用户在 composer 输入母题。
2. `/api/branches` 根据显式选定的写作目标上下文返回结构化 `正 / 反`。
3. 前端在 graph 中创建一个新的 user 节点，并挂上同母题下的两条 assistant 分支。
4. 选择任意 seed 的“组合”，再选另一颗并确认；同角色、跨主题、想法和合都可以参与。
5. `/api/synthesis` 使用两来源的真实角色与双方祖先上下文，返回 `合` 后保存 `sourceNodeIds`；存在共同母题时才保存 `lineageParentId`。直接“裂变”则把返回的正反直接挂在所选 seed 下，不插入虚构提问。
6. active workspace snapshot 会把 graph、focus 和 composer target 一起持久化，刷新后通过 registry 恢复。

这条主线的主产品 contract 就是 `正 / 反 / 合`。

---

## 六、界面结构与交互

`/dialogue` 当前是一个全屏舞台优先的浅色液态主线壳：

- 中央：Shader Park 液态种子舞台，用柔边融合和液桥表达接近关系；同位 DOM 按钮承担点选、拖拽、键盘与无障碍语义
- 桌面侧面板 / 手机底部面板：按需阅读正文、双来源与当前节点动作，不再常驻三栏
- 按需谱系：保留 breadcrumb、完整历史与当前 focus path；可见曲面上限不会截断 graph 历史
- 底部：单输入框，可写新想法或基于任意 seed 继续写；直接裂变在种子面板完成
- 顶部：紧凑 workspace 入口，支持新建、重命名、切换最近工作区，以及导出/导入当前 bundle
- 旁路：Roundtable Theater 作为当前节点的持久化 sidecar，可深挖、收起或把下一问带回主线，不直接写入 canonical `正 / 反 / 合`

核心交互：

- 输入一句话，生成下一轮 `正 / 反`
- 点击任意节点，更新 focus、panel 和 composer target
- 任意两颗不同 seed 均可显式组合为 `合`；每颗 seed 都能直接裂变
- 拖动一方靠近另一方时只显示合成候选；松手后仍由明确动作确认，不因碰撞直接改图
- 刷新页面后，恢复上一轮 workspace state

---

## 七、主线渲染与视觉实验

`/dialogue` 已接入主线专用液态 renderer：固定 8 个 GPU uniform 槽位，材质源码来自 [`reference/anicca-liquid-frontend`](reference/anicca-liquid-frontend/README.md)，运行时只消费场景投影，不拥有 graph。渲染器限制像素比并实现 `resize / render / dispose`；WebGL 不可用或 context lost 时自动回退到 CSS blob，reduced-motion 会冻结材质时间，但不会冻结 DOM 交互。

拖动种子靠近另一颗时，液桥按两者间距与半径逐渐增强，松开后平滑恢复；其他种子保持静止时的融合范围。材质保留参考版的多色色场和 tint 配方，增强液桥不会直接触发业务合成。

移动 Web 使用实际 visual viewport、safe-area 与输入区高度计算可用舞台；页面失焦或进入后台时暂停动画。近期微信目标是微信内 H5，业务/API/布局层已保持平台边界；原生小程序页面、Canvas 和存储适配不在本轮实现中，微信 iOS/Android 真机尚未验收。

旧版深色珍珠前端保留在 `codex/dialogue-metaball-gummy`（`5321273`）。该快照已在隔离目录通过 production build，并用浏览器确认 `/dialogue` 的 shell、舞台和 WebGL canvas 可启动，因此没有另建重复备份分支。检查旧版时应在干净的独立 clone 中切换，避免覆盖当前未提交工作；回退只取前端及必要依赖，不整体回退 API、模型配置、评测或用户数据。

仓库仍保留一组隔离的实验入口，用于继续探索其他液态气泡、raymarching 和 WebGPU 表现：

- `ref/mochi.ts`
- `/newframe`
- `/raymarching`
- `/liquid`
- `/mochi`

这些实验可以继续演化，但不参与 `/dialogue` 的 renderer 生命周期，也不直接改写主产品 contract。

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

- 可选云同步、分享与部署能力
- 持续追踪真实 Provider 的结构漂移、失败率与长尾延迟

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

主线视觉与交互来源见 [`reference/anicca-liquid-frontend`](reference/anicca-liquid-frontend/README.md)；生产页面没有直接加载该参考目录，而是将材质、配色和布局意图适配到现有 Next.js 架构。

---

## 十、验证门

- `npm run lint`
- `npm run typecheck`
- `npm run typecheck:test`
- `npm test`
- `npm run build`
- `npm run test:visual-dialogue`

本地开发服务运行时，可用 `ANICCA_NEXT_DIST_DIR=.cache/next-seed-qa npm run build` 独立构建，再使用相同的 `ANICCA_NEXT_DIST_DIR` 配合 `DIALOGUE_SMOKE_SERVER_MODE=start` 跑视觉验收，避免共享 `.next`。当前视觉脚本以拦截 API 的方式覆盖 9 组桌面/触屏/手机/键盘视口、任意种子组合、直接裂变、持久化，以及液态融合、reduced-motion、WebGL fallback、失败重试/触屏长按、实验画布资源生命周期这 5 项专项检查，不调用真实模型。

GitHub Actions 会在每个 pull request 和 `main` push 上运行双通道门禁：一条执行 lint、生产/测试 TypeScript、全量 Vitest 与 production build；另一条在 Chromium 中执行 production dialogue visual smoke，并保留 14 天视觉证据。

主线 rollout 关注的人工检查项：

- `/` 是否正确跳到 `/dialogue`
- `/newframe` 是否有清晰的 legacy handoff
- desktop / tablet / 320–430px mobile 下常驻输入、按需面板和触控目标是否仍可操作
- stale response 是否被丢弃
- `合` 的谱系、阅读面板、来源与 composer target 是否保持一致
- 液态种子靠近融合、拉远分离以及候选预览时 graph node/edge 数量是否保持不变
- WebGL disabled 与 context lost 时 CSS fallback 是否仍可点击、聚焦和阅读
- Roundtable drawer 的深挖成功/失败、焦点返回、移动端布局与 reduced-motion 是否可用

---

## 十一、路线图

- 阶段一：稳定 `/dialogue` 主线，包括 graph、request matching、workspace restore、ports rollout
- 阶段二：workspace registry foundation（`closed`，2026-04-29）
- 阶段三：workspace bundle import / export（`closed`，2026-04-29）
- 阶段四：主线 Metaball renderer 与 Roundtable sidecar（`closed`，2026-08-09）
- 阶段五：浅色液态主界面、续问裂变、按需阅读与移动 Web（`implemented`，2026-10-01；微信真机待验收）
- 阶段六：可选云同步、分享与部署能力

---

## 十二、参考与素材

- `docs/superpowers/specs/2026-04-23-anicca-dialectic-v2-mainline-design.md`
- `docs/superpowers/plans/2026-04-23-anicca-dialectic-v2-mainline.md`
- `docs/superpowers/plans/2026-04-24-anicca-dialectic-v2-backend-implement-plan.md`
- `docs/superpowers/plans/2026-04-24-anicca-dialectic-v2-frontend-implement-plan.md`
- `docs/superpowers/plans/2026-04-24-anicca-dialectic-v2-ports-rollout-implement-plan.md`
- `docs/superpowers/plans/2026-04-25-anicca-dialectic-v2-workspace-phase-implement-plan.md`
- `docs/superpowers/plans/2026-10-01-anicca-liquid-frontend-integration-plan.md`
- `reference/anicca-liquid-frontend/README.md`
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
