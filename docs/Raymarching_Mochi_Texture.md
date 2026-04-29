# Raymarching 麻薯质感实现文档

本文档说明如何在 Raymarching 渲染中实现"麻薯质感"（Mochi Texture），即边缘看似模糊又没完全模糊、具有体积渐变透明质感的效果。

---

## 1. 麻薯质感的核心特征

- **边缘软化**：边缘不是硬边界，而是柔和的过渡
- **体积渐变**：从中心到边缘有透明度变化
- **半透明感**：看似模糊但没有完全模糊，保持一定的清晰度
- **柔和光晕**：边缘有微妙的光晕效果

---

## 2. 实现原理

### 2.1 基于 SDF 距离的透明度渐变

**核心思路**：使用 SDF（Signed Distance Function）值来控制透明度，距离表面越近，透明度越高；距离越远，透明度越低。

```glsl
// 计算到表面的距离（SDF 值）
float distToSurface = abs(sceneSDF(p));

// 边缘软化：使用 smoothstep 创建柔和的过渡
float edgeSoftness = 0.2; // 边缘软化范围（可调）
float alpha = 1.0 - smoothstep(0.0, edgeSoftness, distToSurface);
```

**原理说明**：
- `sceneSDF(p)` 返回点到表面的距离，正值表示在表面外，负值表示在表面内
- `abs()` 取绝对值，确保距离为正
- `smoothstep(0.0, edgeSoftness, distToSurface)` 创建一个平滑的过渡函数
- 当 `distToSurface = 0` 时（在表面上），`smoothstep` 返回 0，`alpha = 1.0`（完全不透明）
- 当 `distToSurface = edgeSoftness` 时，`smoothstep` 返回 1，`alpha = 0.0`（完全透明）
- 在 0 到 `edgeSoftness` 之间，`alpha` 平滑过渡

### 2.2 基于 Fresnel 的体积渐变

**核心思路**：使用 Fresnel 效应（菲涅尔效应）来增强边缘的透明度，模拟体积感。

```glsl
// Fresnel 效应：基于视角和法线的边缘光
float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), uFresnelPower);

// 体积渐变：边缘更透明
float volumeAlpha = 1.0 - fresnel * 0.4; // 边缘稍微透明，增强麻薯质感
alpha *= volumeAlpha;
```

**原理说明**：
- Fresnel 效应：当视角接近表面法线时（正面看），Fresnel 值小；当视角接近边缘时（侧面看），Fresnel 值大
- `pow(1.0 - max(dot(viewDir, normal), 0.0), uFresnelPower)` 计算 Fresnel 值
- `uFresnelPower` 控制边缘光的强度（通常在 2.0-3.0 之间）
- `volumeAlpha = 1.0 - fresnel * 0.4` 使得边缘（Fresnel 值大）更透明
- 将 `volumeAlpha` 与基于距离的 `alpha` 相乘，得到最终的透明度

### 2.3 边缘软化参数

**关键参数**：
- `edgeSoftness`：边缘软化范围（默认 0.2）
  - 值越大，边缘越柔和，但可能过于模糊
  - 值越小，边缘越清晰，但可能失去麻薯质感
  - 建议范围：0.15-0.3

- `uFresnelPower`：Fresnel 强度（默认 2.5）
  - 值越大，边缘光越明显，体积感越强
  - 值越小，边缘光越弱，体积感越弱
  - 建议范围：2.0-3.5

- `volumeAlpha` 系数：体积透明度系数（默认 0.4）
  - 值越大，边缘越透明，体积感越强
  - 值越小，边缘越不透明，体积感越弱
  - 建议范围：0.2-0.6

---

## 3. 完整实现代码

### 3.1 Shader 代码片段

```glsl
// 计算到表面的距离（用于麻薯质感）
float getDistanceToSurface(vec3 p) {
  return sceneSDF(p);
}

void main() {
  // ... raymarching 计算 ...

  if (t > 0.0) {
    vec3 p = ro + rd * t;
    vec3 normal = calcNormal(p);
    vec3 viewDir = -rd;

    // ... 光照计算 ...

    // 麻薯质感：基于距离的透明度渐变
    float distToSurface = abs(getDistanceToSurface(p));
    float edgeSoftness = 0.2; // 边缘软化范围（可调）
    float alpha = 1.0 - smoothstep(0.0, edgeSoftness, distToSurface);

    // 体积渐变：从中心到边缘的透明度变化
    float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), uFresnelPower);
    float volumeAlpha = 1.0 - fresnel * 0.4; // 边缘稍微透明，增强麻薯质感
    alpha *= volumeAlpha;

    // 确保 alpha 在合理范围内
    alpha = clamp(alpha, 0.0, 1.0);

    // 输出带透明度的颜色
    gl_FragColor = vec4(color, alpha);
  } else {
    // 透明背景
    gl_FragColor = vec4(uBackgroundColor, 0.0);
  }
}
```

### 3.2 材质设置

```typescript
const material = new THREE.ShaderMaterial({
  // ... uniforms ...
  transparent: true, // 启用透明度支持麻薯质感
  depthWrite: false, // 透明物体不需要写入深度
});
```

---

## 4. 参数调优建议

### 4.1 预设参数

根据不同的视觉风格，可以调整以下参数：

**柔和风格（Soft）**：
- `edgeSoftness`: 0.25
- `uFresnelPower`: 2.6
- `volumeAlpha 系数`: 0.3

**中性风格（Neutral）**：
- `edgeSoftness`: 0.2
- `uFresnelPower`: 2.5
- `volumeAlpha 系数`: 0.4

**高对比风格（High Contrast）**：
- `edgeSoftness`: 0.15
- `uFresnelPower`: 2.8
- `volumeAlpha 系数`: 0.5

### 4.2 调试技巧

1. **边缘太模糊**：减小 `edgeSoftness` 或 `volumeAlpha 系数`
2. **边缘太清晰**：增大 `edgeSoftness` 或 `volumeAlpha 系数`
3. **体积感不够**：增大 `uFresnelPower` 或 `volumeAlpha 系数`
4. **整体太透明**：减小 `volumeAlpha 系数`
5. **整体太不透明**：增大 `volumeAlpha 系数`

---

## 5. 与 Bloom 效果的结合

麻薯质感与 Bloom 效果结合，可以增强边缘光晕：

```glsl
// 在 shader 中，边缘透明度较高的区域会产生更多的 Bloom
// Bloom 参数建议：
// - threshold: 0.05-0.15（低阈值，捕获更多边缘光）
// - strength: 0.5-1.0（中等强度，避免过度发光）
// - radius: 0.5-0.8（中等半径，保持柔和）
```

---

## 6. 性能考虑

### 6.1 计算开销

- **SDF 距离计算**：每个像素需要计算一次 `sceneSDF(p)`，性能开销较小
- **Fresnel 计算**：基于法线和视角，计算开销很小
- **透明度计算**：基于 `smoothstep`，计算开销很小

### 6.2 优化建议

1. **移动端优化**：
   - 减小 `edgeSoftness` 范围（0.15-0.2）
   - 降低 `uFresnelPower`（2.0-2.5）
   - 减小 Bloom 强度

2. **桌面端优化**：
   - 可以使用更大的 `edgeSoftness`（0.2-0.3）
   - 可以使用更高的 `uFresnelPower`（2.5-3.5）
   - 可以使用更强的 Bloom 效果

---

## 7. 实现效果对比

### 7.1 无麻薯质感（传统渲染）

- 边缘硬边界
- 完全不透明
- 缺乏体积感

### 7.2 有麻薯质感（当前实现）

- 边缘柔和过渡
- 基于距离的透明度渐变
- 基于 Fresnel 的体积渐变
- 柔和的边缘光晕

---

## 8. 参考与借鉴

- **参考项目**：`threejs-gsap-threejs-raymarching-layout-explorations-with-gsap-n-3`
  - 使用了 Fresnel 效应和边缘光
  - 使用了透明度渐变

- **参考图片**：`IMG_6605.JPG`（sketch1638178）
  - 展示了理想的麻薯质感效果
  - 边缘柔和，体积感强

---

## 9. 未来改进方向

1. **基于噪声的纹理**：添加 FBM noise 来增强表面细节
2. **彩色渐变**：基于位置或法线生成彩色渐变
3. **动态变形**：时间驱动的轻微变形，增强流动感
4. **多层透明度**：更复杂的体积透明度计算

---

## 10. 总结

麻薯质感的实现核心在于：
1. **基于 SDF 距离的透明度渐变**：创建柔和的边缘过渡
2. **基于 Fresnel 的体积渐变**：增强体积感和边缘光
3. **参数调优**：根据视觉风格调整 `edgeSoftness`、`uFresnelPower` 和 `volumeAlpha 系数`
4. **与 Bloom 结合**：增强边缘光晕效果

通过以上方法，可以实现"边缘看似模糊又没完全模糊、具有体积渐变透明质感"的麻薯效果。
