import React, { useEffect, useMemo, useRef, useState } from 'react'
import { on, off, Events } from '@/events/bus'

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
  radii?: number[]; // 规范化半径数组
  // colors 已移除（改为背景主导配色）
  sigma?: number; // 衰减尺度
  gain?: number;  // 场增益（避免过暗）
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
      gl = (canvas.getContext('webgl') as WebGLRenderingContext) || (canvas.getContext('experimental-webgl') as any);
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
        #ifdef GL_ES
        #extension GL_OES_standard_derivatives : enable
        #endif
        uniform vec2 u_resolution;
        uniform float u_time;
        // 交互参数映射：
        // u_scale ← r (全局尺寸缩放)
        // u_edge  ← k (阈值边缘软化宽度)
        // u_threshold ← d (等值面阈值，越大越易粘连)
        uniform float u_edge;
        uniform float u_scale;
        uniform float u_threshold;
        // 额外：场衰减（可后续映射到 UI）
        uniform float u_sigma;   // 衰减尺度（越小越细腰）
        uniform float u_gain;    // 场增益（扩大可见性）
        uniform int u_source_count;  // 源数量
        uniform vec2 u_sources[20];  // 源位置 (最多20个)
        uniform float u_radii[20];   // 每个源的半径（规范化，和 st 同尺度）
        // 移除每源着色，采用背景主导配色
        // 兼容旧版默认两圆演示所需
        uniform float u_d;

        // ============== 3D Simplex Noise (移植自 webgl-noise) ==============
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

          vec3 i  = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);

          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);

          vec3 x1 = x0 - i1 + C.xxx;
          vec3 x2 = x0 - i2 + C.yyy;
          vec3 x3 = x0 - D.yyy;

          i = mod289(i);
          vec4 p = permute(permute(permute(
                    i.z + vec4(0.0, i1.z, i2.z, 1.0))
                  + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                  + i.x + vec4(0.0, i1.x, i2.x, 1.0));

          float n_ = 0.142857142857;
          vec3 ns = n_ * D.wyz - D.xzx;

          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);

          vec4 x = x_ *ns.x + ns.yyyy;
          vec4 y = y_ *ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);

          vec4 b0 = vec4(x.xy, y.xy);
          vec4 b1 = vec4(x.zw, y.zw);

          vec4 s0 = floor(b0)*2.0 + 1.0;
          vec4 s1 = floor(b1)*2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));

          vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);

          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
          p0 *= norm.x;
          p1 *= norm.y;
          p2 *= norm.z;
          p3 *= norm.w;

          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }

        // ============== FBM (分形布朗运动) ==============
        // ShaderPark 的 noise() 返回 [0,1]，但 snoise 返回 [-1,1]
        // 需要重映射到 [0,1]
        vec3 fbm(vec3 p) {
          float offset = 0.1;
          return vec3(
            snoise(p) * 0.5 + 0.5,
            snoise(p + offset) * 0.5 + 0.5,
            snoise(p + offset * 2.0) * 0.5 + 0.5
          );
        }

         // bgColor函数已移除，背景完全由ShaderParkLayer负责

        void main() {
          // 统一像素空间的各向同性度量：x 轴按长宽比缩放
          float aspect = u_resolution.x / u_resolution.y;
          vec2 st = gl_FragCoord.xy / u_resolution.xy;
          vec2 stAspect = st;
          stAspect.x *= aspect;

          // 原始 uv（用于背景渐变）
          vec2 uv = gl_FragCoord.xy / u_resolution.xy;

          // ============== 1. 计算 Metaball 场 ==============
          float field = 0.0;

          if (u_source_count > 0) {
            for (int i = 0; i < 20; i++) {
              if (i >= u_source_count) break;

              vec2 p = u_sources[i];
              p.x *= aspect;
              float ri = max(0.0001, u_radii[i]) * max(0.0001, u_scale);
              float s = max(0.0001, u_sigma);

              float dist = distance(stAspect, p);
              float q = dist / (ri * s);
              float fi = exp(-q*q);

              field += fi;
            }
          }

          // ============== 2. Metaball 渲染（带噪波质感的弥散球） ==============
          float fieldNorm = field * u_gain;

          // 使用更柔和的边缘过渡
          float T = clamp(u_threshold, 0.0, 5.0);
          float edgeWidth = 2.0;
          float a = smoothstep(T - edgeWidth, T + edgeWidth, fieldNorm);

          // 添加噪波纹理，模拟ShaderPark的模糊质感
          vec3 noiseDir = normalize(vec3((uv - 0.5) * 2.0, 1.0));
          vec3 noiseVal = fbm(noiseDir * 3.0 + vec3(0.0, 0.0, u_time * 0.08));

          // 噪波扰动：增强变化让质感更明显
          float noiseFactor = (noiseVal.x * 0.5 + 0.5) * 0.25 + 0.75; // [0.75, 1.0]

          // 基础颜色：略带灰度的白色，更接近ShaderPark渲染的质感
          vec3 ballColor = vec3(0.96, 0.97, 0.98) * noiseFactor;

          // 根据场强调整透明度，中心更实，边缘更虚
          float alphaFinal = a * mix(0.65, 0.92, smoothstep(0.5, 3.0, fieldNorm));

          gl_FragColor = vec4(ballColor, alphaFinal);
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
    if (!gl || !program || !isInitialized) {
      if (Math.random() < 0.001) {
        console.log('[MetaCanvas] Render skipped: gl=', !!gl, 'program=', !!program, 'init=', isInitialized);
      }
      return;
    }

    // 更新canvas尺寸
    updateCanvasSize();

    // DEBUG: 输出参数（低频率避免刷屏）
    if (Math.random() < 0.001) { // 0.1% 概率输出
      console.log('[MetaCanvas] Render params:', {
        r: params.r,
        d: params.d,
        sigma: params.sigma,
        gain: params.gain,
        sources: params.sources?.length,
        radii: (params as any).radii?.slice(0, 3)
      });
    }

    gl.viewport(0, 0, canvas.width, canvas.height);

    // 启用 alpha blending，让弥散球叠加在 ShaderPark 背景上
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // 清除为透明，让 ShaderPark 背景透过来
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
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
    const edgeLocation = gl.getUniformLocation(program, 'u_edge');
    const scaleLocation = gl.getUniformLocation(program, 'u_scale');
    const thresholdLocation = gl.getUniformLocation(program, 'u_threshold');
    const sigmaLocation = gl.getUniformLocation(program, 'u_sigma');
    const gainLocation = gl.getUniformLocation(program, 'u_gain');
    const sourceCountLocation = gl.getUniformLocation(program, 'u_source_count');
    const sourcesLocation = gl.getUniformLocation(program, 'u_sources[0]'); // WebGL 1.0 需要单独设置每个元素
    // 半径数组（规范化）：u_radii[i]
    const radii0 = gl.getUniformLocation(program, 'u_radii[0]');

    if (resolutionLocation) {
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    }
    if (timeLocation) {
      gl.uniform1f(timeLocation, params.t ?? Date.now() * 0.001);
    }
    const actualK = params.k ?? 0.08;
    const actualR = params.r ?? 0.55;
    const actualD = params.d ?? 0.35;
    const actualSigma = params.sigma ?? 0.6;
    const actualGain = params.gain ?? 2.0;

    if (edgeLocation) gl.uniform1f(edgeLocation, actualK);           // 边缘软化宽度
    if (scaleLocation) gl.uniform1f(scaleLocation, actualR);          // 全局尺寸缩放
    if (thresholdLocation) gl.uniform1f(thresholdLocation, actualD);  // 等值阈值
    if (sigmaLocation) gl.uniform1f(sigmaLocation, actualSigma);       // 衰减尺度
    if (gainLocation) gl.uniform1f(gainLocation, actualGain);          // 场增益

    // DEBUG: Log actual uniform values being sent to GPU
    if (Math.random() < 0.001) {
      console.log('[MetaCanvas] Uniforms sent to GPU:', { k: actualK, r: actualR, d: actualD, sigma: actualSigma, gain: actualGain });
    }
    if (sourceCountLocation) {
      const sourceCount = params.sources?.length || 0;
      gl.uniform1i(sourceCountLocation, Math.min(sourceCount, 20));

      // DEBUG: 输出source信息
      if (Math.random() < 0.005 && sourceCount > 0) {
        console.log('[MetaCanvas] Setting sources to GPU:', {
          count: sourceCount,
          sources: params.sources?.slice(0, 3),
          radii: (params as any).radii?.slice(0, 3)
        });
      }

      // 设置每个源的位置
      if (params.sources && sourceCount > 0) {
        for (let i = 0; i < Math.min(sourceCount, 20); i++) {
          const sourceLoc = gl.getUniformLocation(program, `u_sources[${i}]`);
          if (sourceLoc && params.sources[i]) {
            gl.uniform2f(sourceLoc, params.sources[i].x, params.sources[i].y);
          }
          const rLoc = gl.getUniformLocation(program, `u_radii[${i}]`);
          if (rLoc && (params as any).radii && (params as any).radii[i] != null) {
            gl.uniform1f(rLoc, (params as any).radii[i]);
          }
          const cLoc = gl.getUniformLocation(program, `u_colors[${i}]`);
          if (cLoc && (params as any).colors && (params as any).colors[i] != null) {
            const col = (params as any).colors[i];
            gl.uniform3f(cLoc, col[0], col[1], col[2]);
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
      // console.log('[MetaCanvas] setInputs called with:', vars);
      currentParams = { ...currentParams, ...vars };
      // console.log('[MetaCanvas] currentParams after update:', currentParams);
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
  const [linkedNodes, setLinkedNodes] = useState<Array<{ id: string; branch: 'thesis'|'antithesis'; label?: string }>>([]);
  // 维护母子关系与节点属性（位置每次统一布局重算，使分布更均匀）
  const [tree, setTree] = useState<Record<string, string[]>>({ root: [] });
  const initialRootSource: Source = { id: 'root', seed: 0, pos: [0,0,0], radius: 0.5, weight: 1, phase: 0 };
  const nodeMapRef = useRef<Record<string, Source>>({
    root: initialRootSource
  });
  const nodeBranchRef = useRef<Record<string, 'thesis'|'antithesis'|'synthesis'|'root'>>({ root: 'root' as any });
  // 锚定位置：在 combine/fork 后为某些节点指定“强制坐标”，布局时优先采用
  const anchoredPosRef = useRef<Record<string, [number, number]>>({});

  // 全局参数（使用稳定区间 + 优化默认值使球更明显）
  const [k, setK] = useState(0.12);      // 边缘软化（u_edge）
  const [r, setR] = useState(0.35);      // 全局缩放（u_scale）- 提高到0.35让球更大
  const [d, setD] = useState(0.4);       // 阈值（u_threshold）- 降低到0.4让球更容易显示
  const [sigma, setSigma] = useState(1.8); // 场衰减尺度（u_sigma）- 提高到1.8让场更宽
  const [gain, setGain] = useState(1.5);   // 场放大系数（u_gain）- 提高到1.5增强可见性
  const [time, setTime] = useState(0);   // 时间

  // 源列表：初始 1 个 root，与 nodeMapRef 同步
  const [sources, setSources] = useState<Source[]>(() => [initialRootSource]);

  // 调试：控制面板已渲染（放在 sources 声明之后，避免 TDZ）
  // React.useEffect(() => {
  //   try {
  //     console.log('[MetaCanvas] Sources updated:', sources.length, sources.map(s => ({id: s.id, pos: s.pos})));
  //   } catch (err) {
  //     console.error('[MetaCanvas] sources log error', err);
  //   }
  // }, [sources]);

  // 演示用：fork / merge 操作
  const fork = () => {
    console.log('[MetaCanvas] Fork button clicked, current sources:', sources.length);
    if (sources.length >= MAX_SOURCES) return;
    const seedBase = Math.floor(Math.random() * 1e9);
    const add = makeSourceFromSeed(seedBase);
    // 规则：从中心向外，按同心圆分布；每环最多 6 个点
    setSources(prev => {
      const nextIndex = prev.length; // 第 0 个为中心
      if (nextIndex === 0) {
        add.pos = [0, 0, 0];
      } else {
        const ring = Math.floor((nextIndex - 1) / 6);  // 第几圈（从 0 开始）
        const idxInRing = (nextIndex - 1) % 6;         // 本圈内序号
        const angle = (Math.PI * 2 * idxInRing) / 6;   // 六等分角度
        const radius = Math.min(0.95, 0.18 + ring * 0.14); // 每圈半径逐步增大
        const x = Math.cos(angle) * radius;            // 局部坐标系 [-1,1]
        const y = Math.sin(angle) * radius;
        add.pos = [x, y, 0];
      }
      console.log('[MetaCanvas] Fork adding source:', add.id);
      return [...prev, add];
    });
  };

  const merge = () => {
    console.log('[MetaCanvas] Merge button clicked, current sources:', sources.length);
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

  // 更新uniform参数 - 修复无限循环
  useEffect(() => {
    // console.log('[MetaCanvas] Uniform update effect triggered:', { r, d, sigma, gain, sources: sources.length });
    if (runtimeRef.current) {
      // 将sources转换为WebGL需要的格式
      const webglSources = sources.map(source => ({
        x: 0.5 + source.pos[0] * 0.5,
        y: 0.5 - source.pos[1] * 0.5
      }));

      // 计算每个节点的层级基础半径并做夹持
      const depthMap: Record<string, number> = {};
      const childrenOf = (id: string) => tree[id] || [];
      const dfsDepth = (id: string, d: number) => {
        depthMap[id] = d;
        childrenOf(id).forEach(cid => dfsDepth(cid, d + 1));
      };
      dfsDepth('root', 0);
      const r0 = 0.65;
      const alpha = 0.88;
      const radii = sources.map(s => {
        const dpt = depthMap[s.id] ?? 1;
        const base = r0 * Math.pow(alpha, dpt);
        const rNorm = Math.max(0.008, Math.min(0.60, base));
        return rNorm;
      });

      runtimeRef.current.setInputs({
        k,
        r,
        d,
        sigma,
        gain,
        t: time,
        sources: webglSources,
        radii
      });
    }
  }, [k, r, d, sigma, gain, time, sources, tree]); // 添加tree依赖

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
    runtime.setInputs({ k, r, d, sigma, gain, t: time });

    return () => {
      window.removeEventListener('resize', onResize);
      runtime.dispose();
    };
  }, []);

  // 监听聊天联动：记录母子关系；merge 高亮
  useEffect(() => {
    const offAdd = on(Events.ChatAddChildren, (payload: { parentId: string; children: Array<{ id: string; branch: 'thesis'|'antithesis'; label?: string }> }) => {
      try {
        console.log('[MetaCanvas] ChatAddChildren fired:', payload);
        setLinkedNodes(prev => [...prev, ...payload.children]);
        setTree(prev => {
          const t = { ...prev };
          if (!t[payload.parentId]) t[payload.parentId] = [];
          payload.children.forEach(ch => {
            if (!t[ch.id]) t[ch.id] = [];
            if (!t[payload.parentId].includes(ch.id)) t[payload.parentId].push(ch.id);
            nodeBranchRef.current[ch.id] = ch.branch;
            if (!nodeMapRef.current[ch.id]) {
              nodeMapRef.current[ch.id] = { ...makeSourceFromSeed(Math.floor(Math.random()*1e9)), id: ch.id, pos: [0,0,0] };
            }
          });
          if (!nodeMapRef.current[payload.parentId]) {
            nodeMapRef.current[payload.parentId] = { id: payload.parentId, seed: 0, pos: [0,0,0], radius: 0.5, weight: 1, phase: 0 } as Source;
          }
          console.log('[MetaCanvas] After ChatAddChildren, nodeMap has:', Object.keys(nodeMapRef.current));
          return t;
        });
      } catch (e) {
        console.error('[MetaCanvas] ChatAddChildren handler error', e);
      }
    });

    const offMerge = on(Events.Merge, (payload: { turnId: string; side: 'thesis'|'antithesis' }) => {
      try {
        console.log('[MetaCanvas] Merge fired:', payload);
        // 简化：merge 时让最近新增的两个源点之一高亮（通过临时状态）
        setHighlightBranch(payload.side);
        // 不再回收源点，避免"选择并继续"导致已有点被删除
      } catch (e) {
        console.error('[MetaCanvas] Merge handler error', e);
      }
    });

    // 合并：把 from 种子移动到 to 附近，并把 from 的母子关系并入 to
    const offCombine = on(Events.CombineSeeds as any, (payload: { fromId: string; toId: string }) => {
      try {
        console.log('[MetaCanvas] CombineSeeds fired:', payload);
        // 1) 位置：把 from 的 pos 拉到 to 的附近（轻微偏移）
        const from = nodeMapRef.current[payload.fromId];
        const to = nodeMapRef.current[payload.toId];
        if (from && to) {
          const dx = (Math.random() - 0.5) * 0.06;
          const dy = (Math.random() - 0.5) * 0.06;
          const ax = to.pos[0] + dx;
          const ay = to.pos[1] + dy;
          from.pos = [ax, ay, 0];
          anchoredPosRef.current[payload.fromId] = [ax, ay];
        }
        // 2) 关系：把 from 的 children 挂到 to，清空 from 的 children
        setTree(prev => {
          const t = { ...prev } as Record<string,string[]>;
          const fromChildren = t[payload.fromId] || [];
          if (!t[payload.toId]) t[payload.toId] = [];
          fromChildren.forEach(cid => { if (!t[payload.toId].includes(cid)) t[payload.toId].push(cid); });
          t[payload.fromId] = [];
          // 如果某个父节点包含 from，把它的该孩子替换为 to（保持连通）
          Object.keys(t).forEach(pid => {
            const idx = t[pid].indexOf(payload.fromId);
            if (idx >= 0 && !t[pid].includes(payload.toId)) t[pid][idx] = payload.toId;
          });
          console.log('[MetaCanvas] After CombineSeeds, nodeMap has:', Object.keys(nodeMapRef.current));
          return t;
        });
      } catch (e) {
        console.error('[MetaCanvas] CombineSeeds error', e);
      }
    });

    // fork：把 from 种子移动到 to 位置，并且继承 to 的母子关系（上下文）
    const offFork = on(Events.ForkSeed as any, (payload: { fromId: string; toId: string }) => {
      try {
        console.log('[MetaCanvas] ForkSeed fired:', payload);
        const from = nodeMapRef.current[payload.fromId];
        const to = nodeMapRef.current[payload.toId];
        if (from && to) {
          from.pos = [...to.pos];
          anchoredPosRef.current[payload.fromId] = [to.pos[0], to.pos[1]];
        }
        setTree(prev => {
          const t = { ...prev } as Record<string,string[]>;
          // 继承 to 的 children 作为 from 的 children（浅拷贝）
          t[payload.fromId] = [ ...(t[payload.toId] || []) ];
          // 同时把所有父亲中原来指向 to 的边再复制一条到 from，使 from 共享上下文
          Object.keys(t).forEach(pid => {
            if (t[pid].includes(payload.toId) && !t[pid].includes(payload.fromId)) {
              t[pid].push(payload.fromId);
            }
          });
          console.log('[MetaCanvas] After ForkSeed, nodeMap has:', Object.keys(nodeMapRef.current));
          return t;
        });
      } catch (e) {
        console.error('[MetaCanvas] ForkSeed error', e);
      }
    });

    return () => { offAdd(); offMerge(); offCombine(); offFork(); };
  }, []);

  const [highlightBranch, setHighlightBranch] = useState<'thesis'|'antithesis'|'synthesis'|null>(null);
  // 拖拽交互
  const markersRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<{ id: string } | null>(null);

  const screenToLocal = (clientX: number, clientY: number): [number, number] => {
    const el = markersRef.current;
    if (!el) return [0, 0];
    const rect = el.getBoundingClientRect();
    const x01 = (clientX - rect.left) / rect.width;  // 0..1
    const y01 = (clientY - rect.top) / rect.height; // 0..1
    const lx = (x01 - 0.5) * 2; // -1..1
    const ly = (y01 - 0.5) * 2; // -1..1
    return [Math.max(-0.98, Math.min(0.98, lx)), Math.max(-0.98, Math.min(0.98, ly))];
  };

  const beginDrag = (id: string, ev: React.MouseEvent) => {
    draggingRef.current = { id };
    (ev.currentTarget as HTMLElement).style.cursor = 'grabbing';
  };

  const onMouseMove = (ev: React.MouseEvent) => {
    if (!draggingRef.current) return;
    const id = draggingRef.current.id;
    const [lx, ly] = screenToLocal(ev.clientX, ev.clientY);
    // 写入锚定与节点表，并即时刷新 sources
    anchoredPosRef.current[id] = [lx, ly];
    if (nodeMapRef.current[id]) {
      nodeMapRef.current[id].pos = [lx, ly, 0];
    }
    setSources(Object.keys(nodeMapRef.current).map(k => ({ ...nodeMapRef.current[k] })));
  };

  const endDrag = () => {
    draggingRef.current = null;
  };

  // 时间更新循环
  useEffect(() => {
    const interval = setInterval(() => {
      setTime(prev => prev + 0.016); // 约60fps
    }, 16);
    return () => clearInterval(interval);
  }, []);

  // 树变化时：重新布局，生成均匀分布（径向，按子树大小分配角度 + 分离度放松）
  useEffect(() => {
    // console.log('[MetaCanvas] Tree layout effect triggered');
    // console.log('[MetaCanvas] Current tree:', tree);
    // console.log('[MetaCanvas] Current nodeMap keys:', Object.keys(nodeMapRef.current));

    const children = (id: string) => tree[id] || [];
    const leafSizeCache: Record<string, number> = {};
    const leafSize = (id: string): number => {
      if (leafSizeCache[id] != null) return leafSizeCache[id];
      const ch = children(id);
      if (!ch.length) return (leafSizeCache[id] = 1);
      return (leafSizeCache[id] = ch.map(leafSize).reduce((a,b)=>a+b,0));
    };

    const layoutPos: Record<string,[number,number]> = { root: [0,0] };
    const nodeCount = Object.keys(nodeMapRef.current).length;
    // 自适应层半径步长：节点越多越外扩
    const radiusStep = Math.min(0.38, 0.16 + 0.04 * Math.log(1 + nodeCount / 4));
    const dfs = (id: string, start: number, end: number, depth: number) => {
      const ch = children(id);
      if (!ch.length) return;
          const total = ch.map(leafSize).reduce((a,b)=>a+b,0);
      let cur = start;
      ch.forEach(cid => {
        const portion = leafSize(cid) / total;
        const span = (end - start) * portion;
        // 在扇区中心角附近加入极小扰动，减少同角重合
        const jitter = (Math.random() - 0.5) * 0.03;
        const mid = cur + span / 2 + jitter;
        const r = radiusStep * (depth + 1);
        layoutPos[cid] = [Math.cos(mid) * r, Math.sin(mid) * r];
        dfs(cid, cur, cur + span, depth + 1);
        cur += span;
      });
    };
    dfs('root', -Math.PI, Math.PI, 0);

    // 基础位置（锚定优先）
    const ids = Object.keys(nodeMapRef.current);
    const pos: Record<string,[number,number]> = {};
    ids.forEach(id => {
      const p = anchoredPosRef.current[id] || layoutPos[id] || [0,0];
      pos[id] = [p[0], p[1]];
    });

    // 分离度放松（简单斥力 + 最小间距），锚定点不动
    const minDist = 0.12;        // 最小允许距离（单位：场景坐标）
    const relaxIters = 24;       // 迭代次数
    const stepScale = 0.5;       // 步长缩放
    for (let it = 0; it < relaxIters; it++) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = ids[i], b = ids[j];
          if (anchoredPosRef.current[a] && anchoredPosRef.current[b]) continue; // 都锚定则跳过
          const ax = pos[a][0], ay = pos[a][1];
          const bx = pos[b][0], by = pos[b][1];
          let dx = ax - bx, dy = ay - by;
          let dist = Math.hypot(dx, dy) || 1e-6;
          if (dist < minDist) {
            const overlap = (minDist - dist);
            dx /= dist; dy /= dist;
            const push = overlap * stepScale * 0.5; // 平分推动
            const moveA = anchoredPosRef.current[a] ? 0 : push;
            const moveB = anchoredPosRef.current[b] ? 0 : push;
            pos[a] = [
              Math.max(-0.98, Math.min(0.98, ax + dx * moveA)),
              Math.max(-0.98, Math.min(0.98, ay + dy * moveA))
            ];
            pos[b] = [
              Math.max(-0.98, Math.min(0.98, bx - dx * moveB)),
              Math.max(-0.98, Math.min(0.98, by - dy * moveB))
            ];
          }
        }
      }
    }

    const next: Source[] = [];
    ids.forEach(id => {
      const src = nodeMapRef.current[id];
      const p = pos[id] || [0,0];
      src.pos = [p[0], p[1], 0];
      next.push({ ...src });
    });
    // console.log('[MetaCanvas] Setting sources to:', next.length, 'items:', next.map(s => s.id));
    setSources(next);
  }, [tree]);

  // UI - 全屏canvas + 左上角控制面板
  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {/* 全屏Canvas背景 - MetaCanvas 渲染弥散球 */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block"
        style={{
          width: '100vw',
          height: '100vh',
          pointerEvents: 'none',
          zIndex: 10,  // 提高到10，确保在ShaderPark(z-index:1)上面
          position: 'fixed',  // 确保固定定位
          top: 0,
          left: 0
        }}
      />

      {/* 源点可视化标记层：以中心为原点的同心布置，便于直观看到"从中心向外增长" */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'auto',
          userSelect: 'none',
          zIndex: 20  // 在MetaCanvas(10)上面
        }}
        ref={markersRef}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        {sources.map((s, i) => {
          const x01 = 0.5 + s.pos[0] * 0.5; // 映射到 [0,1]
          const y01 = 0.5 + s.pos[1] * 0.5;
          const size = 20 + i * 1; // 更小的标记，避免遮挡弥散球
          // 使用中性灰色，避免颜色干扰
          const color = i === 0 ? 'rgba(80, 80, 80, 0.95)' : 'rgba(100, 100, 100, 0.85)';
          const border = i === 0 ? '2px solid rgba(255, 255, 255, 0.95)' : '1px solid rgba(200, 200, 200, 0.8)';
          const glow = highlightBranch ? (i % 2 === (highlightBranch === 'antithesis' ? 1 : 0) ? '0 0 0 6px rgba(255, 255, 0, 0.3)' : 'none') : 'none';
          return (
            <div key={s.id}
              style={{
                position: 'absolute',
                left: `calc(${(x01 * 100).toFixed(3)}% - ${size/2}px)`,
                top: `calc(${(y01 * 100).toFixed(3)}% - ${size/2}px)`,
                width: `${size}px`,
                height: `${size}px`,
                borderRadius: '999px',
                background: `radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.95), ${color})`,
                border,
                boxShadow: glow,
                cursor: 'grab',
                zIndex: 100 + i // 确保在顶层
              }}
              onMouseDown={(e)=>beginDrag(s.id, e)}
            >
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: '#000', textShadow: '0 1px 3px rgba(255,255,255,0.8)' }}>{i}</div>
            </div>
          )
        })}
      </div>

      {/* 左上角控制面板 - 简化版本 */}
      <div
        style={{
          position: 'fixed',
          top: '20px',
          left: '20px',
          zIndex: 100,  // 简化但足够高
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

        {/* 调试信息 */}
        <div style={{ marginBottom: '12px', fontSize: '11px', color: '#aaa', padding: '8px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px', border: '1px solid #444' }}>
          <div>Sources: {sources.length}</div>
          <div style={{ fontSize: '10px', color: '#888', marginTop: '4px' }}>IDs: {sources.map(s => s.id).join(', ')}</div>
          <div>WebGL: {runtimeRef.current ? '✓' : '✗'}</div>
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
            min={0.01}
            max={0.2}
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
            min={0.1}
            max={0.5}
            step={0.01}
            value={r}
            onChange={e=>{
              const newVal = parseFloat(e.target.value);
              console.log('[MetaCanvas] r slider changed from', r, 'to', newVal);
              setR(newVal);
            }}
            style={{ flex: 1 }}
          />
          <span style={{ width: '30px', textAlign: 'right' }}>{r.toFixed(2)}</span>
        </div>

        <div style={{ marginBottom: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '20px' }}>d</span>
          <input
            type="range"
            min={0.3}
            max={0.8}
            step={0.01}
            value={d}
            onChange={e=>{
              const newVal = parseFloat(e.target.value);
              console.log('[MetaCanvas] d slider changed from', d, 'to', newVal);
              setD(newVal);
            }}
            style={{ flex: 1 }}
          />
          <span style={{ width: '30px', textAlign: 'right' }}>{d.toFixed(2)}</span>
        </div>

        <div style={{ marginBottom: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '20px' }}>σ</span>
          <input
            type="range"
            min={1.0}
            max={2.5}
            step={0.1}
            value={sigma}
            onChange={e=>{
              const newVal = parseFloat(e.target.value);
              console.log('[MetaCanvas] sigma slider changed from', sigma, 'to', newVal);
              setSigma(newVal);
            }}
            style={{ flex: 1 }}
          />
          <span style={{ width: '30px', textAlign: 'right' }}>{sigma.toFixed(1)}</span>
        </div>

        <div style={{ marginBottom: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '20px' }}>g</span>
          <input
            type="range"
            min={0.5}
            max={2.0}
            step={0.1}
            value={gain}
            onChange={e=>{
              const newVal = parseFloat(e.target.value);
              console.log('[MetaCanvas] gain slider changed from', gain, 'to', newVal);
              setGain(newVal);
            }}
            style={{ flex: 1 }}
          />
          <span style={{ width: '30px', textAlign: 'right' }}>{gain.toFixed(1)}</span>
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
