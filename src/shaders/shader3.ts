// Shader3 (Shader Park) 代码迁移：保持与 ref/Shader3/sketch1732356/spCode.js 一致，
// 并提供一个可调的 blobCount（默认1），以便单泡/三泡切换。

export const spCode = `
  // 迁移自 ref/Shader3/sketch1732356/spCode.js 的视觉风格，并加入 splitProgress 呼吸式分裂 + 体积守恒

  // 注意：统一采用仅“名称+默认值”的两参形式，避免旧版解析器对 min/max 的限制
  let click = input('click', 0.0);
  let buttonHover = input('buttonHover', 0.0);
  // 输入顺序与 JS 侧传入一致：click, buttonHover, split, splitProgress
  let splitLegacy = input('splitLegacy', 0.0);
  let splitProgress = input('splitProgress', 0.0);
  let showEdges = input('showEdges', 0.0);
  // 多次分裂代数：输入被 shader-park clamp 到 0..1，单独取出再放大到 0..3
  let splitGenerationRaw = input('splitGeneration', 0.0);
  let splitGeneration = splitGenerationRaw * 3.0;
  
  setMaxIterations(8);
  let offset = .1;

  function fbm(p){
    return vec3(
      noise(p),
      noise(p + offset),
      noise(p + offset * 2.0)
    );
  }

  // 背景：与原版一致的体感（噪声调色），保持中性偏亮
  let s = getRayDirection();
  // 适度恢复噪波影响（介于此前与原版之间）
  let n = sin(fbm(s + vec3(0.0, 0.0, -time * 0.1)) * 2.0) * 0.36 + 0.75;
  n = pow(n, vec3(8.0));
  color(n);

  // === 基础 UV Voronoi 分区（MVP）：计算边界强度 sEdge 并用于轻度调色 ===
  // 将射线方向映射为球面 UV（U wrap，V 极区压缩处理）
  let dir = normalize(getRayDirection());
  let U = atan(dir.z, dir.x) / (2.0 * PI) + 0.5; // [-π,π] -> [0,1]
  let V = asin(clamp(dir.y, -1.0, 1.0)) / PI + 0.5; // [-π/2,π/2] -> [0,1]
  // 轻微蓝噪点抖动，掩盖极区条带（幅度极小）
  let jitter = (noise(vec3(U*7.0, V*7.0, time*0.2)) - 0.5) * 0.002;
  U = clamp(U + jitter, 0.0, 1.0);
  V = clamp(V + jitter, 0.0, 1.0);

  // 两个种子点：随 splitProgress 从集中 -> 外扩（对称分布）
  // 直接使用输入计算局部进度，避免提前引用后文的 t
  let tVor = min(max(max(splitLegacy, splitProgress), 0.0), 1.0);
  // 三段式权重（萌生/分裂/稳态），用于轻度调参与视觉节奏
  let warmW = smoothstep(0.0, 0.3, tVor);
  let splitW = clamp(smoothstep(0.3, 0.7, tVor) - smoothstep(0.0, 0.3, tVor), 0.0, 1.0);
  let settleW = clamp(smoothstep(0.7, 1.0, tVor), 0.0, 1.0);
  let baseR = 0.08; // 初始半径（UV 空间）
  // 在分裂阶段略降速（0.6x 的感知），其余阶段保持线性
  let tSpread = tVor - 0.2 * splitW * (tVor * (1.0 - tVor));
  let spread = mix(0.02, 0.18, clamp(tSpread, 0.0, 1.0)); // 外扩距离
  let ang0 = 0.0;
  let ang1 = PI; // 两球对称
  // 中心随噪声微动，避免死板
  let cU = 0.5 + 0.02 * sin(time*0.3);
  let cV = 0.5 + 0.02 * cos(time*0.27);
  let p0 = vec2(cU + spread*cos(ang0), cV + spread*sin(ang0));
  let p1 = vec2(cU + spread*cos(ang1), cV + spread*sin(ang1));
  // 可选：第三、第四、第五站点（当 seedCount>2 时逐步加入），用于更丰富的分区
  let ang2 = PI * 0.5;
  let ang3 = -PI * 0.5;
  let ang4 = PI * 0.25;
  let extraSpread = spread * 0.9;
  let p2 = vec2(cU + extraSpread*cos(ang2), cV + extraSpread*sin(ang2));
  let p3 = vec2(cU + extraSpread*cos(ang3), cV + extraSpread*sin(ang3));
  let p4 = vec2(cU + extraSpread*cos(ang4), cV + extraSpread*sin(ang4));

  // U 方向 wrap 的距离度量
  function du(a, b){
    let d = abs(a - b);
    return min(d, 1.0 - d);
  }
  function distUV(a, b){
    let dx = du(a.x, b.x);
    let dy = a.y - b.y;
    return sqrt(dx*dx + dy*dy);
  }
  let uv = vec2(U, V);
  // 两站点起步，额外站点用于分区噪声丰富，但不需要外部控制
  let d0 = distUV(uv, p0);
  let d1v = distUV(uv, p1);
  let d2v = distUV(uv, p2);
  let d3v = distUV(uv, p3);
  let d4v = distUV(uv, p4);
  // 精确获取最近与次近距离：逐次累积最近值（无需数组/交换）
  let m1 = 999.0; // 最近
  let m2 = 999.0; // 次近
  // 累积宏：m2 = min(m2, max(m1, d)); m1 = min(m1, d);
  m2 = min(m2, max(m1, d0)); m1 = min(m1, d0);
  m2 = min(m2, max(m1, d1v)); m1 = min(m1, d1v);
  m2 = min(m2, max(m1, d2v)); m1 = min(m1, d2v);
  m2 = min(m2, max(m1, d3v)); m1 = min(m1, d3v);
  m2 = min(m2, max(m1, d4v)); m1 = min(m1, d4v);
  let da = m1;
  let db = m2;
  // 边界强度（越小越靠近边界），K 随进度自适应：分裂期更小、更柔
  let K = mix(0.16, 0.24, settleW) - 0.02 * splitW;
  let sEdge = clamp((db - da) / K, 0.0, 1.0);
  // 材质映射近似：边界提亮、内部略收，分裂期权重更高
  let edgeBoost = pow(1.0 - sEdge, 1.2); // 边界强
  let boundaryLight = 0.6 * (0.4 + 0.6 * splitW); // 分裂期更亮
  let interiorDampen = 0.03 * (0.3 + 0.7 * splitW);
  let cBoost = n + vec3(0.08, 0.08, 0.09) * edgeBoost * boundaryLight - vec3(interiorDampen) * (1.0 - edgeBoost);
  // 分区线可视化（调试）：在 sEdge 很小时叠加细薄线条
  if (showEdges > 0.5) {
    let edgeLine = smoothstep(0.0, 0.04, sEdge) - smoothstep(0.06, 0.12, sEdge);
    cBoost += vec3(0.15, 0.15, 0.18) * edgeLine;
  }
  color(cBoost);

  // 主球基础半径（更强的形态噪波）：
  // 大幅提高半径扰动幅度，增强形态呼吸感
  let R0 = .5 + n.x * .08;
  let t = min(max(max(splitLegacy, splitProgress), 0.0), 1.0);
  
  // 保持主球大小恒定，后续分形使用递减比例计算半径
  let R_main = R0;
  let radiusDecay = 0.62; // 每下一代半径缩放
  let gapBase = 0.28 * R0; // 基础安全间隙
  let gapDecay = 0.86; // 随代次衰减的安全间隙
  let detachEase = pow(clamp(t, 0.0, 1.0), 0.8); // 控制分离速度

  function radiusAtDepth(depth){
    if (depth <= 0.0) return R_main;
    return R_main * pow(radiusDecay, depth);
  }

  function detachStep(level){
    let parentR = radiusAtDepth(level);
    let childR = radiusAtDepth(level + 1.0);
    let gap = gapBase * pow(gapDecay, level);
    return parentR + childR + gap;
  }

  function branchSign(idx, depth, level){
    let denom = pow(2.0, depth - level - 1.0);
    denom = max(1.0, denom);
    let bit = floor(mod(idx / denom, 2.0));
    return bit < 0.5 ? 1.0 : -1.0;
  }

  function offsetXForNode(depth, idx){
    let total = 0.0;
    for (let level = 0.0; level < depth; level += 1.0){
      let step = detachStep(level) * detachEase;
      total += branchSign(idx, depth, level) * step;
    }
    return total;
  }

  function jitterForNode(depth, idx){
    let seed = idx + depth * 13.73;
    let amp = 0.08 * pow(radiusDecay, depth);
    return vec3(
      sin(time * 0.72 + seed) * amp,
      cos(time * 0.61 + seed * 0.7) * amp * 0.6,
      sin(time * 0.53 + seed * 1.3) * amp
    );
  }

  // 主球：不再位移背景，不响应鼠标位移（避免左下角问题）
  shape(() => {
    rotateX(PI/2);
    // 临时去除交互旋转，排除相机/交互影响
    // 简化：仅主球，去除 torus，避免视觉干扰
    mixGeo(click);
    sphere(R_main);
  })();

  // 背景位移取消，防止整体偏移到左下角；降低混合，避免子球被吞没
  blend(.35);
  // displace(mouse.x*2, mouse.y, 0) 被移除

  let maxGenerations = min(splitGeneration, 3.0);
  for (let depth = 1.0; depth <= 3.0; depth += 1.0) {
    if (maxGenerations + 0.5 >= depth) {
      let nodeCount = pow(2.0, depth);
      for (let idx = 0.0; idx < 8.0; idx += 1.0) {
        if (idx + 0.5 < nodeCount) {
          let baseRadius = radiusAtDepth(depth);
          let appear = clamp(detachEase * 1.25, 0.0, 1.0);
          let radius = baseRadius * mix(0.55, 1.0, appear);
          let offsetX = offsetXForNode(depth, idx);
          let lift = (depth * 0.22 - 0.14) * R_main;
          let jitter = jitterForNode(depth, idx);

          shape(() => {
            displace(offsetX + jitter.x, lift + jitter.y, jitter.z);
            sphere(radius);
            reset();
          })();
        }
      }
    }
  }
`;
