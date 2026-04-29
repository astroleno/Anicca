非常好，这个选择是最合理、最具前瞻性的路线。
用 Next.js (App Router) + TypeScript + WebGPU 可以同时满足：
	•	iOS Safari 17+ 的原生 WebGPU 支持；
	•	桌面端 Chrome / Edge / Safari 全兼容；
	•	React-Three-Fiber（R3F）生态下的组件化开发；
	•	性能与未来扩展的双保障。

⸻

一、总体架构思路

我们要实现的核心功能：
	•	WebGPU Compute Shader → 实时计算 7 级 Metaball SDF 场；
	•	Deferred Shading Pipeline → 实现“麻薯半透”质感；
	•	React (TSX) 前端组件 → 拖动、分裂、融合交互；
	•	全程保持移动端流畅（使用局部更新 + 缓存场）。

⸻

二、项目结构 (Next.js 版)

/app
  ├── page.tsx                     # 页面入口
/src
  ├── components/
  │   ├── MetaballCanvas.tsx       # 主渲染入口
  │   ├── MetaballCompute.tsx      # 计算Pass (WebGPU)
  │   ├── LightingPass.tsx         # 延迟光照 + 麻薯质感
  │   ├── ControlsOverlay.tsx      # 拖动/融合UI
  │   └── DebugPanel.tsx           # 调试信息
  ├── shaders/
  │   ├── metaball_compute.wgsl    # 计算场 (Compute Shader)
  │   ├── lighting_deferred.wgsl   # 光照 (Render Shader)
  │   └── sss_blur.wgsl            # 次表面散射
  ├── store/
  │   └── metaballStore.ts         # 分形树数据管理 (Zustand)
  ├── utils/
  │   ├── webgpuInit.ts            # GPU设备初始化
  │   └── mathHelpers.ts           # SDF / Fractal 工具
  ├── hooks/
  │   ├── useMetaballInteraction.ts # 拖动与融合逻辑
  │   └── useWebGPUPipeline.ts     # 通用 GPU 管线 Hook
  ├── types/
  │   └── Metaball.ts              # 类型定义


⸻

三、关键设计模块说明（只读讨论）

1. Metaball 数据结构

export type Metaball = {
  id: number;
  parent: number;
  pos: [number, number, number];
  radius: number;
  level: number;
  active: boolean;
};

Zustand 存储所有节点：

export const useMetaballStore = create((set) => ({
  balls: [] as Metaball[],
  split: (id) => set((s) => { /* 添加子节点 */ }),
  merge: (id) => set((s) => { /* 合并 */ }),
  updatePos: (id, pos) => set((s) => { /* 拖动更新 */ })
}));


⸻

2. Compute Shader（metaball_compute.wgsl）逻辑概述
	•	输入：255 个 metaball 数据 (StorageBuffer)
	•	输出：SDF 场 3D 纹理
	•	核心计算：

for each voxel p:
  float d = 0.0;
  for each ball i:
    let q = distance(p, ball.pos);
    d += ball.radius * ball.radius / (q*q + eps);
store sdf_field[p] = smoothUnion(d);



WebGPU 的 compute pass 将这一结果写入 3D texture，用于下一步渲染。

⸻

3. Lighting Pass（lighting_deferred.wgsl）
	•	输入：SDF 场 + Normal map + Thickness map；
	•	输出：屏幕颜色；
	•	光照模型：
	•	Lambert 主光；
	•	环境模糊散射；
	•	Fresnel 外缘反光；
	•	gamma 修正（1.3）模拟麻薯柔光；
	•	输出为半透明合成色。

⸻

4. SSS 模糊 Pass（sss_blur.wgsl）

模拟麻薯质感内部透光：

color = mix(color, blur(color, radius=ss_thickness), 0.5);

在 iOS GPU 上性能表现良好。

⸻

5. 交互与动态分形

React Hooks 负责：
	•	拖动 (pointerdown → update pos → GPU buffer write)
	•	分裂 (splitProgress 动画控制子节点生成)
	•	融合 (mergeProgress 动画控制半径恢复)

渲染逻辑与数据流完全分离。

⸻

四、移动端优化策略（针对 iOS Safari）

模块	优化手段
SDF 场分辨率	自适应缩放：移动端降到 128³，桌面端 256³
SSS 模糊	改为单通道高斯；延迟模糊一帧执行
Buffer 上传	批量更新（只更新变动节点）
输入	触控事件→pointer事件统一处理


⸻

五、Phase 0 功能目标（MVP）

✅ 显示一棵 7 层树状 metaball 系统（递减半径）
✅ 可在屏幕上拖动根节点，整体动态响应
✅ 自动计算 SDF 场，渲染半透麻薯质感
✅ 移动端 30–60fps 运行

⸻

如果你确认可以继续，我下一步会输出：
	•	/app/page.tsx
	•	/src/components/MetaballCanvas.tsx
	•	/src/shaders/metaball_compute.wgsl
	•	/src/shaders/lighting_deferred.wgsl
	•	/src/store/metaballStore.ts

这些文件组成一个完整可运行原型骨架（可直接 npm run dev 运行），
之后我们再逐步填充 SSS 与分裂逻辑。

要我现在帮你写出这一版骨架代码吗？