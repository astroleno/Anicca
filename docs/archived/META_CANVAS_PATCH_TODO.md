# MetaCanvas 麻薯质感修复 TODO

## 问题诊断总结

**核心问题**：
- 背景纯白，缺少参考图的"彩色雾呼吸感"
- 表面像磨砂塑料球，缺少"糯性体"的柔厚感
- 边缘锯齿，透明混合不够柔和
- 性能卡顿，SDF评估次数过多

**修复路线**：表面 + 彩色雾补偿（路线A）

## 修复阶段总览

| 阶段 | 名称 | 改动范围 | 预期提升 | 性能代价 |
|------|------|----------|----------|----------|
| ① | 屏幕空间彩色雾（FBM）层 | fragment shader | 背景渗色+呼吸感恢复 | +5–8% |
| ② | 糯感光场（包裹光 + rim + 厚度暖光） | lighting 模块 | 恢复柔厚体感 | +10–15% |
| ③ | 抗锯齿与透明优化 | 渲染层 JS/GLState | 边缘清晰，光晕柔和 | +5% |

## 详细实施计划

### ① 屏幕空间彩色雾（FBM）层

**目标**：重现参考图的彩色雾呼吸感，让背景和主体"同气相通"

**插入点**：fragment shader 最末尾，输出颜色之前

**核心逻辑**：
```glsl
// 屏幕空间方向（代替世界坐标噪声）
vec3 viewDir = normalize(v_viewDir); 
float n = fbm(viewDir * 2.5 + u_time * 0.15);  // 频率2.5, 时间速率0.15
vec3 fogColor = 0.5 + 0.5 * sin(vec3(1.2, 2.4, 3.1) * n + vec3(0.0, 2.0, 4.0));
vec3 fogMix = mix(color.rgb, fogColor, 0.15); // 主体与背景混色15%
color.rgb = fogMix;
```

**参数建议**：
- FBM频率：2.5（可调范围1.8-3.5）
- 混色比例：0.15（可调范围0.10-0.25）
- 速率：0.15（可调范围0.10-0.25）

**性能建议**：使用2-3层FBM，GPU成本极低

### ② 糯感光场补偿

**目标**：弥补体积感缺失，让表面光滑、内部柔厚

#### a. 包裹光 Wrap Lighting
```glsl
float ndotl = dot(normal, lightDir);
float wrap = 0.4;  // 包裹度
float diff = clamp((ndotl + wrap) / (1.0 + wrap), 0.0, 1.0);
```

#### b. 宽 rim 光
```glsl
float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.0);
```

#### c. 厚度暖光
```glsl
float thickness = smoothstep(0.2, 0.8, diff);
vec3 warm = mix(vec3(1.0, 0.9, 0.8), vec3(1.0, 0.7, 0.5), rim);
color.rgb += warm * thickness * 0.3; // 强度可调
```

**参数建议**：
- wrap：0.4（可调范围0.3-0.6）
- rim指数：2.0（可调范围1.5-2.5）
- 厚度强度：0.3（可调范围0.2-0.4）

### ③ 抗锯齿与透明优化

#### JS端画布分辨率
```javascript
const ratio = Math.min(2.0, window.devicePixelRatio);
canvas.width = canvas.clientWidth * ratio;
canvas.height = canvas.clientHeight * ratio;
gl.viewport(0, 0, canvas.width, canvas.height);
```

#### Shader端确保扩展
```glsl
#extension GL_OES_standard_derivatives : enable
```

#### Blend配置
```javascript
gl.enable(gl.BLEND);
gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // 预乘alpha
```

#### Fresnel透明度调节
```glsl
float fresnel = pow(1.0 - dot(viewDir, normal), 3.0);
float alpha = mix(0.9, 1.0, fresnel);
```

## 实施顺序

1. **先做①（屏幕空间雾）**：即时反馈，验证整体色调与氛围
2. **再做②（糯感光场）**：对比厚度与发光质感，微调强度与包裹度
3. **最后③（透明与抗锯齿）**：用于收尾、画质提纯

## 性能优化建议

- MAX_SOURCES降到实际需求(6-8个)
- MAX_STEPS降到40-48
- 法线用四面体法(4次)代替中心差分(6次)
- 厚度采样降到2次
- renderScale 0.85

## 预期效果

- ① 恢复彩色雾呼吸感，背景与主体同气相通
- ② 表面从磨砂塑料球变成糯性体，柔厚感显著
- ③ 边缘清晰柔和，整体画质提升

**总计性能代价约20-28%**，但视觉效果提升巨大，能达到80-90%的麻薯观感。
