// Mochi - ShaderPark风格SDF合成（torus/sphere混合+fbm着色）的GLSL移植
// 统一接口：与 spiral/wave 一致，提供 applyMochiUniforms / drawMochi
// 重要约定：将“点击/混合强度”映射为音频脉冲 audio.pulse（uPulse）

export const MOCHI_VERTEX = `
#ifdef GL_ES
precision highp float;
#endif
attribute vec3 aPosition;
attribute vec2 aTexCoord;
varying vec2 vTexCoord;
void main(){
  vTexCoord = aTexCoord;
  vec4 pos = vec4(aPosition, 1.0);
  pos.xy = pos.xy * 2.0 - 1.0;
  gl_Position = pos;
}
`;

// 片元着色器：基于 Shader Park 概念移植（fbm 噪声 + torus/sphere 混合 + raymarch）
export const MOCHI_FRAGMENT = `
#ifdef GL_ES
precision highp float;
#endif

uniform vec2  uResolution;    // 像素
uniform float uTime;          // 秒

// 音频/全局统一参数（与 spiral/wave 保持一致）
uniform float uLevel;         // 0..1 音量
uniform float uFlux;          // 0..1 频谱变化率
uniform float uCentroid;      // 0..1 频谱质心
uniform float uZCR;           // 0..1 过零率
uniform vec4  uMFCC;          // 0..1 x4
uniform float uPulse;         // 0..1 打击脉冲（映射 ShaderPark 的 click/mix）
uniform float uSensitivity;   // 0.5..3.0 可视敏感度

// 视觉控制（可选）
uniform float uNoiseScale;    // 默认 1.0
uniform float uMixStrength;   // 0..1 几何混合强度（基础），会与 uPulse 相乘
uniform float uColorWarmth;   // -1..1 负值偏冷，正值偏暖
uniform float uMaxSteps;      // 最大步进（建议 64~96）
uniform float uMaxDist;       // 最大行进距离（建议 6.0）
uniform float uSurfEpsilon;   // 表面阈值（建议 0.0015~0.003）
// 体积渲染参数
uniform float uVolumeStrength; // 0..2 体积发光强度（默认 0.8）
uniform float uAbsorption;     // 0.1..4 体积吸收系数（默认 1.2）
uniform float uStepScale;      // 0.5..2 步长缩放（默认 1.0 更细=更慢）
uniform float uAnisotropy;     // -0.9..0.9 前向散射相位 g（默认 0.55）
uniform float uLightStrength;  // 0..4 体积入射光强（默认 1.2）
// 色彩循环速度
uniform float uColorCycleSpeed; // 主体颜色循环速度（秒^-1）
uniform float uBgCycleSpeed;    // 背景颜色循环速度（秒^-1）
// 颗粒强度
uniform float uGrainStrength;   // 0..0.2 建议范围，默认 0.06
uniform float uGrainScale;      // 1..4 颗粒尺寸系数（>1 更粗），默认 2.0

varying vec2 vTexCoord;

#define R uResolution

// 旋转矩阵
mat2 rot(float a){ return mat2(cos(a), -sin(a), sin(a), cos(a)); }

// Hash/Noise（简易）
float hash(vec3 p){
  p = fract(p*0.3183099 + vec3(0.1,0.2,0.3));
  p *= 17.0;
  return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
}

float noise(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f*f*(3.0-2.0*f);
  float n000 = hash(i + vec3(0,0,0));
  float n100 = hash(i + vec3(1,0,0));
  float n010 = hash(i + vec3(0,1,0));
  float n110 = hash(i + vec3(1,1,0));
  float n001 = hash(i + vec3(0,0,1));
  float n101 = hash(i + vec3(1,0,1));
  float n011 = hash(i + vec3(0,1,1));
  float n111 = hash(i + vec3(1,1,1));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

// fbm：多八度 Perlin/Fbm，稳定的流动噪声
float fbm(vec3 p){
  float a = 0.5;
  float f = 1.0;
  float s = max(0.2, uNoiseScale);
  float acc = 0.0;
  for(int i=0;i<5;i++){
    acc += a * noise(p * (f * s));
    f *= 2.0;
    a *= 0.5;
  }
  return acc;
}

// 三通道 fbm，便于着色
vec3 fbm3(vec3 p){
  return vec3(
    fbm(p),
    fbm(p + vec3(17.3, 9.1, 3.7)),
    fbm(p + vec3(4.2, 21.7, 11.9))
  );
}

// SDF：圆环与球
float sdTorus(vec3 p, vec2 t){
  vec2 q = vec2(length(p.xz)-t.x, p.y);
  return length(q)-t.y;
}

float sdSphere(vec3 p, float r){
  return length(p)-r;
}

// 平滑最小（布尔混合）
float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}

// 场景 SDF：根据 uPulse 混合 torus / sphere，并用 fbm 位移形成“起伏”
float mapScene(vec3 p, out vec3 baseColor){
  // 域扭曲 + fbm 着色：像 Perlin 一样的平滑流动
  vec3 pw = p;
  float t = uTime * 0.25;
  vec3 warp = fbm3(pw * 1.2 + vec3(0.0, 0.0, -t));
  vec3 n = pow(clamp(warp*0.5 + 0.5, 0.0, 1.0), vec3(2.2));

  // 暖冷调节：uColorWarmth -1..1
  vec3 cool = vec3(0.2, 0.4, 0.9);
  vec3 warm = vec3(1.0, 0.75, 0.45);
  float warmth = clamp(uColorWarmth*0.5 + (uCentroid-0.5)*0.3, -1.0, 1.0);
  vec3 tone = mix(cool, warm, 0.5 + 0.5*warmth);
  baseColor = clamp(n * tone, 0.0, 1.0);

  // 尺度：原作 scale = .5 + n.x*.05，加入音频增益
  float scale = 0.5 + n.x*0.05 + uLevel*0.10 + uFlux*0.06;

  // 旋转：持续时间旋转 + 轻度脉冲
  vec3 q = p;
  float rx = 1.5707963 + 0.25*sin(uTime*0.35) + uPulse*0.45; // 保持旋转
  float rz = 0.35*uTime + -uPulse*0.35; // 基础自转 + 脉冲微调
  q.yz = rot(rx) * q.yz;
  q.xz = rot(rz) * q.xz;

  float dTorus = sdTorus(q, vec2(scale, 0.2));
  float dSphere = sdSphere(p, scale);

  // 基础混合强度（控件）× 脉冲。脉冲越大越偏向混合（更圆/更融合）
  float mixBase = clamp(uMixStrength, 0.0, 1.0);
  float k = 0.35 * (0.35 + 0.65*mixBase*uPulse); // 平滑参数
  float d = smin(dTorus, dSphere, k);

  // 位移场（高度起伏）：音频强度驱动噪声高度
  float noiseHeight = 0.18 + 0.6*uLevel + 0.4*uFlux; // 响度/flux 驱动
  noiseHeight *= (0.6 + 0.4*uPulse); // 脉冲时更起伏
  float disp = (fbm(p * 1.8 + vec3(0.0, 0.0, t*1.2)) - 0.5) * 2.0; // -1..1
  d -= noiseHeight * 0.22 * disp; // 向内外起伏
  return d;
}

// 法线估计
vec3 estimateNormal(vec3 p){
  float e = max(0.0015, uSurfEpsilon);
  vec3 c; 
  float d = mapScene(p, c);
  vec3 nx = vec3(e,0,0), ny = vec3(0,e,0), nz = vec3(0,0,e);
  vec3 cx; mapScene(p+nx, cx);
  vec3 cy; mapScene(p+ny, cy);
  vec3 cz; mapScene(p+nz, cz);
  return normalize(vec3(
    mapScene(p+nx, cx) - d,
    mapScene(p+ny, cy) - d,
    mapScene(p+nz, cz) - d
  ));
}

// 主着色：简单直接的漫反射 + 高光 + 环境 + 音频增益限制
vec3 shade(vec3 p, vec3 rd, vec3 nrm, vec3 albedo){
  vec3 lightDir = normalize(vec3(0.8, 0.9, -0.6));
  float diff = clamp(dot(nrm, lightDir), 0.0, 1.0);
  float spec = pow(clamp(dot(reflect(-lightDir, nrm), -rd), 0.0, 1.0), 32.0);

  float audioGain = clamp(uLevel*0.6 + uFlux*0.4 + uPulse*0.7, 0.0, 1.5);
  float brightnessLift = audioGain * 0.12 * (1.0 + uSensitivity*0.15);

  // 近似环境遮蔽：采样法线方向的 SDF 距离（廉价 AO）
  float ao = 1.0;
  {
    float h = 0.02;
    float k = 1.0;
    for(int i=0;i<4;i++){
      vec3 c; float d = mapScene(p + nrm * h, c);
      ao *= clamp(1.0 - k * max(0.0, d)/h, 0.5, 1.0);
      h *= 2.0; k *= 0.6;
    }
    ao = clamp(ao, 0.55, 1.0);
  }

  // 边缘光
  float rim = pow(1.0 - clamp(dot(nrm, -rd), 0.0, 1.0), 2.0);
  rim *= 0.35;

  vec3 col = albedo * (0.22 + 0.78*diff) * ao;
  col += vec3(0.15) * spec;
  col += albedo * rim;
  col = mix(col, col + col*brightnessLift, 0.6);
  col = clamp(col, 0.0, 1.0);
  return col;
}

// Henyey-Greenstein 相位函数（单次散射近似）
float hgPhase(float cosTheta, float g){
  float gg = g*g;
  return (1.0/(4.0*3.1415926)) * (1.0-gg) / pow(1.0 + gg - 2.0*g*cosTheta, 1.5);
}

// 近似单次散射：到光源的短程阴影采样
float softShadowToLight(vec3 pos, vec3 ldir){
  float t = 0.02; float res = 1.0;
  for(int i=0;i<16;i++){
    vec3 c; float d = mapScene(pos + ldir * t, c);
    res = min(res, 8.0 * d / t);
    t += clamp(d, 0.01, 0.12);
    if(res < 0.02) break;
  }
  return clamp(res, 0.0, 1.0);
}

// 顶层高斯场函数（屏幕空间 metaball 使用）
float gauss2D(vec2 p, vec2 c, float s){
  float d2 = dot(p-c, p-c);
  float k = max(1e-5, s*s*2.0);
  return exp(-d2 / k);
}

// 连续色带（iq palette）：避免分段色产生“两块颜色”
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d){
  return a + b * cos(6.2831853 * (c * t + d));
}

// HSB/HSV 到 RGB（范围均为 0..1）
vec3 hsb2rgb(vec3 c){
  vec3 p = abs(fract(vec3(c.x) + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  vec3 rgb = clamp(p - 1.0, 0.0, 1.0);
  rgb = rgb * rgb * (3.0 - 2.0 * rgb); // 柔化
  return c.z * mix(vec3(1.0), rgb, c.y);
}

// Raymarch
// Raymarch with volumetric accumulation even when surface is hit
bool raymarch(vec3 ro, vec3 rd, out vec3 p, out vec3 nrm, out vec3 albedo, out vec3 volAccum, out float trans){
  float t = 0.0;
  float tMax = max(3.0, uMaxDist);
  int maxSteps = int(max(32.0, uMaxSteps));
  float transmittance = 1.0; // 透射率
  volAccum = vec3(0.0);
  bool hit = false;
  vec3 hitAlbedo = vec3(0.0);
  vec3 hitNormal = vec3(0.0);
  vec3 pos = vec3(0.0);
  vec3 lightDir = normalize(vec3(0.8, 0.9, -0.6));
  for(int i=0;i<128;i++){
    if(i>=maxSteps) break;
    p = ro + rd * t;
    vec3 baseC;
    float d = mapScene(p, baseC);
    // 体积密度：基于 SDF 的壳层与噪声调制，越靠近表面密度越大
    // 将距离映射到 0..1 的壳，负值（内部）更高密度
    float shell = 1.0 - clamp((d + 0.10) / 0.20, 0.0, 1.0);
    // 噪声体积：平滑流动
    float volNoise = fbm(p * 1.3 + vec3(0.0, 0.0, 0.18*uTime));
    float density = shell * (0.55 + 0.45*volNoise);
    // 音频驱动体积：响度/flux/脉冲提升密度
    float audioBoost = clamp(uLevel*0.6 + uFlux*0.5 + uPulse*0.7, 0.0, 2.0);
    density *= (0.65 + 0.7*audioBoost);
    density *= clamp(uVolumeStrength, 0.0, 2.0);

    // 步长：自适应 + 控件缩放
    float stepLen = max(0.005, (abs(d) + 0.015) * (1.0 / max(0.25, uStepScale)));

    // 单次散射：入射光衰减 + 相位
    float shadow = softShadowToLight(p, lightDir);
    float phase = hgPhase(dot(rd, lightDir), clamp(uAnisotropy, -0.9, 0.9));
    vec3 emitCol = baseC * (0.55 + 0.45*volNoise);
    vec3 inscatter = emitCol * (uLightStrength * shadow) * phase;

    // 体积吸收与发光（Beer-Lambert）
    float absorption = max(0.05, uAbsorption);
    float atten = exp(-absorption * density * stepLen);
    vec3 scatter = inscatter * density * stepLen;
    volAccum += transmittance * scatter;
    transmittance *= atten;
    if(!hit && d < uSurfEpsilon){
      // 记录命中，但继续行进一段距离，以获得命中后的体积光晕
      hit = true;
      hitNormal = estimateNormal(p);
      hitAlbedo = baseC;
      pos = p;
    }
    // 推进：使用自适应步长，避免穿透细节
    t += stepLen;
    if(t > tMax || transmittance < 0.02) break;
  }
  trans = transmittance;
  if(hit){
    nrm = hitNormal;
    albedo = hitAlbedo;
    p = pos;
    return true;
  }
  return false;
}

void main(){
  // 2D 屏幕空间 metaball + 彩色渐变（高性能，贴近参考图）
  vec2 uv = (gl_FragCoord.xy - 0.5*R) / min(R.x, R.y);

  // 背景颜色循环（青→紫→蓝）
  float tBg = uTime * (uBgCycleSpeed > 0.0 ? uBgCycleSpeed : 0.2);
  vec3 pA = vec3(0.18, 0.20, 0.26);
  vec3 pB = vec3(0.08, 0.06, 0.10);
  vec3 pC = vec3(1.0, 1.0, 1.0);
  vec3 pD = vec3(0.00, 0.33, 0.66);
  vec3 bgBase = palette(fract(tBg), pA, pB, pC, pD);
  vec3 bg1 = bgBase + vec3(0.02, 0.02, 0.02);
  vec3 bg2 = bgBase - vec3(0.03, 0.03, 0.03);
  float g = clamp((uv.y+0.9)/2.0, 0.0, 1.0);
  vec3 col = mix(bg1, bg2, g);

  // metaball 场：3~4 个中心，半径/位置受音频驱动
  float t = uTime;
  float amp = clamp(uLevel*1.6 + uFlux*1.2 + uPulse*1.8, 0.0, 3.0);
  // 尺寸进一步下调，避免铺满屏
  float baseR = 0.28 + 0.06*amp;         // 主半径
  float childR = 0.16 + 0.05*amp;        // 子半径
  vec2 c0 = 0.36 * vec2(cos(t*0.25), sin(t*0.22));
  vec2 c1 = -0.22 * vec2(cos(t*0.18+1.3), sin(t*0.2+0.7));
  vec2 c2 = 0.18 * vec2(cos(t*0.31+2.1), sin(t*0.27+1.1));

  float sigma0 = baseR*0.8;
  float sigma1 = childR*0.85;
  float sigma2 = childR*0.7;

  // 场强度：高斯叠加 + 轻噪声扰动
  float field = 0.0;
  field += gauss2D(uv, c0, sigma0);
  field += gauss2D(uv, c1, sigma1);
  field += gauss2D(uv, c2, sigma2);
  field += 0.35 * gauss2D(uv, 0.42*c2 - 0.18*c1, sigma2*0.9);
  float n = fbm(vec3(uv*2.6, t*0.2));
  field *= (0.95 + 0.12*n + 0.06*amp);
  // 邻域柔化，降低分层
  float px = 1.5 / min(R.x, R.y);
  vec2 dx = vec2(px, 0.0), dy = vec2(0.0, px);
  float f1 = 0.5*field + 0.125*(
    gauss2D(uv+dx, c0, sigma0)+gauss2D(uv-dx, c0, sigma0)+
    gauss2D(uv+dy, c0, sigma0)+gauss2D(uv-dy, c0, sigma0)
  );
  float f2 = 0.5*field + 0.125*(
    gauss2D(uv+dx, c1, sigma1)+gauss2D(uv-dx, c1, sigma1)+
    gauss2D(uv+dy, c1, sigma1)+gauss2D(uv-dy, c1, sigma1)
  );
  float f3 = 0.5*field + 0.125*(
    gauss2D(uv+dx, c2, sigma2)+gauss2D(uv-dx, c2, sigma2)+
    gauss2D(uv+dy, c2, sigma2)+gauss2D(uv-dy, c2, sigma2)
  );
  float fieldBlur = 0.5*field + 0.5*(0.4*f1 + 0.35*f2 + 0.25*f3);

  // 边缘软阈值，扩宽羽化并降低斜率，避免硬边
  // 连续映射：适度映射，避免过度羽化；确保主体有实体感
  float mapped = 1.0 - exp(-2.0 * clamp(fieldBlur, 0.0, 2.0));
  float fieldSoft = pow(mapped, 1.0);
  // 扩大羽化区间并降低梯度，弱化边界
  float edgeLo = 0.24;
  float edgeHi = 0.86 + 0.03*amp;
  float alpha = smoothstep(edgeLo, edgeHi, fieldSoft);
  // 单次 S 曲线即可（减少固定带）
  alpha = alpha*alpha*(3.0 - 2.0*alpha);

  // 统一密度驱动：颜色与透明度共用 dn，避免中心-边缘错位/分层
  float d = clamp(fieldSoft, 0.0, 1.0);
  // 蓝噪点抖动：降低 8bit 梯度分层（屏幕空间哈希）
  float blueNoise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233))) * 43758.5453);
  float dn = clamp(d + 0.012*(blueNoise - 0.5) + 0.045*(fbm(vec3(uv*2.0, t*0.15)) - 0.5), 0.0, 1.0);

  // 主体颜色循环（真正按色相旋转）
  float tMain = uTime * (uColorCycleSpeed > 0.0 ? uColorCycleSpeed : 0.25);
  float baseHue01 = fract(0.55 + 0.12 * sin(tMain) + 0.07 * cos(1.7*tMain)); // 青蓝附近摆动
  float sat = 0.85;
  float bri = 1.0;
  vec3 baseRgb = hsb2rgb(vec3(baseHue01, sat, bri));
  vec3 innerRgb = hsb2rgb(vec3(baseHue01, 0.25, 1.0)); // 内核更亮更浅
  vec3 rgb = mix(baseRgb, innerRgb, clamp(dn*dn, 0.0, 1.0));

  // 外缘暗化（更柔）
  // 暂停暗角，避免整体进一步变淡
  float vign = 0.0;
  float rimMask = pow(1.0 - dn, 2.0);
  vec3 rim = vec3(0.008, 0.012, 0.028) * rimMask;

  vec3 blobCol = rgb + rim;
  // 预乘式混合：增强主体在深色背景上的对比度
  float a = smoothstep(0.05, 0.75, dn);
  a = pow(a, 1.2);
  // 核心增亮和轻微高光（不额外引入阈值，仅随 dn）
  // 提升饱和度与中心亮度
  vec3 luma = vec3(dot(rgb, vec3(0.299, 0.587, 0.114)));
  rgb = clamp(mix(luma, rgb, 1.35), 0.0, 1.0);
  // 进一步降低中心亮度增益与高光，防止过曝
  vec3 coreBoost = rgb * (1.0 + 0.18 * dn);
  vec3 highlight = vec3(1.0, 0.98, 0.95) * (0.04 * dn);
  blobCol = clamp(coreBoost + highlight, 0.0, 1.0);
  col = col*(1.0 - a) + blobCol*a;
  // 外缘轻微暗影，增强主体边界可读性（仅依赖密度，非描边）
  float shadow = pow(1.0 - dn, 3.0);
  col *= (1.0 - 0.18 * shadow);
  col = mix(col, col*0.96, 1.0 - vign*0.85);

  // 亮度软剪裁：限制最亮不至于刺眼（根据当前亮度做平滑压制）
  float maxL = 0.78;
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float clipAmt = smoothstep(maxL, 1.0, lum);
  if (clipAmt > 0.0) {
    float scale = maxL / max(1e-4, lum);
    col = mix(col, col * scale, clipAmt * 0.9);
  }
  // 全局微弱降亮（偏向高亮区域），避免大面积白场
  col = pow(col, vec3(1.06));

  // 细微噪点（Film Grain）：提升质感，减少大面积平滑带来的单调
  // 双通道颗粒噪声：蓝噪点 + 细纹噪声（时变），更明显但不过分
  float scale = max(1.0, uGrainScale);
  // 避免条纹：使用旋转后的蓝噪点哈希，而不是正弦条纹
  mat2 rotG = mat2(0.7071, -0.7071, 0.7071, 0.7071);
  vec2 gp = (gl_FragCoord.xy / scale) * rotG;
  float grainA = fract(sin(dot(gp + vec2(uTime*37.0, uTime*19.0), vec2(12.9898,78.233))) * 43758.5453) - 0.5;
  float grainC = fract(sin(dot(gp*1.37 + 31.7 + uTime*21.0, vec2(26.651, 9.271))) * 921.271) - 0.5;
  float grain = mix(grainA, grainC, 0.5);
  // 颗粒强度可控（uGrainStrength）：建议 0..0.2；加低频调制让颗粒“忽浓忽淡”
  float gs = clamp(uGrainStrength, 0.0, 0.2);
  float low = fbm(vec3(gl_FragCoord.xy * (0.003/scale), uTime*0.15)); // 低频0..1
  float modAmp = mix(0.7, 1.3, low);
  col += (0.66 * gs * modAmp) * grain;                  // 亮度噪声
  col += (0.5  * gs * modAmp) * vec3(0.9, -0.6, 0.45) * grain; // 轻微色彩噪声

  // 音频脉冲时的微量亮度呼吸
  col *= (1.0 + 0.06*uPulse);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export type MochiControls = {
  noiseScale?: number;     // 噪声尺度
  mixStrength?: number;    // 基础混合强度 0..1（与脉冲相乘）
  colorWarmth?: number;    // -1..1 冷暖
  maxSteps?: number;       // 最大步进
  maxDist?: number;        // 最大行进距离
  surfEpsilon?: number;    // 表面阈值
  volumeStrength?: number; // 体积发光强度 0..2
  absorption?: number;     // 体积吸收系数 0.1..4
  stepScale?: number;      // 步长缩放 0.5..2（越小越细致）
  anisotropy?: number;     // 相位 g -0.9..0.9（前向散射）
  lightStrength?: number;  // 入射光强 0..4
  colorCycleSpeed?: number; // 主体颜色循环速度（秒^-1）
  bgCycleSpeed?: number;    // 背景颜色循环速度（秒^-1）
  grainStrength?: number;   // 颗粒强度（0..0.2）
  grainScale?: number;      // 颗粒尺寸（1..4）
};

export type MochiAudioUniforms = {
  level: number;
  flux: number;
  centroid: number;
  flatness: number;
  zcr: number;
  mfcc: [number, number, number, number];
  pulse: number;           // 打击脉冲（用于几何混合/旋转等）
};

export function applyMochiUniforms(
  p: any,
  shader: any,
  audio: MochiAudioUniforms,
  sensitivity: number,
  controls?: MochiControls
){
  try {
    shader.setUniform('uTime', p.millis() / 1000.0);
    shader.setUniform('uResolution', [p.width, p.height]);

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v || 0));

    // 音频参数
    shader.setUniform('uLevel', clamp01(audio.level));
    shader.setUniform('uFlux', clamp01(audio.flux));
    shader.setUniform('uCentroid', clamp01(audio.centroid));
    shader.setUniform('uZCR', clamp01(audio.zcr));
    shader.setUniform('uMFCC', [
      clamp01(audio.mfcc?.[0] ?? 0),
      clamp01(audio.mfcc?.[1] ?? 0),
      clamp01(audio.mfcc?.[2] ?? 0),
      clamp01(audio.mfcc?.[3] ?? 0),
    ]);
    shader.setUniform('uPulse', clamp01(audio.pulse));
    shader.setUniform('uSensitivity', Math.max(0.5, Math.min(3.0, sensitivity || 1.2)));

    // 控件参数（含默认值）
    const c = {
      noiseScale: controls?.noiseScale ?? 1.0,
      mixStrength: Math.max(0.0, Math.min(1.0, controls?.mixStrength ?? 0.8)),
      colorWarmth: Math.max(-1.0, Math.min(1.0, controls?.colorWarmth ?? 0.1)),
      maxSteps: Math.max(32, Math.min(96, controls?.maxSteps ?? 64)),
      maxDist: Math.max(3.0, Math.min(10.0, controls?.maxDist ?? 6.0)),
      surfEpsilon: Math.max(0.001, Math.min(0.01, controls?.surfEpsilon ?? 0.0025)),
      volumeStrength: Math.max(0.0, Math.min(2.0, controls?.volumeStrength ?? 1.0)),
      absorption: Math.max(0.1, Math.min(4.0, controls?.absorption ?? 1.2)),
      stepScale: Math.max(0.5, Math.min(2.0, controls?.stepScale ?? 1.0)),
      anisotropy: Math.max(-0.9, Math.min(0.9, controls?.anisotropy ?? 0.55)),
      lightStrength: Math.max(0.0, Math.min(4.0, controls?.lightStrength ?? 1.2)),
      colorCycleSpeed: Math.max(0.0, Math.min(2.0, controls?.colorCycleSpeed ?? 0.15)),
      bgCycleSpeed: Math.max(0.0, Math.min(2.0, controls?.bgCycleSpeed ?? 0.2)),
      grainStrength: Math.max(0.0, Math.min(0.2, controls?.grainStrength ?? 0.06)),
      grainScale: Math.max(1.0, Math.min(4.0, controls?.grainScale ?? 2.0)),
    } as Required<MochiControls>;

    shader.setUniform('uNoiseScale', c.noiseScale);
    shader.setUniform('uMixStrength', c.mixStrength);
    shader.setUniform('uColorWarmth', c.colorWarmth);
    shader.setUniform('uMaxSteps', c.maxSteps);
    shader.setUniform('uMaxDist', c.maxDist);
    shader.setUniform('uSurfEpsilon', c.surfEpsilon);
    shader.setUniform('uVolumeStrength', c.volumeStrength);
    shader.setUniform('uAbsorption', c.absorption);
    shader.setUniform('uStepScale', c.stepScale);
    shader.setUniform('uAnisotropy', c.anisotropy);
    shader.setUniform('uLightStrength', c.lightStrength);
    shader.setUniform('uColorCycleSpeed', c.colorCycleSpeed);
    shader.setUniform('uBgCycleSpeed', c.bgCycleSpeed);
    shader.setUniform('uGrainStrength', c.grainStrength);
    shader.setUniform('uGrainScale', c.grainScale);
  } catch (err) {
    console.error('[Mochi] applyMochiUniforms error:', err);
  }
}

export function drawMochi(p: any, shader: any){
  try {
    shader.setUniform('uResolution', [p.width, p.height]);
    p.shader(shader);
    p.noStroke();
    p.rectMode(p.CENTER);
    p.rect(0, 0, p.width, p.height);
  } catch (err) {
    console.error('[Mochi] drawMochi error:', err);
  }
}


