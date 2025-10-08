import React, { useEffect, useMemo, useRef, useState } from 'react'

/**
 * ✅ 目标：给出“能用”的 ShaderPark 组件版本（不依赖你之前的代码文件），
 * 实现：Metaball（平滑并集）+ fork/merge/独立种子 的最小可用演示。
 * 
 * 使用方式：
 * <MetaCanvasSplitMerge /> 直接挂载即可看到：
 * - 单体 → fork 新泡 → merge 回收 的过程；
 * - 所有状态可复现（独立 PRNG 种子 + JSON 导出）。
 * 
 * 备注：
 * - 这里假定项目已安装 Shader Park（shader-park-core 或 webgl 版本），
 *   并提供一个最小渲染器 createMinimalRendererFromString（见下方 shim）。
 * - 如果你项目里已有 sculptToMinimalRenderer，请把 shim 替换成你的封装即可。
 */

// --------------------------- ShaderPark 程序（可以直接替换/沿用） ---------------------------
const MAX_SOURCES = 12; // 上限：移动端建议 6–8，桌面 12–40

export const spCode = `
// Shader Park JS-DSL (基础Metaball演示)
setMaxIterations(6);

// 背景色
color(vec3(0.96, 0.97, 0.98));

// 基础Metaball：两个球体的平滑并集
shape(() => {
  // 常量定义，避免uniform问题
  const k = 0.32;
  const r = 0.42;
  const d = 0.0;

  // 左球
  displace(-d, 0, 0);
  sphere(r);
  reset();

  // 右球
  displace(d, 0, 0);
  sphere(r);
  reset();

  // 平滑混合
  mixGeo(k);
})();
`;

// --------------------------- 渲染器最小封装（Shim） ---------------------------
// 说明：请把下面这段 shim 替换为你项目中现有的 ShaderPark 渲染封装。
// 预期 API：
// const r = createMinimalRendererFromString(canvas, spCode);
// r.setInputs({ name: value, ... });
// r.draw(); r.dispose();

type SPInputs = {
  k?: number;
  r?: number;
  d?: number;
  t?: number;
  sources?: Array<{x: number, y: number}>;
};

type SPRuntime = {
  setInputs: (vars: SPInputs) => void;
  draw: () => void;
  dispose: () => void;
};

function createMinimalRendererFromString(canvas: HTMLCanvasElement, code: string): SPRuntime {
  // 最小化实现，先避免uniform问题
  let gl: WebGLRenderingContext | null = null;
  let program: WebGLProgram | null = null;
  let animationId: number | null = null;
  let isInitialized = false;

  const initWebGL = () => {
    try {
      gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        throw new Error('WebGL not supported');
      }

      // 创建简单的着色器程序
      const vertexShaderSource = `
        attribute vec4 a_position;
        void main() {
          gl_Position = a_position;
        }
      `;

      const fragmentShaderSource = `
        precision mediump float;
        uniform vec2 u_resolution;
        uniform float u_time;
        uniform float u_k;  // 平滑系数
        uniform float u_r;  // 基础半径
        uniform float u_d;  // 分离距离 (用于两个基础圆)
        uniform int u_source_count;  // 源数量
        uniform vec2 u_sources[20];  // 源位置 (最多20个)

        void main() {
          vec2 st = gl_FragCoord.xy / u_resolution.xy;
          vec3 color = vec3(0.96, 0.97, 0.98);

          float metaball = 0.0;

          // 如果有多个源，使用它们
          if (u_source_count > 0) {
            for (int i = 0; i < 20; i++) {
              if (i >= u_source_count) break;

              vec2 source_pos = u_sources[i];
              float dist = distance(st, source_pos);

              float contribution = smoothstep(u_r, u_r - u_k, dist);
              metaball += contribution;
            }
          } else {
            // 默认的两个圆 (兼容旧版本)
            vec2 center1 = vec2(0.5 - u_d, 0.5);
            vec2 center2 = vec2(0.5 + u_d, 0.5);

            float d1 = distance(st, center1);
            float d2 = distance(st, center2);

            float metaball1 = smoothstep(u_r, u_r - u_k, d1);
            float metaball2 = smoothstep(u_r, u_r - u_k, d2);
            metaball = metaball1 + metaball2;
          }

          // 最终混合
          metaball = smoothstep(0.0, 1.0, metaball);

          color = mix(vec3(0.1, 0.1, 0.2), color, 1.0-metaball);

          gl_FragColor = vec4(color, 1.0);
        }
      `;

      // 编译着色器
      const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
      const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

      if (!vertexShader || !fragmentShader) {
        throw new Error('Failed to compile shaders');
      }

      // 创建程序
      program = createProgram(gl, vertexShader, fragmentShader);
      if (!program) {
        throw new Error('Failed to create shader program');
      }

      isInitialized = true;
      console.log('[MetaCanvas] Simple WebGL initialized successfully');
      return true;
    } catch (err) {
      console.error('[MetaCanvas] WebGL initialization failed:', err);
      return false;
    }
  };

  const createShader = (gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[MetaCanvas] Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  };

  const createProgram = (gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null => {
    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[MetaCanvas] Program link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }

    return program;
  };

  const updateCanvasSize = () => {
    // 使用window尺寸确保全屏
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    if (canvas.width !== windowWidth || canvas.height !== windowHeight) {
      canvas.width = windowWidth;
      canvas.height = windowHeight;
      console.log(`[MetaCanvas] Canvas resized to ${windowWidth}x${windowHeight} (full screen)`);
    }
  };

  const render = (params: SPInputs = {}) => {
    if (!gl || !program || !isInitialized) return;

    // 更新canvas尺寸
    updateCanvasSize();

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.96, 0.97, 0.98, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);

    // 设置矩形 (全屏四边形)
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1,  -1, 1,
      -1, 1,   1, -1,   1, 1
    ]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // 设置uniforms
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    const timeLocation = gl.getUniformLocation(program, 'u_time');
    const kLocation = gl.getUniformLocation(program, 'u_k');
    const rLocation = gl.getUniformLocation(program, 'u_r');
    const dLocation = gl.getUniformLocation(program, 'u_d');
    const sourceCountLocation = gl.getUniformLocation(program, 'u_source_count');
    const sourcesLocation = gl.getUniformLocation(program, 'u_sources[0]'); // WebGL 1.0 需要单独设置每个元素

    if (resolutionLocation) {
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    }
    if (timeLocation) {
      gl.uniform1f(timeLocation, Date.now() * 0.001);
    }
    if (kLocation) {
      gl.uniform1f(kLocation, params.k ?? 0.32);
    }
    if (rLocation) {
      gl.uniform1f(rLocation, params.r ?? 0.42);
    }
    if (dLocation) {
      gl.uniform1f(dLocation, params.d ?? 0.0);
    }
    if (sourceCountLocation) {
      const sourceCount = params.sources?.length || 0;
      gl.uniform1i(sourceCountLocation, Math.min(sourceCount, 20));

      // 设置每个源的位置
      if (params.sources && sourceCount > 0) {
        for (let i = 0; i < Math.min(sourceCount, 20); i++) {
          const sourceLoc = gl.getUniformLocation(program, `u_sources[${i}]`);
          if (sourceLoc && params.sources[i]) {
            gl.uniform2f(sourceLoc, params.sources[i].x, params.sources[i].y);
          }
        }
      }
    }

    // 绘制
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  // 初始化
  if (!initWebGL()) {
    return {
      setInputs: () => {},
      draw: () => {},
      dispose: () => {}
    };
  }

  let currentParams: SPInputs = {};

  // 开始渲染循环
  const animate = () => {
    render(currentParams);
    animationId = requestAnimationFrame(animate);
  };
  animate();

  return {
    setInputs: (vars: SPInputs) => {
      currentParams = { ...currentParams, ...vars };
    },
    draw: () => render(currentParams),
    dispose: () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      if (gl && program) {
        gl.deleteProgram(program);
      }
    }
  };
}

// --------------------------- 组件：MetaCanvasSplitMerge ---------------------------

type Source = {
  id: string;
  seed: number;       // 独立种子（可复现）
  pos: [number, number, number];
  radius: number;
  weight: number;     // 这里预留给未来的场强扩展
  phase: number;      // 动态相位（呼吸/细节）
};

function prng(seed: number) {
  // 简易 LCG（演示用）：确保独立种子可复现
  let s = seed >>> 0;
  return () => ((s = (1664525 * s + 1013904223) >>> 0) / 0xffffffff);
}

function makeSourceFromSeed(seed: number, spread = 0.8): Source {
  const rnd = prng(seed);
  const a = rnd() * Math.PI * 2;
  const r = Math.sqrt(rnd()) * spread;
  const h = (rnd() - 0.5) * 0.2;
  return {
    id: `src_${seed}`,
    seed,
    pos: [Math.cos(a) * r, Math.sin(a) * r, h],
    radius: 0.42 + rnd() * 0.2,
    weight: 1.0,
    phase: rnd() * Math.PI * 2,
  };
}

export default function MetaCanvasSplitMerge() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<SPRuntime | null>(null);
  const rafRef = useRef<number | null>(null);

  // 调试：控制面板已渲染
  React.useEffect(() => {
    console.log('[MetaCanvas] Control panel rendered with sources:', sources.length);
  }, [sources]);

  // 全局参数（可外部用 props 控制，这里给默认）
  const [k, setK] = useState(0.32);      // 平滑系数（液态）
  const [r, setR] = useState(0.42);      // 半径
  const [d, setD] = useState(0.0);       // 分离距离
  const [time, setTime] = useState(0);   // 时间

  // 源列表：初始 1 个，支持 fork/merge
  const [sources, setSources] = useState<Source[]>(() => [makeSourceFromSeed(12345)]);

  // 演示用：fork / merge 操作
  const fork = () => {
    if (sources.length >= MAX_SOURCES) return;
    const seedBase = Math.floor(Math.random() * 1e9);
    const add = makeSourceFromSeed(seedBase);
    setSources(prev => [...prev, add]);
    setD(0.6); // 切换到分离状态
  };

  const merge = () => {
    if (sources.length <= 1) return;
    setSources(prev => prev.slice(0, prev.length - 1));
    setD(prev => Math.max(0.0, prev - 0.3)); // 减少分离距离
  };

  // 导出/导入（可复现）
  const exportJSON = () => {
    const data = { k, r, d, time, sources };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'metaball_state.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const importJSON = async (file: File) => {
    const text = await file.text();
    const data = JSON.parse(text);
    if (Array.isArray(data.sources)) setSources(data.sources);
    if (typeof data.k === 'number') setK(data.k);
    if (typeof data.r === 'number') setR(data.r);
    if (typeof data.d === 'number') setD(data.d);
    if (typeof data.time === 'number') setTime(data.time);
  };

  // 更新uniform参数
  useEffect(() => {
    if (runtimeRef.current) {
      // 将sources转换为WebGL需要的格式
      const webglSources = sources.map(source => ({
        x: source.pos[0],  // 使用源的x坐标
        y: source.pos[1]   // 使用源的y坐标
      }));

      runtimeRef.current.setInputs({
        k,
        r,
        d,
        t: time,
        sources: webglSources
      });
    }
  }, [k, r, d, time, sources]);

  // 初始化渲染器
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 创建 runtime
    const runtime = createMinimalRendererFromString(canvas, spCode);
    runtimeRef.current = runtime;

    const onResize = () => {
      // Webgl渲染器内部会处理尺寸，这里不需要额外处理
    };
    window.addEventListener('resize', onResize);

    // 初始化参数
    runtime.setInputs({ k, r, d, t: time });

    return () => {
      window.removeEventListener('resize', onResize);
      runtime.dispose();
    };
  }, []);

  // UI - 全屏canvas + 左上角控制面板
  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {/* 全屏Canvas背景 */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block"
        style={{ width: '100vw', height: '100vh' }}
      />

      {/* 左上角控制面板 - 简化版本 */}
      <div
        style={{
          position: 'fixed',
          top: '20px',
          left: '20px',
          zIndex: 9999,
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          color: 'white',
          padding: '16px',
          borderRadius: '8px',
          border: '2px solid #666',
          minWidth: '250px',
          fontFamily: 'monospace'
        }}
      >
        <div style={{ marginBottom: '12px', fontWeight: 'bold' }}>
          Metaball 控制面板
        </div>

        {/* 操作按钮 */}
        <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={fork}
            disabled={sources.length >= MAX_SOURCES}
            style={{
              padding: '6px 12px',
              backgroundColor: sources.length >= MAX_SOURCES ? '#666' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: sources.length >= MAX_SOURCES ? 'not-allowed' : 'pointer'
            }}
          >
            Fork
          </button>
          <button
            onClick={merge}
            disabled={sources.length <= 1}
            style={{
              padding: '6px 12px',
              backgroundColor: sources.length <= 1 ? '#666' : '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: sources.length <= 1 ? 'not-allowed' : 'pointer'
            }}
          >
            Merge
          </button>
          <div style={{ fontSize: '12px', color: '#ccc' }}>
            源: {sources.length}/{MAX_SOURCES}
          </div>
        </div>

        {/* 参数控制 */}
        <div style={{ marginBottom: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '20px' }}>k</span>
          <input
            type="range"
            min={0.1}
            max={0.6}
            step={0.01}
            value={k}
            onChange={e=>setK(parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ width: '30px', textAlign: 'right' }}>{k.toFixed(2)}</span>
        </div>

        <div style={{ marginBottom: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '20px' }}>r</span>
          <input
            type="range"
            min={0.2}
            max={0.8}
            step={0.01}
            value={r}
            onChange={e=>setR(parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ width: '30px', textAlign: 'right' }}>{r.toFixed(2)}</span>
        </div>

        <div style={{ marginBottom: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '20px' }}>d</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={d}
            onChange={e=>setD(parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ width: '30px', textAlign: 'right' }}>{d.toFixed(2)}</span>
        </div>

        {/* 导入导出 */}
        <div style={{ borderTop: '1px solid #666', paddingTop: '8px', marginTop: '8px', fontSize: '12px', display: 'flex', gap: '8px' }}>
          <button
            onClick={exportJSON}
            style={{
              padding: '4px 8px',
              backgroundColor: '#666',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px'
            }}
          >
            导出
          </button>
          <label
            style={{
              padding: '4px 8px',
              backgroundColor: '#666',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px'
            }}
          >
            导入
            <input
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={e=>{const f=e.target.files?.[0]; if(f) importJSON(f)}}
            />
          </label>
        </div>
      </div>
    </div>
  )
}
