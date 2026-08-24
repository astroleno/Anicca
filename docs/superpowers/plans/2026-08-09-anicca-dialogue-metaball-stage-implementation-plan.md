# Anicca Dialogue Metaball Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/dialogue` 当前 CSS 气泡加 SVG 关系线的舞台，升级为接近用户提供 Shader Park 参考的三维珍珠液体 Metaball：节点靠近形成连续液桥，拉远重新分离，同时保留现有对话语义、DOM 交互、响应式布局与无障碍能力。

**Architecture:** `branchGraph -> deriveDialogueView -> BubbleStage` 继续是唯一产品真相链。新增 WebGL Raymarching 层只消费已经投影完成的舞台几何；Three.js 全屏片元 Shader 用 sphere SDF、smooth-min、法线、Fresnel 与低频珍珠噪声绘制透明曲面。节点文字、点击、拖拽和键盘焦点仍由真实 DOM button 承担；视觉接触不修改 graph，WebGL 不可用或 context lost 时回退到现有 CSS blob。

**Tech Stack:** Next.js 15.5.4, React 18, TypeScript, Three.js 0.181, GLSL SDF/Raymarching, Vitest, Testing Library, production Playwright visual smoke

**Master Plan:** `docs/superpowers/plans/2026-04-23-anicca-dialectic-v2-mainline.md`

**Renderer Preconditions:** `docs/superpowers/plans/2026-05-06-anicca-dialogue-visual-reintegration-phase-conclusion.md`

**Verified Baseline:** `main` merge commit `14acf48990590ea16ca96c63bb594e03c181eef7`；closeout 已通过 28 个测试文件 / 244 个测试、production build 与 production visual smoke。

---

## 1. 已锁定决策

1. 舞台不再绘制 parent/child/source/pending/convergence SVG 线；关系继续由空间位置、节点文案、焦点态、sidebar、panel 与 ARIA 表达。
2. Metaball 是视觉物理效果：靠近融合、拉远分离；接触不会调用 `BranchGraphStore`，不会创建 `合`，不会改变 graph/workspace。
3. Canvas 只负责曲面。真实 `button` 继续负责 click、drag、keyboard、accessible name 和至少 44px 的触控目标。
4. 主线不导入 `MetaballCanvas`、`RaymarchingCanvas` 或旧 `metaballStore`；允许借鉴公式，不接入旧 merge/split 语义。
5. Shader 最多处理 8 个可见曲面；超过时按 `focus -> source -> child -> ancestor -> decorative` 稳定截断。
6. 不新增依赖；使用仓库已有 `three`。参考 sketch 的 `shader-park-core` 写死几何数量，不作为主线 runtime。
7. 首版实现 sphere smooth-union 与珍珠材质；torus 点击 morph、bloom、音频响应不进入本轮。

## 2. 参考效果的技术定义

- 液桥来自两个 SDF 的 smooth-union，是同一表面，不是连接线。
- 珍珠色来自缓慢低频噪声和法线/Fresnel，不是图片贴图。
- 柔边来自三维曲面与受控低分辨率上采样，不用单纯 CSS blur 冒充。
- pointer interaction 只改变视觉几何；不把碰触解释为数据合并。

## 3. 文件边界

### 新建

- `src/components/dialogue/metaball/model.ts`：输入类型、颜色、rect 投影、截断、uniform packing、融合对。
- `src/components/dialogue/metaball/model.test.ts`：纯函数契约。
- `src/components/dialogue/metaball/shaders.ts`：完整 GLSL。
- `src/components/dialogue/metaball/renderer.ts`：Three 生命周期。
- `src/components/dialogue/DialogueMetaballLayer.tsx`：React/DOM adapter。
- `src/components/dialogue/DialogueMetaballLayer.test.tsx`：ready/fallback/reduced-motion/cleanup。

### 修改

- `src/components/dialogue/BubbleStage.tsx`
- `src/components/dialogue/BubbleStage.test.tsx`
- `src/components/dialogue/DialogueShell.module.css`
- `scripts/visual-smoke/dialogue.mjs`

### 不改

- `src/store/branchGraph.ts`
- `src/features/dialectic/viewModel.ts`
- `src/features/dialectic/store.ts`
- `src/types/anicca.ts`
- API、provider、Growth orchestration、retrieval、roundtable
- 三个旧 renderer/store 实验文件

执行中若必须越过“不改”边界，先停止并补 plan amendment。

---

### Task 1: 建立纯 Metaball 投影契约

**Files:**
- Create: `src/components/dialogue/metaball/model.ts`
- Create: `src/components/dialogue/metaball/model.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
const host = { left: 100, top: 50, width: 800, height: 600 };
const surfaces = [
  { id: "a", role: "user", relation: "focus", left: 350, top: 275, width: 150, height: 150 },
  { id: "b", role: "thesis", relation: "child", left: 470, top: 275, width: 150, height: 150 }
];

const nodes = projectMetaballSurfaces(host, surfaces);
expect(nodes[0].radius).toBeCloseTo(0.125, 5);
expect(nodes[0].color).toEqual([0.82, 0.86, 0.9]);
expect(computeFusedPairs(nodes, 0.055)).toEqual(["a::b"]);
expect(packMetaballUniforms(nodes).radii).toHaveLength(8);
```

另测 10 个输入稳定截断为 8 个，focus 第一，decorative pending 最先淘汰。

- [ ] **Step 2: 确认测试失败**

```bash
npx vitest run src/components/dialogue/metaball/model.test.ts
```

Expected: FAIL because `./model` does not exist.

- [ ] **Step 3: 实现模型**

固定接口：

```ts
export const MAX_DIALOGUE_METABALLS = 8;
export type MetaballRole =
  | "user" | "thesis" | "antithesis" | "synthesis"
  | "growth" | "neutral" | "pending";
export type MetaballRelation =
  | "focus" | "source" | "child" | "ancestor" | "decorative";

export type MetaballSurfaceRect = {
  id: string;
  role: MetaballRole;
  relation: MetaballRelation;
  left: number;
  top: number;
  width: number;
  height: number;
};

export type DialogueMetaballNode = {
  id: string;
  center: [number, number];
  radius: number;
  color: [number, number, number];
  emphasis: number;
};
```

实现规则：

- center 以 host 高度归一化，避免宽屏球体变椭圆。
- radius 为 `max(width, height) / 2 / host.height`。
- colors：user `[.82,.86,.90]`、正 `[.18,.82,.62]`、反 `[.93,.38,.55]`、合 `[.94,.72,.34]`、Growth `[.48,.66,.94]`。
- emphasis：focus 1、source .9、child .94、ancestor .76、decorative .68。
- fusion threshold：`distance <= radiusA + radiusB + smoothness * 2`。
- fixed uniforms：centers 16、radii 8、colors 24、emphasis 8，未用槽清零。

- [ ] **Step 4: 运行测试并提交**

```bash
npx vitest run src/components/dialogue/metaball/model.test.ts
git add src/components/dialogue/metaball/model.ts src/components/dialogue/metaball/model.test.ts
git commit -m "feat(dialogue): define metaball stage projection"
```

---

### Task 2: 实现 SDF Shader 与 Three renderer

**Files:**
- Create: `src/components/dialogue/metaball/shaders.ts`
- Create: `src/components/dialogue/metaball/renderer.ts`

- [ ] **Step 1: 写完整 Shader**

固定核心：

```glsl
#define MAX_METABALLS 8
#define MAX_STEPS 52

float sphereSdf(vec3 p, vec3 center, float radius) {
  return length(p - center) - radius;
}

float smin(float a, float b, float k, out float blend) {
  blend = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, blend) - k * blend * (1.0 - blend);
}
```

Fragment Shader 完整行为：

- uniforms：resolution、time、smoothness=.055、count、8 centers/radii/colors/emphasis。
- 正交 ray `origin=(stagePoint,1.2)`、`direction=(0,0,-1)`。
- 最多 52 steps，hit epsilon .0015，最大 travel 2.4。
- 三层 value-noise FBM；几何扰动 .008，颜色速度 .025。
- normal 使用三轴有限差分。
- diffuse .48、specular power 34、Fresnel power 2.2。
- semantic base 与珍珠色按 70/30 混合；miss 直接 `discard`。

- [ ] **Step 2: 实现 renderer 生命周期**

```ts
export const DIALOGUE_METABALL_SMOOTHNESS = 0.055;

export type DialogueMetaballRenderer = {
  resize(width: number, height: number, pixelRatio: number): void;
  render(nodes: DialogueMetaballNode[], timeSeconds: number): void;
  dispose(): void;
};

export function createDialogueMetaballRenderer(
  canvas: HTMLCanvasElement,
  onContextLost: () => void
): DialogueMetaballRenderer;
```

实现约束：

- 单一 `WebGLRenderer + OrthographicCamera + PlaneGeometry + ShaderMaterial`。
- `alpha:true`、`antialias:false`、`premultipliedAlpha:true`。
- resize key 未变时不重新分配。
- 每帧只更新 fixed uniforms，不创建 scene/material/arrays。
- `webglcontextlost` preventDefault 并触发 fallback。
- dispose 释放 listener/geometry/material/renderer，且幂等。

- [ ] **Step 3: 类型、lint、提交**

```bash
npx vitest run src/components/dialogue/metaball/model.test.ts
npm run typecheck
npx eslint src/components/dialogue/metaball
git add src/components/dialogue/metaball
git commit -m "feat(dialogue): add raymarched metaball renderer"
```

Expected: exit 0；新文件 0 warnings。

---

### Task 3: React layer、reduced-motion 与 fallback

**Files:**
- Create: `src/components/dialogue/DialogueMetaballLayer.tsx`
- Create: `src/components/dialogue/DialogueMetaballLayer.test.tsx`

- [ ] **Step 1: 写失败生命周期测试**

Mock renderer，验证 canvas `aria-hidden`、ready、构造异常/context lost fallback、reduced-motion 的 time=0、unmount dispose。

- [ ] **Step 2: 实现 adapter**

```tsx
export type DialogueMetaballRendererState = "loading" | "ready" | "fallback";

type Props = {
  hostRef: RefObject<HTMLDivElement | null>;
  onStateChange(state: DialogueMetaballRendererState): void;
};
```

要求：

- 每帧读取 host 下最多 8 个 `[data-metaball-surface]` 的真实 rect。
- 使用纯模型；不读取 store/graph，不 set React state per frame。
- desktop DPR cap 1.25，宽度不超过 640px 时 cap .9。
- canvas 写 `data-fused-pairs` 与 `data-motion` 供 production smoke 使用。
- reduced-motion 冻结 time，但几何仍刷新。
- 构造失败/context lost/cleanup 不得 console.log。

```tsx
<canvas
  ref={canvasRef}
  className={styles.stageMetaballCanvas}
  data-testid="dialogue-metaball-canvas"
  aria-hidden="true"
/>
```

- [ ] **Step 3: 验证并提交**

```bash
npx vitest run src/components/dialogue/DialogueMetaballLayer.test.tsx src/components/dialogue/metaball/model.test.ts
npm run typecheck
npm run typecheck:test
git add src/components/dialogue/DialogueMetaballLayer.tsx src/components/dialogue/DialogueMetaballLayer.test.tsx
git commit -m "feat(dialogue): add accessible metaball render layer"
```

---

### Task 4: 集成 BubbleStage 并移除所有舞台线

**Files:**
- Modify: `src/components/dialogue/BubbleStage.tsx`
- Modify: `src/components/dialogue/BubbleStage.test.tsx`

- [ ] **Step 1: 先把测试改成 no-line contract**

```tsx
expect(screen.queryByTestId("dialogue-stage-relations")).not.toBeInTheDocument();
expect(screen.getByTestId("dialogue-stage-node-root"))
  .toHaveAttribute("data-metaball-role", "user");
expect(screen.getByTestId("dialogue-stage-node-thesis"))
  .toHaveAttribute("data-metaball-role", "thesis");
expect(screen.getByTestId("dialogue-metaball-canvas")).toBeInTheDocument();
```

Pending 测试断言 thesis/antithesis role 且容器内无 svg；offstage convergence 保留 accessible copy，不期待 trace/dot。

- [ ] **Step 2: 确认旧实现失败**

```bash
npx vitest run src/components/dialogue/BubbleStage.test.tsx
```

- [ ] **Step 3: 接入 layer 与角色**

Role mapping：

```ts
if (node.kind === "user") return "user";
if (node.branchType === "正") return "thesis";
if (node.branchType === "反") return "antithesis";
if (node.branchType === "合" || node.displayRole === "synthesis-record") return "synthesis";
if (node.isGrowthPerspective) return "growth";
return "neutral";
```

Track 添加：

```tsx
data-testid="dialogue-stage-track"
data-metaball-renderer={metaballRendererState}
```

Active button 添加：

```tsx
data-metaball-surface={node.id}
data-metaball-role={getMetaballRole(node)}
data-metaball-relation={node.relation}
```

Empty/pending 使用稳定 id：`empty-root`、`pending-thesis`、`pending-antithesis`、`pending-synthesis`。

- [ ] **Step 4: 删除 line-only 代码**

删除 `buildStageCurve`、`relationshipLinks`、convergence trace 计算、stage/pending SVG、convergence paths/dot。保留 pending status、node ARIA、sidebar/panel 来源信息、focus/click/drag。

- [ ] **Step 5: 更新文案**

Desktop：“拖动液滴，靠近时会自然融合。”；touch：“点选液滴查看正与反。”；已有合：“合流记录已保留。”

- [ ] **Step 6: 验证边界并提交**

```bash
npx vitest run src/components/dialogue/BubbleStage.test.tsx src/features/dialectic/viewModel.test.ts src/store/branchGraph.test.ts
git diff --exit-code -- src/store/branchGraph.ts src/features/dialectic/viewModel.ts src/features/dialectic/store.ts src/types/anicca.ts
git add src/components/dialogue/BubbleStage.tsx src/components/dialogue/BubbleStage.test.tsx
git commit -m "feat(dialogue): replace stage lines with metaball surfaces"
```

---

### Task 5: 材质 layering、焦点与 CSS fallback

**Files:**
- Modify: `src/components/dialogue/DialogueShell.module.css`
- Modify: `src/components/dialogue/BubbleStage.test.tsx`

- [ ] **Step 1: 测试 ready/fallback state**

Mock layer 报告 ready/fallback，验证 track state、button enabled、accessible name 与 fallback blob class。

- [ ] **Step 2: 添加 CSS**

```css
.stageMetaballCanvas {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  pointer-events: none;
  transition: opacity 240ms ease;
}

.stageTrack[data-metaball-renderer="ready"] .stageMetaballCanvas {
  opacity: 1;
}

.stageTrack[data-metaball-renderer="ready"] .stageNode,
.stageTrack[data-metaball-renderer="ready"] .emptyStageBlob,
.stageTrack[data-metaball-renderer="ready"] .stagePendingGhost {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

.stageTrack[data-metaball-renderer="ready"] .stageNode:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.9);
  outline-offset: 7px;
}

.stageTrack[data-metaball-renderer="loading"] .stageMetaballCanvas,
.stageTrack[data-metaball-renderer="fallback"] .stageMetaballCanvas {
  display: none;
}
```

Ready 只隐藏 DOM 材质；不得隐藏 button、文字、hit target 或 focus ring。

- [ ] **Step 3: 删除废弃 CSS**

删除 `.stageRelations`、`.stageRelationPath*`、`.stagePendingRelations`、`.stagePendingPath*`、`.stageConvergenceMark*`、`.stageConvergenceDot*` 及其 reduced-motion 引用。

- [ ] **Step 4: 测试、lint、提交**

```bash
npx vitest run src/components/dialogue/BubbleStage.test.tsx src/components/dialogue/DialogueMetaballLayer.test.tsx
npx eslint src/components/dialogue/BubbleStage.tsx src/components/dialogue/DialogueMetaballLayer.tsx
git add src/components/dialogue/DialogueShell.module.css src/components/dialogue/BubbleStage.test.tsx
git commit -m "style(dialogue): apply pearl metaball stage material"
```

---

### Task 6: Production visual gates

**Files:**
- Modify: `scripts/visual-smoke/dialogue.mjs`
- Generate: `artifacts/visual-smoke/dialogue/*metaball*.png`

Playwright 只用于本关键环节，因为 Shader 输出、clipping、pointer drag 和 WebGL fallback 无法在 jsdom 中可靠验证。

- [ ] **Step 1: Renderer-ready/no-line helper**

等待 canvas 与 track `data-metaball-renderer="ready"`；若 `dialogue-stage-relations` 数量非零立即失败。

- [ ] **Step 2: Fusion/separation 场景**

在 1440×980 seeded workspace：

1. 拖 thesis 接近 root。
2. 等待 `data-fused-pairs` 包含 `asst_thesis_1::user_root_1`。
3. 保存 `desktop-metaball-fused.png`。
4. 拉回原位，等待 pair 消失。
5. 比较 graph node/edge count 与拖拽前一致。
6. `finally` 中释放 pointer。

- [ ] **Step 3: Reduced-motion**

在 reduced-motion context，字体与 renderer ready 后对 stage 间隔 500ms 截图；Buffer 必须相等。

- [ ] **Step 4: WebGL fallback**

Init script 只让 `webgl/webgl2/experimental-webgl` context 返回 null；断言 fallback、CSS root blob 有尺寸、click/focus 工作、无 SVG/page error/console error。

- [ ] **Step 5: 扩展矩阵**

覆盖 1440、1024、390、360、320 与 Growth candidateLimit 1–4：

- canvas rect 与 track 差值不超过 1px；
- backing area 不超过 desktop CSS area × 1.25²、mobile × .9²；
- 节点无重叠、无裁切、可点击、可聚焦；
- 无 SVG、horizontal overflow、hydration/WebGL warning。

- [ ] **Step 6: 运行并提交**

```bash
npm run test:visual-dialogue
git add scripts/visual-smoke/dialogue.mjs
git commit -m "test(dialogue): gate metaball rendering and fallback"
```

---

### Task 7: 全量验证与 closeout

**Files:**
- Create: `docs/superpowers/plans/2026-08-09-anicca-dialogue-metaball-stage-closeout-report.md`
- Modify only if required: `README.md`

- [ ] **Step 1: 定向回归**

```bash
npx vitest run \
  src/components/dialogue/metaball/model.test.ts \
  src/components/dialogue/DialogueMetaballLayer.test.tsx \
  src/components/dialogue/BubbleStage.test.tsx \
  src/components/dialogue/DialogueShell.test.tsx \
  src/features/dialectic/viewModel.test.ts \
  src/store/branchGraph.test.ts
```

- [ ] **Step 2: 完整门禁**

```bash
npm run check
npm run build
DIALOGUE_SMOKE_SERVER_MODE=start npm run test:visual-dialogue
```

Expected: lint 0 errors、双 TypeScript、全量 tests、production build、production smoke 全过；报告记录实际 count。

- [ ] **Step 3: 人工 QA**

确认三维质感、低频珍珠色、连续粗液桥、拉远分离、graph 不变、文字清晰、click/drag/keyboard/touch 正常、focus ring 可见、empty/pending/synthesis/Growth 无线可理解、reduced-motion 冻结、WebGL fallback 可用。

- [ ] **Step 4: 证明不可改边界**

```bash
git diff 14acf48990590ea16ca96c63bb594e03c181eef7...HEAD -- \
  src/store/branchGraph.ts \
  src/features/dialectic/viewModel.ts \
  src/features/dialectic/store.ts \
  src/types/anicca.ts \
  src/app/api
```

Expected: no diff.

- [ ] **Step 5: 写报告并检查仓库**

报告记录 branch、SHA、命令/count、lint/build、visual summary/screenshots、renderer scale、最大节点数、设备、fallback/reduced-motion、风险、数据边界、reference zip 与 `.superpowers/` 未提交。

```bash
git diff --check
git status --short
git diff --stat 14acf48990590ea16ca96c63bb594e03c181eef7...HEAD
```

- [ ] **Step 6: 提交 closeout**

```bash
git add docs/superpowers/plans/2026-08-09-anicca-dialogue-metaball-stage-closeout-report.md
git commit -m "docs(dialogue): close metaball renderer verification"
```

## 4. 测试矩阵

| Layer | Test | Required proof |
|---|---|---|
| Projection | `metaball/model.test.ts` | 坐标/半径、颜色、排序、max 8、fusion threshold |
| Adapter | `DialogueMetaballLayer.test.tsx` | ready、fallback、reduced motion、frame、dispose |
| Stage | `BubbleStage.test.tsx` | no SVG、surface attrs、pending/empty、drag、a11y |
| Dialogue | `DialogueShell.test.tsx` | focus、composer、workspace、Growth 不回归 |
| Domain | `viewModel.test.ts`, `branchGraph.test.ts` | renderer 不拥有 graph semantics |
| Visual | `dialogue.mjs` | 多视口、Growth 1–4、fusion、fallback、reduced motion |
| Build | `npm run build` | 无 SSR/hydration failure |

## 5. 性能预算

- 8 nodes、52 raymarch steps、3 FBM octaves。
- Desktop DPR cap 1.25；mobile cap .9。
- 单 canvas/scene；不开 MSAA。
- 每帧最多读取 8 个 rect，不 set React state。
- reduced-motion 固定 `uTime=0`，仍刷新几何。
- 构造错误/context loss 切 CSS fallback，不循环重试。
- Canvas 始终 `aria-hidden`、`pointer-events:none`。

## 6. Release gate

- [ ] `/dialogue` 无 stage/pending/convergence SVG 线。
- [ ] Production smoke 验证融合、分离、graph 不变。
- [ ] Baseline 244 tests 加新增 tests 全过，报告记录新总数。
- [ ] 双 TypeScript、lint、build、production smoke 全过。
- [ ] Growth 多视口无重叠、无裁切。
- [ ] Ready/fallback 下 DOM 交互与 a11y 可用。
- [ ] Reduced-motion 与 WebGL-disabled 通过。
- [ ] Renderer-owned files 无新增 warning/console noise。
- [ ] Zip、截图、绝对本机路径、`.superpowers/` 未进入 commit。

## 7. 推荐 commit 序列

1. `feat(dialogue): define metaball stage projection`
2. `feat(dialogue): add raymarched metaball renderer`
3. `feat(dialogue): add accessible metaball render layer`
4. `feat(dialogue): replace stage lines with metaball surfaces`
5. `style(dialogue): apply pearl metaball stage material`
6. `test(dialogue): gate metaball rendering and fallback`
7. `docs(dialogue): close metaball renderer verification`

## 8. 非目标

- 实际节点 merge/split 或 renderer-owned synthesis。
- 修改 BranchGraph、workspace schema、Growth 语义。
- Torus morph、bloom、postprocessing、audio reactive。
- 迁移实验页面或删除旧 renderer。
- 无 production screenshot/fallback evidence 就发布。

## 9. 执行交接

实施应在专用 worktree 中进行：

```bash
git worktree add -b codex/anicca-dialogue-metaball-stage ../Anicca-dialogue-metaball-stage 14acf48990590ea16ca96c63bb594e03c181eef7
```

在用户明确授权执行前，不创建 worktree、不 push、不创建 PR。实施时按 task 与 commit 边界推进。
