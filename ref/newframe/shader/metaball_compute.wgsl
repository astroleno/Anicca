struct Ball { pos: vec2<f32>, radius: f32, level: u32, _pad: u32; };

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
fn accumulate(p: vec2<f32>, count: u32) -> vec3<f32> {
  var t: f32 = 0.0;      // thickness/coverage
  var gx: f32 = 0.0;
  var gy: f32 = 0.0;
  let eps: f32 = 1e-4;
  for (var i: u32 = 0u; i < count; i = i + 1u) {
    let c = balls[i].pos;
    let r = balls[i].radius;
    let d2 = max(distance(p, c) * distance(p, c), eps);
    let w = (r*r) / d2;
    t = t + w;

    // ∂w/∂p ≈ -2 r^2 (p-c) / (|p-c|^4 + eps)
    let v = p - c;
    let inv = 1.0 / (d2*d2 + eps);
    let k = -2.0 * r*r * inv;
    gx = gx + k * v.x;
    gy = gy + k * v.y;
  }
  return vec3<f32>(t, gx, gy);
}

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let size = uSize;
  if (gid.x >= u32(size.x) || gid.y >= u32(size.y)) { return; }

  // 像素 → NDC（屏幕空间）
  let p = vec2<f32>(f32(gid.x), f32(gid.y));
  let ndc = ndcFromPixel(p, size);

  let acc = accumulate(ndc, uCount);
  // 简单阈值与 softstep 调整，避免涂满屏
  let t = acc.x;
  // 归一化并压缩到 0..1（参数可调）
  let thick = saturate(t * 0.25); // 调细“覆盖度”
  // 梯度 → 法线方向（屏幕空间），后续片元再正规化
  let outv = vec4<f32>(thick, acc.y, acc.z, 1.0);
  textureStore(outTex, vec2<i32>(i32(gid.x), i32(gid.y)), outv);
}

fn saturate(x: f32) -> f32 {
  return clamp(x, 0.0, 1.0);
}