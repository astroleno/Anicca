# Raymarching 流动感设计（只读讨论）

本文讨论如何让 raymarching 本体产生“有生命力的流动感”。对比参考：`ref/neon-raymarcher.tsx` 与 `ref/liquid-shader.tsx`，并给出可复用的参数接口建议与落地顺序。全篇不包含实现代码，仅供设计与评审。

---

## 1. 结论概览

- 优先参考：`neon-raymarcher.tsx`（直接在 SDF 层做时间演化：位置/旋转/相位/平滑并集），与我们“metaball 本体流动”的目标高度一致。
- 辅助参考：`liquid-shader.tsx`（体积雾/星云类背景的流动节奏与生命周期管理），不直接用作本体几何形变，但其“参数→uniforms”的组织方式与资源清理模式可借鉴。

---

## 2. 可借鉴点

### 2.1 来自 neon-raymarcher（主参考）
- 流动驱动：
  - 基于时间的位移/旋转：为每个形体配置 `posSpeed/rotSpeed` 与 `posPhase/rotPhase`，用 `sin/cos` 叠加主频与次频，避免机械重复。
  - 平滑并集（smin）融合：用 `opSmoothUnion` 保持柔和边界，`k` 可做轻微时间扰动。
- 法线与光照：
  - 有限差分求法线 + rim light（边缘泛光）+ 简单高光，使“流动”在光影层面可感知。
- 氛围与层次：
  - 以总步进距离 `totalDist` 近似 AO/雾化，随时间变化让深浅更有呼吸感。
- 性能参数化：
  - `MAX_STEPS`、`PRECISION` 外露，方便按 FPS 动态调节。

### 2.2 来自 liquid-shader（辅助参考）
- 生命周期管理：
  - 初始化 → 尺寸更新 → 动画循环 → 监听解绑 → 资源释放的清晰流程，可用于我们前景渲染的鲁棒性提升。
- 参数映射：
  - 少量布尔/数值开关即可驱动视觉的思路，利于把“预设/滑杆”映射到 uniforms，形成可控的“风格档位”。

---

## 3. 参数接口建议（统一到前景 Raymarching）

- 时间与频率：
  - `uTime: float`（全局时间）
  - `uFlowSpeed: float`（主摆动速度系数，默认 1.0）
  - `uSecondaryMix: float`（二级扰动权重，默认 0.35）
- 形体演化：
  - 每球体静态常量（初始化生成并保持）：`posSpeed(vec3) / rotSpeed(vec3) / posPhase(vec3) / rotPhase(vec3)`
  - 运行时只推进 `uTime`，球心/朝向在 JS 或 Shader 侧计算（先建议 JS 侧计算中心/角度后写入“纹理表/UBO”）。
- 形体融合：
  - `uSminK: float`（smooth min 混合宽度，默认 0.32，可做 ±10% 的轻扰动）
- 质感与氛围：
  - `uFogDensity: float`（随 totalDist 或 uTime 微调）
  - `uContrast: float`、`uSmoothK: float`（与文档预设对齐）

注：交互时（拖拽/split/merge）对被操作球体的“摆动”做短暂冻结，避免交互造成几何漂移错位；merge 后新球的运动常量可由子球加权并轻度重采样 phase。

---

## 4. 最小落地顺序（不涉及实现，仅路线）

1) 启动“慢流动”：
- 为每个球体生成一组“运动常量”（pos/rot 的 speed 与 phase），默认幅度极小（0.02–0.05 屏幕单位）。
- 帧更新仅推进 `uTime` 并写入新中心/角度。

2) 柔边动态：
- 让 `uSminK` 随时间做轻微扰动（±5%），或与交互耦合（拖拽时减小、静止时回归）。

3) 光影显形：
- 增加 rim light 与简易 AO/雾，使“流动”在光影与层次上映射更明显。

4) 性能自适应：
- 基于 FPS 滑窗，动态下调 `MAX_STEPS/SECONDARY_MIX/flowSpeed`，必要时只保留主频摆动。

---

## 5. 与既有文档的对齐

- 与《Raymarching 迁移计划》一致：
  - 继续采用片元 Raymarching + smooth min。
  - 预设档位（smoothK/contrast/fog）保持统一接口。
  - 性能策略延用：动态分辨率、步数自适应、移动端优先 N=32。

---

## 6. 风险与边界

- 交互一致性：拖拽/合并判定阈值需考虑“摆动偏移”，避免阈值抖动；可在交互窗口冻结被操作球的位姿。
- 视觉一致性：过强的二级扰动会破坏“麻薯/柔边”观感，建议从小幅参数起步。
- 性能：移动端优先降低二级扰动与步数，必要时停用 rim light。

---

## 7. 结语

- 让“本体流动”优先采用 `neon-raymarcher.tsx` 的做法（时间驱动 + smin + 光影显形），`liquid-shader.tsx` 作为工程与参数组织的参考。
- 后续如需“背景层流动”，可单独以背景 canvas 接入 liquid 思路，与前景解耦。
