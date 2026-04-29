import React, { useEffect, useMemo, useRef, useState } from "react";
import { on, off, Events } from "@/events/bus";

/**
 * MetaCanvas.tsx — single‑pass screen‑space metaball renderer
 * Goals
 *  - ShaderPark‑like soft orb look (fbm gradient + pow curve), lightweight
 *  - True metaball field (smooth union via soft kernel sum)
 *  - Split/Merge via chatUI: splitCount + splitProgress drive seed layout
 *  - Optional markers & pointer displacement hooks (MVP: plumbing provided)
 *
 * Notes
 *  - WebGL1, single fragment pass. No raymarching or volume steps.
 *  - Field F(p) = sum_i max(0, 1 - (d/r)^2)^2  (Wyvill‑style soft kernel)
 *  - Anti‑alias: smoothstep using |F-iso| / |gradF|
 *  - Normal from screen‑space finite differences
 */

// ======= Types =======
export type Seed = { id: string; x: number; y: number; r: number };

export type MetaCanvasProps = {
  width?: number;
  height?: number;
  // ChatUI‑driven controls (keep your existing names; map upstream as needed)
  splitCount?: number; // N balls when fully split
  splitProgress?: number; // 0..1
  iso?: number; // 0.45..0.65
  gammaPow?: number; // 6..9
  edgeSoftnessPx?: number; // 1.5..2.5
  bgNoiseAmp?: number; // 0..0.4
  bgNoiseScale?: number; // 0.4..1.6
  timeSpeed?: number; // 0.05..0.2
  // seed override (optional): if provided, bypass radial layout
  seeds?: Seed[];
  // pointer hook (optional)
  pointer?: { x: number; y: number } | null;
  // lifecycle hook
  onFrame?: (t: number) => void;
};

const MAX_SEEDS = 8; // lightweight guard

// ======= GL helpers =======
function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || "";
    gl.deleteShader(sh);
    throw new Error("Shader compile error:\n" + log);
  }
  return sh;
}

function createProgram(gl: WebGLRenderingContext, vsSrc: string, fsSrc: string) {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) || "";
    gl.deleteProgram(prog);
    throw new Error("Program link error:\n" + log);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

// Fullscreen triangle (fewer vertices than a quad)
const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5; // map from NDC to [0,1]
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;

varying vec2 v_uv;

uniform vec2 u_res;              // canvas size in px
uniform float u_time;
uniform float u_iso;             // iso threshold for field
uniform float u_gammaPow;        // mochi curve
uniform float u_edgePx;          // AA width in pixels
uniform float u_bgAmp;           // background noise amplitude
uniform float u_bgScale;         // noise scale
uniform float u_timeSpeed;       // background flow speed

uniform int u_seedCount;
uniform vec3 u_seeds[${MAX_SEEDS}]; // (x,y,r) in normalized screen space [-1,1]

// -------------------- utils --------------------
// Hash & value noise (2D), lightweight
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0,0.0));
  float c = hash(i + vec2(0.0,1.0));
  float d = hash(i + vec2(1.0,1.0));
  vec2 u = f * f * (3.0 - 2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

// 3‑octave fbm for background hues
float fbm(vec2 p){
  float s = 0.0, a = 0.5; vec2 q = p;
  for(int i=0;i<3;i++){ s += a * vnoise(q); q *= 2.0; a *= 0.5; }
  return s;
}

// Soft kernel (Wyvill‑like): k(x) = max(0, 1 - x^2)^2
float kernel(float d, float r){
  float x = clamp(d / max(r, 1e-5), 0.0, 1.0);
  float v = 1.0 - x*x; return v*v;
}

// Field sum, also return gradient via finite differencing
float field(in vec2 p){
  float F = 0.0;
  for(int i=0;i<${MAX_SEEDS}; i++){
    if(i>=u_seedCount) break;
    vec2 c = u_seeds[i].xy; float r = u_seeds[i].z;
    // 修正：使用等距度量，将 x 分量除以 aspect.x 以保持圆形
    vec2 aspect = vec2(u_res.x / u_res.y, 1.0);
    vec2 diff = p - c;
    diff.x /= aspect.x; // 修正 x 方向的距离计算
    F += kernel(length(diff), r);
  }
  return F;
}

// Gradient via central differences (screen space)
vec2 gradF(vec2 p){
  // edgePx in px → convert to NDC step
  vec2 px = 2.0 * vec2(1.0/u_res.x, 1.0/u_res.y) * 1.0; // 1 px in NDC
  // 修正：梯度计算也要考虑 aspect 修正
  vec2 aspect = vec2(u_res.x / u_res.y, 1.0);
  vec2 px_corrected = vec2(px.x / aspect.x, px.y);
  float Fx1 = field(p + vec2(px_corrected.x, 0.0));
  float Fx0 = field(p - vec2(px_corrected.x, 0.0));
  float Fy1 = field(p + vec2(0.0, px_corrected.y));
  float Fy0 = field(p - vec2(0.0, px_corrected.y));
  return vec2((Fx1 - Fx0), (Fy1 - Fy0));
}

void main(){
  // Map to aspect‑corrected NDC center frame: [-1,1] with aspect
  vec2 aspect = vec2(u_res.x / u_res.y, 1.0);
  vec2 p = (v_uv * 2.0 - 1.0) * aspect; // normalized screen space

  // ---- Background color (ShaderPark‑like) ----
  vec2 bgp = p * u_bgScale + vec2(0.0, -u_time * u_timeSpeed);
  
  // 使用不同的旋转和相位，增加颜色差异性
  float angle1 = 0.0;
  float angle2 = 2.094; // 120度
  float angle3 = 4.188; // 240度
  
  vec2 rot1 = vec2(cos(angle1), sin(angle1));
  vec2 rot2 = vec2(cos(angle2), sin(angle2));
  vec2 rot3 = vec2(cos(angle3), sin(angle3));
  
  vec2 p1 = vec2(dot(bgp, rot1), dot(bgp, vec2(-rot1.y, rot1.x)));
  vec2 p2 = vec2(dot(bgp, rot2), dot(bgp, vec2(-rot2.y, rot2.x)));
  vec2 p3 = vec2(dot(bgp, rot3), dot(bgp, vec2(-rot3.y, rot3.x)));
  
  float n1 = fbm(p1);
  float n2 = fbm(p2 + 5.7);
  float n3 = fbm(p3 + 11.3);
  vec3 n = vec3(n1, n2, n3);
  
  // gently center & raise mid‑tones, then pow for soft glow
  n = clamp(n * (1.0 + u_bgAmp) + 0.25, 0.0, 1.0);
  n = pow(n, vec3(u_gammaPow)); // mochi‑like center brightening

  // ---- Metaball field ----
  float F = field(p);
  vec2 g = gradF(p);
  float gLen = max(length(g), 1e-4);
  // Edge soft distance in px → convert by gradient magnitude
  float distLike = (F - u_iso) / gLen; // signed approx distance
  float aa = clamp(0.5 - distLike / (u_edgePx * 0.5 * 2.0 / u_res.y), 0.0, 1.0);
  // Smooth fill amount inside the blob
  float mask = smoothstep(0.0, 1.0, aa);

  // Pseudo normal from grad (rotate 90° because grad in screen space)
  vec3 N = normalize(vec3(g.x, g.y, 1.0));
  vec3 V = vec3(0.0, 0.0, 1.0);
  // light wrap for mochi softness
  float NdV = clamp(dot(N, V), 0.0, 1.0);
  float wrap = 0.35; // fixed, lightweight
  float diff = clamp((NdV + wrap) / (1.0 + wrap), 0.0, 1.0);
  float fres = pow(1.0 - NdV, 3.0);

  vec3 base = n;                     // background hues reused for cohesion
  vec3 blob = n * (0.65 + 0.35*diff) + fres * 0.08; // subtle rim lift
  vec3 col = mix(base, blob, mask);

  // Final gentle tone map
  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

// ======= Component =======
export default function MetaCanvas({
  width = 1024,
  height = 640,
  splitCount = 1,
  splitProgress = 0,
  iso = 0.52,
  gammaPow = 2.0,
  edgeSoftnessPx = 2.0,
  bgNoiseAmp = 0.35,
  bgNoiseScale = 0.9,
  timeSpeed = 0.08,
  seeds,
  pointer,
  onFrame,
}: MetaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const bufRef = useRef<WebGLBuffer | null>(null);
  const startRef = useRef<number>(performance.now());
  
  // 添加 chatUI 联动状态
  const [chatSplitCount, setChatSplitCount] = useState(1);
  const [chatSplitProgress, setChatSplitProgress] = useState(0);
  
  // 添加拖拽状态
  const [draggedSeed, setDraggedSeed] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  
  // 添加种子位置状态管理
  const [seedPositions, setSeedPositions] = useState<Record<string, { x: number; y: number }>>({});

  // 监听 chatUI 事件
  useEffect(() => {
    const offAdd = on(Events.ChatAddChildren, (payload: any) => {
      console.log('MetaCanvas: Received ChatAddChildren event', payload);
      // 根据子节点数量更新 splitCount
      const newCount = Math.min(MAX_SEEDS, payload.children.length + 1);
      setChatSplitCount(newCount);
      setChatSplitProgress(0.8); // 模拟分裂进度
    });

    const offMerge = on(Events.Merge, (payload: any) => {
      console.log('MetaCanvas: Received Merge event', payload);
      // 合并时减少球的数量
      setChatSplitCount(prev => Math.max(1, prev - 1));
      setChatSplitProgress(0.2);
    });

    return () => { offAdd(); offMerge(); };
  }, []);

  // Derived seeds: if not provided, compute radial layout around center
  const derivedSeeds = useMemo<Seed[]>(() => {
    if (seeds && seeds.length) return seeds.slice(0, MAX_SEEDS);
    
    // 使用 chatUI 状态或 props
    const effectiveSplitCount = chatSplitCount || splitCount;
    const effectiveSplitProgress = chatSplitProgress !== undefined ? chatSplitProgress : splitProgress;
    
    // 临时硬编码测试：确保至少有一个球
    const N = Math.max(1, Math.min(MAX_SEEDS, Math.floor(effectiveSplitCount)));
    const cx = 0.0, cy = 0.0; // center in NDC
    const r0 = 0.4; // 合理的半径，确保 metaball 可见
    const childR = r0 / Math.cbrt(N); // conserve volume visually
    const out: Seed[] = [];
    
    // 强制至少有一个球在中心
    out.push({ id: "0", x: cx, y: cy, r: r0 });
    
    if (N > 1) {
      const R = 0.55 - childR; // ring radius (kept within frame)
      for (let i = 1; i < N; i++) {
        const t = (i / N) * Math.PI * 2.0;
        const tx = Math.cos(t) * R;
        const ty = Math.sin(t) * R;
        // splitProgress drives from center→ring
        const x = cx * (1 - effectiveSplitProgress) + tx * effectiveSplitProgress;
        const y = cy * (1 - effectiveSplitProgress) + ty * effectiveSplitProgress;
        out.push({ id: String(i), x, y, r: childR });
      }
    }
    
    // 应用拖拽偏移
    const finalSeeds = out.map(seed => {
      const customPos = seedPositions[seed.id];
      if (customPos) {
        return { ...seed, x: customPos.x, y: customPos.y };
      }
      return seed;
    });
    
    console.log(`MetaCanvas: Generated ${finalSeeds.length} seeds:`, finalSeeds);
    return finalSeeds;
  }, [seeds, splitCount, splitProgress, chatSplitCount, chatSplitProgress, seedPositions]);

  // 组件加载状态报告
  useEffect(() => {
    console.log("MetaCanvas: Component mounted");
    window.dispatchEvent(new CustomEvent('component-load', { 
      detail: { component: 'metaCanvas', loaded: true } 
    }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = (canvas.getContext("webgl", { antialias: true, alpha: true }) ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) throw new Error("WebGL not supported");
    glRef.current = gl;
    
    // 启用 alpha 混合，支持透明背景
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // program
    const prog = createProgram(gl, VERT, FRAG);
    progRef.current = prog;
    gl.useProgram(prog);

    // fullscreen triangle buffer
    const buf = gl.createBuffer()!;
    bufRef.current = buf;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const data = new Float32Array([
      -1, -1,
      3, -1,
      -1, 3,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // initial state
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 1); // 不透明背景

    let raf = 0;
    const u = (name: string) => gl.getUniformLocation(prog, name);

    const render = () => {
      const now = performance.now();
      const t = (now - startRef.current) / 1000;
      if (onFrame) onFrame(t);

      gl.useProgram(prog);
      
      // 调试：检查 uniform 位置
      const u_gammaPow = u("u_gammaPow");
      const u_bgAmp = u("u_bgAmp");
      const u_seedCount = u("u_seedCount");
      
      if (!u_gammaPow) {
        console.error("u_gammaPow uniform not found!");
        return;
      }
      if (!u_bgAmp) {
        console.error("u_bgAmp uniform not found!");
        return;
      }
      if (!u_seedCount) {
        console.error("u_seedCount uniform not found!");
        return;
      }

      gl.uniform2f(u("u_res"), canvas.width, canvas.height);
      gl.uniform1f(u("u_time"), t);
      gl.uniform1f(u("u_iso"), iso);
      gl.uniform1f(u_gammaPow, gammaPow);
      gl.uniform1f(u("u_edgePx"), edgeSoftnessPx);
      gl.uniform1f(u_bgAmp, bgNoiseAmp);
      gl.uniform1f(u("u_bgScale"), bgNoiseScale);
      gl.uniform1f(u("u_timeSpeed"), timeSpeed);

      // seeds → normalized space ([-1,1] in x, aspect‑aware)
      const aspect = (canvas.width / canvas.height) || 1;
      const count = Math.min(MAX_SEEDS, derivedSeeds.length);
      
      // 调试：打印关键参数
      if (Math.floor(t * 10) % 60 === 0) { // 每6秒打印一次
        console.log(`MetaCanvas Debug:`, {
          gammaPow,
          bgNoiseAmp,
          iso,
          seedCount: count,
          derivedSeeds: derivedSeeds.slice(0, 3),
          aspect,
          canvasSize: `${canvas.width}x${canvas.height}`,
          uniformLocations: {
            u_gammaPow: !!u_gammaPow,
            u_bgAmp: !!u_bgAmp,
            u_iso: !!u("u_iso"),
            u_seedCount: !!u_seedCount
          }
        });
      }
      
      gl.uniform1i(u_seedCount, count);
      
      // 使用更稳定的逐个设置方式
      for (let i = 0; i < MAX_SEEDS; i++) {
        if (i < count) {
          const s = derivedSeeds[i];
          gl.uniform3f(u(`u_seeds[${i}]`), s.x, s.y, s.r);
        } else {
          gl.uniform3f(u(`u_seeds[${i}]`), -10, -10, 0);
        }
      }

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => cancelAnimationFrame(raf);
  }, [width, height, iso, gammaPow, edgeSoftnessPx, bgNoiseAmp, bgNoiseScale, timeSpeed, derivedSeeds, onFrame]);

  // adjust canvas size on props change
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    
    // 限制最大尺寸，防止异常增长
    const maxSize = 4096;
    const safeWidth = Math.min(width, maxSize);
    const safeHeight = Math.min(height, maxSize);
    
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.floor(safeWidth * dpr);
    c.height = Math.floor(safeHeight * dpr);
    c.style.width = safeWidth + "px";
    c.style.height = safeHeight + "px";
    
    if (glRef.current) {
      glRef.current.viewport(0, 0, c.width, c.height);
    }
    
    console.log(`MetaCanvas: Canvas resized to ${c.width}x${c.height}, DPR: ${dpr}`);
  }, [width, height]);

  // 拖拽事件处理函数
  const handleMouseDown = (e: React.MouseEvent, seedId: string) => {
    e.preventDefault();
    setDraggedSeed(seedId);
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    setDragOffset({
      x: e.clientX - centerX,
      y: e.clientY - centerY
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggedSeed) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const aspect = (width / height) || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    
    // 屏幕坐标转 NDC 坐标，考虑 DPR
    const screenX = (e.clientX - rect.left) / rect.width;
    const screenY = (e.clientY - rect.top) / rect.height;
    
    // 正确的 NDC 转换：不需要 aspect 修正，因为 shader 内部会处理
    const ndcX = screenX * 2 - 1; // [0,1] -> [-1,1]
    const ndcY = 1 - screenY * 2; // Y 轴翻转
    
    setSeedPositions(prev => ({
      ...prev,
      [draggedSeed]: { x: ndcX, y: ndcY }
    }));
  };

  const handleMouseUp = () => {
    setDraggedSeed(null);
    setDragOffset({ x: 0, y: 0 });
  };

  // 计算标记点位置（NDC 转屏幕坐标）
  const markerPositions = useMemo(() => {
    const positions = derivedSeeds.map(seed => {
      // NDC 坐标 [-1,1] 转屏幕坐标 [0,100%]
      const aspect = (width / height) || 1;
      // 正确的坐标转换：NDC 到屏幕百分比
      const screenX = (seed.x + 1) * 50; // NDC [-1,1] -> [0,100%]
      const screenY = (1 - seed.y) * 50; // Y 轴翻转
      return {
        id: seed.id,
        x: screenX,
        y: screenY,
        radius: seed.r * 50 // 半径：NDC 单位转百分比
      };
    });
    
    // 调试：打印标记点位置
    console.log('MetaCanvas: Marker positions:', positions);
    return positions;
  }, [derivedSeeds, width, height]);

  return (
    <div 
      className="w-full h-full flex items-center justify-center relative"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <canvas ref={canvasRef} />
      
      {/* 标记点渲染 - 带序号的控制器 */}
      {markerPositions.map((marker, index) => (
        <div
          key={marker.id}
          style={{
            position: 'absolute',
            left: `${marker.x}%`,
            top: `${marker.y}%`,
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: draggedSeed === marker.id ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.9)',
            border: '2px solid rgba(255,255,255,1)',
            boxShadow: draggedSeed === marker.id 
              ? '0 0 20px rgba(255,255,255,1), 0 0 40px rgba(255,255,255,0.6)' 
              : '0 0 12px rgba(255,255,255,0.8), 0 0 24px rgba(255,255,255,0.4)',
            transform: 'translate(-50%, -50%)',
            zIndex: 1000,
            pointerEvents: 'auto',
            cursor: draggedSeed === marker.id ? 'grabbing' : 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: 'bold',
            color: '#333',
            userSelect: 'none',
            transition: draggedSeed === marker.id ? 'none' : 'all 0.2s ease'
          }}
          onMouseDown={(e) => handleMouseDown(e, marker.id)}
          onClick={(e) => {
            if (draggedSeed === marker.id) return; // 拖拽时不触发点击
            console.log(`点击了标记点 ${index + 1}:`, marker);
            // 这里可以添加点击事件处理
          }}
        >
          {index + 1}
        </div>
      ))}
      
      {/* 临时调试面板 */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        zIndex: 1001,
        fontSize: '12px'
      }}>
        <div>MetaCanvas 调试面板</div>
        <div>当前 seeds: {derivedSeeds.length}</div>
        <div>标记点: {markerPositions.length}</div>
        <div>splitCount: {chatSplitCount || splitCount}</div>
        <div>splitProgress: {chatSplitProgress !== undefined ? chatSplitProgress : splitProgress}</div>
        <div>gammaPow: {gammaPow}</div>
        <div>bgNoiseAmp: {bgNoiseAmp}</div>
        {derivedSeeds.length > 0 && (
          <div>第一个球: x={derivedSeeds[0].x.toFixed(2)}, y={derivedSeeds[0].y.toFixed(2)}, r={derivedSeeds[0].r.toFixed(2)}</div>
        )}
        {markerPositions.length > 0 && (
          <div>第一个标记: x={markerPositions[0].x.toFixed(1)}%, y={markerPositions[0].y.toFixed(1)}%</div>
        )}
        <button 
          onClick={() => {
            setChatSplitCount(3);
            setChatSplitProgress(0.8);
            console.log('手动设置: splitCount=3, splitProgress=0.8');
          }}
          style={{ marginTop: '5px', padding: '4px 8px' }}
        >
          测试三球分裂
        </button>
        <button 
          onClick={() => {
            setChatSplitCount(1);
            setChatSplitProgress(0);
            console.log('重置: splitCount=1, splitProgress=0');
          }}
          style={{ marginTop: '5px', padding: '4px 8px', marginLeft: '5px' }}
        >
          重置单球
        </button>
      </div>
    </div>
  );
}
