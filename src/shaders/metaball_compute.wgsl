// 16 bytes 对齐：vec2 (8) + f32 (4) + f32 (4)
struct Ball { pos: vec2<f32>, radius: f32, level: f32 };

@group(0) @binding(0) var<storage, read> balls: array<Ball>;
@group(0) @binding(1) var outTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> uSize: vec2<f32>;  // canvas size (w,h)
@group(0) @binding(3) var<uniform> uCount: u32;       // ball count

fn ndcFromPixel(pix: vec2<f32>, size: vec2<f32>) -> vec2<f32> {
  // 像素坐标 -> NDC[-1,1]
  let uv = (pix + vec2<f32>(0.5)) / size;
  return uv * 2.0 - vec2<f32>(1.0);
}

// metaball 融合核：∑ r^2 / (|p-c|^2 + eps)
// 同时累计梯度近似（对 |p-c| 的偏导）
fn accumulate(p: vec2<f32>, count: u32) -> f32 {
  // 使用有界核 w = r^2 / (|p-c|^2 + r^2)，避免中心奇异导致的尖点
  var t: f32 = 0.0;
  // 纠正长宽比，使屏幕像素度量保持圆形
  let aspect = uSize.x / uSize.y;
  let p2 = vec2<f32>(p.x * aspect, p.y);
  for (var i: u32 = 0u; i < count; i = i + 1u) {
    let c = balls[i].pos;
    let c2 = vec2<f32>(c.x * aspect, c.y);
    let r = balls[i].radius;
    let d2 = distance(p2, c2) * distance(p2, c2);
    let w = (r*r) / (d2 + r*r);
    t = t + w;
  }
  return t;
}

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let size = uSize;
  if (gid.x >= u32(size.x) || gid.y >= u32(size.y)) { return; }

  // 像素 → NDC（屏幕空间）
  let p = vec2<f32>(f32(gid.x), f32(gid.y));
  let ndc = ndcFromPixel(p, size);

  let t = accumulate(ndc, uCount); // 原始场强（已无奇异）
  let T: f32 = 1.0;             // 等值面阈值（可调）
  let k: f32 = 0.25;            // 软过渡宽度（可调）
  let mask = smoothstep(T - k, T + k, t);
  // 输出：r=mask（用于 alpha/边缘），g/b 先置 0，片元阶段再做中心差分求梯度
  let outv = vec4<f32>(mask, 0.0, 0.0, 1.0);
  textureStore(outTex, vec2<i32>(i32(gid.x), i32(gid.y)), outv);
}

fn saturate(x: f32) -> f32 {
  return clamp(x, 0.0, 1.0);
}