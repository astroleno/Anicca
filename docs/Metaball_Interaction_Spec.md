# Metaball 交互与语义集成规格

## 目标
- 以“麻薯质感”的屏幕空间 SDF 作为视觉基础，支持：
  - 任意球的吸附（Snap/Attach）与分离（Detach）
  - 任意两球的融合/合并（Merge）
  - 基于聊天语义的分裂（Split，产出正/反两个子球）
- 交互手感优先：稳定、顺滑、低功耗，移动端可用。

## 概念与术语
- ball：屏幕空间下的球实体，含位置/半径/标签等。
- link：临时吸附边；代表两个球处于“磁性吸附”状态。
- cluster：由 links 联通形成的融合团；仅用于交互与 UI，高度不影响 shader 计算。
- op：进行中的动画操作（split/merge）。

## 数据结构（Zustand）
```ts
export type Ball = {
  id: number
  pos: [number, number]   // NDC [-1,1]
  radius: number          // 屏幕空间半径
  label: string
  active: boolean
};

export type Link = { a: number; b: number; since: number; stable: number };
export type Op = {
  id: string
  type: 'split' | 'merge'
  targets: number[]
  progress: number  // 0..1
  params?: Record<string, any>
};

export type Store = {
  balls: Ball[]
  links: Link[]
  ops: Op[]
  // 查询与修改
  findNearestBall(x: number, y: number): number | null
  setPos(id: number, pos: [number, number]): void
  setLabel(id: number, text: string): void
  createBall(pos: [number, number], radius: number, label?: string): number
  removeBall(id: number): void
  // 交互
  updateLinks(dt: number): void
  split(id: number, opts?: { labels?: [string, string]; dir?: [number, number]; ratio?: number }): void
  merge(a: number, b: number, opts?: { label?: string }): void
}
```

## 交互模型
### 1) 吸附（Snap/Attach）
- 条件：`d < k_attach * (r1 + r2)`，建议 `k_attach = 1.2`。
- 行为：进入“磁性”状态，使用弹簧阻尼将相对位置推向 `d_target = s * (r1 + r2)`（`s≈0.95`）。
- 迟滞：分离阈值 `k_detach = 0.9`（`k_detach < k_attach`）。
- 性能：仅对参与吸附的 id 做 GPU 增量写入。

### 2) 分离（Detach）
- 条件：`d > k_detach * (r1 + r2)` 或拖拽外力 > `F_break`。
- 行为：移除 link，短时弱阻尼回弹以体现“黏糯感”。

### 3) 合并（Merge）
- 触发：在吸附稳定后（稳定度/时间阈值）或用户点击确认。
- 规则：
  - 新中心 `p = weightedMean(p_a, p_b; w = r^2)`
  - 保体积（2D 近似）：`r_new^2 = r_a^2 + r_b^2`
  - 动画：两球沿连线向中心移动并缩放，`progress→1` 时替换为单球，旧球 `active=false`。

### 4) 分裂（Split）
- 触发：来自聊天结果（正/反词）或手动命令。
- 规则：
  - 方向：拖拽方向或局部法线方向；
  - 保体积：`r1^2 + r2^2 ≈ r_old^2`；
  - 位置：`p1 = p + dir*Δ*progress`, `p2 = p - dir*Δ*progress`；
  - 标签：分别写入正/反词；
  - 最小半径：`r_min = 0.06 * r_root`，不足拒绝分裂。

## 参数建议（默认）
- `k_attach = 1.2`, `k_detach = 0.9`, `d_target = 0.95*(r1+r2)`
- 动画速率 `k_anim = 7`（桌面）/`5`（移动），阻尼 `c = 0.9*k_anim`
- `r_min = 0.06 * r_root`；每帧增量上传 ≤ 16 节点

## 渲染与标签
- 渲染：现有屏幕空间 SDF（Compute→Render），无须改动。
- 标签：HTML 绝对定位 overlay，NDC→像素放置在中心；点击命中最近球。

## 与 Chat 的集成
- 服务端：`/api/chat` 已就绪，返回 `{ text, summary }`。
- 客户端：`openaiProvider.generate()` 调用；`ChatOverlay` 对指定 ball 进行问答。
- 语义协议（建议）：Prompt LLM 输出 JSON `{ positiveWord: string, negativeWord: string }`。
- 动作：拿到 JSON → `split(ballId, { labels:[pos, neg] })`。
- 合并时可异步请求“合”的词，更新新球 `label`。

## API（供 UI/Chat 调用）
- `split(id, opts?)`、`merge(a,b, opts?)`、`createBall(...)`、`removeBall(...)`、`setLabel(id, text)`、`findNearestBall(x,y)`
- 事件：`onClusterStable(clusterId)`（可提示“是否合并”）。

## 实施里程碑
1. 吸附/分离内核（links + 弹簧阻尼 + 迟滞 + 增量写入）
2. 合并动画（保体积，互斥保护）
3. 分裂动画（来自聊天或手动），标签 overlay
4. Chat popup 接入 `/api/chat`，正/反 JSON 输出 → 自动 split
5. 优化与预设：SSS 模糊、材质参数、移动端自适应
