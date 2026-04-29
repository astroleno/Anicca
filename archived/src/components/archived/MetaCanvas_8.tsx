import React, { useEffect, useRef, useState, useMemo } from "react";

// --- Metaball Playground ----------------------------------------------------
// Single-file React component with:
// 1) WebGL2 full-screen fragment shader rendering 2D metaballs
// 2) Numbered, draggable centers overlaid on top of the canvas
// 3) Controls for ball count, radius, threshold, softness, bg gain
// 4) Shader aesthetic inspired by ShaderPark: soft bloom-ish gradient, fbm tint
// ---------------------------------------------------------------------------

// WebGL1 兼容的着色器
const VERT_WEBGL1 = `#version 100
precision highp float;
attribute vec2 a_pos;
varying vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5; // NDC -> uv
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_WEBGL1 = `#version 100
precision highp float;
varying vec2 v_uv;

uniform vec2 u_resolution;
uniform float u_time;
uniform int u_count;
uniform vec2 u_centers[16]; // max 16 metaballs
uniform float u_radius[16];
uniform float u_softness;   // soft edge width
uniform float u_threshold;  // iso threshold for metaballs
uniform float u_bgGain;     // background gain for SP-like glow

// --- hash/ noise helpers (small, fast) ---
float hash11(float p){
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

vec2 hash22(vec2 p){
  p = vec2(dot(p, vec2(127.1, 311.7)),
           dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float noise2D(in vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = dot(hash22(i+vec2(0,0)), f-vec2(0,0));
  float b = dot(hash22(i+vec2(1,0)), f-vec2(1,0));
  float c = dot(hash22(i+vec2(0,1)), f-vec2(0,1));
  float d = dot(hash22(i+vec2(1,1)), f-vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

float fbm(vec2 p){
  float s = 0.0;
  float a = 0.5;
  // 减少迭代次数以提升性能：从5降到3
  for(int i=0;i<3;i++){
    s += a * noise2D(p);
    p = p*2.0 + 17.0;
    a *= 0.5;
  }
  return s;
}

// field contribution of one ball (screen-space metaball)
float fieldBall(vec2 uv, vec2 c, float r){
  float d2 = max(1e-6, dot(uv-c, uv-c));
  // classic metaball: r^2 / d^2
  return r*r / d2;
}

void main(){
  vec2 uv = v_uv; // 0..1

  // Background gradient + SP-like soft color fog - 优化性能
  // map uv to a soft, large-scale gradient and tint with slow fbm
  vec2 g = (uv - 0.5);
  float vignette = exp(-dot(g,g) * 1.8); // 降低指数以提升性能
  float t = u_time * 0.08;
  vec3 tint = vec3(
    0.62 + 0.38 * fbm(uv*1.2 + vec2(0.0, t)),
    0.70 + 0.30 * fbm(uv*1.1 + vec2(1.3, t*0.9)),
    0.78 + 0.22 * fbm(uv*1.0 + vec2(-1.7, t*1.1))
  );
  vec3 bg = pow(tint, vec3(1.4)) * (0.85 + 0.15*vignette); // 降低幂指数

  // Metaball scalar field
  float F = 0.0;
  for(int i=0;i<16;i++){
    if(i>=u_count) break;
    F += fieldBall(uv, u_centers[i], u_radius[i]);
  }

  // iso surface in screen-space; softstep for feathered edge
  // We also compute a pseudo-normal from field gradient for gentle shading
  float iso = u_threshold;
  float edge = smoothstep(iso - u_softness, iso + u_softness, F);

  // pseudo-normal via central diff on field
  float e = 1.0/1024.0; // small step in uv
  float Fx = 0.0, Fy = 0.0;
  // recompute cheap partials
  for(int i=0;i<16;i++){
    if(i>=u_count) break;
    vec2 c = u_centers[i];
    float r = u_radius[i];
    // derivative of r^2/d^2
    vec2 d = (uv - c);
    float inv = 1.0/max(1e-6, dot(d,d));
    float val = r*r * inv;
    // gradient of val wrt uv is -2*r^2*(uv-c)/d^4
    float inv2 = inv*inv;
    vec2 grad = -2.0 * r*r * d * inv2;
    Fx += grad.x; Fy += grad.y;
  }
  vec2 gradF = vec2(Fx, Fy);
  float shade = 0.5 + 0.5*dot(normalize(vec3(-gradF, 0.2)), vec3(0.577,0.577,0.577));
  shade = pow(shade, 1.2);

  // Combine: SP-like mix — keep bg, add a soft, milky blob color
  vec3 blobCol = mix(vec3(0.85,0.93,1.0), vec3(0.6,0.85,0.95), clamp(F*0.15, 0.0, 1.0));
  blobCol *= shade;

  // airy glow: use edge and field to add luminous rim
  float rim = smoothstep(0.0, 1.0, 1.0 - abs(edge - 0.5)*2.0);
  vec3 glow = vec3(rim) * 0.25;

  vec3 col = bg * (1.0 - u_bgGain*edge*0.25) + blobCol*edge + glow*u_bgGain;
  col = mix(col, bg, 1.0 - edge);

  // gentle filmic tone map
  col = col/(1.0+col);

  gl_FragColor = vec4(col, 1.0);
}`;

// 简化的测试着色器（用于调试）
const FRAG_TEST = `#version 100
precision highp float;
varying vec2 v_uv;
uniform float u_time;
void main(){
  vec2 uv = v_uv;
  float t = u_time * 0.1;
  vec3 col = vec3(
    0.5 + 0.5 * sin(uv.x * 10.0 + t),
    0.5 + 0.5 * sin(uv.y * 10.0 + t),
    0.5 + 0.5 * sin((uv.x + uv.y) * 10.0 + t)
  );
  gl_FragColor = vec4(col, 1.0);
}`;

// WebGL2 着色器
const VERT = `#version 300 es
precision highp float;
layout (location = 0) in vec2 a_pos;
out vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5; // NDC -> uv
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform int u_count;
uniform vec2 u_centers[16]; // max 16 metaballs
uniform float u_radius[16];
uniform float u_softness;   // soft edge width
uniform float u_threshold;  // iso threshold for metaballs
uniform float u_bgGain;     // background gain for SP-like glow

// --- hash/ noise helpers (small, fast) ---
float hash11(float p){
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

vec2 hash22(vec2 p){
  p = vec2(dot(p, vec2(127.1, 311.7)),
           dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float noise2D(in vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = dot(hash22(i+vec2(0,0)), f-vec2(0,0));
  float b = dot(hash22(i+vec2(1,0)), f-vec2(1,0));
  float c = dot(hash22(i+vec2(0,1)), f-vec2(0,1));
  float d = dot(hash22(i+vec2(1,1)), f-vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

float fbm(vec2 p){
  float s = 0.0;
  float a = 0.5;
  // 减少迭代次数以提升性能：从5降到3
  for(int i=0;i<3;i++){
    s += a * noise2D(p);
    p = p*2.0 + 17.0;
    a *= 0.5;
  }
  return s;
}

// field contribution of one ball (screen-space metaball)
float fieldBall(vec2 uv, vec2 c, float r){
  float d2 = max(1e-6, dot(uv-c, uv-c));
  // classic metaball: r^2 / d^2
  return r*r / d2;
}

void main(){
  vec2 uv = v_uv; // 0..1

  // Background gradient + SP-like soft color fog - 优化性能
  // map uv to a soft, large-scale gradient and tint with slow fbm
  vec2 g = (uv - 0.5);
  float vignette = exp(-dot(g,g) * 1.8); // 降低指数以提升性能
  float t = u_time * 0.08;
  vec3 tint = vec3(
    0.62 + 0.38 * fbm(uv*1.2 + vec2(0.0, t)),
    0.70 + 0.30 * fbm(uv*1.1 + vec2(1.3, t*0.9)),
    0.78 + 0.22 * fbm(uv*1.0 + vec2(-1.7, t*1.1))
  );
  vec3 bg = pow(tint, vec3(1.4)) * (0.85 + 0.15*vignette); // 降低幂指数

  // Metaball scalar field
  float F = 0.0;
  for(int i=0;i<16;i++){
    if(i>=u_count) break;
    F += fieldBall(uv, u_centers[i], u_radius[i]);
  }

  // iso surface in screen-space; softstep for feathered edge
  // We also compute a pseudo-normal from field gradient for gentle shading
  float iso = u_threshold;
  float edge = smoothstep(iso - u_softness, iso + u_softness, F);

  // pseudo-normal via central diff on field
  float e = 1.0/1024.0; // small step in uv
  float Fx = 0.0, Fy = 0.0;
  // recompute cheap partials
  for(int i=0;i<16;i++){
    if(i>=u_count) break;
    vec2 c = u_centers[i];
    float r = u_radius[i];
    // derivative of r^2/d^2
    vec2 d = (uv - c);
    float inv = 1.0/max(1e-6, dot(d,d));
    float val = r*r * inv;
    // gradient of val wrt uv is -2*r^2*(uv-c)/d^4
    float inv2 = inv*inv;
    vec2 grad = -2.0 * r*r * d * inv2;
    Fx += grad.x; Fy += grad.y;
  }
  vec2 gradF = vec2(Fx, Fy);
  float shade = 0.5 + 0.5*dot(normalize(vec3(-gradF, 0.2)), vec3(0.577,0.577,0.577));
  shade = pow(shade, 1.2);

  // Combine: SP-like mix — keep bg, add a soft, milky blob color
  vec3 blobCol = mix(vec3(0.85,0.93,1.0), vec3(0.6,0.85,0.95), clamp(F*0.15, 0.0, 1.0));
  blobCol *= shade;

  // airy glow: use edge and field to add luminous rim
  float rim = smoothstep(0.0, 1.0, 1.0 - abs(edge - 0.5)*2.0);
  vec3 glow = vec3(rim) * 0.25;

  vec3 col = bg * (1.0 - u_bgGain*edge*0.25) + blobCol*edge + glow*u_bgGain;
  col = mix(col, bg, 1.0 - edge);

  // gentle filmic tone map
  col = col/(1.0+col);

  fragColor = vec4(col, 1.0);
}
`;

function clamp01(x:number){ return Math.max(0, Math.min(1, x)); }

function useRAF(cb: (t:number)=>void){
  const rafRef = useRef<number | null>(null);
  useEffect(()=>{
    let mounted = true;
    const loop = (t:number)=>{
      if(!mounted) return;
      cb(t*0.001);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return ()=>{ mounted=false; if(rafRef.current) cancelAnimationFrame(rafRef.current); };
  },[cb]);
}

function DraggableMarker({ idx, pos, onChange, container }: { idx:number; pos:{x:number;y:number}; onChange:(p:{x:number;y:number})=>void; container: React.RefObject<HTMLDivElement>; }){
  const [drag,setDrag] = useState(false);
  const offRef = useRef<{ox:number; oy:number}>({ox:0, oy:0});

  useEffect(()=>{
    const onMove = (e:MouseEvent)=>{
      if(!drag || !container.current) return;
      const rect = container.current.getBoundingClientRect();
      const x = clamp01((e.clientX - rect.left)/rect.width);
      const y = clamp01((e.clientY - rect.top)/rect.height);
      onChange({x,y});
    };
    const onUp = ()=> setDrag(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return ()=>{ window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  },[drag, onChange, container]);

  return (
    <div
      onMouseDown={()=>setDrag(true)}
      className="absolute -translate-x-1/2 -translate-y-1/2 select-none cursor-grab active:cursor-grabbing"
      style={{ 
        left: `${pos.x*100}%`, 
        top: `${pos.y*100}%`, 
        zIndex: 15, // 确保标记点在控制面板下方但在画布上方
        pointerEvents: 'auto' // 确保可以交互
      }}
    >
      <div className="w-7 h-7 rounded-full bg-black/60 text-white text-sm flex items-center justify-center shadow-md border border-white/30">
        {idx+1}
      </div>
    </div>
  );
}

export default function MetaballPlayground(){
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | WebGLRenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const startRef = useRef<number>(performance.now());

  const [count, setCount] = useState(2); // 减少球的数量
  const [centers, setCenters] = useState(
    [ {x:0.3,y:0.4}, {x:0.7,y:0.6}, {x:0.5,y:0.3}, {x:0.2,y:0.8} ] // 调整位置避免重叠
  );
  const [radius, setRadius] = useState([0.12, 0.10, 0.08, 0.06]); // 减小半径
  const [softness, setSoftness] = useState(0.15); // 减小软边
  const [threshold, setThreshold] = useState(1.8); // 增大阈值
  const [bgGain, setBgGain] = useState(0.8); // 减小背景增益
  const [useTestShader, setUseTestShader] = useState(false); // 测试开关

  // resize canvas to devicePixelRatio - 优化性能
  useEffect(()=>{
    const c = canvasRef.current; if(!c) return;
    const onResize = ()=>{
      try {
        // 降低分辨率以提升性能
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // 从2降到1.5
        const w = wrapRef.current?.clientWidth || 800;
        const h = wrapRef.current?.clientHeight || 450;
        
        // 限制最大尺寸以提升性能
        const maxWidth = 1920;
        const maxHeight = 1080;
        const finalWidth = Math.min(w, maxWidth);
        const finalHeight = Math.min(h, maxHeight);
        
        c.width = Math.floor(finalWidth*dpr); 
        c.height = Math.floor(finalHeight*dpr);
        c.style.width = finalWidth+"px"; 
        c.style.height = finalHeight+"px";
        
        const gl = glRef.current; 
        if(gl){ 
          gl.viewport(0,0,c.width,c.height); 
          console.log('Canvas resized:', c.width, 'x', c.height);
        }
      } catch (error) {
        console.error('Canvas resize error:', error);
      }
    };
    onResize();
    const ro = new ResizeObserver(onResize);
    if(wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener('resize', onResize);
    return ()=>{ window.removeEventListener('resize', onResize); ro.disconnect(); };
  },[]);

  // init GL - 增强错误处理和兼容性
  useEffect(()=>{
    const canvas = canvasRef.current; if(!canvas) return;
    
    let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;
    let prog: WebGLProgram | null = null;
    let vs: WebGLShader | null = null;
    let fs: WebGLShader | null = null;
    let vao: WebGLVertexArrayObject | null = null;
    let buf: WebGLBuffer | null = null;
    
    try {
      // 尝试 WebGL2，失败则降级到 WebGL1
      gl = canvas.getContext('webgl2');
      if(!gl) {
        console.warn('WebGL2 not available, trying WebGL1');
        gl = canvas.getContext('webgl');
        if(!gl) {
          console.error('WebGL not available at all');
          return;
        }
      }
      glRef.current = gl;
      console.log('WebGL context created:', gl.getParameter(gl.VERSION));

      // 根据 WebGL 版本选择合适的着色器
      const isWebGL2 = gl.getParameter(gl.VERSION).includes('WebGL 2.0');
      const vertSource = isWebGL2 ? VERT : VERT_WEBGL1;
      const fragSource = useTestShader ? FRAG_TEST : (isWebGL2 ? FRAG : FRAG_WEBGL1);
      
      console.log('Using shaders for:', isWebGL2 ? 'WebGL2' : 'WebGL1');

      vs = gl.createShader(gl.VERTEX_SHADER)!; 
      gl.shaderSource(vs, vertSource); 
      gl.compileShader(vs);
      fs = gl.createShader(gl.FRAGMENT_SHADER)!; 
      gl.shaderSource(fs, fragSource); 
      gl.compileShader(fs);
      
      const logV = gl.getShaderInfoLog(vs); 
      if(logV) console.warn('Vertex Shader:', logV);
      const logF = gl.getShaderInfoLog(fs); 
      if(logF) console.warn('Fragment Shader:', logF);

      prog = gl.createProgram()!; 
      gl.attachShader(prog, vs); 
      gl.attachShader(prog, fs); 
      gl.linkProgram(prog);
      
      const logP = gl.getProgramInfoLog(prog); 
      if(logP) console.warn('Program:', logP);
      
      // 检查程序是否成功链接
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error('Program linking failed');
        return;
      }
      
      progRef.current = prog;
      console.log('WebGL program created successfully');

      // fullscreen quad - WebGL1/2 兼容
      if ('createVertexArray' in gl) {
        // WebGL2
        vao = (gl as WebGL2RenderingContext).createVertexArray(); 
        (gl as WebGL2RenderingContext).bindVertexArray(vao);
      }
      buf = gl.createBuffer(); 
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const quad = new Float32Array([
        -1,-1,  1,-1, -1, 1,
        -1, 1,  1,-1,  1, 1,
      ]);
      gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      
    } catch (error) {
      console.error('WebGL initialization error:', error);
    }

    return ()=>{
      if(gl && prog) gl.deleteProgram(prog);
      if(gl && vs) gl.deleteShader(vs); 
      if(gl && fs) gl.deleteShader(fs);
      if(gl && buf) gl.deleteBuffer(buf);
      if(gl && vao && 'deleteVertexArray' in gl) {
        (gl as WebGL2RenderingContext).deleteVertexArray(vao);
      }
    };
  },[]);

  // render loop - 增强错误处理
  useRAF((time)=>{
    const gl = glRef.current; const prog = progRef.current; const canvas = canvasRef.current;
    if(!gl || !prog || !canvas) {
      console.warn('WebGL not ready:', { gl: !!gl, prog: !!prog, canvas: !!canvas });
      return;
    }
    
    try {
      gl.useProgram(prog);
      
  // 添加调试信息
  if (time < 1) { // 只在第一秒打印调试信息
    console.log('Rendering with:', {
      canvasSize: `${canvas.width}x${canvas.height}`,
      centers: centers.slice(0, count),
      radius: radius.slice(0, count),
      threshold,
      softness,
      bgGain,
      time: time
    });
  }

    const locRes = gl.getUniformLocation(prog, 'u_resolution');
    const locTime = gl.getUniformLocation(prog, 'u_time');
    const locCount = gl.getUniformLocation(prog, 'u_count');
    const locCenters = gl.getUniformLocation(prog, 'u_centers[0]');
    const locRadius = gl.getUniformLocation(prog, 'u_radius[0]');
    const locSoft = gl.getUniformLocation(prog, 'u_softness');
    const locThr = gl.getUniformLocation(prog, 'u_threshold');
    const locBg = gl.getUniformLocation(prog, 'u_bgGain');
    
    // 检查 uniform 位置是否正确
    if (time < 1) {
      console.log('Uniform locations:', {
        resolution: locRes,
        time: locTime,
        count: locCount,
        centers: locCenters,
        radius: locRadius,
        softness: locSoft,
        threshold: locThr,
        bgGain: locBg
      });
    }

    gl.uniform2f(locRes, canvas.width, canvas.height);
    gl.uniform1f(locTime, time);

    const n = Math.min(16, Math.max(1, count));
    gl.uniform1i(locCount, n);

    // pack centers/radius to arrays of length 16
    const packedC = new Float32Array(16*2);
    const packedR = new Float32Array(16);
    for(let i=0;i<16;i++){
      const c = centers[i] || centers[0] || {x:0.5,y:0.5};
      const r = radius[i] || radius[0] || 0.2;
      packedC[i*2+0] = c.x; packedC[i*2+1] = c.y;
      packedR[i] = r;
    }
    gl.uniform2fv(locCenters, packedC);
    gl.uniform1fv(locRadius, packedR);

    gl.uniform1f(locSoft, softness);
    gl.uniform1f(locThr, threshold);
    gl.uniform1f(locBg, bgGain);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } catch (error) {
      console.error('Render loop error:', error);
    }
  });

  const updateCenter = (i:number, p:{x:number;y:number})=>{
    setCenters(cs=>{
      const next = cs.slice();
      next[i] = p; return next;
    });
  };

  const addBall = ()=>{
    setCount(c=> Math.min(16, c+1));
  };
  const removeBall = ()=>{
    setCount(c=> Math.max(1, c-1));
  };

  return (
    <div className="w-full h-full p-4">
      <div className="mb-3 text-sm text-gray-700">Metaball Playground — 拖动编号圆点改变球心位置；调节参数可得到更接近 ShaderPark 的柔雾质感。</div>

      <div 
        ref={wrapRef} 
        className="relative w-full rounded-2xl overflow-hidden shadow-lg"
        style={{ 
          height: '540px', // 固定高度，确保容器有尺寸
          minHeight: '400px',
          maxHeight: '800px'
        }}
      >
        <canvas 
          ref={canvasRef} 
          className="w-full h-full block"
          style={{ 
            display: 'block',
            width: '100%',
            height: '100%'
          }}
        />
        {Array.from({length: count}).map((_, i)=> (
          <DraggableMarker key={i} idx={i} pos={centers[i]} onChange={(p)=>updateCenter(i,p)} container={wrapRef} />
        ))}

        {/* Controls panel */}
        <div 
          className="absolute right-3 top-3 bg-white/75 backdrop-blur-sm rounded-xl p-3 text-xs space-y-2 shadow-md"
          style={{ 
            zIndex: 20, // 确保控制面板在最上层
            pointerEvents: 'auto' // 确保可以交互
          }}
        >
          <div className="font-medium">Controls</div>
          <div className="flex items-center gap-2">
            <button onClick={removeBall} className="px-2 py-1 rounded bg-gray-900 text-white">-</button>
            <div>balls: <span className="font-semibold">{count}</span></div>
            <button onClick={addBall} className="px-2 py-1 rounded bg-gray-900 text-white">+</button>
          </div>
          <div className="grid grid-cols-5 items-center gap-2">
            <label className="col-span-2">radius 1</label>
            <input className="col-span-3" type="range" min={0.02} max={0.25} step={0.005}
              value={radius[0]} onChange={e=>{
                const v = parseFloat(e.target.value); setRadius(r=>{ const n=r.slice(); n[0]=v; return n; });
              }} />
            <label className="col-span-2">radius 2</label>
            <input className="col-span-3" type="range" min={0.02} max={0.25} step={0.005}
              value={radius[1]||0.1} onChange={e=>{
                const v = parseFloat(e.target.value); setRadius(r=>{ const n=r.slice(); n[1]=v; return n; });
              }} />
            <label className="col-span-2">radius 3</label>
            <input className="col-span-3" type="range" min={0.02} max={0.25} step={0.005}
              value={radius[2]||0.08} onChange={e=>{
                const v = parseFloat(e.target.value); setRadius(r=>{ const n=r.slice(); n[2]=v; return n; });
              }} />
            <label className="col-span-2">softness</label>
            <input className="col-span-3" type="range" min={0.05} max={0.3} step={0.005}
              value={softness} onChange={e=> setSoftness(parseFloat(e.target.value))} />
            <label className="col-span-2">threshold</label>
            <input className="col-span-3" type="range" min={1.0} max={3.0} step={0.05}
              value={threshold} onChange={e=> setThreshold(parseFloat(e.target.value))} />
            <label className="col-span-2">bg gain</label>
            <input className="col-span-3" type="range" min={0.0} max={1.5} step={0.01}
              value={bgGain} onChange={e=> setBgGain(parseFloat(e.target.value))} />
          </div>
          <div className="text-[10px] text-gray-600">阈值越高越难显示；softness 控制边缘柔和度；bg gain 控制背景混合强度。
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs">测试着色器:</label>
            <input 
              type="checkbox" 
              checked={useTestShader}
              onChange={e => setUseTestShader(e.target.checked)}
              className="w-3 h-3"
            />
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => {
                setCount(2);
                setCenters([{x:0.3,y:0.4}, {x:0.7,y:0.6}, {x:0.5,y:0.3}, {x:0.2,y:0.8}]);
                setRadius([0.12, 0.10, 0.08, 0.06]);
                setSoftness(0.15);
                setThreshold(1.8);
                setBgGain(0.8);
              }}
              className="px-2 py-1 rounded bg-blue-600 text-white text-xs"
            >
              重置参数
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
