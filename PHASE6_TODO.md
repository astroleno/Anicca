# Phase 6: SDF Smooth Union 实施清单

**目标**：达成"磨砂麻薯质感"的 Metaball + ChatUI 联动效果

**预计时间**：2-3 小时核心改造 + 1-2 小时调优

**状态**：🔴 未开始

---

## 🎯 最终验收标准

完成后必须满足以下所有条件：

### 质量标准
- [ ] **无点状环带**：掠射角、薄壳处连续无断裂，放大 200% 看不到锯齿状缺口
- [ ] **边界清晰**：不依赖体积 α 累加和 glow 也有清晰轮廓，零面稳定
- [ ] **磨砂稳定**：噪声颗粒随视线稳定，不随深度层积或拉丝（关键！）
- [ ] **融合自然**：两球分离→搭桥→融合平滑过渡，无"胖边雾化"
- [ ] **法线平滑**：无黑洞、跳变或闪烁

### 性能标准
- [ ] **帧时 < 16.7ms** @ 1080p，6-12 个球（60fps）
- [ ] **平均步数 < 64**（理想 < 32）
- [ ] **Miss 率 < 5%**（表面完整性）
- [ ] **命中率 > 99%**（MAX_STEPS 足够）

### 集成标准
- [ ] **ChatUI 联动正常**：fork/merge/combine 事件触发无误
- [ ] **背景透过**：边缘半透明，ShaderPark 背景可见
- [ ] **UI 参数可控**：blendK、HIT_EPS、NORMAL_EPS、noiseScale 四个旋钮独立调控

### 可调性标准
- [ ] 可调出**清边/柔边**两种档（通过 blendK）
- [ ] 可调出**细砂/粗砂**两种档（通过 grainPow 和 noiseScale）
- [ ] 可快速切换 Phase 5/6 对比（USE_SDF_METHOD 开关）
- [ ] 可切换多项式/指数 smooth-union（SMOOTH_UNION_TYPE 开关）

---

## 📋 实施步骤

### Step 0: 准备工作（10 分钟）

- [ ] **备份当前代码**
  ```bash
  git add .
  git commit -m "Phase 5: volume rendering baseline (before Phase 6)"
  ```

- [ ] **创建实验分支**（可选）
  ```bash
  git checkout -b feature/phase6-sdf-smooth-union
  ```

- [ ] **确认参考文档已读**
  - [ ] `RAYMARCHING_INTEGRATION_PLAN.md` Phase 6 章节
  - [ ] `ref/Shader3/spCode.js` 参考质感实现

#### 0.3 添加调试开关 ⚠️ 关键（便于回滚对比）

在 Fragment Shader 顶部（`#ifdef` 之后，第一个 uniform 之前）添加：

```glsl
// ============== 调试开关（便于回滚对比） ==============
#define USE_SDF_METHOD 1        // 0=体积渲染(Phase 5), 1=SDF表面(Phase 6)
#define SMOOTH_UNION_TYPE 0     // 0=多项式soft-min, 1=指数soft-min
#define NOISE_SPACE 0           // 0=view-space, 1=screen-space
#define DEBUG_PERF 0            // 1=输出性能统计（步数/miss率）

// ============== 常量配置 ==============
const float HIT_EPS = 1e-4;      // 命中判定阈值
const float NORMAL_EPS = 4e-4;   // 法线差分步长（2-4倍HIT_EPS）⚠️ 关键！
const float MIN_STEP = 1e-3;     // 步进下限（防蜗牛走）
const float MAX_STEP = 0.5;      // 步进上限（防过步）
```

**验证点**：
- [ ] 编译通过
- [ ] 可以通过修改 `USE_SDF_METHOD` 快速切换 Phase 5/6

**为什么需要这些开关**：
- `USE_SDF_METHOD`：出问题时可立刻回退到 Phase 5 对比
- `SMOOTH_UNION_TYPE`：多项式 vs 指数，不同场景效果不同
- `NOISE_SPACE`：验证噪声绑定的空间域是否正确
- **两个 epsilon 分开**：避免法线抖动（常见错误）
- **步进护栏**：防止极端情况（掠射角/薄壳）

---

### Step 1: 替换场函数（30 分钟）

#### 1.1 添加 SDF 辅助函数

在 `MetaCanvas.tsx` 的 Fragment Shader 中，**在 `field()` 函数之前**添加：

```glsl
// ============== SDF 基元 ==============

// 单个球体的 SDF（有符号距离场）
float sdSphere(vec3 p, vec3 center, float radius) {
  return length(p - center) - radius;
}

// SDF 平滑最小值（产生融合效果）
float smin(float a, float b, float k) {
  #if SMOOTH_UNION_TYPE == 0
    // 多项式 soft-min（更稳定，推荐）
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
  #else
    // 指数 soft-min（更平滑，但小半径时易过平）
    float res = exp(-k * a) + exp(-k * b);
    return -log(res) / k;
  #endif
}

// 多球 SDF 场（smooth union 融合）
float sdfMetaballs(vec3 p) {
  float d = 1e10;  // 初始化为很大的距离

  for (int i = 0; i < MAX_SOURCES; ++i) {
    if (i >= u_source_count) break;

    float di = sdSphere(p, u_source_pos[i], u_source_rad[i]);

    // 平滑融合（k 参数控制融合范围）
    d = smin(d, di, u_blend_k);
  }

  return d;  // 返回带符号距离
}
```

**验证点**：
- [ ] Shader 编译无错误
- [ ] Console 无 WebGL 错误

#### 1.2 添加新的 Uniform

在 Fragment Shader 的 uniform 声明区域（约 125 行）：

```glsl
// ====== 删除以下旧 uniform ======
// uniform float u_threshold_t;   // ❌ 删除
// uniform float u_kernel_eps;    // ❌ 删除
// uniform float u_kernel_pow;    // ❌ 删除

// ====== 添加新 uniform ======
uniform float u_blend_k;  // ✅ 新增：Smooth union 融合宽度（0.2-0.8）
```

#### 1.3 更新 TypeScript Uniform 设置

在 `render()` 函数中（约 600 行）：

```typescript
// ====== 删除旧 uniform 设置 ======
// const thresholdTLoc = gl.getUniformLocation(program, 'u_threshold_t');  // ❌ 删除
// const kernelEpsLoc = gl.getUniformLocation(program, 'u_kernel_eps');    // ❌ 删除
// const kernelPowLoc = gl.getUniformLocation(program, 'u_kernel_pow');    // ❌ 删除

// ====== 添加新 uniform 获取 ======
const blendKLoc = gl.getUniformLocation(program, 'u_blend_k');  // ✅ 新增

// ====== 设置新 uniform 值 ======
if (blendKLoc) gl.uniform1f(blendKLoc, 0.5);  // ✅ 初始值 0.5
```

#### 1.4 删除 raymarchParams 中的旧参数

在 `raymarchParams` 配置对象中（约 479 行）：

```typescript
const raymarchParams = {
  // ❌ 删除以下三个
  // thresholdT: 1.0,
  // kernelEps: 1e-3,
  // kernelPow: 2.0,

  // ✅ 添加新参数
  blendK: 0.5,        // Smooth union 融合宽度

  // 保持其他参数不变
  rCut: 2.5,
  stepFar: 0.15,
  stepNear: 0.015,
  fGate: 0.3,
  epsHit: 1e-4,       // ✅ 可以改更小（SDF 更精确）
  maxSteps: 256,
  // ...
};
```

**验证点**：
- [ ] TypeScript 编译无错误
- [ ] 浏览器 Console 无 uniform 警告

---

### Step 2: 实现 Sphere Tracing（30 分钟）

#### 2.1 替换 main() 中的体积渲染代码

**找到 `main()` 函数中的体积渲染循环**（约 370-395 行），**完全替换**为：

```glsl
void main() {
  vec2 fragCoord = gl_FragCoord.xy;

  // 1) 相机射线
  vec3 ro, rd;
  makeRay(fragCoord, ro, rd);

  // 2) AABB 裁剪
  float tNear, tFar;
  float hitBox = sdBox(ro, rd, u_bounds_min, u_bounds_max, tNear, tFar);
  if (hitBox < 0.5) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);  // 未命中包围盒，透明
    return;
  }

  // 3) Sphere Tracing 步进
  float t = max(tNear, 0.0);
  bool hit = false;
  float prevD = 1e10;  // ✅ 记录上一步距离（用于掠射角判定）

  for (int i = 0; i < u_max_steps; ++i) {
    if (t > tFar) break;

    vec3 p = ro + rd * t;
    float d = sdfMetaballs(p);  // ✅ 使用 SDF 距离场

    // ✅ 改进的命中判定（结合距离减小趋势）
    if (d < HIT_EPS || (d < prevD && d < HIT_EPS * 2.0)) {
      // 命中！可选：二分精化（先跳过，后续优化）
      hit = true;
      break;
    }

    // ✅ 步进护栏（防止极端情况）
    float step = clamp(d, MIN_STEP, MAX_STEP);
    t += step;
    prevD = d;
  }

  if (!hit) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);  // 未命中，透明
    return;
  }

  // 4) 命中点着色（临时：纯色调试）
  vec3 p = ro + rd * t;
  gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0);  // 洋红色标记命中
}
```

**验证点**：
- [ ] 编译通过
- [ ] **看到洋红色的球体**（命中可视化）
- [ ] 球体边界清晰，无点状环带
- [ ] 两个球靠近时有融合效果

**如果看不到球**：
1. 检查 `u_blend_k` 是否正确传递（Console 输出 uniform 值）
2. 临时增大 `u_eps_hit` 到 `1e-3` 或 `1e-2`
3. 检查 `u_source_count` 和 `u_source_pos` 数组

---

### Step 3: 添加法线和光照（30 分钟）

#### 3.1 两个 epsilon 分开管理 ⚠️ 易错项！

**易错点**：命中阈值（HIT_EPS）和法线差分步长（NORMAL_EPS）**必须分开**。

```glsl
// ❌ 错误：共用一个 epsilon
const float EPS = 1e-4;
if (d < EPS) { /* 命中 */ }
vec3 n = sdfNormal(p, EPS);  // 法线也用同一个 → 抖动！

// ✅ 正确：分开管理（已在 Step 0.3 定义）
const float HIT_EPS = 1e-4;      // 命中判定
const float NORMAL_EPS = 4e-4;   // 法线差分（2-4倍HIT_EPS）

if (d < HIT_EPS) { /* 命中 */ }
vec3 n = sdfNormal(p, NORMAL_EPS);  // ✅ 使用专门的法线epsilon
```

**原因**：
- NORMAL_EPS 太小 → 数值误差 → 法线抖动/黑洞
- NORMAL_EPS 太大 → 法线不准确
- **推荐关系**：`NORMAL_EPS = 2~4 * HIT_EPS`

#### 3.2 更新 sdfNormal 函数

**替换原有的 `normalTetra()` 或 `normalCentral()`**，改为 SDF 梯度法线：

```glsl
// SDF 梯度法线（中心差分，epsilon 作为参数）
vec3 sdfNormal(vec3 p, float e) {  // ✅ epsilon 作为参数
  vec3 n = vec3(
    sdfMetaballs(vec3(p.x + e, p.y, p.z)) - sdfMetaballs(vec3(p.x - e, p.y, p.z)),
    sdfMetaballs(vec3(p.x, p.y + e, p.z)) - sdfMetaballs(vec3(p.x, p.y - e, p.z)),
    sdfMetaballs(vec3(p.x, p.y, p.z + e)) - sdfMetaballs(vec3(p.x, p.y, p.z - e))
  );
  return normalize(n);
}
```

#### 3.3 添加 Lambert 光照着色

**替换 `main()` 中的洋红色调试代码**（Step 2.1 的最后部分）：

```glsl
// 4) 命中点着色
vec3 p = ro + rd * t;
vec3 n = sdfNormal(p, NORMAL_EPS);  // ✅ 使用 NORMAL_EPS

// Lambert 光照
vec3 lightDir = normalize(u_light_dir);
float ndotl = max(dot(n, lightDir), 0.0);
vec3 albedo = u_albedo;  // 基础反射率（白色）
vec3 col = albedo * (u_ambient + (1.0 - u_ambient) * ndotl);

gl_FragColor = vec4(col, 1.0);  // ✅ 基础光照，不透明
```

**验证点**：
- [ ] **看到有明暗变化的白色球体**
- [ ] 光照来自 `lightDir` 方向（可调整观察）
- [ ] 法线平滑，无黑洞或跳变
- [ ] 边界清晰，有体积感

**如果法线异常**：
1. 检查 `sdfNormal()` 的 epsilon（试 `1e-3` 或 `5e-4`）
2. 输出法线颜色调试：`gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);`

---

### Step 4: 添加磨砂质感（1 小时，含调优）⚠️ 关键步骤

#### 4.1 绑定 view-space 噪声

**在 `main()` 的光照计算之后**：

```glsl
// 5) 磨砂颗粒质感（关键！）
// ✅ 噪声绑定在**视线方向**（view-space），不是 world-space
#if NOISE_SPACE == 0
  // View-space 噪声（推荐，磨砂感）
  vec3 s = rd;  // ← 视线方向（等同于 ShaderPark 的 getRayDirection()）
#else
  // Screen-space 噪声（备选，颗粒更稳定但缺乏3D感）
  vec3 s = vec3(gl_FragCoord.xy / u_resolution, 0.0);
#endif

float noiseVal = snoise(s * 5.0 + vec3(0, 0, u_time * 0.1));  // ✅ 时间动画
noiseVal = noiseVal * 0.5 + 0.5;  // 映射到 [0,1]

// ✅ 高伽马颗粒化（参考代码用 pow(n, 8)）
float grain = pow(noiseVal, 8.0);

// ✅ 调制表面颜色（不是 alpha！）
col *= mix(0.8, 1.2, grain);  // 颜色调制范围：80% - 120%
```

**验证点**：
- [ ] **看到磨砂颗粒感**（表面有细微明暗变化）
- [ ] 颗粒随**视线移动而变化**，但在同一视角下稳定
- [ ] **没有云雾感**（如果有云雾，说明绑定错了空间域）

**调优参数**：
- `s * 5.0`：噪声频率（5.0 = 细颗粒，2.0 = 粗颗粒）
- `pow(noiseVal, 8.0)`：颗粒化程度（8.0 较强，6.0 较弱，10.0 极强）
- `mix(0.8, 1.2, grain)`：颜色调制范围（可调为 0.9-1.1 更柔和）

**如果还是云雾感**：
1. ❌ 检查是否错误写成 `snoise(p * 5.0)`（world-space）
2. ✅ 必须是 `snoise(rd * 5.0)` 或 `snoise(s * 5.0)`（view-space）

#### 4.2 升级到 FBM（可选，提升质感层次）

如果单层噪声不够细腻，可升级为多层叠加（参考代码用了 `fbm()`）：

```glsl
// FBM（Fractional Brownian Motion）
float fbm3D(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;

  for (int i = 0; i < 3; ++i) {  // 3 层叠加
    value += amplitude * snoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }

  return value;
}

// 使用 FBM 替代单层 snoise
float noiseVal = fbm3D(s * 5.0 + vec3(0, 0, u_time * 0.1));
```

**验证点**：
- [ ] 颗粒层次更丰富
- [ ] 仍保持 view-space 特性

---

### Step 5: 添加边缘透明度（30 分钟）

#### 5.1 Fresnel 边缘透明

**在 `main()` 最后输出前**：

```glsl
// 6) 边缘透明度（Fresnel 效果）
float fresnel = pow(1.0 - abs(dot(n, -rd)), 2.0);  // ✅ Fresnel 幂次 2.0
float alpha = mix(0.9, 0.3, fresnel);  // 中心 90% 不透明，边缘 30%

// ✅ 最终输出（预乘 Alpha）
gl_FragColor = vec4(col * alpha, alpha);
```

**验证点**：
- [ ] 球体中心基本不透明
- [ ] 边缘半透明，ShaderPark 背景可见
- [ ] 过渡平滑，无突变

**调优参数**：
- `pow(..., 2.0)`：Fresnel 幂次（1.5 = 更透，3.0 = 更不透）
- `mix(0.9, 0.3, ...)`：不透明度范围（可调为 0.95-0.2）

**如果背景被完全遮挡**：
1. 降低中心不透明度：`mix(0.8, 0.2, fresnel)`
2. 增加 Fresnel 幂次：`pow(..., 1.5)`

---

### Step 6: UI 参数控制（30 分钟）

#### 6.1 添加 blendK 滑块

在 `MetaCanvas.tsx` 的控制面板中（约 1343 行）：

```tsx
// 添加 blendK state
const [blendK, setBlendK] = useState(0.5);

// 在 useEffect 中更新 uniform（约 868 行）
useEffect(() => {
  if (runtimeRef.current) {
    // ... 现有代码
    runtimeRef.current.setInputs({
      // ... 现有参数
      blendK  // ✅ 新增
    });
  }
}, [k, r, d, sigma, gain, time, sources, tree, blendK]);  // ✅ 添加依赖

// 在控制面板添加滑块（1343 行之后）
<div style={{ marginBottom: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
  <span style={{ width: '30px' }}>融合</span>
  <input
    type="range"
    min={0.2}
    max={0.8}
    step={0.05}
    value={blendK}
    onChange={e => setBlendK(parseFloat(e.target.value))}
    style={{ flex: 1 }}
  />
  <span style={{ width: '30px', textAlign: 'right' }}>{blendK.toFixed(2)}</span>
</div>
```

#### 6.2 修改 `createMinimalRendererFromString` 接收 blendK

在 `SPInputs` 类型中（约 58 行）：

```typescript
type SPInputs = {
  // ... 现有参数
  blendK?: number;  // ✅ 新增
};
```

在 `render()` 函数中设置 uniform（约 640 行）：

```typescript
// ❌ 删除旧的设置
// if (thresholdTLoc) gl.uniform1f(thresholdTLoc, raymarchParams.thresholdT);

// ✅ 添加新的设置
const blendKLoc = gl.getUniformLocation(program, 'u_blend_k');
if (blendKLoc) gl.uniform1f(blendKLoc, params.blendK ?? 0.5);
```

**验证点**：
- [ ] 滑块调整 blendK 时，融合效果实时变化
- [ ] 0.2 = 几乎不融合（分离清晰）
- [ ] 0.8 = 明显融合（搭桥宽阔）

---

### Step 7: 性能优化（可选）

#### 7.1 降低步数（如果 FPS < 30）

```typescript
const raymarchParams = {
  maxSteps: 128,  // 从 256 降到 128（或 64）
  // ...
};
```

#### 7.2 半分辨率渲染（高级）

```typescript
// 在 updateCanvasSize() 中
const renderScale = 0.75;  // 75% 分辨率
canvas.width = Math.floor(windowWidth * renderScale);
canvas.height = Math.floor(windowHeight * renderScale);
```

**权衡**：
- FPS 提升 2-4x
- 细节略有损失（但磨砂质感会掩盖）

---

## 🐛 故障排除

### 问题 1: 全黑屏幕

**排查**：
1. 检查 Shader 编译：
   ```typescript
   const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
   if (!compiled) console.error(gl.getShaderInfoLog(shader));
   ```
2. 输出固定颜色测试：
   ```glsl
   gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); return;
   ```
3. 检查 AABB 包含射线

### 问题 2: 场强可见但不命中

**解决**：
- 放宽命中阈值：`epsHit = 1e-2`
- 增加步数：`maxSteps = 256`
- 检查 `u_blend_k` 是否传递

### 问题 3: 法线异常（黑洞/闪烁）

**解决**：
- 调整 epsilon：`e = 5e-4` 或 `1e-3`
- 输出法线颜色调试：
  ```glsl
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
  ```

### 问题 4: 还是云雾感（最关键！）

**检查清单**：
- [ ] ❌ 错误：`snoise(p * 5.0)`（world-space）
- [ ] ✅ 正确：`snoise(rd * 5.0)`（view-space）
- [ ] ❌ 错误：调制 alpha/density
- [ ] ✅ 正确：调制 color

### 问题 5: 性能很差 (<15 FPS)

**快速优化**：
- 降低步数：`maxSteps = 64`
- 降低分辨率：`renderScale = 0.5`
- 减少源数量测试（临时）

### 问题 6: 薄壳/掠射角处有断裂 ⚠️ 新增

**原因**：步长过大，跨过薄壳

**解决**：
1. 添加步进护栏（已在 Step 2 中）：
   ```glsl
   float step = clamp(d, MIN_STEP, MAX_STEP);
   t += step;
   ```

2. 改进命中判定（结合距离减小趋势，已在 Step 2 中）：
   ```glsl
   if (d < HIT_EPS || (d < prevD && d < HIT_EPS * 2.0))
   ```

3. 增加精化步数（可选，后续优化）：
   ```glsl
   // 命中后进行二分精化
   for (int j = 0; j < 5; ++j) {
     float tm = t - d * 0.5;
     vec3 pm = ro + rd * tm;
     float dm = sdfMetaballs(pm);
     if (abs(dm) < abs(d)) { t = tm; d = dm; }
   }
   ```

### 问题 7: 法线抖动/黑洞 ⚠️ 新增

**原因**：NORMAL_EPS 太小或与 HIT_EPS 共用

**解决**：
- 分开管理两个 epsilon（已在 Step 0.3 和 Step 3.1）
- NORMAL_EPS = 2~4 * HIT_EPS
- 典型值：HIT_EPS=1e-4, NORMAL_EPS=4e-4

**验证**：输出法线颜色调试
```glsl
gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
```

### 问题 8: 融合效果不自然

**原因**：blendK 参数不合适，或 smooth-union 类型不匹配场景

**解决**：
1. 调整 `blendK`：
   - 0.2 = 几乎不融合（分离清晰）
   - 0.5 = 平衡（推荐）
   - 0.8 = 明显融合（搭桥宽阔）

2. 切换 smooth-union 类型（通过 `SMOOTH_UNION_TYPE`）：
   - 0 = 多项式（更稳定，推荐）
   - 1 = 指数（更平滑，但小半径易过平）

---

## 📊 参数速查表

| 参数 | 初始值 | 范围 | 作用 | 优先级 |
|------|--------|------|------|--------|
| `HIT_EPS` | **1e-4** | 1e-5~1e-2 | 命中阈值 | ⭐⭐⭐ |
| `NORMAL_EPS` | **4e-4** | 2e-4~8e-4 | 法线差分步长（2-4倍HIT_EPS）| ⭐⭐⭐ |
| `MIN_STEP` | **1e-3** | 5e-4~2e-3 | 步进下限（防蜗牛走）| ⭐⭐ |
| `MAX_STEP` | **0.5** | 0.3~1.0 | 步进上限（防过步）| ⭐⭐ |
| `uBlendK` | **0.5** | 0.2-0.8 | Smooth union 融合宽度 | ⭐⭐⭐ |
| `grainPow` | **8.0** | 6.0-10.0 | 噪声颗粒化程度 | ⭐⭐⭐ |
| `noiseScale` | **5.0** | 2.0-10.0 | 噪声频率 | ⭐⭐ |
| `fresnelPow` | **2.0** | 1.5-3.0 | 边缘透明度 | ⭐ |
| `alpha range` | **0.9-0.3** | 0.95-0.2 | 中心-边缘不透明度 | ⭐ |

---

## 📈 性能监控（可选，建议添加）

在 Fragment Shader 中添加性能统计：

```glsl
#if DEBUG_PERF
  // 在 main() 的步进循环中
  int stepCount = 0;
  for (int i = 0; i < u_max_steps; ++i) {
    stepCount++;
    // ... 步进逻辑
  }

  // 在 JavaScript 中收集统计
  // 每100帧输出一次平均步数和命中率
#endif
```

在 TypeScript 中添加统计收集：

```typescript
// 在组件中添加性能计数器
const perfStats = useRef({
  frameCount: 0,
  totalSteps: 0,
  missCount: 0
});

// 在渲染循环中（可选）
useEffect(() => {
  const interval = setInterval(() => {
    const stats = perfStats.current;
    if (stats.frameCount > 0) {
      const avgSteps = stats.totalSteps / stats.frameCount;
      const missRate = stats.missCount / stats.frameCount;
      console.log(`[Perf] Avg steps: ${avgSteps.toFixed(1)}, Miss rate: ${(missRate * 100).toFixed(1)}%`);

      // 重置计数器
      stats.frameCount = 0;
      stats.totalSteps = 0;
      stats.missCount = 0;
    }
  }, 5000); // 每5秒输出一次

  return () => clearInterval(interval);
}, []);
```

**监控指标**：
- 平均步数：应该 < 32（最优），< 64（可接受）
- Miss 率：应该 < 5%（表面完整）
- 帧时：< 16.7ms（60fps），< 33.3ms（30fps可接受）

---

## ✅ 完成清单

### 核心功能
- [ ] SDF 场函数替换完成
- [ ] Sphere tracing 步进正常
- [ ] 法线计算稳定
- [ ] Lambert 光照正常
- [ ] 磨砂质感（view-space 噪声）
- [ ] 边缘透明度（Fresnel）

### 质量验收
- [ ] 无点状环带
- [ ] 边界清晰
- [ ] 磨砂颗粒稳定
- [ ] 融合自然
- [ ] 背景透过

### 性能与集成
- [ ] FPS ≥ 30（1080p，10 个球）
- [ ] ChatUI 联动正常（fork/merge/combine）
- [ ] UI 参数控制正常

### 可选优化
- [ ] 升级到 FBM 噪声
- [ ] 添加精化步骤
- [ ] 半分辨率渲染
- [ ] 空间加速结构

---

## 🎯 下一步行动

**立即开始**：
1. ✅ 阅读本 TODO 文档
2. ⏭️ 执行 Step 0（备份代码）
3. ⏭️ 按顺序执行 Step 1-5
4. ⏭️ 每个 Step 完成后验证
5. ⏭️ 遇到问题查阅故障排除章节

**预计时间线**：
- Step 1-2: 1 小时（场函数 + 步进）
- Step 3: 30 分钟（法线 + 光照）
- Step 4: 1 小时（磨砂质感，含调优）
- Step 5: 30 分钟（边缘透明）
- Step 6: 30 分钟（UI 控制）
- **总计**: 3-4 小时

**风险提示**：
- 噪声绑定到错误空间域（view-space vs world-space）是最常见的失败原因
- 每个 Step 必须验证通过再继续，避免问题累积

---

## 📝 备注

- 本文档基于 `RAYMARCHING_INTEGRATION_PLAN.md` Phase 6 章节
- 参考实现：`ref/Shader3/spCode.js`
- 当前代码：`src/components/MetaCanvas.tsx`
- 如遇到文档未覆盖的问题，参考整合计划的故障排除指南（642-716 行）

---

## ⚠️ 关键风险与缓解策略

### 🔴 高风险项（必须正确）

| 风险 | 后果 | 缓解策略 | 验证方法 |
|------|------|---------|---------|
| **噪声绑定到 world-space** | 云雾感，质感错误 | ✅ 必须用 `rd`（view-space） | 视线移动时颗粒变化，但同视角稳定 |
| **两个 epsilon 共用** | 法线抖动/黑洞 | ✅ NORMAL_EPS = 2-4 * HIT_EPS | 输出法线颜色，检查无跳变 |
| **缺少步进护栏** | 薄壳断裂/蜗牛走 | ✅ clamp(d, MIN_STEP, MAX_STEP) | 掠射角处无点状，性能正常 |

### 🟡 中风险项（可能踩坑）

| 风险 | 后果 | 缓解策略 |
|------|------|---------|
| smooth-union 类型不匹配 | 融合不自然 | 保留双开关（多项式 vs 指数）|
| 命中阈值太严格 | Miss 率高 | 先用 HIT_EPS=1e-3，再逐步降低 |
| 性能瓶颈 | FPS < 30 | 先降步数，再降分辨率 |

### 🟢 低风险项（易解决）

- 边缘透明度不合适 → 调整 Fresnel 幂次
- 颗粒过粗/过细 → 调整 grainPow 和 noiseScale
- 融合宽度不理想 → 调整 blendK

---

## 🎓 实施建议（经验总结）

### 1. 渐进式验证（必须！）

```
Step 0 → Step 1 → Step 2（洋红球） → Step 3（白色光照球） → Step 4（磨砂球） → Step 5（半透明球）
   ↓        ↓          ↓                  ↓                    ↓                 ↓
  开关    场函数      命中稳定            法线正确             质感到位           完成
```

**每个箭头都必须验证通过再继续**，否则问题会累积难以定位。

### 2. 最小回滚单位

每个 Step 完成后立即 git commit：
```bash
git add .
git commit -m "Phase 6 Step X: [功能描述]"
```

出问题时可快速回退到上一个稳定状态。

### 3. 调试优先级

遇到问题时的排查顺序：

1. **先检查开关**（USE_SDF_METHOD, NOISE_SPACE 等）
2. **再检查常量**（HIT_EPS, NORMAL_EPS, MIN_STEP, MAX_STEP）
3. **输出调试颜色**：
   - 命中：洋红色 `vec4(1, 0, 1, 1)`
   - 法线：`vec4(n * 0.5 + 0.5, 1)`
   - 距离场：`vec4(vec3(d), 1)` （灰度）
4. **检查 uniform 传递**（Console 输出值）
5. **最后调整参数**（blendK, grainPow 等）

### 4. 参数调优顺序

**不要一次性调所有参数！** 按优先级逐个调：

```
命中稳定（HIT_EPS, MIN/MAX_STEP）
  ↓
法线正确（NORMAL_EPS）
  ↓
融合自然（blendK, SMOOTH_UNION_TYPE）
  ↓
磨砂质感（grainPow, noiseScale）
  ↓
边缘透明（fresnelPow, alpha range）
```

### 5. 性能优化策略

**优化时机**：功能全部完成后再优化（过早优化是万恶之源）

**优化顺序**：
1. 降低步数（maxSteps: 256 → 128 → 64）
2. 降低分辨率（renderScale: 1.0 → 0.75 → 0.5）
3. 优化 AABB（收紧包围体）
4. 空间加速（网格/八叉树，复杂度高）

---

## 🚀 立即行动（开始实施）

### 准备清单（开始前确认）

- [ ] 已阅读完整 TODO 文档
- [ ] 已阅读 `RAYMARCHING_INTEGRATION_PLAN.md` Phase 6 章节
- [ ] 已查看 `ref/Shader3/spCode.js` 参考代码
- [ ] 已备份当前代码（git commit）
- [ ] 开发环境正常（npm run dev 运行正常）
- [ ] 浏览器 Console 已打开（准备查看错误/日志）

### 第一步：添加调试开关（Step 0.3）

打开 `src/components/MetaCanvas.tsx`，在 Fragment Shader 顶部添加：

```glsl
// ============== 调试开关（便于回滚对比） ==============
#define USE_SDF_METHOD 1        // 先设为 0，验证通过后改为 1
#define SMOOTH_UNION_TYPE 0
#define NOISE_SPACE 0
#define DEBUG_PERF 0

// ============== 常量配置 ==============
const float HIT_EPS = 1e-4;
const float NORMAL_EPS = 4e-4;
const float MIN_STEP = 1e-3;
const float MAX_STEP = 0.5;
```

保存，确认编译通过，然后开始 Step 1。

---

**最后更新**：2025-10-10（补充易错项和实施建议）
**状态**：📄 文档已完成，待实施代码
**责任人**：开发团队
