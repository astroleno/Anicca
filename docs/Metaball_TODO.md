# Metaball 交互与语义落地 TODO 计划

> 依据 `docs/Metaball_Interaction_Spec.md` 与近期讨论整理的实施清单（优先级从高到低）。

## 里程碑概览
- M1 吸附/分离内核（Snap/Detach）
- M2 合并（Merge）动画与确认流
- M3 Split（Chat 驱动）与标签 Overlay
- M4 质感与性能优化（SSS、动态分辨率、自恢复）
- M5 Chat 集成与指令协议（正/反/合）

---

## M1 吸附/分离内核（Snap/Detach）
- [ ] 在 store 增加 `links: Link[]`，维护临时吸附边（含 since、stable）
- [ ] 邻域检测：O(n^2) 起步；阈值 `k_attach`/`k_detach` + 迟滞，生成/移除 link
- [ ] 弹簧-阻尼推进：`d_target = 0.95*(r1+r2)`，只对参与 id 增量 `queue.writeBuffer`
- [ ] 冷却/去抖：link 状态切换最短 150ms，避免抖动
- [ ] 参数外露：桌面/移动分别配置（刚度/阻尼/阈值）
- [ ] 调试可视化（可选）：临时高亮被吸附对
- 验收：拖动 a 进入 b 半径 → 自然吸附、可分离，无抖动，>45fps 移动端可用

## M2 合并（Merge）动画与确认流
- [ ] 提示条件：link 稳定度或重叠度超阈值时显示“可合并”提示
- [ ] API：`merge(a,b, opts?)`，保体积 `r_new^2=r_a^2+r_b^2`，中心加权
- [ ] 动画：沿连线收拢，`progress→1` 时替换新球、旧球 inactive
- [ ] 互斥与边界：同一 id 不并行多操作；最小半径保护
- [ ] 增量 GPU 写入：仅变动 id 段
- 验收：任意两球吸附后可一键合并，动画稳定，最终只剩一球

## M3 Split（Chat 驱动）与标签 Overlay
- [ ] HTML overlay：每球中心文本（label），点击命中最近球
- [ ] API：`split(id,{labels?:[p,n],dir?,ratio?})`，保体积、方向插值
- [ ] 标签规则：最长 8–10 字，溢出省略；分裂后继承父上下文 + 正/反词
- [ ] 快捷触发：先提供按钮/命令测试（无 Chat）
- 验收：点击球→执行 split→两子球出现、标签正确、帧率稳定

## M4 质感与性能优化
- [ ] 屏幕空间 SSS：对 mask 做小半径高斯（1–2 次），权重可调
- [ ] 动态分辨率：基于上一帧耗时自适应 scale（移动端优先降）
- [ ] 设备恢复：`getCurrentTexture` 失败→自动 reconfigure，日志降噪
- [ ] 参数预设：明/柔/透 3 档，快速切换
- 验收：更“糯”、稳定 45–60fps，控制台无持续报错

## M5 Chat 集成与指令协议
- [ ] Chat UI：使用简单 popup 输入（后续可替换为现有 Overlay）
- [ ] 服务端：沿用 `/api/chat`；prompt 产出 JSON `{ positiveWord, negativeWord }`
- [ ] 指令映射：拿到 JSON→`split(id,{labels:[pos,neg]})`
- [ ] 合并语义：merge 后异步请求“合”的词，更新新球 label
- [ ] 上下文继承：父链加权（默认 0.6/0.3/0.1），吸附时临时引用被吸附体上下文
- 验收：一次问答→自动 split；两球合并→更新“合”的标签

---

## 公共技术任务
- [ ] 增量写入工具方法：`writeBall(id, ball)` 封装偏移/对齐
- [ ] NDC↔像素工具与长宽比校正复用
- [ ] FreeList：复用被回收的 id 槽位，避免频繁重建 buffer
- [ ] 单元测试（最小）：合并/分裂的保体积、阈值/迟滞逻辑

## 配置参数（默认）
- `k_attach=1.2`, `k_detach=0.9`, `d_target=0.95*(r1+r2)`
- `k_anim=7`（桌面）/`5`（移动），`damping=0.9*k_anim`
- `r_min=0.06*r_root`; 每帧增量更新 ≤ 16 节点

## 风险与回避
- 性能：球数>100 时 O(n^2) 退化 → 后续加网格哈希
- 设备兼容：`rgba16float` 不可用→回退 `rgba8unorm`（调整掩码映射）
- 数值稳定：split 过细 → 最小半径保护；merge 冲突 → 操作互斥

## 完成标准（DoD）
- 吸附/分离/合并/分裂完整闭环，移动端>45fps
- 标签可点击，chat 产出能驱动 split
- 控制台无持续 error/warning；主要参数可动态调节
