# 无相 Anicca

> A Conversation that Breathes, Dissolves, and Begins Again.

—— 一个“本地可复现的 AI 实验空间”。

本项目以 Next.js + p5.js + JSON 导出为核心，目标是在无后端依赖的前提下，提供“可分叉、可回放、可导出/导入”的冥想式 AI 体验：输入一句话，观察它如何分裂为三种“念头气泡”，并在持续的“生—灭—再生”中进行对话。

---

## 一、核心体验（What）

- **气泡即念**：用户输入文字，被转化为一个半透明的“意识气泡”。
- **三泡泡回应**：系统生成三颗弥散气泡：
  - 顺流：延展原意。
  - 逆流：反问/反向裂变。
  - 止语：以呼吸/符号回应。
- **呼吸的对话**：点击任意气泡，它成为新的“主念”，再裂变出三颗新的回应，形成无终点的呼吸式对话。

美学取向：深色渐变背景、柔和光晕、缓慢节奏、可感知的“消散”。

---

## 二、项目定位（Why）

- 不是效率工具，而是“思考本身”的再体验。
- 强调“无常（Anicca）/ 无相（Formless）/ 无我（Anatta）”。
- 目标是一个可以离线、本地运行、可导出复现的实验空间。

---

## 三、技术栈与架构（How）

### 3.1 技术栈（MVP 建议版本）

- 前端框架：`next@^15`（App Router, TypeScript）
- 渲染层：`p5@^1.10`（WEBGL），可结合自定义 Shader/ShaderPark 思路
- UI：`tailwindcss@^3`，`@shadcn/ui`
- 状态：`zustand@^4.5`
- 工具：`jszip`、`file-saver`、`uuid`
- 模板：`mustache@^4.2`
- 校验：`zod@^3.23`

### 3.2 分层架构

```
┌────────────────────────────────────┐
│             UI 层                  │
│  shadcn/ui + Tailwind + React Hooks │
│   ├── 左栏：Branch 树 / 历史列表     │
│   ├── 中栏：p5 Canvas               │
│   └── 右栏：Prompt / 参数 / 日志    │
├────────────────────────────────────┤
│           状态与逻辑层              │
│  Zustand store（nodes / branches）  │
│   ├── commit() 生成新 node          │
│   ├── fork() / merge() 分支操作     │
│   └── exportJSON() / importJSON()   │
├────────────────────────────────────┤
│             渲染层                  │
│  p5.js (WEBGL)                      │
│   ├── 读取当前 node.params          │
│   ├── 实时渲染弥散球               │
│   └── 输出截图与性能指标            │
├────────────────────────────────────┤
│         存储与导出层                │
│  内存 + JSON 文件 / JSZip 打包      │
│   ├── 自动保存 localStorage (可选)  │
│   └── 导入/导出 project.json/.zip   │
└────────────────────────────────────┘
```

### 3.3 关键设计哲学

- **无后端可复现性**：每个 Node 都是独立快照，导出 JSON 即可复现。
- **事件溯源**：任何改动都生成新 Node（不可变），形成 DAG 分支树。
- **轻量上下文**：只缓存 summary + diff；模板化 Prompt。
- **渐进式演化**：如需上云，仅替换导出/导入逻辑为 API。

---

## 四、数据模型（MVP）

> 下述示例用于指导实现与导出格式。实际实现时请用 `zod` 做 Schema 验证，并保留向后兼容字段。

```json
{
  "version": "0.1.0",
  "projectId": "uuid",
  "createdAt": 1730800000000,
  "nodes": [
    {
      "id": "uuid-node",
      "parentIds": ["uuid-parent-1"],
      "type": "thought", // thought | reply | system
      "prompt": "输入的一句话",
      "mode": "main",    // main | flow | anti | mute
      "params": {
        "seed": 123,
        "render": { "noiseScale": 1.0, "mixStrength": 0.8 },
        "template": "deep_think_v1",
        "variables": { "topic": "无常" }
      },
      "summary": "简短概述",
      "diff": { "from": "uuid-parent-1", "changes": ["param.update.noiseScale"] },
      "thumb": "thumbs/uuid-node.png",
      "metrics": { "fps": 55.2, "frameTimeMs": 18.1 }
    }
  ],
  "branches": [
    { "id": "uuid-branch-main", "name": "main", "headId": "uuid-node" }
  ]
}
```

建议最小字段校验（伪代码）：

```ts
// 所有字段需有解释性注释，重要流程请加入 try/catch 并打印日志
const ProjectSchema = z.object({
  version: z.string(),
  projectId: z.string(),
  createdAt: z.number(),
  nodes: z.array(z.object({
    id: z.string(),
    parentIds: z.array(z.string()).default([]),
    type: z.enum(["thought","reply","system"]).default("thought"),
    prompt: z.string().default(""),
    mode: z.enum(["main","flow","anti","mute"]).default("main"),
    params: z.record(z.any()).default({}),
    summary: z.string().optional(),
    diff: z.record(z.any()).optional(),
    thumb: z.string().optional(),
    metrics: z.record(z.number()).optional(),
  })),
  branches: z.array(z.object({ id: z.string(), name: z.string(), headId: z.string() }))
});
```

---

## 五、三泡泡回应生成（逻辑草案）

1. 输入 `prompt` → 归一化与去噪（可选停用词/情绪标签）。
2. 模板化生成三类回应：
   - 顺流（flow）：沿原意延展的 paraphrase/expansion；
   - 逆流（anti）：反问/镜像/否定式重构；
   - 止语（mute）：以呼吸/符号/留白回应；
3. 每个回应即新 Node（不可变），写入 `nodes`，更新 `branches.headId`。
4. 渲染层仅“读取”当前 Node 的 `params` → 生成视觉。

提示词模板建议：`mustache` 模板 + 版本化，变量如 `{topic}`, `{tone}`, `{limit}`。

---

## 六、渲染层（p5 + Shader 思路）

参考 `ref/mochi.ts`（体积/噪声/色带/粒子）：

- 提供统一接口：`applyUniforms(p, shader, audio, sensitivity, controls)` 与 `draw(p, shader)`。
- 音频与交互打通：将点击/混合强度映射为 `uPulse`，与 `uLevel/uFlux` 共用一套驱动。
- 性能建议：
  - 控制 `uMaxSteps`/`uStepScale`/`uSurfEpsilon` 等，避免高配独占；
  - 通过 `requestAnimationFrame` 节流与“只读渲染”，状态变更由 store 驱动；
  - 必要时使用 OffscreenCanvas/Worker（可选增强）。

---

## 七、UI 结构与交互

- 左栏：分支树/历史列表（点击定位 node）。
- 中央：Canvas（三泡泡的弥散/裂变/消隐）。
- 右栏：输入区、参数面板（噪声/混合/色相/粒子强度等）、日志。

基础交互：

- 输入 → 生成三泡泡；
- 点击任意泡泡 → 成为主念 → 继续裂变；
- 悬浮显示摘要与参数；
- 支持导出/导入（见下）。

---

## 八、导入/导出

- 导出：`project.json` 或 `.zip`（包含 `project.json` 与 `thumbs/*`），使用 `JSZip` 打包；
- 导入：校验 Schema → 写入内存 store；
- 可选：localStorage 自动保存最近一次状态。

---

## 九、本地开发与运行

> 目前仓库处于“规划/设计稿 + 参考着色器”阶段，尚未初始化 Next.js 工程。建议按以下步骤启动：

```bash
# 1) 初始化项目
npm create next-app@latest anicca --ts --use-npm --eslint --app --src-dir --import-alias "@/*"

# 2) 安装依赖
cd anicca
npm i p5 zustand tailwindcss @shadcn/ui class-variance-authority clsx tailwind-merge jszip file-saver uuid mustache zod

# 3) 初始化 Tailwind
npx tailwindcss init -p

# 4) 运行
npm run dev
```

落地时需要：

- 在 `app/` 中创建 `Canvas` 组件并封装 p5 生命周期；
- 建立 `store`（Zustand）存储 nodes/branches，与导入/导出函数；
- 将 `ref/mochi.ts` 的思路抽象为 `shaders/mochi.ts` 并对接控制面板；
- 搭建三栏 UI（shadcn/ui）；
- 加入 JSON 导出/导入与缩略图生成。

---

## 十、质量与日志

- 重要流程均需 `try/catch` 并记录详细日志（包括数据与关键参数）。
- 性能指标：FPS、渲染耗时、导出文件大小等需在 UI 中可见。
- Schema 校验失败/导入异常必须给出清晰提示与修复建议。

---

## 十一、路线图（对齐 docs/TODO.md）

- 阶段一（MVP）：项目脚手架、弥散圆渲染、三泡泡基础链路、导入/导出。
- 阶段二：完善动效与音频联动、实验管理（创建/分支/对比）。
- 阶段三：视觉增强（体积、噪声、色相循环）、UX 优化、离线支持。
- 阶段四：可选云同步、社区分享、部署与监控。

---

## 十二、参考与素材

- `docs/项目介绍.md`：理念与体验设计
- `docs/技术初探.md`：技术架构与选型
- `docs/TODO.md`：开发任务拆解
- `ref/mochi.ts`：渲染/着色器与音频驱动的可复用思路

---

## 变更记录

- 2025-10-05：创建 README（汇总项目目标、架构、数据模型、开发指引）。


