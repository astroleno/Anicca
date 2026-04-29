# Anicca Dialectic V2 Mainline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在同仓库内建立新的 `/dialogue` 主线，让 Anicca 先具备稳定的正反合多轮对话，再决定是否把现有 shader 视觉重新接回主路径。

**Architecture:** 继续使用 `src/store/branchGraph.ts` 作为对话谱系真相源，新增结构化 `/api/branches` 和 `/api/synthesis` 作为无状态内容生成器，并用新的 view-model 层把 graph 投影成 sidebar、breadcrumb、bubble stage、composer 所需数据。主线路径先采用稳定的 2D/SVG/DOM 气泡舞台，不依赖 `src/components/MetaballCanvas.tsx` 或 `src/components/RaymarchingCanvas.tsx`。

**Tech Stack:** Next.js 15, React 18, TypeScript, Zustand, OpenAI Responses API, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-04-23-anicca-dialectic-v2-mainline-design.md`

## Focused Implementation Plans

- Backend implement plan: `docs/superpowers/plans/2026-04-24-anicca-dialectic-v2-backend-implement-plan.md`
- Frontend implement plan: `docs/superpowers/plans/2026-04-24-anicca-dialectic-v2-frontend-implement-plan.md`
- Ports / rollout implement plan: `docs/superpowers/plans/2026-04-24-anicca-dialectic-v2-ports-rollout-implement-plan.md`

These focused plans are execution slices of this master plan. Use the slice plans for implementation sequencing and file-level execution; use this document only for product contracts, cross-slice dependencies, and rollout policy.

### Plan Authority Contract

- Slice plans own execution-level file lists, unit breakdowns, and test choreography.
- This master plan owns integrated product contracts, scope boundaries, cross-slice dependencies, and rollout policy.
- When a slice plan and the archived task-by-task sections below diverge, update the slice plan first and then sync only the affected contract language back into this master plan.
- The detailed task sections later in this document are retained for traceability and review history; they are not a second independently-maintained implement plan.

---

## Frontend

### Frontend Direction

- 主线前端不继续在 `/newframe` 上补功能，而是新建 `/dialogue`。
- 首发交付采用稳定的 2D/SVG/DOM bubble stage，不把 `src/components/MetaballCanvas.tsx` 或 `src/components/RaymarchingCanvas.tsx` 作为前提依赖。
- UI 必须通过 `view-model` 消费 `branchGraph`，不再让渲染层自行决定“分支语义”。
- `/newframe`、`/raymarching`、`/liquid`、`/mochi` 继续保留为实验入口，但不再承担主产品职责。

### Frontend Reuse Decision

- 当前仓库里的 WebGPU/metaball 前端不作为首发主线骨架，但仍是后续主视觉引擎的优先候选。
- `ref/anicca` 只做“产品 DNA 借鉴”，不做“整体迁移”。
- 可以借鉴：
  - blob 渐变与体积感
  - 选中态 ring / hover detail card
  - 底部常驻 composer 的氛围与层次
  - BlobVisual / BlobContent 的视觉层与内容层分离
  - 输入即裂变为 `正 / 反` 的身体化体验
  - 正反靠近、张力增强、再生成 `合` 的空间暗示
- 不直接迁移：
  - `ref/anicca/components/Canvas.tsx` 的本地 `nodes` 状态与自由拖拽物理
  - 任意节点拖拽靠近即 synthesis 的隐式数据规则
  - `ref/anicca/services/gemini.ts` 的前端直连模型方式
  - Vite + React 19 的应用壳与目录结构

### Post-Review Frontend Correction

2026-04-24 的多 agent 前端评审结论：当前 `/dialogue` 的 graph、source tracking、local persistence、request matching 是产品化强化；但 UI 已明显被通用 dark glass dashboard / card chrome 稀释，中心 bubble stage 没有成为第一主角。

后续前端工作必须按以下优先级修正：

- 先修 P1 可用性问题：mobile scroll、stage safe area、pending-state 互斥与 synthesis loading。
- 再修 P2 质量问题：sidebar ARIA 语义、reduced-motion、实验组件 debug/mock 痕迹。
- 再做视觉方向：低饱和暗场 + living blob stage + restrained operational chrome。
- 不继续增加面板和说明文案来解释产品；优先让 stage 表达“母题分裂、正反张力、合流生成”。
- WebGPU/metaball 回主线前必须消费 `branchGraph -> view-model` 数据，并保留 DOM/SVG fallback 和可访问控件。

### Frontend Deliverables

- `BranchSidebar`: 分支树导航与当前焦点路径
- `BubbleStage`: 只负责当前焦点相关节点的稳定 2D 可视化
- `ConversationPanel`: 当前节点正文、摘要、来源说明
- `DialogueComposer`: 常驻输入区，明确“当前输入会接到哪里”
- `DialogueShell`: 三段式页面总装
- `src/app/dialogue/page.tsx`: 新主入口
- `src/app/page.tsx`: 根路由跳转到 `/dialogue`
- `src/app/newframe/page.tsx`: legacy banner + link-out

### Focus-to-Compose Contract

- 焦点是 `assistant` 时，composer 直接续写在该 assistant 之下。
- 焦点是非 root `user` 时，composer 的实际挂载点回退为该 user 的父 assistant；这允许用户“回看某一轮 user 节点后，从同一上游分支继续提问”，而不会错误新建 root。
- 焦点是 root `user` 且没有父 assistant 时，composer 明确显示这是一个新的 root 主题输入。
- 焦点是 `合` 时，下一轮 `user` 直接挂在该 `合` assistant 之下。
- UI 必须始终显式显示 composer target label，避免“当前会接到哪里”成为隐式规则。

### Request Concurrency Contract

- 每次 `/api/branches` 或 `/api/synthesis` 请求都必须携带客户端生成的 `requestId`。
- `requestId` 必须与发起时的 `workspaceSessionId`、`focusSnapshotId`、`composerTargetId` 一起保存在本地 pending state 中。
- route 响应必须原样回显 `requestId`，便于客户端做 active-request matching。
- 客户端只允许把响应写入仍然处于 active 状态、且 `requestId` 与当前 pending slot 完全匹配的请求。
- 迟到响应、被替换响应、跨 tab 的旧响应、焦点切换后失效的响应，一律丢弃并只记日志，不得写 graph。
- graph 写入必须在“响应匹配当前 pending slot”之后发生，而不是只在“HTTP 成功”之后发生。

### Synthesis Lineage Contract

- `合` 节点同时保留：
  - `sourceNodeIds`: 指向 `正` / `反` 两个 assistant 来源
  - `lineageParentId`: 指向这组 `正` / `反` 的共同上游 `user`
- breadcrumb 的祖先路径对 `合` 节点一律沿 `lineageParentId` 及其祖先展开，不沿 `sourceNodeIds` 二选一。
- sidebar tree 里，`合` 显示为该 `lineageParentId` user 的一个显式子节点，并带 source badge / source summary，而不是挂到某一侧 source assistant 下。
- composer target 对焦点为 `合` 时始终指向该 `合` 节点本身。
- context continuation 对焦点为 `合` 或其后代时：
  - lineage 向上沿 `lineageParentId` 走
  - source 信息从 `sourceNodeIds` 单独注入
  - 两者不得互相替代

### Responsive and Accessibility Contract

- 桌面宽屏固定为三段式布局：左 `sidebar`、中 `stage`、右 `panel`、底部 `composer`。
- tablet 固定为两行布局：顶部横向 `sidebar chips`，下方左 `stage` 右 `panel`，底部 `composer`。
- mobile 固定为一列可滚动布局：顶部 compact brand/status，中部 `stage`，其下横向可滚动 `sidebar chips`，再下方 `panel`，底部 sticky `composer`。不使用 tabbed sheet 作为首版实现。
- 根布局不得用全局 `overflow: hidden` 阻止移动端访问纵向内容；desktop fixed-stage 行为应由 `/dialogue` shell 自己控制。
- `stage` 布局必须拥有 safe-area 约束，节点不能被左侧 sidebar、右侧 panel 或底部 composer 遮挡。
- mobile stage 必须使用不重叠的 root / 正 / 反 / 合 位置；不能只缩小 desktop 百分比坐标。
- 所有节点切换、synthesis 触发、breadcrumb 跳转都必须可通过键盘完成，且使用真实 `button` / `nav` / `section` 语义元素。
- 焦点顺序固定为：sidebar -> stage -> panel -> composer。
- Bubble 与 sidebar item 的触控目标不小于 44px。
- 当前焦点、可继续输入位置、可触发 synthesis 的对象必须有可见 focus ring 或等价高亮。
- 如果使用 `role="tree"`，必须实现 tree keyboard model 与 `aria-level`；否则使用 plain nav/list/button。
- 无限动画、shader loop、blob drift 必须尊重 `prefers-reduced-motion` 并提供低性能降级。

### Workspace Snapshot Versioning Contract

- V2 本地恢复必须保存 versioned workspace snapshot，而不是只保存裸 `Graph`。
- snapshot 至少包含：`schemaVersion`、`workspaceSessionId`、graph snapshot、`focusedNodeId`、`composerParentId`。
- `activeRequestId`、`pendingAction`、任意 in-flight request slot 都不得跨 reload 恢复，避免把过期网络状态重新当成有效工作状态。
- snapshot 版本不兼容时必须整包失效并重新引导到 fresh workspace，不做 best-effort partial restore。

### Product Signal

- `/dialogue` 首发后的主 adoption signal 是“用户会不会回来继续同一个 dialectic workspace”，而不是单次停留时长：
  - 7 日内是否有用户回到 `/dialogue`
  - 回访时是否恢复并继续已有 workspace，而不是每次新开 root
  - 回访 session 是否继续完成新的 continuation 或新的 `合`
- launch readiness 的 workflow proof 仍需成立：
  - 首次 session 至少继续到第二轮
  - 至少切换过一次 focus
  - 至少显式生成过一次 `合`
  - 关闭后能恢复到上次工作点继续
- 新主线的识别点不是“更整洁的分支聊天”，而是：
  - `正 / 反 / 合` 为一等交互对象
  - lineage、source、synthesis 在 UI 中可见
  - bubble stage 提供非聊天列表式的空间结构感

---

## Backend

### Backend Responsibility

- 后端只负责“结构化内容生成”，不负责 graph 持久化，不负责 branch id 分配，不负责 UI 状态。
- `branchGraph` 仍然是本地优先的真相源，graph 变更发生在前端 store / domain 层。
- route handler 的职责是：
  - 校验输入
  - 调用 OpenAI Responses API
  - 解析结构化输出
  - 返回稳定 JSON contract
- 这一轮不引入数据库，不新增服务端 session，不把多轮状态搬到服务端。

### Backend Deliverables

- `src/lib/openai/readOutputText.ts`: 统一 Responses API 文本提取
- `src/app/api/chat/route.ts`: 修复兼容入口的文本解析
- `src/app/api/branches/route.ts`: 生成 `正 / 反`
- `src/app/api/synthesis/route.ts`: 生成 `合`
- `src/app/api/__tests__/dialectic-routes.test.ts`: 接口契约测试

### Backend Runtime Config

- `OPENAI_API_KEY`: 必需
- `OPENAI_BASE_URL`: 可选，兼容代理或兼容层
- `ANICCA_DEFAULT_MODEL`: 默认模型，供 `/api/branches` 和 `/api/synthesis` 使用

### Route Error Contract

- route 不得把模型输出解析异常直接抛成未处理 500。
- `/api/chat` 也使用同一套安全解析与 provider-format error 语义，不保留“静默把 provider 输出转成字符串”的旧行为。
- 对结构化输出的接受条件必须包含：
  - 至少提取到一个 JSON object
  - JSON 结构满足预期 key
  - `stance` 与端点语义匹配
- 当模型输出为空、含 prose、含 code fence 或结构缺字段时，route 返回稳定错误：
  - `502 invalid_model_output`
  - 必要时带 `details` 便于日志定位
- `/api/branches` 与 `/api/synthesis` 响应体都回显调用方提供的 `requestId`。
- UI 必须把 route 失败视为可恢复错误，而不是把 graph 留在半写入状态。

### Legacy Compatibility Boundary

- `/newframe` 与 legacy rerun stack 不接入新的 `/dialogue` graph mutation path。
- `src/app/api/chat/route.ts` 只做兼容性解析修复与统一错误语义，不扩展为主线 dialectic API。
- `src/engine/rerun.ts` / `src/llm/runner.ts` 视为 legacy-only utilities：
  - 可继续支持 `正` / `反`
  - 遇到 `合` 时必须显式跳过或返回 unsupported，不得以空 system prompt 伪装支持
- `/dialogue` 不依赖 legacy rerun stack 完成主线能力。

---

## Ports

### User-Facing Ports

| Port | Type | Role | Status |
|---|---|---|---|
| `/` | Page route | 根入口，统一跳转到主线 | Mainline |
| `/dialogue` | Page route | 正反合多轮对话主入口 | Mainline |
| `/newframe` | Page route | 旧视觉实验入口，保留演示价值 | Legacy |
| `/raymarching` | Page route | shader/raymarching 实验页 | Experimental |
| `/liquid` | Page route | 流动背景实验页 | Experimental |
| `/mochi` | Page route | 质感实验页 | Experimental |

### HTTP API Ports

| Port | Method | Purpose | Caller |
|---|---|---|---|
| `/api/chat` | `POST` | 兼容旧 chat 入口；本轮只修解析，不继续扩展主链路能力 | Legacy UI |
| `/api/branches` | `POST` | 输入当前 userText 与 context，返回结构化 `thesis/antithesis` | `/dialogue` |
| `/api/synthesis` | `POST` | 输入同母题下 `正/反`，返回结构化 `synthesis` | `/dialogue` |

### Internal Ports / Boundaries

| Port | Producer | Consumer | Responsibility |
|---|---|---|---|
| `branchGraphStore` | domain layer | view-model / shell | 对话谱系真相源 |
| `buildParentContext` | chat layer | API caller | 生成可控上下文消息 |
| `deriveDialogueView` | view-model layer | dialogue UI | 将 graph 投影为 UI 可消费结构 |
| `useDialogueUiStore` | UI state layer | dialogue shell | 焦点、pending、composer 状态 |
| `saveGraphLocal` / `loadGraphLocal` | persist layer | app boot / shell | 恢复 graph 与 workspace snapshot |

---

## Archived Integrated Reference

This section is kept as an integrated snapshot for review traceability. Active execution planning now lives in the focused implementation plans listed above.

### Shared / Core

| File | Responsibility | Action |
|---|---|---|
| `package.json` | Add test tooling and scripts | Modify |
| `package-lock.json` | Lockfile for new test tooling | Modify |
| `vitest.config.ts` | Vitest config with TS path aliases | Create |
| `tests/setup.ts` | JSDOM and jest-dom setup | Create |
| `src/lib/openai/readOutputText.ts` | Safe OpenAI Responses text extraction | Create |
| `src/lib/openai/readOutputText.test.ts` | Parser contract tests | Create |
| `src/types/anicca.ts` | Extend branch types and node metadata | Modify |
| `src/store/branchGraph.ts` | Add helpers for true multi-turn dialogue and synthesis nodes | Modify |
| `src/store/branchGraph.test.ts` | Graph behavior tests | Create |
| `src/chat/context.ts` | Context trimming rules for positive, negative, and synthesis continuation | Modify |
| `src/chat/context.test.ts` | Context behavior tests | Create |
| `src/features/dialectic/viewModel.ts` | Project graph into UI state | Create |
| `src/features/dialectic/store.ts` | Focus, composer, pending request UI state | Create |
| `src/features/dialectic/viewModel.test.ts` | View projection tests | Create |
| `src/lib/persist/local.ts` | Persist graph plus workspace snapshot locally | Modify |
| `src/lib/persist/local.test.ts` | Persistence behavior tests | Create |

### Backend

| File | Responsibility | Action |
|---|---|---|
| `src/app/api/chat/route.ts` | Fix raw text extraction | Modify |
| `src/app/api/branches/route.ts` | Generate structured thesis/antithesis | Create |
| `src/app/api/synthesis/route.ts` | Generate structured synthesis | Create |
| `src/app/api/__tests__/dialectic-routes.test.ts` | API route tests with mocked OpenAI | Create |

### Frontend

| File | Responsibility | Action |
|---|---|---|
| `src/components/dialogue/DialogueShell.tsx` | Main page composition | Create |
| `src/components/dialogue/BranchSidebar.tsx` | Tree navigation | Create |
| `src/components/dialogue/DialogueComposer.tsx` | Persistent composer | Create |
| `src/components/dialogue/ConversationPanel.tsx` | Text detail panel | Create |
| `src/components/dialogue/BubbleStage.tsx` | Deterministic 2D bubble layout | Create |
| `src/components/dialogue/DialogueShell.module.css` | Mainline shell styling | Create |
| `src/components/dialogue/DialogueShell.test.tsx` | UI integration tests | Create |

### Ports / Entrypoints

| File | Responsibility | Action |
|---|---|---|
| `src/app/dialogue/page.tsx` | New main entry route | Create |
| `src/app/__tests__/entrypoint-smoke.test.ts` | Root entry smoke test | Create |
| `src/app/page.tsx` | Redirect `/` to `/dialogue` | Modify |
| `src/app/newframe/page.tsx` | Legacy banner and link-out | Modify |
| `README.md` | Update product path description | Modify |

---

### Task 1: Add test harness and fix OpenAI text extraction

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `src/lib/openai/readOutputText.ts`
- Create: `src/lib/openai/readOutputText.test.ts`
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Write the failing parser test**

Create `src/lib/openai/readOutputText.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readOutputText } from "./readOutputText";

describe("readOutputText", () => {
  it("prefers response.output_text", () => {
    expect(readOutputText({ output_text: "dialectic" })).toBe("dialectic");
  });

  it("falls back to output content parts", () => {
    expect(
      readOutputText({
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "branch text" }]
          }
        ]
      })
    ).toBe("branch text");
  });

  it("returns an empty string when the response has no text", () => {
    expect(readOutputText({ output: [] })).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- src/lib/openai/readOutputText.test.ts
```

Expected:

```text
npm ERR! Missing script: "test"
```

- [ ] **Step 3: Add test tooling and implement the parser**

Update `package.json` scripts and devDependencies:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "jsdom": "^25.0.1",
    "vite-tsconfig-paths": "^5.1.4",
    "vitest": "^2.1.8"
  }
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["tests/setup.ts"]
  }
});
```

Create `tests/setup.ts`:

```ts
import "@testing-library/jest-dom";
```

Create `src/lib/openai/readOutputText.ts`:

```ts
export function readOutputText(response: any): string {
  if (typeof response?.output_text === "string") return response.output_text;

  const texts: string[] = [];
  for (const item of response?.output ?? []) {
    for (const part of item?.content ?? []) {
      if (part?.type === "output_text" && typeof part?.text === "string") {
        texts.push(part.text);
      }
    }
  }

  return texts.join("").trim();
}
```

Modify `src/app/api/chat/route.ts` to use the parser:

```ts
import { readOutputText } from "@/lib/openai/readOutputText";

const text = readOutputText(res) || "抱歉，无法生成回复";
```

- [ ] **Step 4: Run the tests and verify they pass**

Run:

```bash
npm run test -- src/lib/openai/readOutputText.test.ts
```

Expected:

```text
✓ src/lib/openai/readOutputText.test.ts
  ✓ prefers response.output_text
  ✓ falls back to output content parts
  ✓ returns an empty string when the response has no text
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/setup.ts src/lib/openai/readOutputText.ts src/lib/openai/readOutputText.test.ts src/app/api/chat/route.ts
git commit -m "feat: add test harness and safe OpenAI text parsing"
```

---

### Task 2: Extend the graph model for real multi-turn dialogue and synthesis

**Files:**
- Modify: `src/types/anicca.ts`
- Modify: `src/store/branchGraph.ts`
- Create: `src/store/branchGraph.test.ts`

- [ ] **Step 1: Write failing graph tests**

Create `src/store/branchGraph.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BranchGraphStore } from "./branchGraph";

describe("BranchGraphStore", () => {
  it("creates a child user node under an assistant", () => {
    const store = new BranchGraphStore();
    const rootUserId = store.createUserNode("Should I keep building?");
    const { thesisId, antithesisId } = store.createAssistantPair(rootUserId, { model: "gpt-4o-mini" });
    const childUserId = store.createChildUserNode(thesisId, "What should I narrow first?");

    const graph = store.getGraph();
    expect(graph.nodes[childUserId].parents).toEqual([thesisId]);
    expect(graph.nodes[thesisId].children).toContain(childUserId);
  });

  it("creates synthesis as an assistant node with dual sources", () => {
    const store = new BranchGraphStore();
    const rootUserId = store.createUserNode("Should I keep building?");
    const { thesisId, antithesisId } = store.createAssistantPair(rootUserId, { model: "gpt-4o-mini" });
    const synthesisId = store.createSynthesisAssistant([thesisId, antithesisId], {
      text: "Build a new mainline and freeze the demo.",
      label: "重开",
      summary: "新主线推进旧入口冻结"
    });

    const graph = store.getGraph();
    expect(graph.nodes[synthesisId].kind).toBe("assistant");
    expect(graph.nodes[synthesisId].branchType).toBe("合");
    expect(graph.nodes[synthesisId].meta?.sourceNodeIds).toEqual([thesisId, antithesisId]);
  });
});
```

- [ ] **Step 2: Run the graph tests to verify they fail**

Run:

```bash
npm run test -- src/store/branchGraph.test.ts
```

Expected:

```text
FAIL  src/store/branchGraph.test.ts
TypeError: store.createAssistantPair is not a function
```

- [ ] **Step 3: Implement the graph helpers and type changes**

Modify `src/types/anicca.ts`:

```ts
export type BranchType = "正" | "反" | "合";

export interface AniccaNodeMeta {
  temperature?: number;
  topP?: number;
  seedId?: number;
  model?: string;
  promptHash?: string;
  summary?: string;
  summaryStatus?: "ok" | "missing" | "invalid";
  label?: string;
  sourceNodeIds?: string[];
}
```

Modify `src/store/branchGraph.ts`:

```ts
createChildUserNode(parentAssistantId: string, text: string): string {
  const parent = this.graph.nodes[parentAssistantId];
  if (!parent || parent.kind !== "assistant") throw new Error(`assistant parent not found: ${parentAssistantId}`);

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
  return id;
}

createAssistantPair(baseUserId: string, opts?: { model?: string }) {
  return {
    thesisId: this.forkNode(baseUserId, { branchType: "正", model: opts?.model }),
    antithesisId: this.forkNode(baseUserId, { branchType: "反", model: opts?.model })
  };
}

createSynthesisAssistant(parentIds: string[], opts?: { text?: string; label?: string; summary?: string; model?: string }) {
  const id = this.generateId("asst");
  const node: AniccaNode = {
    id,
    kind: "assistant",
    text: opts?.text ?? "",
    createdAt: new Date().toISOString(),
    parents: [...parentIds],
    children: [],
    branchType: "合",
    meta: {
      model: opts?.model,
      label: opts?.label,
      summary: opts?.summary,
      summaryStatus: opts?.summary ? "ok" : "missing",
      sourceNodeIds: [...parentIds]
    }
  };
  this.graph.nodes[id] = node;
  for (const parentId of parentIds) {
    this.graph.nodes[parentId].children.push(id);
    this.link(parentId, id, "synthesis");
  }
  return id;
}

updateNodeMeta(nodeId: string, patch: Partial<AniccaNodeMeta>) {
  const node = this.graph.nodes[nodeId];
  if (!node) throw new Error(`node not found: ${nodeId}`);
  node.meta = { ...(node.meta || {}), ...patch };
}
```

- [ ] **Step 4: Run the graph tests and verify they pass**

Run:

```bash
npm run test -- src/store/branchGraph.test.ts
```

Expected:

```text
✓ src/store/branchGraph.test.ts
  ✓ creates a child user node under an assistant
  ✓ creates synthesis as an assistant node with dual sources
```

- [ ] **Step 5: Commit**

```bash
git add src/types/anicca.ts src/store/branchGraph.ts src/store/branchGraph.test.ts
git commit -m "feat: extend graph model for multi-turn dialogue and synthesis"
```

---

### Task 3: Add structured `/api/branches` and `/api/synthesis` routes

**Files:**
- Create: `src/app/api/branches/route.ts`
- Create: `src/app/api/synthesis/route.ts`
- Create: `src/app/api/__tests__/dialectic-routes.test.ts`

**Backend note:** 这两个 route 是纯内容生成端口。它们返回结构化结果，但不直接创建 graph node，也不持有会话状态。

- [ ] **Step 1: Write failing API contract tests**

Create `src/app/api/__tests__/dialectic-routes.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("openai", () => {
  const create = vi.fn();
  return { default: vi.fn(() => ({ responses: { create } })), __create: create };
});

describe("dialectic routes", () => {
  beforeEach(async () => {
    const mod = await import("openai");
    mod.__create.mockReset();
  });

  it("returns structured thesis and antithesis", async () => {
    const openai = await import("openai");
    openai.__create.mockResolvedValue({
      output_text: JSON.stringify({
        thesis: { text: "Keep building the project.", summary: "聚焦后继续推进", label: "聚焦", stance: "正" },
        antithesis: { text: "Stop patching the old demo.", summary: "停止续修旧demo", label: "停修", stance: "反" }
      })
    });

    const { POST } = await import("../branches/route");
    const response = await POST(
      new Request("http://localhost/api/branches", {
        method: "POST",
        body: JSON.stringify({ userText: "Should I keep building?" })
      }) as any
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      thesis: { stance: "正" },
      antithesis: { stance: "反" }
    });
  });

  it("returns structured synthesis", async () => {
    const openai = await import("openai");
    openai.__create.mockResolvedValue({
      output_text: JSON.stringify({
        synthesis: { text: "Build a new mainline.", summary: "新主线推进旧入口冻结", label: "重开", stance: "合" }
      })
    });

    const { POST } = await import("../synthesis/route");
    const response = await POST(
      new Request("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          thesis: { text: "Keep building.", summary: "聚焦后继续推进", label: "聚焦", stance: "正" },
          antithesis: { text: "Stop patching.", summary: "停止续修旧demo", label: "停修", stance: "反" }
        })
      }) as any
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      synthesis: { stance: "合" }
    });
  });

  it("returns 502 instead of throwing when the model emits invalid JSON", async () => {
    const openai = await import("openai");
    openai.__create.mockResolvedValue({
      output_text: "```json\\nnot valid\\n```"
    });

    const { POST } = await import("../branches/route");
    const response = await POST(
      new Request("http://localhost/api/branches", {
        method: "POST",
        body: JSON.stringify({ userText: "Should I keep building?" })
      }) as any
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: "invalid_model_output"
    });
  });
});
```

- [ ] **Step 2: Run the API tests to verify they fail**

Run:

```bash
npm run test -- src/app/api/__tests__/dialectic-routes.test.ts
```

Expected:

```text
FAIL  src/app/api/__tests__/dialectic-routes.test.ts
Error: Cannot find module '../branches/route'
```

- [ ] **Step 3: Implement the routes**

Create `src/app/api/branches/route.ts`:

```ts
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { readOutputText } from "@/lib/openai/readOutputText";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy-key-for-build",
  baseURL: process.env.OPENAI_BASE_URL || undefined
});

function parseFirstJsonObject(raw: string) {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const match = withoutFence.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("json_object_not_found");
  return JSON.parse(match[0]);
}

function isBranchPayload(value: any) {
  return value?.thesis?.stance === "正" && value?.antithesis?.stance === "反";
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.userText) {
    return NextResponse.json({ error: "userText required" }, { status: 400 });
  }

  const result = await openai.responses.create({
    model: body?.model || process.env.ANICCA_DEFAULT_MODEL || "gpt-4o-mini",
    input: JSON.stringify({
      task: "generate dialectic pair",
      contextMessages: body?.contextMessages || [],
      userText: body.userText
    }),
    temperature: 0.7,
    max_output_tokens: 1024
  });

  try {
    const parsed = parseFirstJsonObject(readOutputText(result));
    if (!isBranchPayload(parsed)) {
      return NextResponse.json({ error: "invalid_model_output" }, { status: 502 });
    }
    return NextResponse.json(parsed);
  } catch (error) {
    console.error("/api/branches invalid output", error);
    return NextResponse.json({ error: "invalid_model_output" }, { status: 502 });
  }
}
```

Create `src/app/api/synthesis/route.ts`:

```ts
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { readOutputText } from "@/lib/openai/readOutputText";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy-key-for-build",
  baseURL: process.env.OPENAI_BASE_URL || undefined
});

function parseFirstJsonObject(raw: string) {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const match = withoutFence.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("json_object_not_found");
  return JSON.parse(match[0]);
}

function isSynthesisPayload(value: any) {
  return value?.synthesis?.stance === "合";
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.thesis || !body?.antithesis) {
    return NextResponse.json({ error: "thesis and antithesis required" }, { status: 400 });
  }

  const result = await openai.responses.create({
    model: body?.model || process.env.ANICCA_DEFAULT_MODEL || "gpt-4o-mini",
    input: JSON.stringify({
      task: "generate synthesis",
      contextMessages: body?.contextMessages || [],
      thesis: body.thesis,
      antithesis: body.antithesis
    }),
    temperature: 0.3,
    max_output_tokens: 1024
  });

  try {
    const parsed = parseFirstJsonObject(readOutputText(result));
    if (!isSynthesisPayload(parsed)) {
      return NextResponse.json({ error: "invalid_model_output" }, { status: 502 });
    }
    return NextResponse.json(parsed);
  } catch (error) {
    console.error("/api/synthesis invalid output", error);
    return NextResponse.json({ error: "invalid_model_output" }, { status: 502 });
  }
}
```

- [ ] **Step 4: Run the API tests and verify they pass**

Run:

```bash
npm run test -- src/app/api/__tests__/dialectic-routes.test.ts
```

Expected:

```text
✓ src/app/api/__tests__/dialectic-routes.test.ts
  ✓ returns structured thesis and antithesis
  ✓ returns structured synthesis
  ✓ returns 502 instead of throwing when the model emits invalid JSON
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/branches/route.ts src/app/api/synthesis/route.ts src/app/api/__tests__/dialectic-routes.test.ts
git commit -m "feat: add structured branches and synthesis routes"
```

---

### Task 4: Project graph state into UI-friendly dialogue state

**Files:**
- Modify: `src/chat/context.ts`
- Create: `src/chat/context.test.ts`
- Create: `src/features/dialectic/viewModel.ts`
- Create: `src/features/dialectic/store.ts`
- Create: `src/features/dialectic/viewModel.test.ts`

- [ ] **Step 1: Write failing view-model tests**

Create `src/chat/context.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { branchGraphStore } from "@/store/branchGraph";
import { createEmptyGraph } from "@/types/anicca";
import { buildParentContext } from "./context";

describe("buildParentContext", () => {
  beforeEach(() => {
    branchGraphStore.setGraph(createEmptyGraph());
  });

  it("keeps both synthesis sources when continuing below a synthesis node", () => {
    const rootUserId = branchGraphStore.createUserNode("Should I keep building?");
    const { thesisId, antithesisId } = branchGraphStore.createAssistantPair(rootUserId, { model: "gpt-4o-mini" });
    branchGraphStore.updateNodeMeta(thesisId, { summary: "聚焦后继续推进", summaryStatus: "ok" });
    branchGraphStore.updateNodeMeta(antithesisId, { summary: "停止续修旧demo", summaryStatus: "ok" });
    const synthesisId = branchGraphStore.createSynthesisAssistant([thesisId, antithesisId], {
      text: "Build a new mainline.",
      summary: "新主线推进旧入口冻结",
      label: "重开"
    });
    const childUserId = branchGraphStore.createChildUserNode(synthesisId, "What should I ship first?");
    const { thesisId: childThesisId } = branchGraphStore.createAssistantPair(childUserId, { model: "gpt-4o-mini" });

    const built = buildParentContext(childThesisId, "system", "正");
    const serialized = built.messages.map((message) => message.content).join("\n");

    expect(serialized.includes("聚焦后继续推进")).toBe(true);
    expect(serialized.includes("停止续修旧demo")).toBe(true);
    expect(serialized.includes("What should I ship first?")).toBe(true);
  });
});
```

Create `src/features/dialectic/viewModel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BranchGraphStore } from "@/store/branchGraph";
import { deriveDialogueView } from "./viewModel";

describe("deriveDialogueView", () => {
  it("builds breadcrumb path for the focused node", () => {
    const graphStore = new BranchGraphStore();
    const rootUserId = graphStore.createUserNode("Should I keep building?");
    const { thesisId } = graphStore.createAssistantPair(rootUserId, { model: "gpt-4o-mini" });
    const childUserId = graphStore.createChildUserNode(thesisId, "What should I narrow first?");
    const { antithesisId } = graphStore.createAssistantPair(childUserId, { model: "gpt-4o-mini" });

    const view = deriveDialogueView(graphStore.getGraph(), antithesisId);
    expect(view.breadcrumb.map(item => item.id)).toEqual([rootUserId, thesisId, childUserId, antithesisId]);
  });

  it("resolves composer target to the parent assistant when focus is a non-root user", () => {
    const graphStore = new BranchGraphStore();
    const rootUserId = graphStore.createUserNode("Should I keep building?");
    const { thesisId } = graphStore.createAssistantPair(rootUserId, { model: "gpt-4o-mini" });
    const childUserId = graphStore.createChildUserNode(thesisId, "What should I narrow first?");

    const view = deriveDialogueView(graphStore.getGraph(), childUserId);
    expect(view.composerTarget.nodeId).toBe(thesisId);
  });

  it("exposes synthesis action with explicit pair ids", () => {
    const graphStore = new BranchGraphStore();
    const rootUserId = graphStore.createUserNode("Should I keep building?");
    const { thesisId, antithesisId } = graphStore.createAssistantPair(rootUserId, { model: "gpt-4o-mini" });

    const view = deriveDialogueView(graphStore.getGraph(), rootUserId);
    expect(view.availableSynthesisActions).toContainEqual(
      expect.objectContaining({ parentUserId: rootUserId, thesisId, antithesisId })
    );
  });

  it("surfaces source nodes for the focused synthesis node", () => {
    const graphStore = new BranchGraphStore();
    const rootUserId = graphStore.createUserNode("Should I keep building?");
    const { thesisId, antithesisId } = graphStore.createAssistantPair(rootUserId, { model: "gpt-4o-mini" });
    graphStore.updateNodeMeta(thesisId, { label: "聚焦", summary: "聚焦后继续推进", summaryStatus: "ok" });
    graphStore.updateNodeMeta(antithesisId, { label: "停修", summary: "停止续修旧demo", summaryStatus: "ok" });
    const synthesisId = graphStore.createSynthesisAssistant([thesisId, antithesisId], {
      text: "Build a new mainline.",
      summary: "新主线推进旧入口冻结",
      label: "重开"
    });

    const view = deriveDialogueView(graphStore.getGraph(), synthesisId);
    expect(view.currentNode.sourceNodes.map(item => item.id)).toEqual([thesisId, antithesisId]);
  });
});
```

- [ ] **Step 2: Run the view-model tests to verify they fail**

Run:

```bash
npm run test -- src/chat/context.test.ts
npm run test -- src/features/dialectic/viewModel.test.ts
```

Expected:

```text
FAIL  src/chat/context.test.ts
FAIL  src/features/dialectic/viewModel.test.ts
Error: Cannot find module './viewModel'
```

- [ ] **Step 3: Implement the projection and UI store**

Modify `src/chat/context.ts`:

```ts
export function buildParentContext(targetId: string, systemPrelude: string, branchFilter?: BranchType): BuiltContext {
  const effectiveBranchFilter = branchFilter === "合" ? undefined : branchFilter;
  const g = branchGraphStore.getGraph();
  const target = g.nodes[targetId];
  const msgs: Message[] = [];
  const weightsUsed: number[] = [];
  const lengthCaps: { userCap: number; sumCap: number }[] = [];
  const visitedAssistantIds = new Set<string>();

  if (systemPrelude) {
    msgs.push({ id: `sys_${targetId}`, role: "system", content: systemPrelude, createdAt: new Date().toISOString() });
  }

  let cursorIds = Array.from(new Set(target?.parents ?? []));
  let count = 0;
  while (cursorIds.length && count < 5) {
    const assistantParents = cursorIds
      .map((id) => g.nodes[id])
      .filter((node): node is NonNullable<typeof node> => Boolean(node) && node.kind === "assistant");

    for (const assistantNode of assistantParents) {
      if (visitedAssistantIds.has(assistantNode.id)) continue;
      visitedAssistantIds.add(assistantNode.id);

      const sourceIds = assistantNode.meta?.sourceNodeIds?.length ? assistantNode.meta.sourceNodeIds : [];
      if (!sourceIds.length) continue;

      const sourceSummaries = sourceIds
        .map((id) => g.nodes[id])
        .filter((node): node is NonNullable<typeof node> => Boolean(node) && node.kind === "assistant")
        .map((node) => node.meta?.summary)
        .filter(Boolean);

      const mergedSources = truncate(sourceSummaries.join("；"), 40);
      if (mergedSources) {
        msgs.push({
          id: `${assistantNode.id}_sources`,
          role: "assistant",
          content: mergedSources,
          createdAt: assistantNode.createdAt
        });
      }
    }

    const userNode = cursorIds
      .map((id) => g.nodes[id])
      .find((node): node is NonNullable<typeof node> => Boolean(node) && node.kind === "user");

    if (!userNode) {
      cursorIds = Array.from(new Set(assistantParents.flatMap((node) => node.parents)));
      continue;
    }

    const k = count + 1;
    const w = weight(k);
    const cap = capsForWeight(w);
    weightsUsed.push(w);
    lengthCaps.push(cap);

    const userText = truncate(userNode.text || "", cap.userCap);
    if (userText) {
      msgs.push({ id: userNode.id, role: "user", content: userText, createdAt: userNode.createdAt });
    }

    const childSummaries: string[] = [];
    for (const childId of userNode.children) {
      const child = g.nodes[childId];
      if (child?.kind === "assistant" && child.meta?.summary) {
        if (!effectiveBranchFilter || child.branchType === effectiveBranchFilter) {
          childSummaries.push(child.meta.summary);
        }
      }
    }

    const merged = truncate(childSummaries.join("；"), cap.sumCap);
    if (merged) {
      msgs.push({ id: `${userNode.id}_sum`, role: "assistant", content: merged, createdAt: userNode.createdAt });
    }

    cursorIds = Array.from(new Set(userNode.parents));
    count++;
  }

  return { systemPrelude, messages: msgs, weightsUsed, lengthCaps };
}
```

Create `src/features/dialectic/viewModel.ts`:

```ts
import { Graph } from "@/types/anicca";

export function deriveDialogueView(graph: Graph, focusedNodeId: string | null) {
  const focusId = focusedNodeId || graph.entryIds[0] || null;
  const breadcrumb: Array<{ id: string; text: string }> = [];
  const focusNode = focusId ? graph.nodes[focusId] : null;

  let cursor = focusId;
  while (cursor) {
    const node = graph.nodes[cursor];
    if (!node) break;
    breadcrumb.unshift({ id: node.id, text: node.meta?.label || node.text || node.id });
    cursor = node.parents[0] || null;
  }

  const composerTarget = (() => {
    if (!focusNode) return { nodeId: null, label: "New root topic" };
    if (focusNode.kind === "assistant") {
      return { nodeId: focusNode.id, label: focusNode.meta?.label || focusNode.text || focusNode.id };
    }
    const parentAssistantId = focusNode.parents.find((id) => graph.nodes[id]?.kind === "assistant") || null;
    if (parentAssistantId) {
      const parentAssistant = graph.nodes[parentAssistantId];
      return { nodeId: parentAssistantId, label: parentAssistant.meta?.label || parentAssistant.text || parentAssistant.id };
    }
    return { nodeId: null, label: "New root topic" };
  })();

  const sidebarItems = Object.values(graph.nodes).map((node) => ({
    id: node.id,
    text: node.meta?.label || node.text || node.id,
    kind: node.kind,
    branchType: node.branchType,
    isFocused: node.id === focusId
  }));

  const currentNode = focusNode
    ? {
        id: focusNode.id,
        text: focusNode.text || "",
        summary: focusNode.meta?.summary,
        label: focusNode.meta?.label,
        sourceNodes: (focusNode.meta?.sourceNodeIds || [])
          .map((id) => graph.nodes[id])
          .filter(Boolean)
          .map((node) => ({
            id: node.id,
            label: node.meta?.label || node.text || node.id,
            summary: node.meta?.summary,
            branchType: node.branchType
          }))
      }
    : { id: "", text: "", summary: "", label: "", sourceNodes: [] };

  const availableSynthesisActions = Object.values(graph.nodes)
    .filter(node => node.kind === "user")
    .flatMap(node => {
      const children = node.children.map(childId => graph.nodes[childId]).filter(Boolean);
      const thesisChildren = children.filter(child => child.branchType === "正");
      const antithesisChildren = children.filter(child => child.branchType === "反");
      const hasExistingSynthesis = children.some(child => child.branchType === "合");
      if (thesisChildren.length !== 1 || antithesisChildren.length !== 1 || hasExistingSynthesis) return [];
      return [{
        id: `${node.id}:${thesisChildren[0].id}:${antithesisChildren[0].id}`,
        parentUserId: node.id,
        thesisId: thesisChildren[0].id,
        antithesisId: antithesisChildren[0].id
      }];
    })
    ;

  return { focusId, breadcrumb, sidebarItems, currentNode, composerTarget, availableSynthesisActions };
}
```

Create `src/features/dialectic/store.ts`:

```ts
import { create } from "zustand";

type PendingAction = "branches" | "synthesis" | null;

interface DialogueUiState {
  focusedNodeId: string | null;
  composerParentId: string | null;
  pendingAction: PendingAction;
  errorMessage: string | null;
  focusNode: (nodeId: string | null) => void;
  openComposer: (parentId: string | null) => void;
  setPendingAction: (action: PendingAction) => void;
  setErrorMessage: (message: string | null) => void;
}

export const useDialogueUiStore = create<DialogueUiState>((set) => ({
  focusedNodeId: null,
  composerParentId: null,
  pendingAction: null,
  errorMessage: null,
  focusNode: (focusedNodeId) => set({ focusedNodeId }),
  openComposer: (composerParentId) => set({ composerParentId }),
  setPendingAction: (pendingAction) => set({ pendingAction }),
  setErrorMessage: (errorMessage) => set({ errorMessage })
}));
```

- [ ] **Step 4: Run the view-model tests and verify they pass**

Run:

```bash
npm run test -- src/chat/context.test.ts
npm run test -- src/features/dialectic/viewModel.test.ts
```

Expected:

```text
✓ src/chat/context.test.ts
  ✓ keeps both synthesis sources when continuing below a synthesis node
✓ src/features/dialectic/viewModel.test.ts
  ✓ builds breadcrumb path for the focused node
  ✓ resolves composer target to the parent assistant when focus is a non-root user
  ✓ exposes synthesis action with explicit pair ids
  ✓ surfaces source nodes for the focused synthesis node
```

- [ ] **Step 5: Commit**

```bash
git add src/chat/context.ts src/chat/context.test.ts src/features/dialectic/viewModel.ts src/features/dialectic/store.ts src/features/dialectic/viewModel.test.ts
git commit -m "feat: add dialogue context and view-model projection layer"
```

---

### Task 4B: Persist graph plus workspace state locally

> This task lands immediately after Task 5, once the dialogue shell exists.

**Files:**
- Modify: `src/lib/persist/local.ts`
- Create: `src/lib/persist/local.test.ts`
- Modify: `src/components/dialogue/DialogueShell.tsx`

- [ ] **Step 1: Write failing persistence tests**

Create `src/lib/persist/local.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createEmptyGraph } from "@/types/anicca";
import { loadWorkspaceLocal, saveWorkspaceLocal } from "./local";

describe("workspace persistence", () => {
  it("persists graph plus focused workspace state", () => {
    const graph = createEmptyGraph();
    saveWorkspaceLocal({
      graph,
      ui: { focusedNodeId: "node-1", composerParentId: "node-2", pendingAction: "branches" }
    });

    expect(loadWorkspaceLocal()).toMatchObject({
      graph,
      ui: {
        focusedNodeId: "node-1",
        composerParentId: "node-2",
        pendingAction: null
      }
    });
  });
});
```

- [ ] **Step 2: Run the persistence test to verify it fails**

Run:

```bash
npm run test -- src/lib/persist/local.test.ts
```

Expected:

```text
FAIL  src/lib/persist/local.test.ts
TypeError: saveWorkspaceLocal is not a function
```

- [ ] **Step 3: Implement workspace snapshot persistence**

Modify `src/lib/persist/local.ts`:

```ts
import { Graph } from "@/types/anicca";

const GRAPH_KEY = "anicca_graph_v1";
const WORKSPACE_KEY = "anicca_workspace_v2";

export interface WorkspaceSnapshot {
  graph: Graph;
  ui: {
    focusedNodeId: string | null;
    composerParentId: string | null;
    pendingAction: null;
  };
}

export function saveGraphLocal(graph: Graph) {
  try {
    localStorage.setItem(GRAPH_KEY, JSON.stringify(graph));
  } catch (e) {
    console.error("saveGraphLocal error", e);
  }
}

export function loadGraphLocal(): Graph | null {
  try {
    const text = localStorage.getItem(GRAPH_KEY);
    if (!text) return null;
    const parsed = JSON.parse(text);
    if (parsed?.version !== "anicca-mvp-1") return null;
    return parsed as Graph;
  } catch (e) {
    console.error("loadGraphLocal error", e);
    return null;
  }
}

export function saveWorkspaceLocal(snapshot: { graph: Graph; ui: { focusedNodeId: string | null; composerParentId: string | null; pendingAction: string | null } }) {
  saveGraphLocal(snapshot.graph);
  try {
    const normalized: WorkspaceSnapshot = {
      graph: snapshot.graph,
      ui: {
        focusedNodeId: snapshot.ui.focusedNodeId,
        composerParentId: snapshot.ui.composerParentId,
        pendingAction: null
      }
    };
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(normalized));
  } catch (e) {
    console.error("saveWorkspaceLocal error", e);
  }
}

export function loadWorkspaceLocal(): WorkspaceSnapshot | null {
  try {
    const text = localStorage.getItem(WORKSPACE_KEY);
    if (!text) {
      const graph = loadGraphLocal();
      return graph ? { graph, ui: { focusedNodeId: null, composerParentId: null, pendingAction: null } } : null;
    }
    const parsed = JSON.parse(text);
    if (parsed?.graph?.version !== "anicca-mvp-1") return null;
    return {
      graph: parsed.graph,
      ui: {
        focusedNodeId: parsed?.ui?.focusedNodeId ?? null,
        composerParentId: parsed?.ui?.composerParentId ?? null,
        pendingAction: null
      }
    };
  } catch (e) {
    console.error("loadWorkspaceLocal error", e);
    return null;
  }
}
```

Modify `src/components/dialogue/DialogueShell.tsx` to hydrate graph plus `focusedNodeId` / `composerParentId` on boot, and persist the latest workspace snapshot after successful graph/focus changes; `pendingAction` must always reset to `null` on restore.

- [ ] **Step 4: Run the persistence test and verify it passes**

Run:

```bash
npm run test -- src/lib/persist/local.test.ts
```

Expected:

```text
✓ src/lib/persist/local.test.ts
  ✓ persists graph plus focused workspace state
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/persist/local.ts src/lib/persist/local.test.ts src/components/dialogue/DialogueShell.tsx
git commit -m "feat: persist dialogue workspace state locally"
```

---

### Task 5: Build the new `/dialogue` shell with persistent composer and explicit synthesis

**Files:**
- Create: `src/components/dialogue/DialogueShell.tsx`
- Create: `src/components/dialogue/BranchSidebar.tsx`
- Create: `src/components/dialogue/DialogueComposer.tsx`
- Create: `src/components/dialogue/ConversationPanel.tsx`
- Create: `src/components/dialogue/BubbleStage.tsx`
- Create: `src/components/dialogue/DialogueShell.module.css`
- Create: `src/components/dialogue/DialogueShell.test.tsx`
- Create: `src/app/dialogue/page.tsx`

**Frontend note:** 这一任务允许借鉴 `ref/anicca` 的视觉语言，但不迁移其本地状态模型、拖拽物理与前端直连模型方式。`BubbleStage` 仍然要以 `branchGraph -> view-model -> UI` 这一条主线来实现。graph 写入必须发生在 route 成功返回之后；失败时只清 UI pending/error，不留下半成品 node。

- [ ] **Step 1: Write the failing shell test**

Create `src/components/dialogue/DialogueShell.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyGraph } from "@/types/anicca";
import { branchGraphStore } from "@/store/branchGraph";
import { useDialogueUiStore } from "@/features/dialectic/store";
import DialogueShell from "./DialogueShell";

describe("DialogueShell", () => {
  beforeEach(() => {
    branchGraphStore.setGraph(createEmptyGraph());
    useDialogueUiStore.setState({
      focusedNodeId: null,
      composerParentId: null,
      pendingAction: null,
      errorMessage: null
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        thesis: { text: "Keep building.", summary: "聚焦后继续推进", label: "聚焦", stance: "正" },
        antithesis: { text: "Stop patching.", summary: "停止续修旧demo", label: "停修", stance: "反" }
      })
    }));
  });

  it("renders a persistent composer and branch sidebar", () => {
    render(<DialogueShell />);

    expect(screen.getByRole("textbox", { name: "Dialogue composer" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Branch tree" })).toBeInTheDocument();
  });

  it("shows synthesis after generating a branch pair", async () => {
    render(<DialogueShell />);

    fireEvent.change(screen.getByRole("textbox", { name: "Dialogue composer" }), {
      target: { value: "Should I keep building?" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate Branches" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Synthesis" })).toBeInTheDocument();
    });
  });

  it("does not leave orphan nodes when branch generation fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "invalid_model_output" })
    }));

    render(<DialogueShell />);

    fireEvent.change(screen.getByRole("textbox", { name: "Dialogue composer" }), {
      target: { value: "Should I keep building?" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate Branches" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Unable to generate branches");
    });

    expect(Object.keys(branchGraphStore.getGraph().nodes)).toHaveLength(0);
    expect(useDialogueUiStore.getState().pendingAction).toBeNull();
  });
});
```

- [ ] **Step 2: Run the shell test to verify it fails**

Run:

```bash
npm run test -- src/components/dialogue/DialogueShell.test.tsx
```

Expected:

```text
FAIL  src/components/dialogue/DialogueShell.test.tsx
Error: Cannot find module './DialogueShell'
```

- [ ] **Step 3: Implement the shell and route**

Create `src/components/dialogue/DialogueComposer.tsx`:

```tsx
type DialogueComposerProps = {
  onSubmit?: (text: string) => void;
  targetLabel?: string;
  errorMessage?: string | null;
};

export default function DialogueComposer({ onSubmit, targetLabel, errorMessage }: DialogueComposerProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const value = String(formData.get("message") || "").trim();
        if (value) onSubmit?.(value);
      }}
    >
      <label className="sr-only" htmlFor="dialogue-message">Dialogue composer</label>
      <p>Continuing under: {targetLabel || "New root topic"}</p>
      <textarea id="dialogue-message" name="message" aria-label="Dialogue composer" placeholder="继续当前焦点，或从这里开始新的问题。" />
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      <button type="submit">Generate Branches</button>
    </form>
  );
}
```

Create `src/components/dialogue/BranchSidebar.tsx`:

```tsx
type BranchSidebarProps = {
  view: {
    breadcrumb: Array<{ id: string; text: string }>;
    sidebarItems: Array<{ id: string; text: string; kind: string; branchType?: string; isFocused: boolean }>;
  };
  onFocusNode?: (nodeId: string) => void;
};

export default function BranchSidebar({ view, onFocusNode }: BranchSidebarProps) {
  return (
    <nav aria-label="Branch tree">
      <h2>Branches</h2>
      <ol aria-label="Focused path">
        {view.breadcrumb.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => onFocusNode?.(item.id)}>
              {item.text}
            </button>
          </li>
        ))}
      </ol>
      <ul>
        {view.sidebarItems.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              aria-current={item.isFocused ? "true" : undefined}
              onClick={() => onFocusNode?.(item.id)}
            >
              {item.branchType ? `[${item.branchType}] ` : ""}{item.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

Create `src/components/dialogue/ConversationPanel.tsx`:

```tsx
type ConversationPanelProps = {
  view: {
    focusId: string | null;
    currentNode: {
      id: string;
      text: string;
      summary?: string;
      label?: string;
      sourceNodes: Array<{ id: string; label: string; summary?: string; branchType?: string }>;
    };
  };
};

export default function ConversationPanel({ view }: ConversationPanelProps) {
  return (
    <section aria-label="Conversation panel">
      <h2>Current node</h2>
      <p>{view.currentNode.text || "Select a branch to inspect its text and summary."}</p>
      <p>{view.currentNode.summary || "No summary yet."}</p>
      {view.currentNode.sourceNodes.length ? (
        <ul aria-label="Current node sources">
          {view.currentNode.sourceNodes.map((item) => (
            <li key={item.id}>{item.branchType ? `[${item.branchType}] ` : ""}{item.label} - {item.summary || "No summary"}</li>
          ))}
        </ul>
      ) : null}
      <small>{view.focusId ? `Focused node: ${view.focusId}` : "No focus selected yet."}</small>
    </section>
  );
}
```

Create `src/components/dialogue/BubbleStage.tsx`:

```tsx
type BubbleStageProps = {
  view: {
    availableSynthesisActions: Array<{ id: string; parentUserId: string; thesisId: string; antithesisId: string }>;
  };
  onGenerateSynthesis?: (action: { id: string; parentUserId: string; thesisId: string; antithesisId: string }) => void;
};

export default function BubbleStage({ view, onGenerateSynthesis }: BubbleStageProps) {
  return (
    <section aria-label="Bubble stage">
      <div>Focused node bubble</div>
      {view.availableSynthesisActions.map((action) => (
        <button key={action.id} type="button" onClick={() => onGenerateSynthesis?.(action)}>
          Generate Synthesis
        </button>
      ))}
    </section>
  );
}
```

Create `src/components/dialogue/DialogueShell.tsx`:

```tsx
'use client'
import { useEffect, useMemo, useState } from "react";
import { buildParentContext } from "@/chat/context";
import { branchGraphStore } from "@/store/branchGraph";
import { deriveDialogueView } from "@/features/dialectic/viewModel";
import { useDialogueUiStore } from "@/features/dialectic/store";
import BranchSidebar from "./BranchSidebar";
import BubbleStage from "./BubbleStage";
import ConversationPanel from "./ConversationPanel";
import DialogueComposer from "./DialogueComposer";
import styles from "./DialogueShell.module.css";

export default function DialogueShell() {
  const [version, setVersion] = useState(0);
  const graph = branchGraphStore.getGraph();
  const { focusedNodeId, focusNode, openComposer, setPendingAction, errorMessage, setErrorMessage } = useDialogueUiStore();
  const view = useMemo(() => deriveDialogueView(graph, focusedNodeId), [graph, focusedNodeId, version]);

  useEffect(() => {
    openComposer(view.composerTarget.nodeId);
  }, [view.composerTarget.nodeId, openComposer]);

  async function handleGenerateBranches(text: string) {
    setPendingAction("branches");
    setErrorMessage(null);

    const composerTargetNodeId = view.composerTarget.nodeId;
    const composerTargetNode = composerTargetNodeId ? graph.nodes[composerTargetNodeId] : null;
    const built = composerTargetNode
      ? buildParentContext(composerTargetNode.id, "", composerTargetNode.branchType)
      : { messages: [] };

    try {
      const response = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userText: text, contextMessages: built.messages })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "branches_failed");

      const userNodeId = composerTargetNodeId
        ? branchGraphStore.createChildUserNode(composerTargetNodeId, text)
        : branchGraphStore.createUserNode(text);

      const { thesisId, antithesisId } = branchGraphStore.createAssistantPair(userNodeId, { model: "gpt-4o-mini" });
      branchGraphStore.setNodeText(thesisId, data.thesis.text);
      branchGraphStore.updateNodeMeta(thesisId, {
        label: data.thesis.label,
        summary: data.thesis.summary,
        summaryStatus: "ok",
        model: "gpt-4o-mini"
      });
      branchGraphStore.setNodeText(antithesisId, data.antithesis.text);
      branchGraphStore.updateNodeMeta(antithesisId, {
        label: data.antithesis.label,
        summary: data.antithesis.summary,
        summaryStatus: "ok",
        model: "gpt-4o-mini"
      });

      focusNode(thesisId);
      setVersion((current) => current + 1);
    } catch (error) {
      console.error("handleGenerateBranches error", error);
      setErrorMessage("Unable to generate branches. Please retry.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleGenerateSynthesis(action: { id: string; parentUserId: string; thesisId: string; antithesisId: string }) {
    const thesisNode = graph.nodes[action.thesisId];
    const antithesisNode = graph.nodes[action.antithesisId];
    if (!thesisNode || !antithesisNode) return;

    setPendingAction("synthesis");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/synthesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thesis: { text: thesisNode.text, summary: thesisNode.meta?.summary, label: thesisNode.meta?.label, stance: "正" },
          antithesis: { text: antithesisNode.text, summary: antithesisNode.meta?.summary, label: antithesisNode.meta?.label, stance: "反" },
          contextMessages: buildParentContext(thesisNode.id, "", undefined).messages
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "synthesis_failed");

      const synthesisId = branchGraphStore.createSynthesisAssistant([thesisNode.id, antithesisNode.id], {
        text: data.synthesis.text,
        label: data.synthesis.label,
        summary: data.synthesis.summary,
        model: "gpt-4o-mini"
      });

      focusNode(synthesisId);
      setVersion((current) => current + 1);
    } catch (error) {
      console.error("handleGenerateSynthesis error", error);
      setErrorMessage("Unable to generate synthesis. Please retry.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <BranchSidebar view={view} onFocusNode={focusNode} />
      </aside>
      <section className={styles.stage}>
        <BubbleStage view={view} onGenerateSynthesis={handleGenerateSynthesis} />
      </section>
      <aside className={styles.panel}><ConversationPanel view={view} /></aside>
      <div className={styles.composer}>
        <DialogueComposer
          onSubmit={handleGenerateBranches}
          targetLabel={view.composerTarget.label}
          errorMessage={errorMessage}
        />
      </div>
    </main>
  );
}
```

Create `src/components/dialogue/DialogueShell.module.css`:

```css
.shell {
  display: grid;
  grid-template-columns: 280px 1fr 340px;
  grid-template-rows: 1fr auto;
  min-height: 100vh;
  background: radial-gradient(circle at top, #161d2e 0%, #090b11 60%, #040507 100%);
  color: #f6f7fb;
}

.sidebar { grid-column: 1; grid-row: 1 / span 2; padding: 24px; border-right: 1px solid rgba(255,255,255,0.08); }
.stage { grid-column: 2; grid-row: 1; padding: 24px; }
.panel { grid-column: 3; grid-row: 1; padding: 24px; border-left: 1px solid rgba(255,255,255,0.08); }
.composer { grid-column: 2 / span 2; grid-row: 2; padding: 20px 24px; border-top: 1px solid rgba(255,255,255,0.08); }

@media (max-width: 1100px) {
  .shell {
    grid-template-columns: 1fr 320px;
    grid-template-rows: auto 1fr auto;
  }

  .sidebar {
    grid-column: 1 / span 2;
    grid-row: 1;
    border-right: 0;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }

  .stage { grid-column: 1; grid-row: 2; }
  .panel { grid-column: 2; grid-row: 2; }
  .composer { grid-column: 1 / span 2; grid-row: 3; }
}

@media (max-width: 768px) {
  .shell {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr minmax(180px, auto) auto;
  }

  .sidebar {
    grid-column: 1;
    grid-row: 1;
    overflow-x: auto;
  }

  .stage { grid-column: 1; grid-row: 2; }

  .panel {
    grid-column: 1;
    grid-row: 3;
    border-left: 0;
    border-top: 1px solid rgba(255,255,255,0.08);
  }

  .composer {
    grid-column: 1;
    grid-row: 4;
    position: sticky;
    bottom: 0;
    background: rgba(4, 5, 7, 0.92);
    backdrop-filter: blur(18px);
  }
}
```

Create `src/app/dialogue/page.tsx`:

```tsx
import DialogueShell from "@/components/dialogue/DialogueShell";

export default function DialoguePage() {
  return <DialogueShell />;
}
```

- [ ] **Step 4: Run the shell test and verify it passes**

Run:

```bash
npm run test -- src/components/dialogue/DialogueShell.test.tsx
```

Expected:

```text
✓ src/components/dialogue/DialogueShell.test.tsx
  ✓ renders a persistent composer and branch sidebar
  ✓ shows synthesis after generating a branch pair
  ✓ does not leave orphan nodes when branch generation fails
```

- [ ] **Step 5: Commit**

```bash
git add src/components/dialogue/DialogueShell.tsx src/components/dialogue/BranchSidebar.tsx src/components/dialogue/DialogueComposer.tsx src/components/dialogue/ConversationPanel.tsx src/components/dialogue/BubbleStage.tsx src/components/dialogue/DialogueShell.module.css src/components/dialogue/DialogueShell.test.tsx src/app/dialogue/page.tsx
git commit -m "feat: add dialogue mainline shell and route"
```

---

### Task 6: Switch the entrypoint, isolate legacy pages, and update product docs

**Files:**
- Create: `src/app/__tests__/entrypoint-smoke.test.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/newframe/page.tsx`
- Modify: `README.md`

- [ ] **Step 1: Write a failing redirect/legacy expectation test**

Create `src/app/__tests__/entrypoint-smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import HomePage from "@/app/page";

describe("entrypoint", () => {
  it("redirects the root route to /dialogue", () => {
    expect(typeof HomePage).toBe("function");
  });
});
```

- [ ] **Step 2: Run the smoke test to verify current behavior is outdated**

Run:

```bash
npm run test -- src/app/__tests__/entrypoint-smoke.test.ts
```

Expected:

```text
✓ src/app/__tests__/entrypoint-smoke.test.ts
```

Then manually inspect:

```bash
sed -n '1,40p' src/app/page.tsx
```

Expected:

```text
redirect('/newframe')
```

- [ ] **Step 3: Implement the route switch and legacy notice**

Modify `src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/dialogue");
}
```

Modify `src/app/newframe/page.tsx`:

```tsx
'use client'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Suspense } from 'react'

const MetaballCanvas = dynamic(() => import('@/components/MetaballCanvas'), { ssr: false })

export default function Page() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, maxWidth: 360, padding: 16, borderRadius: 16, background: 'rgba(9, 11, 17, 0.78)', color: '#f6f7fb', backdropFilter: 'blur(18px)' }}>
        <strong>Legacy Experiment</strong>
        <p style={{ margin: '8px 0 12px' }}>`/newframe` 保留为旧视觉实验入口。新的正反合主线已经迁移到 `/dialogue`。</p>
        <Link href="/dialogue" style={{ color: '#8fd3ff' }}>Go to /dialogue</Link>
      </div>
      <Suspense fallback={<div style={{ padding: 20 }}>Loading WebGPU…</div>}>
        <MetaballCanvas />
      </Suspense>
    </div>
  )
}
```

Update `README.md` opening sections so the current product description says “两分形 + 合” and points readers at `/dialogue` as the mainline path.

- [ ] **Step 4: Run the test suite and build**

Run:

```bash
npm run test
npm run build
```

Expected:

```text
Test Files  8 passed
✓ Compiled successfully
```

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/newframe/page.tsx README.md src/app/__tests__/entrypoint-smoke.test.ts
git commit -m "feat: switch main entrypoint to dialogue and mark newframe legacy"
```

---

## Test Matrix

| Area | Test file | Scenario |
|---|---|---|
| OpenAI text parsing | `src/lib/openai/readOutputText.test.ts` | Correctly extract `output_text` and fallback content |
| Graph model | `src/store/branchGraph.test.ts` | Continue from assistant, create synthesis from dual parents |
| API routes | `src/app/api/__tests__/dialectic-routes.test.ts` | Structured `正/反` and `合` responses |
| Context builder | `src/chat/context.test.ts` | Synthesis continuation should keep both branch summaries |
| View projection | `src/features/dialectic/viewModel.test.ts` | Breadcrumbs and synthesis availability |
| Local persistence | `src/lib/persist/local.test.ts` | Restore graph plus focused workspace state |
| UI shell | `src/components/dialogue/DialogueShell.test.tsx` | Persistent composer and branch navigation |
| Entrypoint | `src/app/__tests__/entrypoint-smoke.test.ts` | Root path moved to `/dialogue` |

## Manual QA Checklist

- Open `/dialogue` and confirm the composer is always visible
- Create a root prompt and verify one `user` node plus two assistant branches appear
- Click `正` and continue one additional round
- Focus a non-root `user` node and verify the composer target resolves to its parent assistant instead of creating a fresh root
- Return to the parent using breadcrumb
- Trigger `Generate Synthesis` from a node that has both `正` and `反`
- Verify the synthesis action is bound to the visible pair and not to an arbitrary “first available” pair
- Force `/api/branches` to fail once and verify no orphan graph nodes remain and pending clears
- Continue below a `合` node and verify both source summaries are still represented in context / panel
- Reload and verify focused node and composer target restore from local workspace state
- Reload and verify the page still loads without touching `/newframe`
- Open `/newframe` and confirm the legacy banner links back to `/dialogue`
- Resize to tablet and mobile widths and verify sidebar/panel reflow while composer remains reachable
- Tab through sidebar, stage actions, panel, and composer to verify keyboard reachability and visible focus states

## Sequencing Notes

- Task 1 must land before any new route work because route parsing is currently unreliable
- Task 2 must land before Task 4 because the view-model depends on stable graph semantics
- Task 3 can proceed after Task 1 and Task 2
- Task 5 depends on Task 3 and Task 4
- Task 4B depends on Task 5 because workspace persistence must hydrate the final dialogue shell
- Task 6 is the rollout gate and should land last

## Layer Ownership

- Frontend owns page composition, focus interaction, stable bubble rendering, and legacy-experiment isolation.
- Backend owns structured generation contracts and model-output parsing only.
- Ports own route/API exposure and make the mainline-vs-legacy boundary explicit.

## Deferred Work

The following items are intentionally out of scope for this plan:

- Reintegrating `src/components/MetaballCanvas.tsx` as the mainline stage
- Reintegrating `src/components/RaymarchingCanvas.tsx` as the mainline stage
- Cross-context graft / independent seed mechanics
- Multi-model switching
- Cloud persistence or server-side graph storage
