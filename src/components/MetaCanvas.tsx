import React, { useEffect, useMemo, useRef } from "react";

// ===== 元信息 =====
// 目标：
// 1) 复刻 ShaderPark 的淡彩弥散球质感（轻量 fbm + pow 曲线），
// 2) 真正的 metaball 融合/分裂（统一标量场），
// 3) 与现有 chatUI 的 splitCount / splitProgress / 参数桥接，
// 4) 统一坐标度量（修复半径过小、拖拽偏移、背景单色）。

export type Seed = { id: string; x: number; y: number; r: number };

export type MetaCanvasProps = {
  width?: number;
  height?: number;
  splitCount?: number;     // N 个球
  splitProgress?: number;  // 0..1
  iso?: number;            // 0.45..0.65
  gammaPow?: number;       // 1.4..2.6（小于 3，更像 ShaderPark 的柔彩）
  edgeSoftnessPx?: number; // 1.5..2.5
  bgNoiseAmp?: number;     // 0..0.5
  bgNoiseScale?: number;   // 0.5..1.5
  timeSpeed?: number;      // 0.05..0.2
  seeds?: Seed[];          // 外部自定义（百分比坐标与短边百分比半径）
  onFrame?: (t: number) => void;
};

const MAX_SEEDS = 8;

// ===== GL 工具 =====
function createShader(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!; gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || "");
  return sh;
}
function createProgram(gl: WebGLRenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  const v = createShader(gl, gl.VERTEX_SHADER, vs);
  const f = createShader(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "");
  gl.deleteShader(v); gl.deleteShader(f); return p;
}

// ===== 顶点：全屏三角形 =====
const VERT = `
attribute vec2 a_pos; varying vec2 v_uv; void main(){ v_uv=a_pos*0.5+0.5; gl_Position=vec4(a_pos,0.0,1.0); }
`;

// ===== 片元：统一场 + 淡彩背景（RGB 去相关） =====
const FRAG = `
precision highp float; varying vec2 v_uv;
uniform vec2 u_res; uniform float u_time; uniform float u_iso; uniform float u_gammaPow; uniform float u_edgePx; uniform float u_bgAmp; uniform float u_bgScale; uniform float u_timeSpeed; uniform int u_seedCount; uniform vec3 u_seeds[${MAX_SEEDS}];

// Value noise + 旋转矩阵
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); float a=hash(i); float b=hash(i+vec2(1.0,0.0)); float c=hash(i+vec2(0.0,1.0)); float d=hash(i+vec2(1.0,1.0)); vec2 u=f*f*(3.0-2.0*f); return mix(mix(a,b,u.x), mix(c,d,u.x), u.y); }
float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<3;i++){ s+=a*vnoise(p); p*=2.0; a*=0.5;} return s; }
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }

// 软核（Wyvill 型）
float kernel(float d, float r){ float x=clamp(d/max(r,1e-5),0.0,1.0); float v=1.0-x*x; return v*v; }

float field(vec2 p){ float F=0.0; for(int i=0;i<${MAX_SEEDS}; ++i){ if(i>=u_seedCount) break; vec2 c=u_seeds[i].xy; float r=u_seeds[i].z; F+=kernel(length(p-c), r); } return F; }

vec2 gradF(vec2 p){ vec2 px=2.0*vec2(1.0/u_res.x, 1.0/u_res.y); float Fx1=field(p+vec2(px.x,0.0)); float Fx0=field(p-vec2(px.x,0.0)); float Fy1=field(p+vec2(0.0,px.y)); float Fy0=field(p-vec2(0.0,px.y)); return vec2(Fx1-Fx0, Fy1-Fy0); }

void main(){
  // 统一度量：p0 为未拉伸的标准 NDC（[-1,1]），再对 x 做 aspect 矫正进入场
  vec2 res=u_res; float aspect=res.x/res.y;
  vec2 p0=v_uv*2.0-1.0;                 // 标准 NDC（不带拉伸）
  vec2 p=vec2(p0.x/aspect, p0.y);       // 用于场的等距度量

  // 背景淡彩（RGB 去相关：旋转 + 位移 + 不同相位）
  vec2 q = p * u_bgScale; float t = u_time*u_timeSpeed;
  vec3 n;
  n.r = fbm(rot(0.0    )*(q+vec2( 0.00, -t)));
  n.g = fbm(rot(2.09439)*(q+vec2( 3.71, -t*1.07)));
  n.b = fbm(rot(4.18878)*(q+vec2(-2.42, -t*0.93)));
  n = clamp(n*(1.0+u_bgAmp)+0.20, 0.0, 1.0);
  n = pow(n, vec3(u_gammaPow));

  // Metaball 场 + 软边
  float F = field(p);
  vec2 g = gradF(p); float gLen=max(length(g), 1e-4);
  float distLike=(F-u_iso)/gLen; // 签名近似距离
  float aa = clamp(0.5 - distLike/(u_edgePx*0.5*2.0/u_res.y), 0.0, 1.0);
  float mask = smoothstep(0.0,1.0,aa);

  // 轻质感（wrap + 微 Fresnel）
  vec3 N = normalize(vec3(g.x, g.y, 1.0)); vec3 V=vec3(0,0,1);
  float NdV=clamp(dot(N,V),0.0,1.0); float wrap=0.35; float diff=clamp((NdV+wrap)/(1.0+wrap),0.0,1.0); float fres=pow(1.0-NdV,3.0);
  vec3 base=n; vec3 blob=n*(0.65+0.35*diff)+0.08*fres; vec3 col=mix(base, blob, mask);
  gl_FragColor=vec4(clamp(col,0.0,1.0),1.0);
}
`;

export default function MetaCanvas({
  width = 1024, height = 640,
  splitCount = 1, splitProgress = 0,
  iso = 0.52, gammaPow = 1.8,
  edgeSoftnessPx = 2.0,
  bgNoiseAmp = 0.35, bgNoiseScale = 0.9,
  timeSpeed = 0.1,
  seeds,
  onFrame,
}: MetaCanvasProps){
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const glRef = useRef<WebGLRenderingContext|null>(null);
  const progRef = useRef<WebGLProgram|null>(null);
  const bufRef = useRef<WebGLBuffer|null>(null);
  const startRef = useRef<number>(performance.now());

  // 统一：外部 seeds 使用 百分比坐标 + 短边百分比半径；映射到 NDC（未乘 aspect）
  const derived = useMemo<Seed[]>(()=>{
    if (seeds && seeds.length){
      return seeds.slice(0, MAX_SEEDS).map((s,i)=>({
        id: s.id ?? String(i),
        x: 2*s.x-1,                    // 百分比 → NDC x
        y: 1-2*s.y,                    // 百分比 → NDC y（顶部为 +1）
        r: s.r                          // 短边百分比 → 直接作为 NDC 半径
      }));
    }
    // 无外部 seeds：按分裂进度生成环形布局（体积守恒）
    const N = Math.max(1, Math.min(MAX_SEEDS, Math.floor(splitCount)));
    const r0 = 0.48; const childR = r0/Math.cbrt(N);
    if (N===1) return [{ id: "0", x: 0, y: 0, r: r0 }];
    const R = 0.55 - childR; const out: Seed[]=[];
    for(let i=0;i<N;i++){ const ang = i/N*Math.PI*2; const tx=Math.cos(ang)*R; const ty=Math.sin(ang)*R; const x = 0*(1-splitProgress)+tx*splitProgress; const y = 0*(1-splitProgress)+ty*splitProgress; out.push({ id: String(i), x, y, r: childR }); }
    return out;
  },[seeds, splitCount, splitProgress]);

  useEffect(()=>{
    const canvas = canvasRef.current!;
    const gl = (canvas.getContext("webgl", { antialias: true, alpha: false }) || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) throw new Error("WebGL not supported"); glRef.current = gl;

    const prog = createProgram(gl, VERT, FRAG); progRef.current = prog; gl.useProgram(prog);

    const buf = gl.createBuffer()!; bufRef.current = buf; gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const tri = new Float32Array([-1,-1, 3,-1, -1,3]); gl.bufferData(gl.ARRAY_BUFFER, tri, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos"); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = (n:string)=> gl.getUniformLocation(prog, n);
    const uSeeds: (WebGLUniformLocation|null)[] = Array.from({length: MAX_SEEDS}, (_,i)=> u(`u_seeds[${i}]`));

    let raf = 0; const render = ()=>{
      const t = (performance.now()-startRef.current)/1000; if(onFrame) onFrame(t);
      gl.useProgram(prog);
      gl.uniform2f(u("u_res"), canvas.width, canvas.height);
      gl.uniform1f(u("u_time"), t);
      gl.uniform1f(u("u_iso"), iso);
      gl.uniform1f(u("u_gammaPow"), gammaPow);
      gl.uniform1f(u("u_edgePx"), edgeSoftnessPx);
      gl.uniform1f(u("u_bgAmp"), bgNoiseAmp);
      gl.uniform1f(u("u_bgScale"), bgNoiseScale);
      gl.uniform1f(u("u_timeSpeed"), timeSpeed);

      const count = Math.min(MAX_SEEDS, derived.length); gl.uniform1i(u("u_seedCount"), count);
      for(let i=0;i<MAX_SEEDS;i++){
        const loc = uSeeds[i]; if(!loc) continue;
        if(i<count){ const s=derived[i]; gl.uniform3f(loc, s.x, s.y, s.r); }
        else{ gl.uniform3f(loc, -10, -10, 0); }
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return ()=> cancelAnimationFrame(raf);
  },[iso, gammaPow, edgeSoftnessPx, bgNoiseAmp, bgNoiseScale, timeSpeed, derived, onFrame]);

  useEffect(()=>{
    const c = canvasRef.current!; const dpr = Math.min(window.devicePixelRatio||1, 2);
    c.width = Math.floor(width * dpr); c.height = Math.floor(height * dpr);
    c.style.width = width+"px"; c.style.height = height+"px";
    glRef.current?.viewport(0,0,c.width,c.height);
  },[width, height]);

  return <canvas ref={canvasRef} />;
}
