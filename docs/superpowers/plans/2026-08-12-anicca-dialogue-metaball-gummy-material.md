# Anicca Dialogue Metaball Gummy Material Implementation Plan

> **Superseded in part — 2026-08-13:** The A-model implementation in Task 2 and its Task 3 calibration gate failed visual review and must not be executed, tuned, or treated as the active material direction. They are replaced by `docs/superpowers/specs/2026-08-13-anicca-dialogue-metaball-c-light-design.md`. Task 4–6 remain blocked until a new C-light implementation plan is written and its four-scenario/five-screenshot WebGL gate receives explicit user approval.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (only after the user explicitly authorizes agent use) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已选定的 A 方向中，把 `/dialogue` 当前珍珠/PBR Metaball 改成“近黑舞台上的 QQ 糖实体色场”：轮廓明确但具有 2–5% 的像素尺度 coverage 柔边，内部颜色连续缓慢流动，并完整保留现有 SDF 融合、DOM 交互、reduced-motion 与 WebGL fallback。

**Architecture:** 保留 `branchGraph -> deriveDialogueView -> BubbleStage -> DialogueMetaballLayer -> createDialogueMetaballRenderer` 的现有真相链和 uniform 数据结构。只在 Three.js 全屏 raymarch shader 内替换材质与 coverage：删除镜面高光、Fresnel 珍珠层和宽光晕；先把 `[0, 0.9625]` 的 FBM 归一化到有符号域再生成低频三通道色场；raymarch 同时记录每条射线的最小 SDF 距离，并按物理像素宽度让 alpha 从 0 连续过渡到实体值。节点几何、投影、smooth-min 融合参数、交互语义和图数据不变；微表面扰动会单独降频、降速、降幅，CSS fallback 同步收敛到同一视觉语法。

**Tech Stack:** Next.js 15.5.4, React 18, TypeScript, Three.js 0.181, GLSL SDF/Raymarching, Vitest, Testing Library, production Playwright visual smoke

---

## 已确认的设计基线

### 参考依据

- 用户提供的参考归档：`/Users/aitoshuu/Downloads/sketch1637050 (1).zip`。
- 归档 SHA-256：`aa08498e27e96c9062dec35433f04324f5f45ef9baba5ae75f750db42b13f817`。
- 关键截图 `Screen Shot 2022-09-03 at 7.17.06 PM.png` 为 1298×1298 RGB PNG，SHA-256：`d17146328e0ddba2cc23f89f7ab8e8bb221a7d7fa6504e739d435d155e5ef134`。
- Shader Park 源文件 `spCode.js` SHA-256：`180b4deac6b6961de4f2ec3bc2f7f91aeaad364cd1004fec86bcee9788520d0e`。
- 参考代码的核心是 `sphere()`、`torus()`、`mixGeo(click)`、`blend(.4)` 和一个被鼠标位移的附加 `sphere(.2)`；主体是实体 SDF，不是 alpha 雾团。
- 参考颜色来自三个有偏移的噪声通道，随后执行 `sin(...)*.5+.75` 与 `pow(..., 8)`；参考 runtime 的 `noise()` 与当前 `[0,1]` value-noise 取值域不同，因此只能借鉴结构，不能直接照抄映射常量。
- 参考边界可辨认，只在很窄的范围内柔化；“软”来自平滑几何、连续色场和低对比实体暗边，不来自整层 blur/bloom。

### 当前实现的主要偏差

1. `src/components/dialogue/metaball/shaders.ts` 使用 `diffuse + specular(power 34) + Fresnel`，产生白色镜面热点和珍珠/塑料球读感。
2. `pearlCool/pearlWarm` 只在珍珠色之间混合，色场是材质点缀，不是参考项目那种主导表面的连续多通道颜色。
3. 当前 alpha 基本恒定，边缘由 hard hit/discard 决定；视觉上轮廓硬，但内部又被 PBR 高光强化，缺少“有界限但柔化”的窄边缘。
4. CSS fallback 仍使用顶部白色高光、宽 `blur(16px)` 外晕和多层 inset 阴影，与目标材质不一致。
5. 初版计划把 `[0, 0.9625]` 的正值 FBM 直接送入 `sin(field * 2.0) * 0.5 + 0.75` 再 clamp；10,201 点复算得到三通道同时饱和率 92.81%、平均 RGB 跨度 0.0158，结果会退化成白灰球。
6. 初版计划在 `if (!hit) discard` 后把 alpha 下界设为 0.38；这只能改变实体内部明暗，无法在 antialias 关闭时形成从 0 开始的像素 coverage 柔边。

### 方案选择

采用方案 A：**近黑舞台 + 原生 shader QQ 糖实体色场**。

- 优点：不改变运行时架构、不新增依赖、不会破坏 8 球上限/DPR/融合和交互契约；可直接复用当前高质量 SDF 几何。
- 代价：需要人工视觉验收，Vitest 只能保护 shader 结构，不能证明像素审美。

不采用以下方案：

- **直接引入 Shader Park runtime：** 参考 sketch 的固定几何与 Anicca 的 DOM 投影、多节点语义和 renderer 生命周期不匹配，会引入第二套渲染真相。
- **给当前珍珠材质加整层 blur/bloom：** 会得到 B 方案的雾团效果，丢失 QQ 糖实体边界，且更难保证文字可读性。
- **降低 raymarch 步数复刻 `setMaxIterations(8)`：** Shader Park 的迭代语义不能直接等价到当前 52 步 marcher；粗暴降低会造成漏绘、断桥和不同 DPR 下的不稳定边缘。
- **继续用法线朝向模拟强 3D 暗边：** 会把目标重新推回“暗场软球”；本方案只保留 14% 以内的无方向性体积压暗，轮廓 softness 由最小 SDF 距离 coverage 承担。

## 不变项与非目标

- 不修改 `src/components/dialogue/metaball/model.ts` 的节点排序、半径、语义色和 emphasis 数据。
- 不修改 `DIALOGUE_METABALL_SMOOTHNESS = 0.055`；先把材质与轮廓问题独立解决，避免把融合颈部和材质同时调参。
- 节点中心、半径、smooth-min 几何与融合阈值不变；`disturbance` 的频率、速度、振幅会调整，因此文档不再声称“全部几何不变”。
- 不修改 `BubbleStage.tsx` 的 DOM button、文字、点击、拖拽、键盘、无障碍与图语义。
- 不修改 dark stage 为参考项目的浅色背景；目标是“参考材质在现有产品舞台中的适配”，不是逐像素复制参考构图。
- 不新增后处理 pass、runtime 贴图或 npm 依赖。
- 外部参考原图在未确认再分发许可前不提交到仓库；提交可复核的 hash manifest，并由单状态原型生成项目自有的校准截图。
- 不重写历史 closeout/implementation 文档；只更新 README 中描述当前产品状态的文字。

## 视觉验收标准

1. 单球在 100% 缩放下有连续、明确的外轮廓；柔化带约占球半径的 2%–5%，不能形成宽雾圈。
2. 球内出现至少两个宽尺度色区，颜色连续过渡；色场缓慢漂移，但轮廓不能随高频噪声抖动。
3. 不出现白色镜面热点、金属 Fresnel 边或“被摄影棚灯照亮”的 PBR 球感；A 指近黑舞台与克制感，不代表保留珍珠照明。
4. alpha 必须从轮廓外的 0 连续过渡到实体值；内部只允许轻微、无方向性的体积压暗，读感是软糖实体而不是强 3D 灯光球或光晕。
5. 两球靠近时仍形成连续液桥，拉远后干净分离；融合不创建或删除 graph node/edge。
6. 黑色舞台上仍能看清 thesis/antithesis/user 的语义差异，但语义色是色场偏置，不是整球单一染色。
7. reduced-motion 固定 `uTime = 0`，画面在 500ms 对比中完全不变；DOM 拖拽引起的几何更新仍可发生。
8. WebGL fallback 使用同样的窄柔边、无白色热点、弱外晕视觉语法。
9. 在 `uTime = 0、15、30、60、120s` 五个时间点分别执行 10,201 点色场审计；每个时间点都满足三通道同时饱和率 `< 1%`、平均 RGB 跨度 `> 0.1`、跨度 `>= 0.1` 的彩色点比例 `> 40%`。
10. 独立单状态 shader 的 reduced-motion 静态图与正常运动动态图都由用户确认后，才允许继续 CSS fallback、完整交互证据和 README 收尾。

## 文件职责

| 文件 | 本计划中的职责 |
| --- | --- |
| `docs/references/metaball-gummy/REFERENCE.md` | 固化归档、截图与 shader 源文件 hash、尺寸、使用边界和目标语义 |
| `docs/references/metaball-gummy/approved-calibration-static.png` | 用户确认后的 reduced-motion 单状态材质基线 |
| `docs/references/metaball-gummy/approved-calibration-animated.png` | 用户确认后的正常运动单状态材质基线 |
| `src/components/dialogue/metaball/material-config.json` | shader、数值审计与 coverage 测试共享的唯一材质参数源 |
| `src/components/dialogue/metaball/shaders.ts` | 保留 SDF/raymarch，替换珍珠 PBR 为 gummy chromatic field 与窄柔边 |
| `src/components/dialogue/metaball/renderer.test.ts` | 锁定色场范围、minimum-distance coverage 和禁止珍珠高光回归 |
| `src/components/dialogue/DialogueShell.module.css` | 让 WebGL fallback 与 gummy 材质共享同一边缘/高光语法 |
| `scripts/visual-smoke/metaball-field-audit.mjs` | 以 GLSL 等价 value-noise/FBM 对 10,201 点执行色域饱和与跨度门禁 |
| `scripts/visual-smoke/dialogue.mjs` | 增加单状态确认门禁与分离态证据，继续保护融合、reduced-motion、fallback 与图不变性 |
| `README.md` | 把当前 renderer 描述从“珍珠质感”更新为“软糖色场” |

---

### Task 0: 固化参考身份与使用边界

**Files:**
- Create: `docs/references/metaball-gummy/REFERENCE.md`

- [ ] **Step 1: 创建可跨机器核验的 reference manifest**

创建以下文档；不复制或提交外部 PNG 本体：

```markdown
# Metaball Gummy Material Reference

## Source identity

- Archive filename: `sketch1637050 (1).zip`
- Archive SHA-256: `aa08498e27e96c9062dec35433f04324f5f45ef9baba5ae75f750db42b13f817`
- Key image: `Screen Shot 2022-09-03 at 7.17.06 PM.png`
- Key image dimensions: 1298×1298 RGB PNG
- Key image SHA-256: `d17146328e0ddba2cc23f89f7ab8e8bb221a7d7fa6504e739d435d155e5ef134`
- Shader source: `spCode.js`
- Shader source SHA-256: `180b4deac6b6961de4f2ec3bc2f7f91aeaad364cd1004fec86bcee9788520d0e`

## Durable interpretation

- Product direction: A — near-black Anicca stage.
- Material direction: bounded QQ-gummy entity, not a fog field.
- Edge: visible silhouette with a narrow 2–5% coverage transition.
- Interior: broad, continuous, slowly drifting chromatic regions.
- Lighting: no white photographic hotspot, metallic rim, pearl Fresnel, or bloom halo.
- Geometry: retain Anicca DOM projection and smooth-min fusion; do not import Shader Park runtime.

## Usage boundary

The external reference image is not committed or bundled because redistribution permission has not been established. A matching archive can be verified by the hashes above. Project-owned calibration screenshots generated by Anicca may be committed as implementation evidence.

After user approval, the durable project-owned baselines live at `docs/references/metaball-gummy/approved-calibration-static.png` and `docs/references/metaball-gummy/approved-calibration-animated.png`.
```

- [ ] **Step 2: 核验本机参考身份**

Run:

```bash
shasum -a 256 '/Users/aitoshuu/Downloads/sketch1637050 (1).zip'
```

Expected:

```text
aa08498e27e96c9062dec35433f04324f5f45ef9baba5ae75f750db42b13f817  /Users/aitoshuu/Downloads/sketch1637050 (1).zip
```

若文件不在该路径，只允许使用 SHA-256 完全相同的归档继续视觉校准；不得用同名但 hash 不同的文件替代。

- [ ] **Step 3: 提交 reference manifest**

```bash
git add docs/references/metaball-gummy/REFERENCE.md
git commit -m "docs(dialogue): pin gummy metaball reference identity"
```

---

### Task 1: 先锁定色场分布与 coverage shader 合同

**Files:**
- Create: `src/components/dialogue/metaball/material-config.json`
- Modify: `src/components/dialogue/metaball/renderer.test.ts:110-128`
- Create: `scripts/visual-smoke/metaball-field-audit.mjs`
- Test: `src/components/dialogue/metaball/renderer.test.ts`

- [ ] **Step 1: 创建 shader、审计与测试共享的唯一材质参数源**

创建 `src/components/dialogue/metaball/material-config.json`：

```json
{
  "fbmMaxAmplitude": 0.9625,
  "fieldSpatialScale": 1.65,
  "fieldOrbitRadius": 0.12,
  "fieldOrbitSpeed": 0.08,
  "channelOffset": 0.11,
  "fieldSineScale": 1.7,
  "fieldSineAmplitude": 0.36,
  "fieldSineBias": 0.62,
  "fieldExponent": 2.4,
  "surfaceSpatialScale": 1.35,
  "surfaceTimeScale": 0.01,
  "surfaceDisplacement": 0.0035,
  "coverageInnerPixels": 0.25,
  "coverageOuterPixels": 2.25,
  "marchMinStepPixels": 0.45,
  "softVolumeMin": 0.86,
  "softVolumePower": 0.55,
  "semanticMix": 0.26,
  "emphasisBrightnessMin": 0.82,
  "solidAlphaMin": 0.84,
  "solidAlphaMax": 0.94,
  "auditTimesSeconds": [0, 15, 30, 60, 120]
}
```

约束：`shaders.ts`、`renderer.test.ts` 和 `metaball-field-audit.mjs` 都必须读取该 JSON；不得在任一文件维护第二套材质数字。合同测试必须遍历 JSON 到全部 GLSL 常量的映射并自动比对最终 shader 字符串，不能只抽查一两个字段。

- [ ] **Step 2: 把现有 fixed shader contract 测试扩展为共享参数、色场和 coverage 曲线合同**

在 `renderer.test.ts` 顶部加入：

```ts
import materialConfig from "./material-config.json";
```

在 `describe` 前加入 GLSL `smoothstep` 等价函数：

```ts
function smoothstep(edge0: number, edge1: number, value: number) {
  const normalized = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return normalized * normalized * (3 - 2 * normalized);
}

function alphaAtBackingPixelDistance(
  distancePixels: number,
  pixelRatio: number,
  emphasis: number
) {
  const resolutionHeight = 600 * pixelRatio;
  const pixelWidth = 1 / resolutionHeight;
  const minimumDistance = distancePixels / resolutionHeight;
  const coverage =
    1 -
    smoothstep(
      pixelWidth * materialConfig.coverageInnerPixels,
      pixelWidth * materialConfig.coverageOuterPixels,
      minimumDistance
    );
  const solidAlpha =
    materialConfig.solidAlphaMin +
    (materialConfig.solidAlphaMax - materialConfig.solidAlphaMin) * emphasis;
  return solidAlpha * coverage;
}
```

将 `ships the fixed raymarching shader contract` 测试替换为以下两个测试：

```ts
it("ships the bounded gummy-field and minimum-distance coverage contract", () => {
  const materialConstants = [
    ["FBM_MAX_AMPLITUDE", materialConfig.fbmMaxAmplitude],
    ["FIELD_SPATIAL_SCALE", materialConfig.fieldSpatialScale],
    ["FIELD_ORBIT_RADIUS", materialConfig.fieldOrbitRadius],
    ["FIELD_ORBIT_SPEED", materialConfig.fieldOrbitSpeed],
    ["CHANNEL_OFFSET", materialConfig.channelOffset],
    ["FIELD_SINE_SCALE", materialConfig.fieldSineScale],
    ["FIELD_SINE_AMPLITUDE", materialConfig.fieldSineAmplitude],
    ["FIELD_SINE_BIAS", materialConfig.fieldSineBias],
    ["FIELD_EXPONENT", materialConfig.fieldExponent],
    ["SURFACE_SPATIAL_SCALE", materialConfig.surfaceSpatialScale],
    ["SURFACE_TIME_SCALE", materialConfig.surfaceTimeScale],
    ["SURFACE_DISPLACEMENT", materialConfig.surfaceDisplacement],
    ["COVERAGE_INNER_PIXELS", materialConfig.coverageInnerPixels],
    ["COVERAGE_OUTER_PIXELS", materialConfig.coverageOuterPixels],
    ["MARCH_MIN_STEP_PIXELS", materialConfig.marchMinStepPixels],
    ["SOFT_VOLUME_MIN", materialConfig.softVolumeMin],
    ["SOFT_VOLUME_POWER", materialConfig.softVolumePower],
    ["SEMANTIC_MIX", materialConfig.semanticMix],
    ["EMPHASIS_BRIGHTNESS_MIN", materialConfig.emphasisBrightnessMin],
    ["SOLID_ALPHA_MIN", materialConfig.solidAlphaMin],
    ["SOLID_ALPHA_MAX", materialConfig.solidAlphaMax]
  ] as const;

  for (const [shaderName, value] of materialConstants) {
    const glslValue = Number.isInteger(value) ? `${value}.0` : String(value);
    expect(DIALOGUE_METABALL_FRAGMENT_SHADER).toContain(
      `const float ${shaderName} = ${glslValue};`
    );
  }

  expect(DIALOGUE_METABALL_VERTEX_SHADER).toContain("gl_Position");
  expect(DIALOGUE_METABALL_FRAGMENT_SHADER).toContain("#define MAX_METABALLS 8");
  expect(DIALOGUE_METABALL_FRAGMENT_SHADER).toContain("#define MAX_STEPS 52");
  expect(DIALOGUE_METABALL_FRAGMENT_SHADER).toContain("float sphereSdf");
  expect(DIALOGUE_METABALL_FRAGMENT_SHADER).toContain("float smin");
  expect(DIALOGUE_METABALL_FRAGMENT_SHADER).toContain("vec3 chromaticField");
  expect(DIALOGUE_METABALL_FRAGMENT_SHADER).toContain(
    `sin(signedField * FIELD_SINE_SCALE) * FIELD_SINE_AMPLITUDE + FIELD_SINE_BIAS`
  );
  expect(DIALOGUE_METABALL_FRAGMENT_SHADER).toContain("vec2 temporalOffset");
  expect(DIALOGUE_METABALL_FRAGMENT_SHADER).toContain("float minimumDistance");
  expect(DIALOGUE_METABALL_FRAGMENT_SHADER).toContain(
    "float pixelWidth = 1.0 / uResolution.y"
  );
  expect(DIALOGUE_METABALL_FRAGMENT_SHADER).toContain(
    "pixelWidth * COVERAGE_OUTER_PIXELS"
  );
  expect(DIALOGUE_METABALL_FRAGMENT_SHADER).toContain(
    "if (silhouetteCoverage <= 0.001) discard"
  );
  expect(DIALOGUE_METABALL_FRAGMENT_SHADER).toContain(
    "float alpha = solidAlpha * silhouetteCoverage"
  );
  expect(DIALOGUE_METABALL_FRAGMENT_SHADER).not.toContain("if (!hit) discard");
  expect(DIALOGUE_METABALL_FRAGMENT_SHADER).not.toContain("float specular");
  expect(DIALOGUE_METABALL_FRAGMENT_SHADER).not.toContain("float fresnel");
  expect(DIALOGUE_METABALL_FRAGMENT_SHADER).not.toContain("pearlColor");
});

it.each([0.9, 1, 1.25])(
  "keeps final alpha monotonic at DPR %s",
  (pixelRatio) => {
    for (const emphasis of [0, 1]) {
      const solidAlpha =
        materialConfig.solidAlphaMin +
        (materialConfig.solidAlphaMax - materialConfig.solidAlphaMin) * emphasis;
      const samples = [0.25, 1, 2, 2.25].map((distance) =>
        alphaAtBackingPixelDistance(distance, pixelRatio, emphasis)
      );

      expect(samples[0]).toBeCloseTo(solidAlpha, 6);
      expect(samples[1]).toBeCloseTo(solidAlpha * 0.68359375, 6);
      expect(samples[2]).toBeCloseTo(solidAlpha * 0.04296875, 6);
      expect(samples[3]).toBeCloseTo(0, 6);
      expect(samples).toEqual([...samples].sort((left, right) => right - left));
    }
  }
);
```

- [ ] **Step 3: 创建读取共享 JSON、覆盖五个时间点的色场数值审计**

创建 `scripts/visual-smoke/metaball-field-audit.mjs`：

```js
import { readFile } from "node:fs/promises";

const GRID_SIZE = 101;
const configUrl = new URL(
  "../../src/components/dialogue/metaball/material-config.json",
  import.meta.url
);
const materialConfig = JSON.parse(await readFile(configUrl, "utf8"));
const CHANNEL_OFFSETS = [
  0,
  materialConfig.channelOffset,
  materialConfig.channelOffset * 2
];

const fract = (value) => value - Math.floor(value);
const mix = (left, right, amount) => left * (1 - amount) + right * amount;

function hash31(point) {
  const value = point.map((channel) => fract(channel * 0.1031));
  const dot =
    value[0] * (value[1] + 33.33) +
    value[1] * (value[2] + 33.33) +
    value[2] * (value[0] + 33.33);
  const shifted = value.map((channel) => channel + dot);
  return fract((shifted[0] + shifted[1]) * shifted[2]);
}

function valueNoise(point) {
  const cell = point.map(Math.floor);
  const local = point.map(fract);
  const smoothLocal = local.map((value) => value * value * (3 - 2 * value));
  const sample = (x, y, z) => hash31([cell[0] + x, cell[1] + y, cell[2] + z]);
  const nx00 = mix(sample(0, 0, 0), sample(1, 0, 0), smoothLocal[0]);
  const nx10 = mix(sample(0, 1, 0), sample(1, 1, 0), smoothLocal[0]);
  const nx01 = mix(sample(0, 0, 1), sample(1, 0, 1), smoothLocal[0]);
  const nx11 = mix(sample(0, 1, 1), sample(1, 1, 1), smoothLocal[0]);
  const nxy0 = mix(nx00, nx10, smoothLocal[1]);
  const nxy1 = mix(nx01, nx11, smoothLocal[1]);
  return mix(nxy0, nxy1, smoothLocal[2]);
}

function fbm(point) {
  let value = 0;
  let amplitude = 0.55;
  let samplePoint = [...point];
  for (let octave = 0; octave < 3; octave += 1) {
    value += valueNoise(samplePoint) * amplitude;
    samplePoint = [
      samplePoint[0] * 2.03 + 17.1,
      samplePoint[1] * 2.03 + 9.2,
      samplePoint[2] * 2.03 + 13.7
    ];
    amplitude *= 0.5;
  }
  return value;
}

function mapChannel(value) {
  const signed =
    Math.min(1, Math.max(0, value / materialConfig.fbmMaxAmplitude)) * 2 - 1;
  const field =
    Math.sin(signed * materialConfig.fieldSineScale) *
      materialConfig.fieldSineAmplitude +
    materialConfig.fieldSineBias;
  return Math.pow(
    Math.min(1, Math.max(0, field)),
    materialConfig.fieldExponent
  );
}

function auditAtTime(timeSeconds) {
  const phase = timeSeconds * materialConfig.fieldOrbitSpeed;
  const temporalOffset = [
    Math.cos(phase) * materialConfig.fieldOrbitRadius,
    Math.sin(phase) * materialConfig.fieldOrbitRadius
  ];
  let tripleSaturated = 0;
  let colorful = 0;
  let totalSpan = 0;
  let sampleCount = 0;

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const stagePoint = [
        -1 + (2 * x) / (GRID_SIZE - 1),
        -1 + (2 * y) / (GRID_SIZE - 1)
      ];
      const rgb = CHANNEL_OFFSETS.map((offset) =>
        mapChannel(
          fbm([
            (stagePoint[0] + temporalOffset[0]) * materialConfig.fieldSpatialScale +
              offset,
            (stagePoint[1] + temporalOffset[1]) * materialConfig.fieldSpatialScale +
              offset,
            offset
          ])
        )
      );
      const span = Math.max(...rgb) - Math.min(...rgb);
      if (rgb.every((channel) => channel >= 0.999)) tripleSaturated += 1;
      if (span >= 0.1) colorful += 1;
      totalSpan += span;
      sampleCount += 1;
    }
  }

  return {
    timeSeconds,
    sampleCount,
    tripleSaturatedPct: (tripleSaturated / sampleCount) * 100,
    meanRgbSpan: totalSpan / sampleCount,
    colorfulPct: (colorful / sampleCount) * 100
  };
}

const results = materialConfig.auditTimesSeconds.map(auditAtTime);
console.log(JSON.stringify(results, null, 2));

for (const metrics of results) {
  if (
    metrics.tripleSaturatedPct >= 1 ||
    metrics.meanRgbSpan <= 0.1 ||
    metrics.colorfulPct <= 40
  ) {
    throw new Error(
      `Metaball color-field audit failed at ${metrics.timeSeconds}s: ${JSON.stringify(metrics)}`
    );
  }
}
```

- [ ] **Step 4: 运行现有测试并确认共享配置与 shader 合同先失败**

Run:

```bash
npx vitest run src/components/dialogue/metaball/renderer.test.ts
```

Expected: FAIL；当前 shader 尚未读取 `material-config.json`，也没有 `FBM_MAX_AMPLITUDE`、bounded temporal orbit、`minimumDistance` 和 minimum-distance coverage，且仍包含 pearl/PBR 字段。

- [ ] **Step 5: 运行五时间点色场审计并确认候选映射通过**

Run:

```bash
node scripts/visual-smoke/metaball-field-audit.mjs
```

Expected: exit 0；输出 0、15、30、60、120 秒五条记录，每条 `sampleCount` 都为 10201、`tripleSaturatedPct` 都为 0；五个时间点的 `meanRgbSpan` 约为 0.128–0.137，`colorfulPct` 约为 55.62%–58.49%，每个时间点分别通过门槛。

---

### Task 2: [SUPERSEDED — DO NOT EXECUTE] 用连续色场和窄柔边替换珍珠 PBR

**Files:**
- Read: `src/components/dialogue/metaball/material-config.json`
- Modify: `src/components/dialogue/metaball/shaders.ts:9-142`
- Test: `src/components/dialogue/metaball/renderer.test.ts`

- [ ] **Step 1: 完整替换 fragment shader，保留既有 uniform 与 SDF 接口**

在 `shaders.ts` 顶部加入共享配置和 GLSL float serializer；保留 `DIALOGUE_METABALL_VERTEX_SHADER`，将 `DIALOGUE_METABALL_FRAGMENT_SHADER` 的字符串整体替换为：

```ts
import materialConfig from "./material-config.json";

function glslFloat(value: number) {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

export const DIALOGUE_METABALL_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

#define MAX_METABALLS 8
#define MAX_STEPS 52

const float FBM_MAX_AMPLITUDE = ${glslFloat(materialConfig.fbmMaxAmplitude)};
const float FIELD_SPATIAL_SCALE = ${glslFloat(materialConfig.fieldSpatialScale)};
const float FIELD_ORBIT_RADIUS = ${glslFloat(materialConfig.fieldOrbitRadius)};
const float FIELD_ORBIT_SPEED = ${glslFloat(materialConfig.fieldOrbitSpeed)};
const float CHANNEL_OFFSET = ${glslFloat(materialConfig.channelOffset)};
const float FIELD_SINE_SCALE = ${glslFloat(materialConfig.fieldSineScale)};
const float FIELD_SINE_AMPLITUDE = ${glslFloat(materialConfig.fieldSineAmplitude)};
const float FIELD_SINE_BIAS = ${glslFloat(materialConfig.fieldSineBias)};
const float FIELD_EXPONENT = ${glslFloat(materialConfig.fieldExponent)};
const float SURFACE_SPATIAL_SCALE = ${glslFloat(materialConfig.surfaceSpatialScale)};
const float SURFACE_TIME_SCALE = ${glslFloat(materialConfig.surfaceTimeScale)};
const float SURFACE_DISPLACEMENT = ${glslFloat(materialConfig.surfaceDisplacement)};
const float COVERAGE_INNER_PIXELS = ${glslFloat(materialConfig.coverageInnerPixels)};
const float COVERAGE_OUTER_PIXELS = ${glslFloat(materialConfig.coverageOuterPixels)};
const float MARCH_MIN_STEP_PIXELS = ${glslFloat(materialConfig.marchMinStepPixels)};
const float SOFT_VOLUME_MIN = ${glslFloat(materialConfig.softVolumeMin)};
const float SOFT_VOLUME_POWER = ${glslFloat(materialConfig.softVolumePower)};
const float SEMANTIC_MIX = ${glslFloat(materialConfig.semanticMix)};
const float EMPHASIS_BRIGHTNESS_MIN = ${glslFloat(materialConfig.emphasisBrightnessMin)};
const float SOLID_ALPHA_MIN = ${glslFloat(materialConfig.solidAlphaMin)};
const float SOLID_ALPHA_MAX = ${glslFloat(materialConfig.solidAlphaMax)};

uniform vec2 uResolution;
uniform float uTime;
uniform float uSmoothness;
uniform int uCount;
uniform vec2 uCenters[MAX_METABALLS];
uniform float uRadii[MAX_METABALLS];
uniform vec3 uColors[MAX_METABALLS];
uniform float uEmphasis[MAX_METABALLS];

varying vec2 vUv;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float valueNoise(vec3 p) {
  vec3 cell = floor(p);
  vec3 local = fract(p);
  vec3 smoothLocal = local * local * (3.0 - 2.0 * local);

  float n000 = hash31(cell + vec3(0.0, 0.0, 0.0));
  float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(cell + vec3(1.0, 1.0, 1.0));

  float nx00 = mix(n000, n100, smoothLocal.x);
  float nx10 = mix(n010, n110, smoothLocal.x);
  float nx01 = mix(n001, n101, smoothLocal.x);
  float nx11 = mix(n011, n111, smoothLocal.x);
  float nxy0 = mix(nx00, nx10, smoothLocal.y);
  float nxy1 = mix(nx01, nx11, smoothLocal.y);
  return mix(nxy0, nxy1, smoothLocal.z);
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.55;
  for (int octave = 0; octave < 3; octave++) {
    value += valueNoise(p) * amplitude;
    p = p * 2.03 + vec3(17.1, 9.2, 13.7);
    amplitude *= 0.5;
  }
  return value;
}

vec3 chromaticField(vec2 p, float time) {
  float phase = time * FIELD_ORBIT_SPEED;
  vec2 temporalOffset = vec2(cos(phase), sin(phase)) * FIELD_ORBIT_RADIUS;
  vec3 samplePoint = vec3((p + temporalOffset) * FIELD_SPATIAL_SCALE, 0.0);
  vec3 field = vec3(
    fbm(samplePoint),
    fbm(samplePoint + vec3(CHANNEL_OFFSET)),
    fbm(samplePoint + vec3(CHANNEL_OFFSET * 2.0))
  );
  vec3 signedField = clamp(field / FBM_MAX_AMPLITUDE, 0.0, 1.0) * 2.0 - 1.0;
  field = sin(signedField * FIELD_SINE_SCALE) * FIELD_SINE_AMPLITUDE + FIELD_SINE_BIAS;
  return pow(clamp(field, 0.0, 1.0), vec3(FIELD_EXPONENT));
}

float sphereSdf(vec3 p, vec3 center, float radius) {
  return length(p - center) - radius;
}

float smin(float a, float b, float k, out float blend) {
  blend = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, blend) - k * blend * (1.0 - blend);
}

float sceneSdf(vec3 p, out vec3 semanticColor, out float emphasis) {
  semanticColor = vec3(0.0);
  emphasis = 0.0;
  float distanceToScene = 10.0;
  float surfaceDrift =
    fbm(p * SURFACE_SPATIAL_SCALE + vec3(0.0, 0.0, uTime * SURFACE_TIME_SCALE)) /
    FBM_MAX_AMPLITUDE;
  float disturbance = (surfaceDrift - 0.5) * SURFACE_DISPLACEMENT;

  for (int index = 0; index < MAX_METABALLS; index++) {
    if (index >= uCount) break;

    float sphereDistance = sphereSdf(p, vec3(uCenters[index], 0.0), uRadii[index]) + disturbance;
    if (index == 0) {
      distanceToScene = sphereDistance;
      semanticColor = uColors[index];
      emphasis = uEmphasis[index];
    } else {
      float blend = 0.0;
      distanceToScene = smin(distanceToScene, sphereDistance, uSmoothness, blend);
      semanticColor = mix(uColors[index], semanticColor, blend);
      emphasis = mix(uEmphasis[index], emphasis, blend);
    }
  }

  return distanceToScene;
}

float sampleDistance(vec3 p) {
  vec3 ignoredColor;
  float ignoredEmphasis;
  return sceneSdf(p, ignoredColor, ignoredEmphasis);
}

vec3 estimateNormal(vec3 p) {
  const float epsilon = 0.0012;
  float centerDistance = sampleDistance(p);
  return normalize(vec3(
    sampleDistance(p + vec3(epsilon, 0.0, 0.0)) - centerDistance,
    sampleDistance(p + vec3(0.0, epsilon, 0.0)) - centerDistance,
    sampleDistance(p + vec3(0.0, 0.0, epsilon)) - centerDistance
  ));
}

void main() {
  if (uCount == 0) discard;

  vec2 stagePoint = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;
  vec3 rayOrigin = vec3(stagePoint, 1.2);
  vec3 rayDirection = vec3(0.0, 0.0, -1.0);
  float pixelWidth = 1.0 / uResolution.y;
  float travel = 0.0;
  float minimumDistance = 10.0;
  vec3 closestPoint = rayOrigin;
  vec3 closestSemanticColor = vec3(0.0);
  float closestEmphasis = 0.0;

  for (int stepIndex = 0; stepIndex < MAX_STEPS; stepIndex++) {
    vec3 samplePoint = rayOrigin + rayDirection * travel;
    vec3 sampleColor = vec3(0.0);
    float sampleEmphasis = 0.0;
    float distanceToScene = sceneSdf(samplePoint, sampleColor, sampleEmphasis);
    float absoluteDistance = abs(distanceToScene);

    if (absoluteDistance < minimumDistance) {
      minimumDistance = absoluteDistance;
      closestPoint = samplePoint;
      closestSemanticColor = sampleColor;
      closestEmphasis = sampleEmphasis;
    }

    if (absoluteDistance < pixelWidth * COVERAGE_INNER_PIXELS) break;
    travel += max(distanceToScene * 0.82, pixelWidth * MARCH_MIN_STEP_PIXELS);
    if (travel > 2.4) break;
  }

  float silhouetteCoverage =
    1.0 - smoothstep(
      pixelWidth * COVERAGE_INNER_PIXELS,
      pixelWidth * COVERAGE_OUTER_PIXELS,
      minimumDistance
    );
  if (silhouetteCoverage <= 0.001) discard;

  vec3 normal = estimateNormal(closestPoint);
  vec3 viewDirection = normalize(rayOrigin - closestPoint);
  float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
  float softVolume = mix(SOFT_VOLUME_MIN, 1.0, pow(facing, SOFT_VOLUME_POWER));

  vec3 fieldColor = chromaticField(stagePoint, uTime);
  vec3 bodyColor = mix(fieldColor, closestSemanticColor, SEMANTIC_MIX);
  bodyColor *= softVolume;
  bodyColor *= mix(EMPHASIS_BRIGHTNESS_MIN, 1.0, closestEmphasis);

  float solidAlpha = mix(SOLID_ALPHA_MIN, SOLID_ALPHA_MAX, closestEmphasis);
  float alpha = solidAlpha * silhouetteCoverage;
  gl_FragColor = vec4(bodyColor * alpha, alpha);
}
`;
```

实现约束：

- 本次方案列出的全部可调材质参数只能存在于 `material-config.json`；shader 的结构常量（例如 hash、octave 变换和 52 步上限）不属于调参入口。`shaders.ts` 通过模板插值生成 GLSL，审计脚本读取同一 JSON，测试导入同一 JSON 并逐项比对生成结果，不得在三处复制材质参数。
- `chromaticField` 必须先除以共享的 `fbmMaxAmplitude` 并映射到 `[-1,1]`；不得把正值 FBM 直接送入旧 Shader Park 映射，也不得把 `fbm` 乘到 alpha。
- 时间变化必须采用 `fieldOrbitRadius/fieldOrbitSpeed` 定义的有界二维环形位移，不再沿噪声 z 轴无限平移；0、15、30、60、120 秒必须分别通过审计门槛。
- 色场采用共享配置生成的 signed-field sine mapping 与 exponent；执行者不得在单状态门禁前自行恢复 `.75/8.0`。
- `surfaceDrift` 的位移幅度固定为 `0.0035`，频率从当前 `3.1` 降到 `1.35`，速度从 `0.025` 降到 `0.01`；节点中心、半径和 smooth-min 不变，但微表面几何会改变。
- `semanticColor` 只占最终颜色的 `0.26`；不得恢复为整球单色。
- `silhouetteCoverage` 必须来自 raymarch 过程记录的 `minimumDistance` 和 `pixelWidth`，而不是法线 facing；alpha 必须从轮廓外的 0 连续过渡，只有 coverage `<= 0.001` 才允许 discard。
- coverage 上界 `2.25` 个 backing pixels 在现有 DPR cap（0.9–1.25）下约为 1.8–2.5 CSS px；相对现有约 56–79 CSS px 的节点半径约为 2.3%–4.5%，落在 2%–5% 验收范围内。
- `softVolume` 的最暗值固定为 `0.86`，只提供轻微无方向性厚度；不得恢复定向 diffuse/specular/Fresnel。
- 保持 premultiplied alpha 输出 `vec4(bodyColor * alpha, alpha)`。

- [ ] **Step 2: 运行 renderer 测试并确认新合同通过**

Run:

```bash
npx vitest run src/components/dialogue/metaball/renderer.test.ts
```

Expected: PASS；6 个 renderer 测试全部通过，包括 0.9/1/1.25 DPR 下、最低与最高实体 alpha 两端的单调曲线。

- [ ] **Step 3: 重跑数值色场门禁并确认 shader 常量与审计一致**

Run:

```bash
node scripts/visual-smoke/metaball-field-audit.mjs
```

Expected: exit 0；0、15、30、60、120 秒逐点通过，三通道同时饱和率均为 0%，平均 RGB 跨度约 0.128–0.137，彩色点比例约 55.62%–58.49%。

- [ ] **Step 4: 运行 shader/模型/Layer 的目标回归集**

Run:

```bash
npx vitest run \
  src/components/dialogue/metaball/model.test.ts \
  src/components/dialogue/metaball/renderer.test.ts \
  src/components/dialogue/DialogueMetaballLayer.test.tsx \
  src/components/dialogue/BubbleStage.test.tsx
```

Expected: PASS；节点投影、fixed uniform、renderer 生命周期、fallback、DOM 交互和融合数据合同不变。

- [ ] **Step 5: 提交 shader 材质替换与数值门禁**

```bash
git add \
  src/components/dialogue/metaball/material-config.json \
  src/components/dialogue/metaball/shaders.ts \
  src/components/dialogue/metaball/renderer.test.ts \
  scripts/visual-smoke/metaball-field-audit.mjs
git commit -m "style(dialogue): replace pearl metaballs with gummy color fields"
```

---

### Task 3: [SUPERSEDED — DO NOT EXECUTE] 建立独立单状态 shader 校准门禁

这里的“独立”指独立数据场景、独立截图和阻塞式用户确认，不复制第二份 GLSL 或 renderer。校准必须调用生产 `DialogueMetaballLayer` 与即将交付的同一 shader，避免原型通过但正式实现漂移。

**Files:**
- Modify: `scripts/visual-smoke/dialogue.mjs:1765-1852`
- Modify: `scripts/visual-smoke/dialogue.mjs:2744-2760`
- Generate: `artifacts/visual-smoke/dialogue/desktop-metaball-gummy-calibration-static.png`
- Generate: `artifacts/visual-smoke/dialogue/desktop-metaball-gummy-calibration-animated.png`
- Create after approval: `docs/references/metaball-gummy/approved-calibration-static.png`
- Create after approval: `docs/references/metaball-gummy/approved-calibration-animated.png`

- [ ] **Step 1: 增加只含一个 user 节点的校准场景**

在 `readPersistedGraphCounts` 后、`ensureMetaballFusionAndSeparation` 前加入：

```js
async function waitForOpaqueMetaballCanvas(page, label, expectedMotion) {
  await waitForCondition(
    page,
    label,
    ({ motion }) => {
      const canvas = document.querySelector('[data-testid="dialogue-metaball-canvas"]');
      return (
        canvas instanceof HTMLCanvasElement &&
        canvas.dataset.motion === motion &&
        getComputedStyle(canvas).opacity === "1"
      );
    },
    { motion: expectedMotion }
  );
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
}

function createGummyCalibrationWorkspace() {
  const workspace = cloneJson(seededWorkspace);
  const root = workspace.graph.nodes.user_root_1;
  root.children = [];
  workspace.focusedNodeId = root.id;
  workspace.composerParentId = null;
  workspace.graph.entryIds = [root.id];
  workspace.graph.nodes = { [root.id]: root };
  workspace.graph.edges = {};
  return workspace;
}

async function ensureGummyMaterialCalibration(browser) {
  const staticWorkspace = createGummyCalibrationWorkspace();
  const staticScenario = await createScenarioPage(
    browser,
    staticWorkspace,
    {
      viewport: { width: 1440, height: 980 },
      reducedMotion: "reduce"
    }
  );
  const staticScreenshotPath = path.join(
    outputDir,
    "desktop-metaball-gummy-calibration-static.png"
  );

  try {
    const { page, pageIssues } = staticScenario;
    await assertMetaballStage(page, "static gummy material calibration");
    await waitForOpaqueMetaballCanvas(
      page,
      "gummy-calibration:static-canvas-opaque",
      "reduced"
    );
    await page.evaluate(() => document.fonts.ready);
    const stage = page.getByTestId("dialogue-stage");
    const canvas = page.getByTestId("dialogue-metaball-canvas");
    const nodeCount = await stage.locator('[data-testid^="dialogue-stage-node-"]').count();
    if (nodeCount !== 1) {
      throw new Error(`Gummy calibration requires exactly one node, received ${nodeCount}`);
    }

    const staticFirst = await canvas.screenshot();
    await page.waitForTimeout(500);
    const staticSecond = await canvas.screenshot();
    if (!staticFirst.equals(staticSecond)) {
      throw new Error("Reduced-motion gummy calibration changed over 500ms");
    }
    await stage.screenshot({ path: staticScreenshotPath });
    assertNoPageIssues(pageIssues, "static gummy material calibration");
  } finally {
    await staticScenario.context.close().catch(() => {});
  }

  const animatedWorkspace = createGummyCalibrationWorkspace();
  const animatedScenario = await createScenarioPage(browser, animatedWorkspace, {
    viewport: { width: 1440, height: 980 }
  });
  const animatedScreenshotPath = path.join(
    outputDir,
    "desktop-metaball-gummy-calibration-animated.png"
  );

  try {
    const { page, pageIssues } = animatedScenario;
    await assertMetaballStage(page, "animated gummy material calibration");
    await waitForOpaqueMetaballCanvas(
      page,
      "gummy-calibration:animated-canvas-opaque",
      "animated"
    );
    await page.evaluate(() => document.fonts.ready);
    const stage = page.getByTestId("dialogue-stage");
    const canvas = page.getByTestId("dialogue-metaball-canvas");
    const animatedFirst = await canvas.screenshot();
    await page.waitForTimeout(1000);
    const animatedSecond = await canvas.screenshot();
    if (animatedFirst.equals(animatedSecond)) {
      throw new Error("Animated gummy calibration did not change over 1000ms");
    }
    await stage.screenshot({ path: animatedScreenshotPath });
    assertNoPageIssues(pageIssues, "animated gummy material calibration");
  } finally {
    await animatedScenario.context.close().catch(() => {});
  }

  return {
    name: "metaball-gummy-calibration",
    passed: true,
    nodeCount: 1,
    screenshot: staticScreenshotPath,
    screenshots: {
      static: staticScreenshotPath,
      animated: animatedScreenshotPath
    }
  };
}
```

- [ ] **Step 2: 把校准场景放在全部 interaction scenarios 之前**

将 `runInteractionScenarios` 的数组开头改为：

```js
const scenarios = [
  ["metaball-gummy-calibration", ensureGummyMaterialCalibration],
  ["metaball-fusion-and-separation", ensureMetaballFusionAndSeparation],
  ["metaball-reduced-motion", ensureMetaballReducedMotion],
  ["metaball-webgl-fallback", ensureMetaballWebglFallback],
```

其余 scenario 保持原顺序和内容。

- [ ] **Step 3: 运行本地 visual smoke 并只审阅单状态材质**

Run:

```bash
npm run test:visual-dialogue
```

Expected: exit 0，并生成：

```text
artifacts/visual-smoke/dialogue/desktop-metaball-gummy-calibration-static.png
artifacts/visual-smoke/dialogue/desktop-metaball-gummy-calibration-animated.png
```

同时满足：static canvas 在 500ms 内像素不变；animated canvas 在 1000ms 内像素发生变化；两张截图都在 canvas opacity 已稳定为 1 且又经过两个 animation frames 后采集。

- [ ] **Step 4: 用户确认门禁（阻塞后续任务）**

向用户同时展示 static 与 animated 单状态截图，并报告 1000ms 动态像素差异已通过；按以下五项验收：

1. 近黑舞台仍属于已选 A 方向。
2. 外轮廓有界限，coverage 柔边约占半径 2–5%，没有硬锯齿或宽雾圈。
3. 内部有宽尺度彩色色区，没有白灰饱和、白色热点或珍珠 Fresnel。
4. 体积读感像 QQ 糖实体，但没有明显定向灯光塑造成“暗场 3D 球”。
5. 正常运动状态仍保留宽尺度彩色分区，没有随时间变成灰白或单色；reduced-motion 状态保持冻结。

只有用户明确确认该截图后才能执行 Task 4–6。若未通过，只回到 `material-config.json` 的色场、coverage 或 `softVolume` 对应键进行单变量调整；随后重跑 Task 1 的 GLSL 常量自动比对、coverage 数值曲线、五时间点色场审计与本 Task 双状态截图。不得直接改 `shaders.ts` 的生成结果，也不得先改 CSS fallback 掩盖 shader 问题。

- [ ] **Step 5: 用户确认后固化项目自有校准图并提交场景**

```bash
cp \
  artifacts/visual-smoke/dialogue/desktop-metaball-gummy-calibration-static.png \
  docs/references/metaball-gummy/approved-calibration-static.png
cp \
  artifacts/visual-smoke/dialogue/desktop-metaball-gummy-calibration-animated.png \
  docs/references/metaball-gummy/approved-calibration-animated.png
git add \
  scripts/visual-smoke/dialogue.mjs \
  docs/references/metaball-gummy/approved-calibration-static.png \
  docs/references/metaball-gummy/approved-calibration-animated.png
git commit -m "test(dialogue): add single-state gummy material gate"
```

---

### Task 4: 让 CSS fallback 使用同一软糖视觉语法

**Files:**
- Modify: `src/components/dialogue/DialogueShell.module.css:495-540`
- Modify: `src/components/dialogue/DialogueShell.module.css:625-793`
- Test: `src/components/dialogue/BubbleStage.test.tsx`
- Visual test: `scripts/visual-smoke/dialogue.mjs` 的 `ensureMetaballWebglFallback`

- [ ] **Step 1: 收紧 fallback 的高光、暗边和外晕**

在 `.emptyStageBlob` 中把 `box-shadow` 替换为：

```css
box-shadow:
  0 24px 58px rgba(0, 0, 0, 0.22),
  inset 0 0 0 1px rgba(194, 220, 218, 0.08),
  inset 0 -12px 24px rgba(0, 0, 0, 0.12);
```

在 `.stageNode` 中加入 role 可覆盖的色场变量，并把 `box-shadow` 替换为：

```css
--stage-node-field-a: rgba(135, 171, 177, 0.18);
--stage-node-field-b: rgba(93, 127, 139, 0.12);
box-shadow:
  0 22px 54px rgba(0, 0, 0, 0.2),
  inset 0 0 0 1px rgba(194, 220, 218, 0.07),
  inset 0 -12px 24px rgba(0, 0, 0, 0.13);
```

将 `.stageNode::before` 与 `.stageNode::after` 替换为：

```css
.stageNode::before {
  inset: 3px;
  background:
    radial-gradient(circle at 31% 31%, var(--stage-node-field-a), transparent 52%),
    radial-gradient(circle at 69% 66%, var(--stage-node-field-b), transparent 62%);
  filter: blur(5px);
  opacity: 0.72;
}

.stageNode::after {
  inset: -4px;
  z-index: -1;
  filter: blur(8px);
  opacity: 0.18;
}
```

这一步的关键是把现有“局部白色镜面点 + 16px 宽光晕”改成“role 色宽变化 + 8px 弱外晕”；`::before` 不得再包含纯白 radial gradient。不能删除 `::after`，因为 thesis/antithesis/user 的 role-specific glow 仍依赖它。

- [ ] **Step 2: 降低 fallback role gradients 的塑料对比度**

将三个基础角色背景替换为以下值；保留 synthesis 的独立记录/事件样式，不在本轮扩张范围：

```css
.stageNodeUser {
  --stage-node-field-a: rgba(174, 211, 204, 0.28);
  --stage-node-field-b: rgba(116, 158, 168, 0.18);
  width: 158px;
  height: 158px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 30% 34%, rgba(174, 211, 204, 0.52), transparent 60%),
    linear-gradient(145deg, rgba(187, 205, 208, 0.92), rgba(123, 147, 153, 0.9));
  color: #0a1115;
}

.stageNodeThesis {
  --stage-node-field-a: rgba(101, 222, 171, 0.3);
  --stage-node-field-b: rgba(44, 146, 113, 0.2);
  background:
    radial-gradient(circle at 30% 34%, rgba(167, 233, 190, 0.56), transparent 58%),
    linear-gradient(155deg, rgba(59, 183, 139, 0.94), rgba(24, 125, 96, 0.96));
}

.stageNodeAntithesis {
  --stage-node-field-a: rgba(239, 126, 148, 0.3);
  --stage-node-field-b: rgba(160, 67, 99, 0.2);
  background:
    radial-gradient(circle at 31% 33%, rgba(239, 145, 163, 0.54), transparent 58%),
    linear-gradient(155deg, rgba(216, 97, 127, 0.94), rgba(126, 48, 76, 0.96));
}
```

同步把三个 empty-state background 替换为：

```css
.emptyStageRoot {
  background:
    radial-gradient(circle at 30% 34%, rgba(174, 211, 204, 0.52), transparent 60%),
    linear-gradient(145deg, rgba(187, 205, 208, 0.92), rgba(123, 147, 153, 0.9));
}

.emptyStageThesis {
  background:
    radial-gradient(circle at 30% 34%, rgba(167, 233, 190, 0.56), transparent 58%),
    linear-gradient(155deg, rgba(59, 183, 139, 0.94), rgba(24, 125, 96, 0.96));
}

.emptyStageAntithesis {
  background:
    radial-gradient(circle at 31% 33%, rgba(239, 145, 163, 0.54), transparent 58%),
    linear-gradient(155deg, rgba(216, 97, 127, 0.94), rgba(126, 48, 76, 0.96));
}
```

保证空舞台和有数据舞台不出现两套材质；三个 empty-state background 同样不得包含 `rgba(255, 255, 255, ...)` 或纯白色值。

- [ ] **Step 3: 运行组件回归测试**

Run:

```bash
npx vitest run src/components/dialogue/BubbleStage.test.tsx
```

Expected: PASS；DOM 节点、role data attributes、renderer ready/fallback 切换和 focus 语义不变。

- [ ] **Step 4: 提交 fallback 样式**

```bash
git add src/components/dialogue/DialogueShell.module.css
git commit -m "style(dialogue): align metaball fallback with gummy material"
```

---

### Task 5: 扩充视觉证据并进行人工材质验收

**Files:**
- Modify: `scripts/visual-smoke/dialogue.mjs:1740-1852`
- Generate: `artifacts/visual-smoke/dialogue/desktop-metaball-gummy-separated.png`
- Regenerate: `artifacts/visual-smoke/dialogue/desktop-metaball-fused.png`
- Regenerate: `artifacts/visual-smoke/dialogue/desktop-metaball-reduced-motion.png`
- Regenerate: `artifacts/visual-smoke/dialogue/desktop-metaball-fallback.png`

- [ ] **Step 1: 在融合测试中锁定可见间隙并补充分离态截图**

在 `ensureMetaballFusionAndSeparation` 的 `initially-separated` wait 和 `graphBefore` 校验之后插入：

```js
const rootCenter = {
  x: rootBox.x + rootBox.width / 2,
  y: rootBox.y + rootBox.height / 2
};
const thesisCenter = {
  x: thesisBox.x + thesisBox.width / 2,
  y: thesisBox.y + thesisBox.height / 2
};
const centerDistance = Math.hypot(
  rootCenter.x - thesisCenter.x,
  rootCenter.y - thesisCenter.y
);
const separationGapPx =
  centerDistance -
  Math.max(rootBox.width, rootBox.height) / 2 -
  Math.max(thesisBox.width, thesisBox.height) / 2;

// 两侧 coverage 在现有 DPR cap 下最坏合计约向外扩 5 CSS px；保留 6px 门槛，防止
// data-fused-pairs 已分离但画面仍提前粘连或残留液桥。
if (separationGapPx <= 6) {
  throw new Error(
    `Separated metaballs do not retain a visible gap: ${separationGapPx}px`
  );
}

const separatedScreenshotPath = path.join(
  outputDir,
  "desktop-metaball-gummy-separated.png"
);
await page.screenshot({ path: separatedScreenshotPath, fullPage: false });
```

把该函数成功返回值扩展为：

```js
return {
  name: "metaball-fusion-separation",
  passed: true,
  pair,
  graphBefore,
  graphAfter,
  separationGapPx,
  screenshot: fusedScreenshotPath,
  screenshots: {
    separated: separatedScreenshotPath,
    fused: fusedScreenshotPath
  }
};
```

保留原来的 `screenshot` 字段以避免改变现有 summary 消费者。

- [ ] **Step 2: 运行本地 visual smoke**

Run:

```bash
npm run test:visual-dialogue
```

Expected:

- 命令 exit 0。
- 7 个 viewport 和现有全部 interaction scenario 通过。
- `summary.json` 中没有 failed interaction。
- `metaball-fusion-separation.separationGapPx > 6`，分离态不仅在逻辑上解除 pair，投影球面之间也保留可见间隙。
- 新的 separated 截图与 fused/reduced-motion/fallback 截图同时生成。

- [ ] **Step 3: 按视觉验收标准人工查看六张图**

逐张查看：

```text
artifacts/visual-smoke/dialogue/desktop-metaball-gummy-calibration-static.png
artifacts/visual-smoke/dialogue/desktop-metaball-gummy-calibration-animated.png
artifacts/visual-smoke/dialogue/desktop-metaball-gummy-separated.png
artifacts/visual-smoke/dialogue/desktop-metaball-fused.png
artifacts/visual-smoke/dialogue/desktop-metaball-reduced-motion.png
artifacts/visual-smoke/dialogue/desktop-metaball-fallback.png
```

验收记录必须明确回答：

1. 边缘是否仍有实体界限，且柔化没有扩大成雾圈？
2. 是否完全看不到白色镜面热点和珍珠 Fresnel？
3. 色场是否在球体内部形成大块连续过渡，而不是高频纹理？
4. thesis/antithesis/user 是否仍可区分？
5. static 校准图是否稳定，animated 校准图是否保持同一材质且色场确实发生缓慢变化？
6. separated 截图中是否存在干净可见的间隙，无提前重叠、无残余液桥？
7. fused 截图中的液桥是否连续、无漏绘和锯齿断层？
8. fallback 是否属于同一材质家族，而不是回到塑料球？

如果 1、2、3、5、6 或 7 任一失败，只允许回到 `material-config.json` 调整对应键，不扩张架构：

```json
{
  "fieldSpatialScale": 1.65,
  "fieldOrbitRadius": 0.12,
  "fieldOrbitSpeed": 0.08,
  "fieldSineScale": 1.7,
  "fieldSineAmplitude": 0.36,
  "fieldSineBias": 0.62,
  "coverageInnerPixels": 0.25,
  "coverageOuterPixels": 2.25,
  "softVolumeMin": 0.86,
  "softVolumePower": 0.55,
  "solidAlphaMin": 0.84,
  "solidAlphaMax": 0.94
}
```

`shaders.ts`、数值审计和测试不得出现上述参数的第二份字面量。任何配置变化后都必须同时重跑 `renderer.test.ts` 与 `node scripts/visual-smoke/metaball-field-audit.mjs`；任何色场、coverage、`softVolume` 或 alpha 变化后都必须重新经过 Task 3 的 static + animated 用户确认门禁。分离态失败时先收窄 `coverageOuterPixels`，不得修改 graph 融合阈值来掩盖视觉提前粘连。

- [ ] **Step 4: 提交 visual smoke 证据路径变更**

```bash
git add scripts/visual-smoke/dialogue.mjs
git commit -m "test(dialogue): capture separated gummy metaball evidence"
```

生成的 `artifacts/visual-smoke/dialogue/*.png` 保持现有仓库策略：除非项目当前明确追踪对应 artifact，否则不强制加入源码提交。

---

### Task 6: 更新当前产品文档并完成全量验证

**Files:**
- Modify: `README.md:17`
- Modify: `README.md:228-245`

- [ ] **Step 1: 更新 README 中的当前材质描述**

把：

```markdown
- `/dialogue` 已接入珍珠质感 Metaball renderer，并保留 DOM 交互、reduced-motion 与 WebGL fallback。
```

替换为：

```markdown
- `/dialogue` 已接入软糖色场 Metaball renderer：实体轮廓采用窄柔边，内部颜色由低频连续色场驱动，并保留 DOM 交互、reduced-motion 与 WebGL fallback。
```

把 renderer 详情段落替换为：

```markdown
`/dialogue` 已接入主线专用 Metaball renderer：最多 8 个可见曲面、52 步 raymarch、有符号低频三通道软糖色场和有界环形时间位移，以及按最小 SDF 距离和像素宽度计算的窄 coverage 柔边；desktop DPR 上限 1.25、mobile 上限 0.9。WebGL 不可用或 context lost 时自动回退到同视觉语法的 CSS blob；reduced-motion 会冻结材质时间，但不会冻结几何和 DOM 交互。shader、数值审计和 coverage 测试共享同一份材质参数配置。
```

- [ ] **Step 2: 运行格式、类型和目标测试门禁**

Run:

```bash
npx eslint \
  src/components/dialogue/metaball/shaders.ts \
  src/components/dialogue/metaball/renderer.ts \
  src/components/dialogue/metaball/renderer.test.ts \
  src/components/dialogue/DialogueMetaballLayer.tsx \
  scripts/visual-smoke/metaball-field-audit.mjs \
  scripts/visual-smoke/dialogue.mjs
node scripts/visual-smoke/metaball-field-audit.mjs
npm run typecheck
npm run typecheck:test
npx vitest run \
  src/components/dialogue/metaball/model.test.ts \
  src/components/dialogue/metaball/renderer.test.ts \
  src/components/dialogue/DialogueMetaballLayer.test.tsx \
  src/components/dialogue/BubbleStage.test.tsx
```

Expected: 所有命令 exit 0。

- [ ] **Step 3: 运行全量质量门禁**

Run:

```bash
npm run check
npm run build
```

Expected:

- ESLint 无 error。
- TypeScript app/test 两个 gate 通过。
- 全量 Vitest 通过。
- Next production build 生成全部现有 route，无新增 warning/error。

- [ ] **Step 4: 在 production server 模式复跑视觉门禁**

Run:

```bash
DIALOGUE_SMOKE_SERVER_MODE=start npm run test:visual-dialogue
```

Expected: exit 0；production 模式下 7 个 viewport、融合/分离、reduced-motion、fallback 和其余全部 interaction scenario 通过。

- [ ] **Step 5: 提交 README 与最终验证说明**

```bash
git add README.md
git commit -m "docs(dialogue): describe gummy metaball material"
```

最终交付说明必须包含：

- shader 材质由 pearl/PBR 改为 gummy chromatic field；
- 节点中心/半径、融合阈值、DOM 交互和 graph 不变；微表面 disturbance 已明确降频、降速、降幅；
- CSS fallback 已对齐；
- 目标测试、全量 check/build、local/production visual smoke 的实际结果；
- static + animated 单状态确认门禁与六张材质截图的人工验收结论；
- 仍未测量的物理移动设备 GPU 帧时/功耗风险。

## 风险与回退

- **透明边在暗背景上过暗：** 在 `material-config.json` 把 `solidAlphaMin` 从 `0.84` 提到 `0.88`，保持 `alpha = solidAlpha * silhouetteCoverage`；不要给 coverage 设置非零下界，也不要恢复 Fresnel 或白色 rim。
- **色场过花：** 把 `fieldSpatialScale` 从 `1.65` 降到 `1.25`；不要通过 blur 隐藏纹理。
- **动态色场漂移过快或变化过小：** 只调整有界的 `fieldOrbitSpeed` / `fieldOrbitRadius`，并要求 `auditTimesSeconds` 中每个时间点独立通过门槛；不得恢复沿噪声 z 轴无限平移。
- **语义角色不明显：** 把 `semanticMix` 从 `0.26` 最多提高到 `0.34`；超过该值容易回到单色球。
- **轮廓仍太硬：** 只把 `coverageOuterPixels` 从 `2.25` 提高到 `2.75`；不得恢复 `if (!hit) discard` 或把 alpha 下界设为非零。
- **轮廓太雾或分离态提前粘连：** 把 `coverageOuterPixels` 从 `2.25` 降到 `1.75`，并保持 `coverageInnerPixels = 0.25`。
- **融合桥受扰动破坏：** 把 `surfaceDisplacement` 从 `0.0035` 降到 `0.002` 或直接置零；不要改 `uSmoothness` 掩盖问题。
- **性能回归：** 本方案不增加 octave、raymarch step 或额外 pass；若 GPU 时间上升，优先确认 shader 编译与截图证据，不降低现有 DPR 前先定位原因。

每次调整 `material-config.json` 后，必须重跑 Task 1 的 coverage 合同测试、五时间点色场审计和 Task 3 双状态校准；共享配置是唯一调参入口，不能只验证修改前的公式。

## 完成定义

只有同时满足以下条件才可声明完成：

- 新 shader 合同测试通过，并明确阻止 `if (!hit) discard`、`specular`、`fresnel`、`pearlColor` 回归。
- 0、15、30、60、120 秒各自完成 10,201 点色场数值门禁：三通道同时饱和率 `< 1%`、平均 RGB 跨度 `> 0.1`、彩色点比例 `> 40%`。
- coverage 在 DPR 0.9、1、1.25 下，于 0.25、1、2、2.25 backing pixels 处分别满足预期 alpha 且单调递减。
- static + animated 单状态 shader 截图都在 canvas opacity 稳定为 1 并等待两个 animation frames 后采集，分别证明 reduced-motion 静止和正常运动色场变化；两张图均在 CSS fallback 和完整视觉收尾前获得用户确认。
- 四项核心视觉标准（实体边界、窄柔边、连续内部色场、无珍珠热点）全部人工通过。
- fused 液桥连续；separated 状态有 `> 6px` 投影间隙且人工确认无提前重叠/残余桥；graph 不变性通过。
- reduced-motion 与 fallback 通过。
- `npm run check`、`npm run build`、local/production visual smoke 全部 exit 0。
- README 描述与实际实现一致。
