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

@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let data = textureSample(texIn, smp, uv); // r=thick, g=gradx, b=grady
  let thick = data.r;

  // 法线近似（屏幕空间转 3D，z 指向屏幕外）
  var n = normalize(vec3(-data.g, -data.b, 1.0));

  // 简化光照：主光 + Fresnel，营造“糯”与柔边
  let L = normalize(vec3(0.5, 0.6, 1.0));
  let diff = max(dot(n, L), 0.0);

  let viewN = max(dot(n, vec3(0.0,0.0,1.0)), 0.0);
  let fres = pow(1.0 - viewN, 2.0);

  // 颜色基调与厚度映射
  let base = mix(vec3(0.92, 0.90, 0.88), vec3(1.0, 0.98, 0.96), thick);
  let color = base * (0.55 + 0.45 * diff) + fres * 0.15;

  // 边缘柔化（根据厚度作为 alpha）
  let alpha = smoothstep(0.05, 0.6, thick);

  return vec4(color, alpha);
}