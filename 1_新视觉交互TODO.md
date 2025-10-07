# Anicca 视觉交互开发TODO文档 (修订版)

## 项目概览

### 核心哲学
Anicca (无相) 是基于佛教哲学的AI对话艺术体验，将传统问答转化为"存在-消散-觉察"的冥想式节奏。

### 技术约束 (MVP阶段)
- **核心管线**: Shader Park + React (单管线)
- **禁用技术**: p5.js, SPH/碰撞, GLTF/PBR/HDRI, 多pass合成
- **渲染引擎**: WebGL 2.0 (通过Shader Park封装)
- **UI框架**: HTML/CSS (轻量级HUD)
- **状态管理**: React内置状态

### 性能KPI阈值
- **冷启动**: TTI ≤ 3s (4G网络，首屏1M像素)
- **渲染预算**:
  - DPR ≤ 2
  - 总像素 ≤ 1.3M
  - 在屏实例 ≤ 5k
  - setMaxIterations ≤ 8
- **帧率要求**:
  - avg ≥ 30fps
  - P95 ≥ 24fps
- **触控交互**:
  - 可交互气泡直径 ≥ 44px
  - 误触取消率 < 2%

---

## 阶段规划

### Phase 1: Shader Park单管线MVP (2-3周)
**目标**: 建立基础着色器管线和交互框架

### Phase 2: 核心交互实现 (3-4周)
**目标**: 完成分裂、探索、嫁接的核心交互

### Phase 3: 假体积流体效果 (2-3周)
**目标**: 实现"假体积"视觉错觉

### Phase 4: 语义识别与标签 (2周)
**目标**: UI标签系统 (不做几何布尔)

### Phase 5: Three.js多pass迁移 (可选)
**目标**: 仅当性能达标时考虑

---

## 交互阈值参数表

### 边缘检测与磁吸
| 参数 | 阈值 | 说明 |
|------|------|------|
| 边缘判定 | ≤10%视口宽高或64px | 持续≥180ms |
| 磁吸半径 | 48px (DPR≤2) | 命中后显示8px/90ms抖动 |
| 拖拽取消 | 速度>1200px/s且离目标回退>72px | 快速回弹检测 |

### 触控交互
| 参数 | 阈值 | 说明 |
|------|------|------|
| 双击"合"预览 | 间隔≤280ms | 快速双击融合预览 |
| 长按"冻结分支" | ≥420ms | 长按冻结当前分支 |
| 单击分裂 | 立即触发 | 分裂动画启动 |

### 动效时长
| 状态 | 时长 | 缓动函数 |
|------|------|----------|
| SPLIT | 320ms | ease-out-cubic |
| GRAFT | 260ms | ease-in-out-cubic |
| FUSION | 420ms | ease-out-back |

---

## 状态机与Uniform映射

### 状态流转图
```
IDLE → SPLIT → EXPLORE → GRAFT_READY → GRAFTED → FUSION_READY → FUSION → IDLE
```

### Shader Park Uniform映射表
| 状态 | u_mode | splitProgress | showEdges | 说明 |
|------|--------|---------------|-----------|------|
| IDLE | 0 | 0.0 | 0 | 初始状态 |
| SPLIT | 1 | [0→1] | 0 | 分裂动画 |
| EXPLORE | 2 | 1.0 | 1 | 探索模式，边界高亮 |
| GRAFT_READY | 3 | 1.0 | 1 | 嫁接准备，磁吸激活 |
| GRAFTED | 3 | 1.0 | 1 | 嫁接完成 |
| FUSION_READY | 2 | 1.0 | 1 | 融合准备 |
| FUSION | 4 | [1→0] | 0 | 融合动画(反向) |

### 边界亮度映射
```javascript
// EXPLORE和GRAFT_READY状态下边界亮度+8%
float boundaryBrightness = showEdges > 0.5 ? 1.08 : 1.0;
```

---

## Phase 1: Shader Park单管线MVP

### 1.1 基础架构搭建
- [x] **已完成**: Shader Park集成 (`/src/shaders/shader3.ts`)
- [ ] **任务**: React组件封装
  - 创建`ShaderParkCanvas`组件
  - 实现uniform更新机制
  - 添加WebGL上下文错误处理
- [ ] **任务**: 状态管理系统
  - 实现上述状态机
  - uniform变更队列 (防抖16ms)
  - 错误状态回退机制

### 1.2 分形三球分裂 (核心算法)
- [ ] **任务**: 分裂着色器逻辑
  ```glsl
  // 基于splitProgress的三球位置计算
  vec3 splitPosition(float t, int index) {
    float angle = float(index) * 2.0 * PI / 3.0;
    float distance = DETACH_DISTANCE * t;
    return vec3(cos(angle) * distance, sin(angle) * distance, 0.0);
  }
  ```
- [ ] **任务**: 体积守恒动画
  - 主球半径: R0 * (1.0 - 0.3 * t)
  - 子球半径: R0 * 0.22 * t^0.8
  - 总体积: R0³ (恒定)

### 1.3 薄壳弥散错觉
- [ ] **任务**: 双层薄壳渲染
  - 外层: `sphere(R0 + 0.02)` 半透明
  - 内层: `sphere(R0 - 0.02)` 实心
- [ ] **任务**: 视角增亮效果
  ```glsl
  float rimLight = pow(1.0 - dot(normal, viewDir), 2.0);
  vec3 finalColor = baseColor + rimLight * 0.3;
  ```
- [ ] **任务**: 噪声扰动
  - 时间噪声: `time * 0.1`
  - 空间噪声: `fbm(position * 4.0) * 0.01`

### 1.4 Voronoi边界调色
- [ ] **任务**: 球面UV映射
  ```glsl
  vec2 sphereUV(vec3 dir) {
    float u = atan(dir.z, dir.x) / (2.0 * PI) + 0.5;
    float v = asin(clamp(dir.y, -1.0, 1.0)) / PI + 0.5;
    return vec2(u, v);
  }
  ```
- [ ] **任务**: 边界检测
  - 边界强度: `clamp((d2 - d1) / K, 0.0, 1.0)`
  - K值: `mix(0.16, 0.24, settleW) - 0.02 * splitW`

### 1.5 HTML/CSS HUD
- [ ] **任务**: 基础UI布局
  - 顶部: 状态指示器 (6个状态点)
  - 底部: 操作提示 (当前可执行动作)
  - 侧边: 实验标签 (Phase 4)
- [ ] **任务**: 响应式触控
  - 最小触控区域: 44px × 44px
  - 触控反馈: 8px / 90ms 抖动动画

---

## Phase 2: 核心交互实现

### 2.1 触控事件处理
- [ ] **任务**: 多触控支持
  ```javascript
  const handleTouch = (event) => {
    // 单击: 分裂
    // 双击: 融合预览
    // 长按: 冻结分支
    // 拖拽: 探索/嫁接
  }
  ```
- [ ] **任务**: 手势识别
  - 双击检测: ≤280ms间隔
  - 长按检测: ≥420ms
  - 快速拖拽: >1200px/s (取消)

### 2.2 边缘检测与磁吸
- [ ] **任务**: 视口边缘检测
  ```javascript
  const isAtEdge = (x, y) => {
    const threshold = Math.min(window.innerWidth, window.innerHeight) * 0.1;
    return x < threshold || x > window.innerWidth - threshold ||
           y < threshold || y > window.innerHeight - threshold;
  }
  ```
- [ ] **任务**: 磁吸算法
  ```javascript
  const magneticSnap = (targetPos, currentPos) => {
    const distance = length(targetPos - currentPos);
    if (distance < 48 && distance > 8) {
      return mix(currentPos, targetPos, 0.3); // 磁吸吸引力
    }
    return currentPos;
  }
  ```

### 2.3 动画系统
- [ ] **任务**: 缓动函数库
  ```javascript
  const easings = {
    'split': cubicOut,
    'graft': cubicInOut,
    'fusion': cubicOutBack
  };
  ```
- [ ] **任务**: 动画队列管理
  - 防重叠: 状态锁机制
  - 优先级: 融合 > 嫁接 > 分裂
  - 中断处理: 平滑过渡

---

## Phase 3: 假体积流体效果

### 3.1 双层薄壳系统
- [ ] **任务**: 外层薄壳
  - 材质: 半透明 (alpha = 0.3)
  - 法线扰动: `fbm(normal * 8.0) * 0.02`
  - 边缘发光: fresnel效果

### 3.2 视角增亮
- [ ] **任务**: Fresnel效应
  ```glsl
  float fresnel = pow(1.0 - dot(normal, viewDir), 3.0);
  vec3 rimColor = baseColor * (1.0 + fresnel * 0.5);
  ```
- [ ] **任务**: 动态光照
  - 环境光: 0.7
  - 边缘光: 0.3 * fresnel
  - 噪声调制: `sin(time * 0.5) * 0.1`

### 3.3 噪声扰动系统
- [ ] **任务**: 3D噪声函数
  ```glsl
  float fbm3D(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;

    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p * frequency);
      amplitude *= 0.5;
      frequency *= 2.0;
    }
    return value;
  }
  ```
- [ ] **任务**: 时间混合
  - 基础噪声: `fbm3D(position + time * 0.1)`
  - 呼吸效果: `sin(time * 0.3) * 0.02`

---

## Phase 4: 语义识别与标签

### 4.1 UI标签系统
- [ ] **任务**: 标签组件
  ```jsx
  const TagBadge = ({ label, x, y, active }) => (
    <div className={`tag-badge ${active ? 'active' : ''}`}
         style={{ transform: `translate(${x}px, ${y}px)` }}>
      {label}
    </div>
  );
  ```
- [ ] **任务**: 标签位置算法
  - 避免重叠: 力导向布局
  - 磁吸吸附: 32px吸附半径
  - 边界约束: 保持在视口内

### 4.2 简化语义识别
- [ ] **任务**: 标签预设库
  ```
  const PRESET_TAGS = [
    '哲学', '技术', '艺术', '禅修',
    '存在', '虚无', '变化', '觉察'
  ];
  ```
- [ ] **任务**: 手动标签分配
  - 点击气泡: 显示标签选择器
  - 拖拽标签: 到目标气泡
  - 多标签支持: 最多3个/气泡

---

## 性能优化策略

### 4.1 渲染优化
- [ ] **LOD系统**: 根据距离调整细节
  - 距离 > 500px: setMaxIterations(4)
  - 距离 > 1000px: setMaxIterations(2)
- [ ] **实例化渲染**: 共享几何体
- [ ] **视锥剔除**: 仅渲染可见区域

### 4.2 内存管理
- [ ] **对象池**: 复用气泡对象
- [ ] **纹理压缩**: ASTC格式支持
- [ ] **垃圾回收**: 主动释放大对象

### 4.3 网络优化
- [ ] **代码分割**: Shader Park按需加载
- [ ] **资源预加载**: 关键资源优先
- [ ] **缓存策略**: Service Worker缓存

---

## 风险评估

### 高风险项
1. **Shader Park性能**: 复杂着色器可能影响帧率
   - 缓解措施: 严格限制setMaxIterations ≤ 8
   - 备选方案: 降级到简化着色器

2. **移动端兼容性**: WebGL 2.0支持差异
   - 缓解措施: 功能检测 + 优雅降级
   - 备选方案: Canvas 2D回退

### 中风险项
1. **触控精度**: 小屏幕触控体验
   - 缓解措施: 最小44px触控区域
   - 验证方法: 多设备测试

2. **状态管理复杂性**: 多状态同步问题
   - 缓解措施: 单一数据源 + 状态机验证
   - 监控方案: 状态变化日志

### 低风险项
1. **视觉效果差异**: 设备间渲染差异
   - 缓解措施: 标准化色彩配置文件

---

## 测试策略

### 性能测试
- **基准测试**: 60fps @ 1080p
- **压力测试**: 5个并发分裂
- **内存测试**: 长时间运行泄漏检测

### 兼容性测试
- **浏览器**: Chrome 90+, Firefox 88+, Safari 14+
- **设备**: iPhone 8+, Android 8.0+
- **DPI**: 1x, 2x, 3x支持

### 用户体验测试
- **可用性**: 首次用户操作成功率
- **满意度**: 视觉效果主观评分
- **流畅度**: 交互延迟感知测试

---

## 交付标准

### Phase 1 MVP验收标准
- [x] Shader Park集成完成
- [ ] 基础分裂动画 (320ms, ease-out-cubic)
- [ ] 三球体积守恒验证
- [ ] 边界检测准确率 > 95%
- [ ] 帧率稳定在30fps以上

### Phase 2 完整交互验收
- [ ] 所有触控手势识别准确
- [ ] 磁吸效果流畅自然
- [ ] 状态机转换无异常
- [ ] 动画队列正常工作

### 最终产品验收
- [ ] 冷启动TTI ≤ 3s
- [ ] 渲染性能达标
- [ ] 用户体验流畅
- [ ] 代码质量合格

---

*文档版本: v1.0*
*创建日期: 2025-10-07*
*项目状态: 工程化规划阶段*
*下次更新: Phase 1完成后*