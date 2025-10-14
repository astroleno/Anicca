struct VSOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VSOut {
  var pos = array<vec2<f32>, 6>(
    vec2(-1.0,-1.0), vec2( 1.0,-1.0), vec2(-1.0, 1.0),
    vec2(-1.0, 1.0), vec2( 1.0,-1.0), vec2( 1.0, 1.0)
  );
  var out: VSOut;
  out.pos = vec4(pos[vid], 0.0, 1.0);
  out.uv  = (pos[vid] * 0.5) + vec2(0.5);
  return out;
}

@group(0) @binding(0) var texIn: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
// 临时注释掉时间 uniform
// struct TimeBlock { t: f32, _pad0: vec3<f32> };
// @group(0) @binding(2) var<uniform> uTime: TimeBlock;   // 时间（秒）用于背景缓慢演变

// --- 背景噪声（低饱和/暗色） --------------------------------------------
fn hash(p: vec2<f32>) -> f32 {
  // 简单哈希噪声（性能优先）
  let h = sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453;
  return fract(h);
}

fn noise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let a = hash(i);
  let b = hash(i + vec2<f32>(1.0, 0.0));
  let c = hash(i + vec2<f32>(0.0, 1.0));
  let d = hash(i + vec2<f32>(1.0, 1.0));
  let u = f*f*(3.0-2.0*f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm(p: vec2<f32>) -> f32 {
  var v: f32 = 0.0;
  var a: f32 = 0.5;
  var q = p;
  for (var i: i32 = 0; i < 3; i = i + 1) {
    v = v + noise(q) * a;
    q = q * 2.0 + 17.0;
    a = a * 0.5;
  }
  return v;
}

fn bgColor(uv: vec2<f32>, t: f32) -> vec3<f32> {
  // 低频缓慢变化的噪声
  let scale: f32 = 0.8;         // 降采样，柔和
  let speed: f32 = 0.03;        // 缓慢流动
  let n = fbm((uv - 0.5) * scale + vec2<f32>(t * speed, -t * speed));
  // 低饱和/暗色调：从灰到微暖
  let hue = 0.02 + 0.05 * n;    // 细微色相漂移
  let sat = 0.06 + 0.06 * n;    // 低饱和
  let val = 0.04 + 0.05 * n;    // 暗
  // 近似把 HSV 转 RGB（简单而足够）
  let k = vec3<f32>(5.0, 3.0, 1.0) + hue * 6.0;
  let rgb = val * (vec3<f32>(1.0) - sat * clamp(abs(fract(k) * 2.0 - vec3<f32>(1.0)) - vec3<f32>(0.5), vec3<f32>(0.0), vec3<f32>(1.0)));
  return rgb;
}

@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let data = textureSample(texIn, smp, uv); // r=mask
  let mask = data.r;

  // 用中心差分在片元阶段估计梯度，减少 compute 阶段的数值噪声
  let off = vec2<f32>(1.0/1024.0, 1.0/1024.0); // 近似，分辨率影响小
  let m10 = textureSample(texIn, smp, uv + vec2(-off.x, 0.0)).r;
  let m01 = textureSample(texIn, smp, uv + vec2(0.0, -off.y)).r;
  let m12 = textureSample(texIn, smp, uv + vec2(off.x, 0.0)).r;
  let m21 = textureSample(texIn, smp, uv + vec2(0.0, off.y)).r;
  let grad = vec2<f32>(m12 - m10, m21 - m01);
  var n = normalize(vec3(-grad.x, -grad.y, 1.0));

  // 简化光照：主光 + Fresnel，营造“糯”与柔边
  let L = normalize(vec3(0.5, 0.6, 1.0));
  let diff = max(dot(n, L), 0.0);

  let viewN = max(dot(n, vec3(0.0,0.0,1.0)), 0.0);
  let fres = pow(1.0 - viewN, 2.0);

  // 物体颜色基调与掩码映射（麻薯偏暖白）
  let objBase = mix(vec3(0.90, 0.88, 0.86), vec3(1.0, 0.98, 0.96), mask);
  let objColor = objBase * (0.55 + 0.45 * diff) + fres * 0.12;

  // 临时关闭噪声背景，恢复纯色
  let bg = vec3<f32>(0.02, 0.02, 0.03);
  let outColor = mix(bg, objColor, mask);
  return vec4(outColor, 1.0);
}