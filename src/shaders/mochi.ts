// 基础渲染内核（Mochi）：
// - 提供顶点/片元着色器源码常量
// - 提供统一的 uniforms 应用函数与绘制函数
// - 所有对外 API 均做 try/catch 与日志打印，便于排错

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
  flatness?: number;
  zcr: number;
  mfcc: [number, number, number, number];
  pulse: number;           // 打击脉冲（用于几何混合/旋转等）
};

// 顶点/片元着色器源码：直接从 ref/mochi.ts 迁移（删去不必要注释）
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

export const MOCHI_FRAGMENT = `
#ifdef GL_ES
precision highp float;
#endif
uniform vec2  uResolution;    // 像素
uniform float uTime;          // 秒
// 音频/全局
uniform float uLevel;         // 0..1 音量
uniform float uFlux;          // 0..1 频谱变化率
uniform float uCentroid;      // 0..1 频谱质心
uniform float uZCR;           // 0..1 过零率
uniform vec4  uMFCC;          // 0..1 x4
uniform float uPulse;         // 0..1 打击脉冲
uniform float uSensitivity;   // 0.5..3.0 可视敏感度
// 视觉控制
uniform float uNoiseScale;
uniform float uMixStrength;
uniform float uColorWarmth;
uniform float uMaxSteps;
uniform float uMaxDist;
uniform float uSurfEpsilon;
uniform float uVolumeStrength;
uniform float uAbsorption;
uniform float uStepScale;
uniform float uAnisotropy;
uniform float uLightStrength;
uniform float uColorCycleSpeed;
uniform float uBgCycleSpeed;
uniform float uGrainStrength;
uniform float uGrainScale;
varying vec2 vTexCoord;
#define R uResolution
mat2 rot(float a){ return mat2(cos(a), -sin(a), sin(a), cos(a)); }
float hash(vec3 p){ p = fract(p*0.3183099 + vec3(0.1,0.2,0.3)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.0-2.0*f); float n000=hash(i+vec3(0,0,0)); float n100=hash(i+vec3(1,0,0)); float n010=hash(i+vec3(0,1,0)); float n110=hash(i+vec3(1,1,0)); float n001=hash(i+vec3(0,0,1)); float n101=hash(i+vec3(1,0,1)); float n011=hash(i+vec3(0,1,1)); float n111=hash(i+vec3(1,1,1)); float nx00=mix(n000,n100,f.x); float nx10=mix(n010,n110,f.x); float nx01=mix(n001,n101,f.x); float nx11=mix(n011,n111,f.x); float nxy0=mix(nx00,nx10,f.y); float nxy1=mix(nx01,nx11,f.y); return mix(nxy0,nxy1,f.z); }
float fbm(vec3 p){ float a=0.5; float f=1.0; float s=max(0.2, uNoiseScale); float acc=0.0; for(int i=0;i<5;i++){ acc += a*noise(p*(f*s)); f*=2.0; a*=0.5; } return acc; }
vec3 fbm3(vec3 p){ return vec3(fbm(p), fbm(p+vec3(17.3,9.1,3.7)), fbm(p+vec3(4.2,21.7,11.9))); }
float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xz)-t.x, p.y); return length(q)-t.y; }
float sdSphere(vec3 p, float r){ return length(p)-r; }
float smin(float a, float b, float k){ float h=clamp(0.5+0.5*(b-a)/k,0.0,1.0); return mix(b,a,h) - k*h*(1.0-h); }
float mapScene(vec3 p, out vec3 baseColor){ vec3 pw=p; float t=uTime*0.25; vec3 warp=fbm3(pw*1.2+vec3(0.0,0.0,-t)); vec3 n=pow(clamp(warp*0.5+0.5,0.0,1.0), vec3(2.2)); vec3 cool=vec3(0.2,0.4,0.9); vec3 warm=vec3(1.0,0.75,0.45); float warmth=clamp(uColorWarmth*0.5+(uCentroid-0.5)*0.3,-1.0,1.0); vec3 tone=mix(cool,warm,0.5+0.5*warmth); baseColor=clamp(n*tone,0.0,1.0); float scale=0.5+n.x*0.05+uLevel*0.10+uFlux*0.06; vec3 q=p; float rx=1.5707963+0.25*sin(uTime*0.35)+uPulse*0.45; float rz=0.35*uTime + -uPulse*0.35; q.yz=rot(rx)*q.yz; q.xz=rot(rz)*q.xz; float dTorus=sdTorus(q, vec2(scale,0.2)); float dSphere=sdSphere(p, scale); float mixBase=clamp(uMixStrength,0.0,1.0); float k=0.35*(0.35+0.65*mixBase*uPulse); float d=smin(dTorus, dSphere, k); float noiseHeight=0.18+0.6*uLevel+0.4*uFlux; noiseHeight *= (0.6+0.4*uPulse); float disp=(fbm(p*1.8+vec3(0.0,0.0,t*1.2))-0.5)*2.0; d -= noiseHeight*0.22*disp; return d; }
vec3 estimateNormal(vec3 p){ float e=max(0.0015, uSurfEpsilon); vec3 c; float d=mapScene(p,c); vec3 nx=vec3(e,0,0), ny=vec3(0,e,0), nz=vec3(0,0,e); vec3 cx; mapScene(p+nx, cx); vec3 cy; mapScene(p+ny, cy); vec3 cz; mapScene(p+nz, cz); return normalize(vec3(mapScene(p+nx,cx)-d, mapScene(p+ny,cy)-d, mapScene(p+nz,cz)-d)); }
vec3 shade(vec3 p, vec3 rd, vec3 nrm, vec3 albedo){ vec3 lightDir=normalize(vec3(0.8,0.9,-0.6)); float diff=clamp(dot(nrm,lightDir),0.0,1.0); float spec=pow(clamp(dot(reflect(-lightDir,nrm), -rd),0.0,1.0),32.0); float audioGain=clamp(uLevel*0.6+uFlux*0.4+uPulse*0.7,0.0,1.5); float brightnessLift=audioGain*0.12*(1.0+uSensitivity*0.15); float ao=1.0; { float h=0.02; float k=1.0; for(int i=0;i<4;i++){ vec3 c; float d=mapScene(p+nrm*h, c); ao *= clamp(1.0 - k * max(0.0, d)/h, 0.5, 1.0); h*=2.0; k*=0.6; } ao=clamp(ao,0.55,1.0);} float rim=pow(1.0-clamp(dot(nrm,-rd),0.0,1.0),2.0); rim*=0.35; vec3 col=albedo*(0.22+0.78*diff)*ao; col+=vec3(0.15)*spec; col+=albedo*rim; col=mix(col, col+col*brightnessLift, 0.6); return clamp(col,0.0,1.0);} 
float gauss2D(vec2 p, vec2 c, float s){ float d2=dot(p-c,p-c); float k=max(1e-5, s*s*2.0); return exp(-d2/k); }
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d){ return a + b * cos(6.2831853 * (c*t + d)); }
vec3 hsb2rgb(vec3 c){ vec3 p=abs(fract(vec3(c.x)+vec3(0.0,2.0/3.0,1.0/3.0))*6.0-3.0); vec3 rgb=clamp(p-1.0,0.0,1.0); rgb=rgb*rgb*(3.0-2.0*rgb); return c.z*mix(vec3(1.0), rgb, c.y); }
bool raymarch(vec3 ro, vec3 rd, out vec3 p, out vec3 nrm, out vec3 albedo, out vec3 volAccum, out float trans){ float t=0.0; float tMax=max(3.0, uMaxDist); int maxSteps=int(max(32.0, uMaxSteps)); float transmittance=1.0; volAccum=vec3(0.0); bool hit=false; vec3 hitAlbedo=vec3(0.0); vec3 hitNormal=vec3(0.0); vec3 pos=vec3(0.0); vec3 lightDir=normalize(vec3(0.8,0.9,-0.6)); for(int i=0;i<128;i++){ if(i>=maxSteps) break; p=ro+rd*t; vec3 baseC; float d=mapScene(p, baseC); float shell=1.0 - clamp((d+0.10)/0.20, 0.0, 1.0); float volNoise=fbm(p*1.3+vec3(0.0,0.0,0.18*uTime)); float density=shell*(0.55+0.45*volNoise); float audioBoost=clamp(uLevel*0.6+uFlux*0.5+uPulse*0.7,0.0,2.0); density*=(0.65+0.7*audioBoost); density*=clamp(uVolumeStrength,0.0,2.0); float stepLen=max(0.005,(abs(d)+0.015)*(1.0/max(0.25,uStepScale))); float shadow=softShadowToLight(p, lightDir); float phase=(1.0/(4.0*3.1415926)) * (1.0-pow(uAnisotropy,2.0)) / pow(1.0 + pow(uAnisotropy,2.0) - 2.0*uAnisotropy*dot(rd,lightDir), 1.5); vec3 emitCol=baseC*(0.55+0.45*volNoise); vec3 inscatter=emitCol*(uLightStrength*shadow)*phase; float absorption=max(0.05, uAbsorption); float atten=exp(-absorption*density*stepLen); vec3 scatter=inscatter*density*stepLen; volAccum += transmittance * scatter; transmittance *= atten; if(!hit && d < uSurfEpsilon){ hit=true; hitNormal=estimateNormal(p); hitAlbedo=baseC; pos=p; } t += stepLen; if(t>tMax || transmittance < 0.02) break; } trans=transmittance; if(hit){ nrm=hitNormal; albedo=hitAlbedo; p=pos; return true; } return false; }
void main(){ vec2 uv=(gl_FragCoord.xy-0.5*R)/min(R.x,R.y); float tBg=uTime*(uBgCycleSpeed>0.0?uBgCycleSpeed:0.2); vec3 pA=vec3(0.18,0.20,0.26); vec3 pB=vec3(0.08,0.06,0.10); vec3 pC=vec3(1.0,1.0,1.0); vec3 pD=vec3(0.00,0.33,0.66); vec3 bgBase=palette(fract(tBg), pA,pB,pC,pD); vec3 bg1=bgBase+vec3(0.02); vec3 bg2=bgBase-vec3(0.03); float g=clamp((uv.y+0.9)/2.0,0.0,1.0); vec3 col=mix(bg1,bg2,g); float t=uTime; float amp=clamp(uLevel*1.6+uFlux*1.2+uPulse*1.8,0.0,3.0); float baseR=0.28+0.06*amp; float childR=0.16+0.05*amp; vec2 c0=0.36*vec2(cos(t*0.25), sin(t*0.22)); vec2 c1=-0.22*vec2(cos(t*0.18+1.3), sin(t*0.2+0.7)); vec2 c2=0.18*vec2(cos(t*0.31+2.1), sin(t*0.27+1.1)); float sigma0=baseR*0.8; float sigma1=childR*0.85; float sigma2=childR*0.7; float field=0.0; field+=gauss2D(uv,c0,sigma0); field+=gauss2D(uv,c1,sigma1); field+=gauss2D(uv,c2,sigma2); field+=0.35*gauss2D(uv, 0.42*c2-0.18*c1, sigma2*0.9); float n=fbm(vec3(uv*2.6, t*0.2)); field*=(0.95+0.12*n+0.06*amp); float px=1.5/min(R.x,R.y); vec2 dx=vec2(px,0.0), dy=vec2(0.0,px); float f1=0.5*field+0.125*(gauss2D(uv+dx,c0,sigma0)+gauss2D(uv-dx,c0,sigma0)+gauss2D(uv+dy,c0,sigma0)+gauss2D(uv-dy,c0,sigma0)); float f2=0.5*field+0.125*(gauss2D(uv+dx,c1,sigma1)+gauss2D(uv-dx,c1,sigma1)+gauss2D(uv+dy,c1,sigma1)+gauss2D(uv-dy,c1,sigma1)); float f3=0.5*field+0.125*(gauss2D(uv+dx,c2,sigma2)+gauss2D(uv-dx,c2,sigma2)+gauss2D(uv+dy,c2,sigma2)+gauss2D(uv-dy,c2,sigma2)); float fieldBlur=0.5*field+0.5*(0.4*f1+0.35*f2+0.25*f3); float mapped=1.0-exp(-2.0*clamp(fieldBlur,0.0,2.0)); float fieldSoft=pow(mapped,1.0); float edgeLo=0.24; float edgeHi=0.86+0.03*amp; float alpha=smoothstep(edgeLo, edgeHi, fieldSoft); alpha=alpha*alpha*(3.0-2.0*alpha); float d=clamp(fieldSoft,0.0,1.0); float blueNoise=fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453); float dn=clamp(d + 0.012*(blueNoise-0.5) + 0.045*(fbm(vec3(uv*2.0, t*0.15))-0.5), 0.0,1.0); float tMain=uTime*(uColorCycleSpeed>0.0?uColorCycleSpeed:0.25); float baseHue01=fract(0.55 + 0.12*sin(tMain) + 0.07*cos(1.7*tMain)); float sat=0.85; float bri=1.0; vec3 baseRgb=hsb2rgb(vec3(baseHue01, sat, bri)); vec3 innerRgb=hsb2rgb(vec3(baseHue01, 0.25, 1.0)); vec3 rgb=mix(baseRgb, innerRgb, clamp(dn*dn,0.0,1.0)); float vign=0.0; float rimMask=pow(1.0-dn,2.0); vec3 rim=vec3(0.008,0.012,0.028)*rimMask; vec3 blobCol=rgb+rim; float a=smoothstep(0.05,0.75,dn); a=pow(a,1.2); vec3 luma=vec3(dot(rgb, vec3(0.299,0.587,0.114))); rgb=clamp(mix(luma, rgb, 1.35), 0.0, 1.0); vec3 coreBoost=rgb*(1.0+0.18*dn); vec3 highlight=vec3(1.0,0.98,0.95)*(0.04*dn); blobCol=clamp(coreBoost+highlight, 0.0, 1.0); col = col*(1.0-a) + blobCol*a; float shadow=pow(1.0-dn,3.0); col *= (1.0 - 0.18*shadow); col = mix(col, col*0.96, 1.0 - vign*0.85); float maxL=0.78; float lum=dot(col, vec3(0.2126,0.7152,0.0722)); float clipAmt=smoothstep(maxL, 1.0, lum); if(clipAmt>0.0){ float scale=maxL / max(1e-4, lum); col = mix(col, col*scale, clipAmt*0.9); } col = pow(col, vec3(1.06)); float scale=max(1.0, uGrainScale); mat2 rotG=mat2(0.7071,-0.7071,0.7071,0.7071); vec2 gp=(gl_FragCoord.xy/scale)*rotG; float grainA=fract(sin(dot(gp+vec2(uTime*37.0,uTime*19.0), vec2(12.9898,78.233)))*43758.5453)-0.5; float grainC=fract(sin(dot(gp*1.37 + 31.7 + uTime*21.0, vec2(26.651,9.271)))*921.271)-0.5; float grain=mix(grainA, grainC, 0.5); float gs=clamp(uGrainStrength,0.0,0.2); float low=fbm(vec3(gl_FragCoord.xy*(0.003/scale), uTime*0.15)); float modAmp=mix(0.7, 1.3, low); col += (0.66*gs*modAmp)*grain; col += (0.5*gs*modAmp)*vec3(0.9, -0.6, 0.45)*grain; col *= (1.0 + 0.06*uPulse); gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0); }
`;

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


