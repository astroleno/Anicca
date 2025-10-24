# Metaball 交互与语义落地 TODO 计划

> 依据 `docs/Metaball_Interaction_Spec.md` 与近期讨论整理的实施清单（优先级从高到低）。

## 里程碑概览（更新）
- M0 工程化底座（状态机/恢复/测试）（新增）
- M1 吸附/分离内核（Snap/Detach）
- M1.5 空间哈希与自适应分辨率（新增）
- M2 合并（Merge）动画与确认流
- M3 Split（Chat 驱动）与标签 Overlay
- M4 质感与性能优化（SSS、动态分辨率、自恢复）
- M5 Chat 集成与指令协议（正/反/合）

---

## M0 工程化底座（1–2 天）
- [ ] 状态域与互斥规则：`ops(split/merge)`、`links(吸附)`、`selection`
- [ ] 封装工具：`writeBall(id)`、NDC↔像素、长宽比校正、帧计时
- [ ] 设备恢复：`getCurrentTexture` 失败与 `device.lost` 监听、自动 `configure()`
- [ ] 日志阈值与错误屏蔽（降噪）
- [ ] 测试基线：Vitest + 保体积/阈值-迟滞两个用例

## M1 吸附/分离内核（Snap/Detach）
- [ ] 在 store 增加 `links: Link[]`，维护临时吸附边（含 since、stable）
- [ ] 邻域检测：O(n^2) 起步；阈值 `k_attach`/`k_detach` + 迟滞，生成/移除 link
- [ ] 弹簧-阻尼推进：`d_target = 0.95*(r1+r2)`，只对参与 id 增量 `queue.writeBuffer`
- [ ] 冷却/去抖：link 状态切换最短 150ms
- [ ] 参数外露：桌面/移动分别配置（刚度/阻尼/阈值）
- [ ] 调试可视化（可选）：临时高亮被吸附对
- 验收：拖动 a 进入 b 半径 → 自然吸附、可分离，无抖动，>45fps 移动端可用

## M1.5 空间哈希与自适应（1–2 天）
- [ ] 屏幕均匀网格哈希（例如 32×32 cell）以缩减邻域候选
- [ ] 帧时自适应：目标 45/60fps，动态调整计算纹理 scale
- [ ] 移动端阈值与刚度降档
- 验收：80–120 球保持流畅，无明显掉帧

## M2 合并（Merge）动画与确认流
- [ ] 提示条件：link 稳定度或重叠度超阈值时显示“可合并”
- [ ] API：`merge(a,b, opts?)`，保体积 `r_new^2=r_a^2+r_b^2`，中心加权
- [ ] 动画：沿连线收拢，`progress→1` 时替换新球、旧球 inactive
- [ ] 互斥与边界：同一 id 不并行多操作；最小半径保护
- [ ] 增量 GPU 写入：仅变动 id 段

## M3 Split（Chat 驱动）与标签 Overlay
- [ ] HTML overlay：每球中心文本（label），点击命中最近球
- [ ] API：`split(id,{labels?:[p,n],dir?,ratio?})`，保体积、方向插值
- [ ] 标签规则：最长 8–10 字，溢出省略；分裂后继承父上下文 + 正/反词
- [ ] 快捷触发：先提供按钮/命令测试（无 Chat）

## M4 质感与性能优化
- [ ] 屏幕空间 SSS：对 mask 做小半径高斯（1–2 次），权重可调
- [ ] 动态分辨率：基于上一帧耗时自适应 scale（移动端优先降）
- [ ] 设备恢复：`getCurrentTexture` 失败→自动 reconfigure，日志降噪
- [ ] 参数预设：明/柔/透 3 档

## M5 Chat 集成与指令协议
- [ ] Chat UI：popup 输入（先行），后续对接现有 Overlay
- [ ] 服务端：沿用 `/api/chat`；prompt 产出 JSON `{ positiveWord, negativeWord }`
- [ ] 指令映射：拿到 JSON→`split(id,{labels:[pos,neg]})`
- [ ] 合并语义：merge 后异步请求“合”的词，更新新球 label
- [ ] 上下文继承：父链加权（默认 0.6/0.3/0.1），吸附时临时引用被吸附体上下文

## 兼容与降级（并行）
- [ ] `rgba16float`→`rgba8unorm` 回退（掩码映射同步调整）
- [ ] 无 WebGPU 时的提示页与说明
- [ ] 移动端事件与 DPI 适配

## 公共技术任务
- [ ] 增量写入工具方法：`writeBall(id, ball)` 封装偏移/对齐
- [ ] NDC↔像素工具与长宽比校正复用
- [ ] FreeList：复用被回收 id 槽位
- [ ] 单元测试：合并/分裂保体积、阈值/迟滞逻辑

## 完成标准（DoD）
- 吸附/分离/合并/分裂闭环，移动端>45fps
- 标签可点击，chat 产出能驱动 split
- 控制台无持续 error/warning；主要参数可动态调节
