# Raymarching 迁移计划（WebGL · 目标≈30球）

本文档定义从现有 WebGPU 屏幕空间 metaball 渲染迁移/补充到 Three.js + WebGL Raymarching 的技术路线，用于 30 球量级（桌面）/ 12–16 球量级（移动）的可交互展示，覆盖 split/merge、悬停 1s 自动合并，并尽量保持“麻薯/柔边”质感与后期（Bloom/FXAA/Gamma）。

---

## 约束与目标

- 并发球数：
  - 桌面 ≤ 30
  - 移动 ≤ 12（性能优先，可在 16 以内按机型调参）
- 交互：split（保体积）、merge（迟滞/吸附，悬停 1s 自动合并）、拖拽
- 质感：柔和边界、轻雾、Bloom、可调对比
- 兼容：iOS 上无需开启 WebGPU；以 WebGL 为主，后续可作为 WebGPU 主线的 fallback backend

---

## 架构总览

- 渲染层：Three.js + WebGL（全屏平面 + 片元 Raymarching）
- 数据层：JS 维护 `balls[]`（position, radius, level, active），通过“浮点纹理表”传入 shader
- 交互层：沿用现有 Store（Zustand）接口：`split/merge/create/remove/setPos`
- 后期：EffectComposer → RenderPass → Bloom → FXAA → Gamma

---

## 数据通道设计

- 球数据纹理表（建议 RGBA32F）：
  - R: x（NDC，-1..1）
  - G: y（NDC，-1..1）
  - B: radius（屏幕空间半径，按需要缩放）
  - A: level/flags（可扩展：标签/选中态等）
- uniforms：
  - `uBallsTex`（sampler2D），`uCount`（int），`uTexDim`（ivec2）
  - 质感参数：`uSmoothK`（smooth min 混合宽度）、`uContrast`、`uFogDensity`
  - 后期参数：bloomStrength/threshold/radius（JS 侧）
- 上传策略：
  - 初始化：一次性写满 N 条
  - 运行期：仅对变化的条目使用 texSubImage2D 增量写入（避免全量重传）

具体实现约定（稳定性与兼容性）：
- 尺寸与布局：默认 N=32（推荐 8×4 或 16×2 排布），上限 N=64（8×8）。移动端优先 N=32；桌面可按需升至 N=64。
- 采样方式：作为数据表固定使用 NEAREST，不依赖 `OES_texture_float_linear`，避免插值差异导致的数值偏差。
- 类型与降级：优先 `RGBA32F`；若设备不支持 → 降级 `RGBA16F`；若浮点纹理不可用 → 退回 UBO（限制 N≤64）或减少球数。
- WebGL 参数：`ClampToEdgeWrapping`、`UNPACK_ALIGNMENT=1`，二维尺寸优先 2 的幂次以减少驱动差异。
- 增量写入：将多处微小变更合并为单次/少次数 `texSubImage2D`，避免调用放大带来的驱动开销。

---

## Shader 改造要点（片元 Raymarching）

1. 替换现有 `for (int i=0; i<10; i++)`：
   - 由 `for (int i=0; i<uCount; i++)` 驱动，从 `uBallsTex` 采样中心/半径
   - 允许 N ≤ 64（性能看机型，默认桌面 30，移动 12）
2. 几何场：继续用 SDF + smooth min（`smin(a,b,k)`）混合；`k` 作为 UI/预设参数
3. 步进：MAX_STEPS 桌面 ≤ 100，移动 ≤ 60；空域时可更小
4. 视觉：移植/对齐参考 demo 的 AO、软阴影、对比、雾；Bloom 在后期链路完成

---

## 交互与动画（保持与现有 Store 一致）

- split（保体积）：
  - 半径：`r1^2 + r2^2 = r_old^2`
  - 方向：给定 dir，位置沿 dir ±Δ 差动；200–400ms 插值
  - 结束：两子球写入表；父球 inactive
- merge（迟滞 + 悬停 1s）：
  - 进入阈值：`d <= k_attach * (r1+r2)`，建议 raymarching 下 `k_attach ≈ 1.3–1.6`
  - 退出阈值：`d > k_detach * (r1+r2)`，建议 `k_detach ≈ 1.6–1.9`
  - 进入后计时 1000ms，仍在范围内则触发：
    - 新中心：按面积加权；新半径保体积
    - 动画：靠拢 + 淡出旧球；结束后旧球 inactive，表中替换为新球
- 拖拽：
  - pointer 统一（`touchAction: 'none'`），移动端长按 120ms 才开始拖拽
  - 拖拽中禁用 chatUI，避免误触

事件对齐与防抖（减少抖动/jitter）：
- pointermove 与拖拽坐标更新通过 `requestAnimationFrame` 与渲染同步（最小间隔≈16ms）。
- merge/吸附判定采用 50–80ms 防抖窗口；状态机切换加入迟滞，避免频繁进出边界导致闪烁。

---

## 性能优化清单

- 动态分辨率：当帧率 < 50fps（桌面）/< 45fps（移动）时，降尺度渲染到 FBO，再 upsample
- 自适应步进：远离命中面时步长更大；命中附近缩小（现有 demo 已有类似逻辑，可收紧）
- 屏幕裁剪：视锥外/屏幕外的球可跳过（CPU 侧粗裁剪）
- 后期降级：移动端关闭 Gamma 或调低 Bloom 的 strength/radius
- 纹理表尺寸：`N` 取 32/64，尽量对齐最小 2 的幂，减少驱动差异

动态分辨率与 Bloom 调参（触发/回弹策略）：
- 采样与统计：每 500ms 采样 FPS，使用 1s 滑动窗口均值。
- 触发：当窗口均值 < 50fps（桌面）/< 45fps（移动）时，将渲染 scale 递减 0.1，最小不低于 0.6。
- 回弹：当连续 2s ≥ 55fps（桌面）/≥ 50fps（移动）时，scale 回弹 +0.1，最高回到 1.0。
- Bloom 联动：随 scale 线性衰减至 70% 下限（例如 `bloomStrength *= lerp(1.0, 0.7, 1.0-scale)`），避免低分辨率过曝。

---

## 参数与预设（建议）

- 预设档位：
  - 柔和：`smoothK=0.28`，`contrast=1.15`，`fog=0.07`，`bloomStrength=0.4`
  - 中性：`smoothK=0.32`，`contrast=1.25`，`fog=0.10`，`bloomStrength=0.6`
  - 高对比：`smoothK=0.40`，`contrast=1.45`，`fog=0.12`，`bloomStrength=0.9`
- 交互阈值（raymarching）：`k_attach=1.3–1.6`，`k_detach=1.6–1.9`（依据设备调参）

---

## 里程碑与验收

- M1（2–3 天）：
  - Three+Raymarching 基线，纹理表供数，Bloom/FXAA/Gamma
  - 桌面 30 球 ≥ 55fps（2K），移动 12 球 ≥ 45fps（全高清）
- M2（2–3 天）：
  - split/merge/吸附/迟滞 + 高亮提示，增量上传生效
  - 悬停 1s 自动合并通过
- M3（1–2 天）：
  - 动态分辨率、步数自适应、三档预设
- M4（1 天）：
  - 标签/序号 + chatUI 点击触发；日志与异常处理

中期真机基线验证（纳入 M1 完成条件）：
- 设备：iPhone（A15/A16 级别）与安卓中端各 1 台。
- 场景：12 球、1080p。
- 目标：≥ 45fps；若未达标，先降 `MAX_STEPS` 与 scale，再回溯纹理表尺寸与 Bloom 参数。

**验收标准**

- 桌面 ≥ 55fps（2K，30 球）；移动 ≥ 45fps（1080p，12 球）
- split 保体积；merge 迟滞与 1s 自动合并正确
- 预设切换不抖动；连续操作不显著掉帧

---

## 何时选 Raymarching、何时保留 WebGPU

- Raymarching（本方案）适用：
  - 目标 N≤30、以一致的跨端兼容为主（特别是 iOS）
  - 需要华丽后期，但交互频率相对温和
- 保留 WebGPU 主线：
  - N 可增长、交互频繁、需要计算侧扩展（Compute 更具伸缩性）
  - Raymarching 作为 fallback 渲染后端，两者共享同一数据与交互 API

---

## 实施备注

- 先复用参考 demo 的后期链与 UI 组织，仅替换球源为“纹理表驱动”，关闭 demo 内程序化轨迹
- 交互/状态机完全复用现有 Store；渲染端只做“当前帧状态的可视化”
- 参数外露为滑杆，便于在真机上手调（smoothK、k_attach/detach、Bloom strength/radius）

Three.js 实现约定（DataTexture 建议）：
- 格式：`RGBAFormat + FloatType`（优先 32F，降级 16F）。
- 过滤/包裹：`NearestFilter`、`ClampToEdgeWrapping`。
- 对齐：`gl.pixelStorei(UNPACK_ALIGNMENT, 1)`；二维尺寸优先 2 的幂次。
- 增量：`texture.needsUpdate = false`，使用底层 `texSubImage2D` 写入变更区域。

能力探测与降级顺序：
1. WebGL2 + EXT_color_buffer_float/texture_float 支持 → `RGBA32F`。
2. 若 32F 渲染/采样受限 → `RGBA16F`。
3. 若浮点纹理不可用 → UBO（限制 N）并按需降低球数。
4. 若仍达不到目标 → 降低分辨率与后期强度，并在 UI 中提示降级状态。

日志与监测（用于调试与线上观测）：
- FPS 滑窗、动态分辨率触发/回弹事件、Bloom 动态调整参数。
- 纹理表：初始化/增量上传耗时与失败计数；能力探测结果与最终配置。
- 渲染：超步数率（提前中断占比）、命中失败重试次数。
- 交互：split/merge 开始/完成/取消与失败原因；自动合并触发统计。

执行计划（更新，10–12 天）：
- 第 1–3 天（M1）：Three+Raymarching 基线；纹理表（32F→16F→UBO）降级链路；Bloom/FXAA/Gamma；真机基线验证。
- 第 4–6 天（M2）：split/merge/吸附/迟滞；悬停 1s 自动合并；事件 rAF 对齐与防抖；增量上传优化。
- 第 7–8 天（M3）：动态分辨率与步数自适应；三档视觉预设；性能回归。
- 第 9–10 天（M4）：标签/序号与 chatUI 联动；日志/异常打点；文档与参数面板完善。
