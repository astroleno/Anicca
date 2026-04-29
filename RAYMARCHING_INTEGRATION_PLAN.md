# Metaball Raymarching 整合计划

## 实施总结（2025-10-10更新）

### ❌ Phase 1-4: 表面Raymarching（势场方法）- 失败
**实施结果**: 出现**"点状环带"**问题（dotted ring bands），无法获得稳定的表面命中。

**根本原因分析**:
- **数学范畴不匹配**: Metaball势场 `f(p) = Σ k/r²` 不是严格的有符号距离场（SDF）
- **步进策略冲突**: 使用了 sphere tracing 的步进逻辑（假设 `|∇d| = 1`），但势场的梯度不均匀
- **过步问题**: 在薄壳/掠射区域，步进容易跨过等值面，导致命中率低下
- **精化无效**: 二分/割线精化需要可靠的变号区间，但过步后无法捕获

**尝试的修复**（均未根本解决）:
- 缩小步长（`stepNear = 0.08`）
- 扩大命中阈值（`epsHit = 1e-3~1e-2`）
- Secant 插值精化
- 调整场阈值 `thresholdT`

**结论**: 势场 + sphere tracing = 范式不兼容，需要改变数学模型。

---

### ❌ Phase 5: 体积渲染（Volume Rendering）- 偏离目标
**实施结果**: 避免了"点状环带"，但产生了**"云雾"效果**，与目标的清晰边界+磨砂质感相差较远。

**实现机制**:
- 体积积分: `∫ρ(t) dt` 沿光线累积密度
- 阈值化密度函数: 三段映射（glow区 → 软边区 → 核心区）
- Beer-Lambert前向合成: `α = 1 - exp(-ρ·step)`
- 预乘Alpha输出

**观感问题**:
- ✅ 解决了点状问题（连续积分无需精确命中）
- ❌ 天然的"雾化/云化"效果：
  - World-space 密度累积 → 层云感
  - 缺乏清晰的几何边界
  - 无法产生参考图的"实体+磨砂"质感
- ❌ 背景遮挡严重（即使降低密度系数）

**核心矛盾**:
```
体积渲染 + 平滑场函数 = 云雾效果（当前）
表面检测 + 真SDF = 清晰边界（目标）
```

**结论**: 体积渲染范式本身不适合"清晰实体+磨砂透过感"的目标，需要回归表面方法。

---

### ✅ 新方案: SDF基元 + Smooth Union（待实施）
**核心策略**: 保留metaball的blobby外观，但用**真SDF**的数学实现。

**关键改变**:
| 维度 | 旧方案（势场） | 新方案（SDF） |
|------|---------------|--------------|
| 基元 | 核函数 `k/r²` | 球体SDF `length(p) - r` |
| 融合 | 密度相加 + 阈值 | SDF smooth union (soft-min) |
| 步进 | 易过步的固定步长 | 安全的 sphere tracing |
| 命中 | 需要精确零点 | 保守距离估计 |
| 法线 | 势场梯度（不稳定） | SDF梯度（Lipschitz连续） |

**Smooth Union公式**（产生blobby融合效果）:
```glsl
// Polynomial smooth-min
float smin(float a, float b, float k) {
  float h = max(k - abs(a-b), 0.0) / k;
  return min(a, b) - h*h*k*0.25;
}
```

**优势**:
- ✅ 根治"点状环带"（SDF保证sphere tracing安全性）
- ✅ 保留metaball视觉外观（smooth union视觉等效）
- ✅ 清晰的几何边界（表面命中 + 稳定法线）
- ✅ 适配参考质感（表面着色 + view-space噪声）

---

## 目标（重新定义）
实现类似 `ref/Shader3` 的视觉效果：
- ✅ **Metaball的blobby融合外观**（soft edge, blending bridges）
- ✅ **清晰的实体边界**（不是云雾，有明确轮廓）
- ✅ **磨砂透过质感**（view-space噪声颗粒 + 高伽马）
- ✅ **3D光照和体积感**（法线 + Lambert/AO）
- ✅ **背景可见**（半透明边缘，不完全遮挡ShaderPark背景）

---

## Phase 6: SDF Smooth Union方法（推荐实施）

### 核心思路
将每个metaball源从"势场贡献"改为"SDF球体"，然后用smooth union融合。

### 6.1 SDF场函数（替换势场）

**旧方法**（势场，Phase 1-4）:
```glsl
float fieldRaw(vec3 p) {
  float sum = 0.0;
  for (int i = 0; i < MAX_SOURCES; ++i) {
    if (i >= uSourceCount) break;
    vec3 delta = p - uSourcePos[i];
    float r = length(delta);
    if (r > uRCut * uSourceRad[i]) continue;
    float denom = r * r + uKernelEps;
    sum += uSourceK[i] / denom;  // 势场贡献
  }
  return sum - uThresholdT;  // 找零点
}
```

**新方法**（SDF smooth union）:
```glsl
// SDF平滑最小值（产生融合效果）
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

// 单个球体的SDF（距离场）
float sdSphere(vec3 p, vec3 center, float radius) {
  return length(p - center) - radius;
}

// 多球SDF场（smooth union融合）
float sdfMetaballs(vec3 p) {
  float d = 1e10;  // 初始化为很大的距离

  for (int i = 0; i < MAX_SOURCES; ++i) {
    if (i >= uSourceCount) break;

    float di = sdSphere(p, uSourcePos[i], uSourceRad[i]);

    // 平滑融合（k参数控制融合范围）
    d = smin(d, di, uBlendK);
  }

  return d;  // 返回带符号距离
}
```

**关键参数**:
- `uBlendK`: 融合宽度（0.2-0.8，越大融合越明显）
- 不再需要 `uThresholdT`（SDF的零等值面就是表面）
- 不再需要 `uKernelPow`, `uKernelEps`（势场参数）

### 6.2 Sphere Tracing步进（安全步进）

**旧方法**（固定/自适应步长，易过步）:
```glsl
float t = tNear;
for (int i = 0; i < uMaxSteps; ++i) {
  vec3 p = ro + rd * t;
  float f = fieldRaw(p);
  if (abs(f) < uEpsHit) break;  // 命中检测不可靠
  t += someStep;  // 固定或自适应步长，易跨过表面
}
```

**新方法**（sphere tracing，保守且安全）:
```glsl
float t = tNear;
for (int i = 0; i < uMaxSteps; ++i) {
  if (t > tFar) break;

  vec3 p = ro + rd * t;
  float d = sdfMetaballs(p);  // 距离场

  if (d < uEpsHit) {
    // 命中！可选：二分精化最后几步
    for (int j = 0; j < 3; ++j) {
      t -= d * 0.5;
      p = ro + rd * t;
      d = sdfMetaballs(p);
    }
    return t;
  }

  t += d;  // 安全步进：最多走d距离
}
return -1.0;  // 未命中
```

**优势**:
- ✅ 永远不会过步（SDF保证球内距离 ≤ 实际最短距离）
- ✅ 自动自适应（远处大步，近处小步）
- ✅ 命中稳定（无点状环带）

### 6.3 法线计算（SDF梯度）

```glsl
vec3 sdfNormal(vec3 p) {
  float e = 1e-4;  // 差分步长（可以比势场小很多）
  vec3 n = vec3(
    sdfMetaballs(vec3(p.x + e, p.y, p.z)) - sdfMetaballs(vec3(p.x - e, p.y, p.z)),
    sdfMetaballs(vec3(p.x, p.y + e, p.z)) - sdfMetaballs(vec3(p.x, p.y - e, p.z)),
    sdfMetaballs(vec3(p.x, p.y, p.z + e)) - sdfMetaballs(vec3(p.x, p.y, p.z - e))
  );
  return normalize(n);
}
```

**稳定性**: SDF梯度 Lipschitz连续，不会出现法线跳变或黑洞。

### 6.4 参考质感：磨砂透过感（关键）

**参考ShaderPark的实现机制**:
```glsl
// ShaderPark参考代码的核心
let s = getRayDirection();  // 视线方向（view-space）
let n = sin(fbm(s + vec3(0, 0, -time*.1)) * 2) * .5 + .75;
n = pow(n, vec3(8));  // 高伽马 → 颗粒化
color(n)  // 绑定到表面颜色
```

**在我们的实现中**:
```glsl
void main() {
  // 1. 标准raymarching命中
  vec3 ro, rd;
  makeRay(gl_FragCoord.xy, ro, rd);
  float t = sphereTrace(ro, rd);

  if (t < 0.0) {
    gl_FragColor = vec4(0.0);  // 未命中，透明
    return;
  }

  vec3 p = ro + rd * t;
  vec3 n = sdfNormal(p);

  // 2. 基础光照
  vec3 lightDir = normalize(uLightDir);
  float lambert = max(dot(n, lightDir), 0.0);
  vec3 baseColor = uAlbedo * (uAmbient + (1.0 - uAmbient) * lambert);

  // 3. 磨砂颗粒（关键！）
  // 噪声绑定在**视线方向**，不是world-space
  vec3 s = rd;  // 视线方向（等同于getRayDirection()）
  float noiseVal = simplexNoise3D(s * 5.0 + vec3(0, 0, uTime * 0.1));
  noiseVal = noiseVal * 0.5 + 0.5;  // [0,1]

  // 高伽马颗粒化（pow 6-10）
  float grain = pow(noiseVal, 8.0);

  // 调制表面颜色/粗糙度
  baseColor *= mix(0.8, 1.2, grain);

  // 4. 边缘透明度（Fresnel或距离衰减）
  float fresnel = pow(1.0 - abs(dot(n, -rd)), 2.0);
  float alpha = mix(0.9, 0.3, fresnel);  // 中心不透明，边缘透明

  gl_FragColor = vec4(baseColor, alpha);
}
```

**关键点**:
- ❌ **不要**把噪声喂进体积密度（会云化）
- ✅ **要**把噪声绑定在视线方向 `rd`（view-space）
- ✅ **要**用高伽马 `pow(noise, 8)` 打成颗粒
- ✅ **要**调制表面颜色/粗糙度，不是不透明度

### 6.5 快速改造清单

**Step 1: 替换场函数**
```typescript
// 删除旧的势场uniform
- uThresholdT
- uKernelPow
- uKernelEps

// 添加新的SDF uniform
+ uBlendK: 0.5  // 融合宽度（初始值）
```

**Step 2: 更新shader代码**
```glsl
// 替换 fieldRaw() → sdfMetaballs()
// 替换 raymarch() → sphereTrace()
// 更新 法线计算（可用更小的epsilon）
```

**Step 3: 添加磨砂质感**
```glsl
// 添加 simplexNoise3D() 函数（或用sin/cos简化版）
// 在着色阶段绑定噪声到视线方向
// 应用高伽马 pow(noise, 8)
```

**Step 4: 调整alpha合成**
```glsl
// 边缘用Fresnel或SDF距离调制alpha
// 避免完全遮挡背景
```

### 6.6 参数对照表

| 参数 | 推荐值 | 范围 | 作用 |
|------|--------|------|------|
| `uBlendK` | 0.5 | 0.2-0.8 | Smooth union融合宽度 |
| `uEpsHit` | 1e-4 | 1e-5~1e-3 | 命中阈值（可以更小） |
| `uMaxSteps` | 64 | 32-128 | 最大步数 |
| `grainPow` | 8.0 | 6.0-10.0 | 噪声颗粒化程度 |
| `fresnelPow` | 2.0 | 1.5-3.0 | 边缘透明度 |

---

## Phase 1: 最小验证版本（预计2小时）

### 目标
快速验证骨架代码能否在当前环境运行，看到场强灰度图。

### 步骤

#### 1.1 添加新的Fragment Shader
```typescript
// src/components/MetaCanvas.tsx
// 在createMinimalRendererFromString函数中

const fragmentShaderSourceRaymarch = `
  precision highp float;

  // [粘贴完整的骨架代码]
  // ...
`;

// 替换原有的fragmentShaderSource
```

#### 1.2 设置固定正交相机
```typescript
// 简单的俯视相机看XY平面
const cameraConfig = {
  pos: new Float32Array([0, 0, 5]),      // 相机在Z=5处
  dir: new Float32Array([0, 0, -1]),     // 朝-Z看
  right: new Float32Array([1, 0, 0]),    // X轴右
  up: new Float32Array([0, 1, 0]),       // Y轴上
  fovY: Math.PI / 4                      // 45度视角
};
```

#### 1.3 转换坐标系统
```typescript
// sources从2D屏幕空间[0,1]转为3D世界空间[-2,2]
const sources3D = sources.map(s => {
  const x = (s.pos[0] - 0.5) * 4.0;  // [0,1] -> [-2,2]
  const y = (s.pos[1] - 0.5) * 4.0;
  const z = 0.0;                      // 固定在Z=0平面
  return { x, y, z };
});
```

#### 1.4 添加所有必需的Uniform
```typescript
// 在render()函数中获取uniform locations
const uniformLocations = {
  // 相机
  uCamPos: gl.getUniformLocation(program, 'uCamPos'),
  uCamDir: gl.getUniformLocation(program, 'uCamDir'),
  uCamRight: gl.getUniformLocation(program, 'uCamRight'),
  uCamUp: gl.getUniformLocation(program, 'uCamUp'),
  uFovY: gl.getUniformLocation(program, 'uFovY'),

  // 包围体
  uBoundsMin: gl.getUniformLocation(program, 'uBoundsMin'),
  uBoundsMax: gl.getUniformLocation(program, 'uBoundsMax'),

  // 场参数
  uSourceCount: gl.getUniformLocation(program, 'uSourceCount'),
  uThresholdT: gl.getUniformLocation(program, 'uThresholdT'),
  uRCut: gl.getUniformLocation(program, 'uRCut'),
  uKernelEps: gl.getUniformLocation(program, 'uKernelEps'),
  uKernelPow: gl.getUniformLocation(program, 'uKernelPow'),

  // 步进参数
  uStepFar: gl.getUniformLocation(program, 'uStepFar'),
  uStepNear: gl.getUniformLocation(program, 'uStepNear'),
  uFGate: gl.getUniformLocation(program, 'uFGate'),
  uEpsHit: gl.getUniformLocation(program, 'uEpsHit'),
  uMaxSteps: gl.getUniformLocation(program, 'uMaxSteps'),

  // 光照
  uLightDir: gl.getUniformLocation(program, 'uLightDir'),
  uAlbedo: gl.getUniformLocation(program, 'uAlbedo'),
  uAmbient: gl.getUniformLocation(program, 'uAmbient'),

  // 调试
  uDebugView: gl.getUniformLocation(program, 'uDebugView')
};
```

#### 1.5 初始参数配置（起跑基线）
```typescript
const raymarchParams = {
  // 场参数
  thresholdT: 1.0,        // 等值面阈值（0.8-1.2扫描）
  rCut: 2.5,              // 截断半径
  kernelEps: 1e-3,        // 核epsilon
  kernelPow: 2.0,         // 核幂次

  // 步进参数
  stepFar: 1.0,           // 远场步长
  stepNear: 0.08,         // 近场步长
  fGate: 0.3,             // 近场门限
  epsHit: 1e-3,           // 命中阈值
  maxSteps: 64,           // 最大步数

  // 光照参数
  lightDir: [0.4, 0.7, 0.2],      // 光方向（未归一化）
  albedo: [0.92, 0.93, 0.94],     // 基础反射率
  ambient: 0.25,                   // 环境光

  // 调试
  debugView: 1  // 0=光照 1=场强 2=命中 3=法线
};
```

#### 1.6 计算AABB包围体
```typescript
function computeAABB(sources3D: Array<{x,y,z}>, radii: number[], rCut: number) {
  let bmin = [Infinity, Infinity, Infinity];
  let bmax = [-Infinity, -Infinity, -Infinity];

  sources3D.forEach((src, i) => {
    const r = rCut * Math.max(radii[i], 1e-6);
    bmin[0] = Math.min(bmin[0], src.x - r);
    bmin[1] = Math.min(bmin[1], src.y - r);
    bmin[2] = Math.min(bmin[2], src.z - r);
    bmax[0] = Math.max(bmax[0], src.x + r);
    bmax[1] = Math.max(bmax[1], src.y + r);
    bmax[2] = Math.max(bmax[2], src.z + r);
  });

  return { bmin, bmax };
}
```

#### 1.7 设置所有Uniform值
```typescript
// 在render()中
if (uniformLocations.uCamPos) {
  gl.uniform3fv(uniformLocations.uCamPos, cameraConfig.pos);
}
if (uniformLocations.uCamDir) {
  gl.uniform3fv(uniformLocations.uCamDir, cameraConfig.dir);
}
// ... 设置所有其他uniform

// Sources数组（需要改为3D）
for (let i = 0; i < sourceCount; i++) {
  const posLoc = gl.getUniformLocation(program, `uSourcePos[${i}]`);
  const radLoc = gl.getUniformLocation(program, `uSourceRad[${i}]`);
  const kLoc = gl.getUniformLocation(program, `uSourceK[${i}]`);

  if (posLoc) gl.uniform3f(posLoc, sources3D[i].x, sources3D[i].y, sources3D[i].z);
  if (radLoc) gl.uniform1f(radLoc, radii[i]);
  if (kLoc) gl.uniform1f(kLoc, 1.0);
}
```

### 验证点1：场强灰度图

**操作：** 设置 `debugView = 1`

**期望结果：**
- 看到灰色/白色的圆形区域
- 中心亮（场强高），边缘暗（场强低）
- 多个球靠近时，中间区域更亮（场强叠加）

**如果看不到：**
1. 检查console是否有shader编译错误
2. 检查AABB是否包含相机射线
3. 临时输出固定颜色验证shader在运行

---

## Phase 2: 调试渲染管线（预计1-2小时）

### 2.1 验证命中检测

**操作：** 设置 `debugView = 2`

**期望结果：**
- 看到洋红色（magenta）的圆形区域
- 对应metaball的位置
- 边界清晰可见

**如果不命中：**
- 降低 `thresholdT` （从1.0降到0.5试试）
- 增加 `maxSteps` （从64增到128）
- 检查 `uEpsHit` 是否太小（改为1e-2试试）

### 2.2 验证法线计算

**操作：** 设置 `debugView = 3`

**期望结果：**
- 看到彩色的球体
- 法线指向不同方向显示为不同颜色
- 边缘平滑过渡

**如果法线异常：**
- 检查差分步长 `e` 是否合适
- 尝试切换四面体/中心差分（注释/取消注释 `USE_TETRA_NORMAL`）

### 2.3 开启光照

**操作：** 设置 `debugView = 0`

**期望结果：**
- 看到有明暗变化的白色球体
- 光照来自 `lightDir` 方向
- 有体积感和深度感

**如果光照异常：**
- 调整 `lightDir` 方向
- 调整 `ambient` 环境光强度（0.1-0.4）
- 检查法线是否已归一化

---

## Phase 3: 参数调优（预计1小时）

### 3.1 形态调优

#### thresholdT（等值面阈值）
```typescript
// 扫描范围：0.8 - 1.2，步长0.05
thresholdT = 0.8;  // 更"鼓"，连接桥明显
thresholdT = 1.0;  // 平衡
thresholdT = 1.2;  // 更"瘦"，分离清晰
```

**观察：**
- 值越小，球越容易融合
- 值越大，球更独立

#### rCut（截断半径）
```typescript
rCut = 2.0;  // 更局部化，连接范围小
rCut = 2.5;  // 平衡
rCut = 3.0;  // 更远距离影响
```

**权衡：**
- 越大：融合效果越好，但性能越差
- 越小：性能更好，但连接不明显

### 3.2 质感调优

#### kernelPow（核幂次）
```typescript
kernelPow = 1.5;  // 更柔和的衰减
kernelPow = 2.0;  // 标准（推荐）
kernelPow = 2.5;  // 更陡峭的衰减
```

#### albedo（基础颜色）
```typescript
albedo = [0.92, 0.93, 0.94];  // 冷白色
albedo = [0.95, 0.94, 0.92];  // 暖白色
albedo = [0.90, 0.91, 0.93];  // 更灰一些
```

### 3.3 光照调优

#### lightDir（光照方向）
```typescript
// 归一化后传入shader
lightDir = normalize([0.4, 0.7, 0.2]);   // 右上方
lightDir = normalize([-0.5, 0.8, 0.3]);  // 左上方
lightDir = normalize([0, 1, 0]);          // 正上方
```

#### ambient（环境光）
```typescript
ambient = 0.15;  // 暗一些，对比强
ambient = 0.25;  // 平衡（推荐）
ambient = 0.35;  // 亮一些，更柔和
```

---

## Phase 4: 性能优化（可选）

### 4.1 降低步数
```typescript
maxSteps = 64;  // 起点
maxSteps = 48;  // 第一次降低
maxSteps = 32;  // 配合半分辨率
```

**观察：**
- FPS提升
- 是否出现"断层"或"噪点"

### 4.2 调整步长
```typescript
stepFar = 1.2;   // 增大远场步长
stepNear = 0.1;  // 可以略微增大近场步长
```

### 4.3 半分辨率渲染（高级）
```typescript
// 渲染到较小的framebuffer
const renderScale = 0.5;
const fbWidth = Math.floor(canvas.width * renderScale);
const fbHeight = Math.floor(canvas.height * renderScale);

// 创建framebuffer和texture
// 然后上采样到全屏
```

### 4.4 空间加速结构（高级）
```typescript
// 将屏幕分成8x8网格
// 每个格子记录影响它的球的索引
// shader中只遍历当前格子的球

// 实现复杂，收益显著（3-5x）
```

---

## 关键参数速查表

| 参数 | 推荐值 | 范围 | 作用 |
|------|--------|------|------|
| thresholdT | 1.0 | 0.8-1.2 | 等值面阈值，控制融合程度 |
| rCut | 2.5 | 2.0-3.0 | 截断半径，控制影响范围 |
| kernelPow | 2.0 | 1.5-2.5 | 核幂次，控制衰减陡峭度 |
| kernelEps | 1e-3 | 1e-4~1e-2 | 防除零，影响核心区域 |
| stepFar | 1.0 | 0.8-1.5 | 远场步长 |
| stepNear | 0.08 | 0.05-0.15 | 近场步长 |
| fGate | 0.3 | 0.2-0.5 | 近场切换门限 |
| epsHit | 1e-3 | 1e-4~1e-2 | 命中阈值 |
| maxSteps | 64 | 32-128 | 最大步数 |
| ambient | 0.25 | 0.15-0.4 | 环境光强度 |

---

## 故障排除指南

### 问题：全黑屏幕

**可能原因：**
1. Shader编译失败
2. AABB不包含相机射线
3. 所有uniform未正确传递

**排查步骤：**
```typescript
// 1. 检查shader编译
const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
if (!compiled) {
  console.error(gl.getShaderInfoLog(shader));
}

// 2. 输出固定颜色测试
// 在fragment shader最开始加：
// gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); return;

// 3. 检查AABB
console.log('AABB:', bmin, bmax);
console.log('Camera:', cameraConfig.pos);
```

### 问题：场强图可见，但不命中

**可能原因：**
1. thresholdT设置不当
2. 步进参数太保守

**解决方案：**
```typescript
// 降低阈值
thresholdT = 0.5;

// 增加步数
maxSteps = 128;

// 放宽命中容差
epsHit = 1e-2;
```

### 问题：法线异常（全黑或闪烁）

**可能原因：**
1. 差分步长太大或太小
2. 未归一化

**解决方案：**
```glsl
// 检查差分步长
float e = max(1.5 * uEpsHit, 1e-4);

// 确保归一化
vec3 n = normalize(gradient);
if (length(n) < 0.1) n = vec3(0,0,1); // 容错
```

### 问题：性能很差（<15 FPS）

**快速优化：**
```typescript
// 1. 降低步数
maxSteps = 48;

// 2. 减少源数量测试
// 临时只渲染前5个球

// 3. 降低分辨率
canvas.width = window.innerWidth * 0.5;
canvas.height = window.innerHeight * 0.5;
```

---

## 成功标准

### Phase 1 成功标志
- ✅ 看到灰度场强分布
- ✅ Console无shader编译错误
- ✅ 参数改变能影响视觉效果

### Phase 2 成功标志
- ✅ debugView=2 看到洋红命中区域
- ✅ debugView=3 看到彩色法线
- ✅ debugView=0 看到有光照的白色球体

### Phase 3 成功标志
- ✅ 球体有明显的明暗变化
- ✅ 多个球靠近时有连接桥效果
- ✅ 质感接近ShaderPark的模糊弥散效果

### 最终目标
- ✅ 视觉质感类似ref/Shader3
- ✅ 保持metaball的融合连接特性
- ✅ 帧率 >30 FPS（全屏1080p，20个球）
- ✅ UI交互流畅（拖拽、fork/merge）

---

## 时间预算

| Phase | 乐观 | 现实 | 悲观 |
|-------|------|------|------|
| Phase 1 | 1小时 | 2小时 | 4小时 |
| Phase 2 | 0.5小时 | 1.5小时 | 3小时 |
| Phase 3 | 0.5小时 | 1小时 | 2小时 |
| Phase 4 | - | 1小时 | 3小时 |
| **总计** | **2小时** | **5.5小时** | **12小时** |

**建议策略：**
- 先完成Phase 1-2（验证可行性）
- 如果遇到重大阻碍，及时切换回"方案2：简化径向光照"
- Phase 4可以后续迭代优化

---

## 回退方案

如果raymarching遇到无法解决的问题（性能/bug/复杂度），可以回退到：

### 方案2：简化径向光照（30分钟）
```glsl
// 移除噪波，添加径向光照
float centerDist = length(stAspect - sourcePos) / sourceRadius;
float fakeLighting = pow(1.0 - smoothstep(0.0, 1.0, centerDist), 1.8);
vec3 color = vec3(0.92, 0.93, 0.94) * (0.6 + 0.4 * fakeLighting);
float alpha = smoothstep(threshold + edgeWidth, threshold - edgeWidth, field);
gl_FragColor = vec4(color, alpha);
```

**优点：**
- 实现简单
- 性能无影响
- 质感比纯白云层好很多

**缺点：**
- 不是真3D光照
- 无法处理遮挡关系
- 没有raymarching的细节

---

## 下一步行动

### 立即开始（选项B：快速验证）

1. **备份当前代码**
   ```bash
   git add .
   git commit -m "backup: before raymarching integration"
   ```

2. **创建实验分支**
   ```bash
   git checkout -b feature/raymarching-metaball
   ```

3. **开始Phase 1.1**
   - 复制骨架shader代码到MetaCanvas.tsx
   - 保留现有代码，先注释掉
   - 逐步替换

4. **设置验证点**
   - Phase 1 完成后提交
   - Phase 2 完成后提交
   - 便于回退

---

## 参考资料

### 骨架代码位置
- 完整GLSL代码：见之前的对话记录
- 包含：AABB裁剪、两段步进、二分精化、四面体法线、Lambert光照

### 关键概念
- **SDF Raymarching**：沿射线步进寻找等值面
- **Metaball场**：`f(p) = Σ k_i * kernel(r_i) - T`
- **梯度法线**：`n = normalize(∇f)`
- **二分精化**：命中后精确定位等值面

### 优化技术
- **R_cut截断**：忽略远距离贡献
- **两段步进**：远大步，近小步
- **空间加速**：网格/八叉树索引
- **半分辨率**：降低渲染分辨率再上采样

---

## 经验教训总结

### ✅ 正确的方向
1. **范式选择至关重要**: 表面渲染（清晰边界）vs 体积渲染（云雾效果）在根本上决定视觉效果
2. **数学模型必须匹配**: 势场不适合sphere tracing，SDF才是正解
3. **噪声的空间域决定质感**: view-space噪声 = 磨砂表面，world-space噪声 = 云雾体积
4. **参考代码的底层机制需深度理解**: ShaderPark的`blend()`是SDF smooth union，不是密度相加

### ❌ 踩过的坑
1. **过早优化**: Phase 1-4尝试用二分精化、Secant插值等技术，但无法解决范畴不匹配的根本问题
2. **方案切换成本**: 从势场 → 体积渲染 → SDF，每次切换都是大量代码重写
3. **参数调优陷阱**: 在错误的范式下调参数，永远达不到目标效果
4. **视觉参考的表象**: 看到"软边融合"就认为是体积渲染，实际可能是SDF smooth union

### 🎯 关键决策点
- **决策1**: 如果要"清晰实体+磨砂质感" → 必须用表面方法
- **决策2**: 如果要"metaball融合" → 可以用SDF smooth union代替势场
- **决策3**: 如果要"磨砂透过感" → 噪声放在view-space，不是world-space或密度

---

## 下一步行动（Phase 6实施）

### 立即开始

1. **备份当前代码**
   ```bash
   git add .
   git commit -m "Phase 5: volume rendering (cloudy effect, not ideal)"
   ```

2. **实施Phase 6: SDF Smooth Union**
   - 预计时间：3-4小时（核心改造）
   - 按照6.5节的快速改造清单逐步实施
   - 每个子步骤验证通过后再继续

3. **验证点**
   - ✅ SDF场函数返回合理距离值
   - ✅ Sphere tracing稳定命中（无点状）
   - ✅ 法线平滑正确
   - ✅ 基础光照正常
   - ✅ 磨砂颗粒质感出现
   - ✅ 背景透过（边缘半透明）

4. **调优顺序**
   ```
   命中稳定 → 法线正确 → 基础光照 → 磨砂质感 → 边缘透明度 → 整体参数微调
   ```

---

**文档创建时间：** 2025-10-10
**最后更新：** 2025-10-10（Phase 1-5总结 + Phase 6方案）
**状态：** Phase 5完成（体积渲染，云雾效果） | Phase 6待实施（SDF方法，推荐）
**推荐路线：** ✅ Phase 6 (SDF Smooth Union + view-space噪声磨砂质感)
