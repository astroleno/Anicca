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
const MAX_SOURCES = 64; // Raymarching版本：支持更多球体

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
  start?: () => void;  // 可选：启动渲染循环
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
        #ifdef GL_ES
        #extension GL_OES_standard_derivatives : enable
        #endif
        precision highp float;

        // ====== 配置 ======
        #define MAX_SOURCES 64
        #define BISECT_STEPS 5
        #define USE_TETRA_NORMAL

        // ============== Phase 6: 调试开关（便于回滚对比） ==============
        #define USE_SDF_METHOD 0        // 0=体积渲染(Phase 5), 1=SDF表面(Phase 6)
        #define SMOOTH_UNION_TYPE 0     // 0=多项式soft-min, 1=指数soft-min
        #define NOISE_SPACE 0           // 0=view-space, 1=screen-space
        #define DEBUG_PERF 0            // 1=输出性能统计（步数/miss率）

        // ============== Phase 6: 常量配置 ==============
        const float HIT_EPS = 1e-4;      // 命中判定阈值
        const float NORMAL_EPS = 4e-4;   // 法线差分步长（2-4倍HIT_EPS）
        const float MIN_STEP = 1e-3;     // 步进下限（防蜗牛走）
        const float MAX_STEP = 0.5;      // 步进上限（防过步）

        // ====== Uniforms: 相机/画布 ======
        uniform vec2  u_resolution;
        uniform float u_time;
        uniform vec3  u_cam_pos;
        uniform vec3  u_cam_dir;
        uniform vec3  u_cam_right;
        uniform vec3  u_cam_up;
        uniform float u_fov_y;

        // ====== Uniforms: 包围体AABB ======
        uniform vec3  u_bounds_min;
        uniform vec3  u_bounds_max;

        // ====== Uniforms: 场函数/核参数 ======
        uniform int   u_source_count;
        uniform vec3  u_source_pos[MAX_SOURCES];
        uniform float u_source_rad[MAX_SOURCES];
        uniform float u_source_k[MAX_SOURCES];
        uniform float u_r_cut;

        // ====== Phase 6: SDF smooth union 参数 ======
        uniform float u_blend_k;         // SDF smooth union的融合参数

        // ====== Phase 5: 势场参数（仅在USE_SDF_METHOD=0时使用）======
        uniform float u_threshold_t;
        uniform float u_kernel_eps;
        uniform float u_kernel_pow;

        // ====== Uniforms: 步进/命中参数 ======
        uniform float u_step_far;
        uniform float u_step_near;
        uniform float u_f_gate;
        uniform float u_eps_hit;
        uniform int   u_max_steps;

        // ====== Uniforms: 光照/颜色 ======
        uniform vec3  u_light_dir;
        uniform vec3  u_albedo;
        uniform float u_ambient;

        // ====== Uniforms: 调试视图 ======
        uniform int   u_debug_view;

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

        // ============== Phase 6: SDF 基元（替代势场） ==============

        // 单个球体的 SDF（有符号距离场）
        float sdSphere(vec3 p, vec3 center, float radius) {
          return length(p - center) - radius;
        }

        // SDF 平滑最小值（产生融合效果）
        float smin(float a, float b, float k) {
          #if SMOOTH_UNION_TYPE == 0
            // 多项式 soft-min（更稳定，推荐）
            float h = max(k - abs(a - b), 0.0) / k;
            return min(a, b) - h * h * k * 0.25;
          #else
            // 指数 soft-min（更平滑，但小半径时易过平）
            float res = exp(-k * a) + exp(-k * b);
            return -log(res) / k;
          #endif
        }

        // 多球 SDF 场（smooth union 融合）
        float sdfMetaballs(vec3 p) {
          float d = 1e10;  // 初始化为很大的距离

          for (int i = 0; i < MAX_SOURCES; ++i) {
            if (i >= u_source_count) break;

            float di = sdSphere(p, u_source_pos[i], u_source_rad[i]);

            // 平滑融合（k 参数控制融合范围）
            d = smin(d, di, u_blend_k);
          }

          return d;  // 返回带符号距离
        }

        // ============== Phase 6: SDF 法线计算 ==============

        // SDF 梯度法线（中心差分，epsilon 作为参数）
        vec3 sdfNormal(vec3 p, float e) {
          vec3 n = vec3(
            sdfMetaballs(vec3(p.x + e, p.y, p.z)) - sdfMetaballs(vec3(p.x - e, p.y, p.z)),
            sdfMetaballs(vec3(p.x, p.y + e, p.z)) - sdfMetaballs(vec3(p.x, p.y - e, p.z)),
            sdfMetaballs(vec3(p.x, p.y, p.z + e)) - sdfMetaballs(vec3(p.x, p.y, p.z - e))
          );
          return normalize(n);
        }

        // ============== 工具函数 ==============

        // AABB vs Ray 相交测试
        float sdBox(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax, out float tNear, out float tFar) {
          vec3 invD = 1.0 / rd;
          vec3 t0 = (bmin - ro) * invD;
          vec3 t1 = (bmax - ro) * invD;
          vec3 tsm = min(t0, t1);
          vec3 tbg = max(t0, t1);
          tNear = max(max(tsm.x, tsm.y), tsm.z);
          tFar  = min(min(tbg.x, tbg.y), tbg.z);
          return (tFar >= max(tNear, 0.0)) ? 1.0 : 0.0;
        }

        // 核函数
        float kernelInvPow(float r, float epsk, float n) {
          float d2 = r*r + epsk;
          return 1.0 / pow(d2, n);
        }

        // Metaball场函数（原始版本，带threshold）
        float field(vec3 p) {
          float s = -u_threshold_t;
          for (int i = 0; i < MAX_SOURCES; ++i) {
            if (i >= u_source_count) break;
            vec3  d  = p - u_source_pos[i];
            float r  = length(d);
            if (r > u_r_cut) continue;
            float rn = r / max(u_source_rad[i], 1e-6);
            s += u_source_k[i] * kernelInvPow(rn, u_kernel_eps, u_kernel_pow);
          }
          return s;
        }

        // 原始场强（不减threshold，用于调试）
        float fieldRaw(vec3 p) {
          float s = 0.0;
          for (int i = 0; i < MAX_SOURCES; ++i) {
            if (i >= u_source_count) break;
            vec3  d  = p - u_source_pos[i];
            float r  = length(d);
            if (r > u_r_cut) continue;
            float rn = r / max(u_source_rad[i], 1e-6);
            s += u_source_k[i] * kernelInvPow(rn, u_kernel_eps, u_kernel_pow);
          }
          return s;
        }

        // 四面体法线
        vec3 normalTetra(vec3 p, float e) {
          const vec3 k1 = vec3( 1.0, -1.0, -1.0);
          const vec3 k2 = vec3(-1.0, -1.0,  1.0);
          const vec3 k3 = vec3(-1.0,  1.0, -1.0);
          const vec3 k4 = vec3( 1.0,  1.0,  1.0);
          float f1 = field(p + k1*e);
          float f2 = field(p + k2*e);
          float f3 = field(p + k3*e);
          float f4 = field(p + k4*e);
          vec3  n  = k1*f1 + k2*f2 + k3*f3 + k4*f4;
          return normalize(n);
        }

        // 中心差分法线
        vec3 normalCentral(vec3 p, float e) {
          vec3 ex = vec3(e,0.0,0.0), ey = vec3(0.0,e,0.0), ez = vec3(0.0,0.0,e);
          float fx = field(p + ex) - field(p - ex);
          float fy = field(p + ey) - field(p - ey);
          float fz = field(p + ez) - field(p - ez);
          return normalize(vec3(fx, fy, fz));
        }

        // 二分精化
        float refineBisection(vec3 ro, vec3 rd, float t0, float t1) {
          float f0 = field(ro + rd * t0);
          float f1 = field(ro + rd * t1);
          if (f0 * f1 > 0.0) {
            return (abs(f0) < abs(f1)) ? t0 : t1;
          }
          float a = t0, b = t1;
          float fa = f0, fb = f1;
          for (int i = 0; i < BISECT_STEPS; ++i) {
            float m  = 0.5*(a + b);
            float fm = field(ro + rd * m);
            if (fa * fm <= 0.0) { b = m; fb = fm; }
            else { a = m; fa = fm; }
          }
          return 0.5*(a + b);
        }

        // 生成世界射线
        void makeRay(in vec2 fragCoord, out vec3 ro, out vec3 rd) {
          ro = u_cam_pos;
          vec2 ndc = (2.0 * fragCoord - u_resolution) / u_resolution;
          float aspect = u_resolution.x / max(u_resolution.y, 1.0);
          float tY = tan(0.5 * u_fov_y);
          float tX = tY * aspect;
          vec3 dir = normalize(u_cam_dir + ndc.x * tX * u_cam_right + ndc.y * tY * u_cam_up);
          rd = dir;
        }

        // Lambert光照
        vec3 lambert(vec3 n, vec3 viewDir, vec3 base) {
          vec3 L = normalize(-u_light_dir);
          float ndotl = max(dot(n, L), 0.0);
          vec3  col = base * (u_ambient + (1.0 - u_ambient) * ndotl);
          return col;
        }

        // 体积渲染参数（全局常量）
        const float STEP = 0.08;
        const int MAX_VOL_STEPS = 128;
        const float OPACITY_CUTOFF = 0.95;
        const float DITHER = 0.5;
        const float T_GLOW = 0.05;     // 降低：更早开始软边
        const float T_CORE = 0.40;     // 降低：核心更大
        const float DENSITY_K = 1.5;   // 大幅降低：让整体更透明
        const float CORE_BOOST = 1.2;  // 降低：核心不那么实

        // 阈值化密度函数：三段映射
        float densityFromField(float fRaw) {
          if (fRaw < T_GLOW) return 0.0;

          // 软边：平滑起势
          float x = clamp((fRaw - T_GLOW) / max(T_CORE - T_GLOW, 1e-6), 0.0, 1.0);
          float edge = pow(x, 2.5);

          // 核心：陡峭+增益
          float core = max(fRaw - T_CORE, 0.0);
          core = CORE_BOOST * core;
          core = pow(clamp(core, 0.0, 1.0), 2.0);

          return DENSITY_K * (edge + core);
        }

        void main() {
          vec2 fragCoord = gl_FragCoord.xy;

          // 1) 相机射线
          vec3 ro, rd;
          makeRay(fragCoord, ro, rd);

          // 2) AABB裁剪
          float tNear, tFar;
          float hitBox = sdBox(ro, rd, u_bounds_min, u_bounds_max, tNear, tFar);
          if (hitBox < 0.5) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
            return;
          }

          #if USE_SDF_METHOD == 1
            // ============== Phase 6: SDF Sphere Tracing ==============

            // 3) Sphere Tracing 步进
            float t = max(tNear, 0.0);
            bool hit = false;
            float prevD = 1e10;  // 记录上一步距离（用于掠射角判定）

            for (int i = 0; i < u_max_steps; ++i) {
              if (t > tFar) break;

              vec3 p = ro + rd * t;
              float d = sdfMetaballs(p);  // 使用 SDF 距离场

              // 改进的命中判定（结合距离减小趋势）
              if (d < HIT_EPS || (d < prevD && d < HIT_EPS * 2.0)) {
                hit = true;
                break;
              }

              // 步进护栏（防止极端情况）
              float step = clamp(d, MIN_STEP, MAX_STEP);
              t += step;
              prevD = d;
            }

            if (!hit) {
              gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);  // 未命中，透明
              return;
            }

            // 4) 命中点着色：法线 + Lambert 光照
            vec3 p = ro + rd * t;
            vec3 n = sdfNormal(p, NORMAL_EPS);  // 使用 NORMAL_EPS（不是 HIT_EPS！）

            // Lambert 光照
            vec3 lightDir = normalize(u_light_dir);
            float ndotl = max(dot(n, lightDir), 0.0);
            vec3 albedo = u_albedo;  // 基础反射率
            vec3 col = albedo * (u_ambient + (1.0 - u_ambient) * ndotl);

            // 5) 磨砂颗粒质感（关键！）
            // ⚠️ 噪声必须绑定在视线方向（view-space），不是世界坐标
            #if NOISE_SPACE == 0
              // View-space 噪声（推荐，磨砂感）
              vec3 s = rd;  // ← 视线方向（等同于 ShaderPark 的 getRayDirection()）
            #else
              // Screen-space 噪声（备选，颗粒更稳定但缺乏3D感）
              vec3 s = vec3(gl_FragCoord.xy / u_resolution, 0.0);
            #endif

            float noiseVal = snoise(s * 5.0 + vec3(0, 0, u_time * 0.1));  // 时间动画
            noiseVal = noiseVal * 0.5 + 0.5;  // 映射到 [0,1]

            // 高伽马颗粒化（参考代码用 pow(n, 8)）
            float grain = pow(noiseVal, 8.0);

            // 调制表面颜色（不是 alpha！）
            col *= mix(0.8, 1.2, grain);  // 颜色调制范围：80% - 120%

            // 6) 边缘透明度（Fresnel 效果）
            float fresnel = pow(1.0 - abs(dot(n, -rd)), 2.0);  // Fresnel 幂次 2.0
            float alpha = mix(0.9, 0.3, fresnel);  // 中心 90% 不透明，边缘 30%

            // 最终输出（预乘 Alpha）
            gl_FragColor = vec4(col * alpha, alpha);

          #else
            // ============== Phase 5: Volume Rendering (原始实现) ==============

            // 3) 体积渲染：阈值化密度 + 前向累积
            float rand = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
            float t = tNear + (DITHER * rand) * STEP;

            vec3 accum = vec3(0.0);
            float alpha = 0.0;

            for (int i = 0; i < MAX_VOL_STEPS; ++i) {
              if (t > tFar || alpha > OPACITY_CUTOFF) break;

              vec3 p = ro + rd * t;
              float fRaw = fieldRaw(p);
              float rho = densityFromField(fRaw);

              if (rho > 0.0) {
                // Beer-Lambert前向合成
                float a = 1.0 - exp(-rho * STEP);

                // 颜色：边缘淡青→中心饱和青
                vec3 cEdge = vec3(0.88, 0.95, 0.98);
                vec3 cCore = vec3(0.55, 0.85, 0.90);
                float w = clamp((fRaw - T_GLOW) / max(T_CORE - T_GLOW, 1e-6), 0.0, 1.0);
                vec3 col = mix(cEdge, cCore, pow(w, 1.5));

                // 预乘合成
                col *= a;
                accum += (1.0 - alpha) * col;
                alpha += (1.0 - alpha) * a;
              }

              t += STEP;
            }

            gl_FragColor = vec4(accum, alpha);
          #endif
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
      console.log('[MetaCanvas-Raymarch] WebGL initialized successfully');
      console.log('[MetaCanvas-Raymarch] Shader compiled OK');
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

  // Raymarching相机配置（固定正交相机看XY平面）
  const cameraConfig = {
    pos: [0, 0, 5] as [number, number, number],
    dir: [0, 0, -1] as [number, number, number],
    right: [1, 0, 0] as [number, number, number],
    up: [0, 1, 0] as [number, number, number],
    fovY: Math.PI / 4
  };

  // Raymarching参数配置（极限测试：暴力小步长）
  const raymarchParams = {
    // Phase 6: SDF参数
    blendK: 0.5,       // SDF smooth union融合参数（推荐0.3-0.8）

    // Phase 5: 势场参数（仅在USE_SDF_METHOD=0时使用）
    thresholdT: 1.0,
    rCut: 2.5,
    kernelEps: 1e-3,
    kernelPow: 2.0,

    // 通用步进参数
    stepFar: 0.15,     // 极小步长
    stepNear: 0.015,   // 极小步长
    fGate: 0.3,
    epsHit: 1e-3,
    maxSteps: 256,     // 大幅增加步数

    // 光照参数
    lightDir: [0.4, 0.7, 0.2] as [number, number, number],
    albedo: [0.92, 0.93, 0.94] as [number, number, number],
    ambient: 0.25,
    debugView: 0  // 0=光照 1=场强 2=命中 3=法线
  };

  // 计算AABB包围体
  function computeAABB(sources3D: Array<{x: number, y: number, z: number}>, radii: number[], rCut: number) {
    const bmin = [Infinity, Infinity, Infinity];
    const bmax = [-Infinity, -Infinity, -Infinity];

    sources3D.forEach((src, i) => {
      const r = rCut * Math.max(radii[i], 1e-6);
      bmin[0] = Math.min(bmin[0], src.x - r);
      bmin[1] = Math.min(bmin[1], src.y - r);
      bmin[2] = Math.min(bmin[2], src.z - r);
      bmax[0] = Math.max(bmax[0], src.x + r);
      bmax[1] = Math.max(bmax[1], src.y + r);
      bmax[2] = Math.max(bmax[2], src.z + r);
    });

    return { bmin, bmax };
  }

  const render = (params: SPInputs = {}) => {
    if (!gl || !program || !isInitialized) {
      if (Math.random() < 0.001) {
        console.log('[MetaCanvas] Render skipped: gl=', !!gl, 'program=', !!program, 'init=', isInitialized);
      }
      return;
    }

    // 如果没有sources，跳过渲染（等待初始化）
    if (!params.sources || params.sources.length === 0) {
      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
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

    // 转换sources从2D到3D世界坐标
    const sources3D = (params.sources || []).map(s => {
      // s.x和s.y是[0,1]范围，但s.y已经带了屏幕翻转
      // 需要先反转回局部坐标，再转3D
      const localX = (s.x - 0.5) * 2.0;      // [0,1] -> [-1,1]
      const localY = (0.5 - s.y) * 2.0;      // [0,1] -> [-1,1]，反转屏幕翻转
      const x = localX * 2.0;                // [-1,1] -> [-2,2]
      const y = localY * 2.0;
      const z = 0.0;                         // 固定在Z=0平面
      return { x, y, z };
    });

    const radii = (params as any).radii || [];

    // 计算AABB包围体
    const aabb = sources3D.length > 0
      ? computeAABB(sources3D, radii, raymarchParams.rCut)
      : { bmin: [-3, -3, -3], bmax: [3, 3, 3] };

    // 获取所有uniform locations
    const resolutionLoc = gl.getUniformLocation(program, 'u_resolution');
    const timeLoc = gl.getUniformLocation(program, 'u_time');
    const camPosLoc = gl.getUniformLocation(program, 'u_cam_pos');
    const camDirLoc = gl.getUniformLocation(program, 'u_cam_dir');
    const camRightLoc = gl.getUniformLocation(program, 'u_cam_right');
    const camUpLoc = gl.getUniformLocation(program, 'u_cam_up');
    const fovYLoc = gl.getUniformLocation(program, 'u_fov_y');

    const boundsMinLoc = gl.getUniformLocation(program, 'u_bounds_min');
    const boundsMaxLoc = gl.getUniformLocation(program, 'u_bounds_max');

    const sourceCountLoc = gl.getUniformLocation(program, 'u_source_count');
    const rCutLoc = gl.getUniformLocation(program, 'u_r_cut');

    // Phase 6: SDF参数
    const blendKLoc = gl.getUniformLocation(program, 'u_blend_k');

    // Phase 5: 势场参数（仅在USE_SDF_METHOD=0时使用）
    const thresholdTLoc = gl.getUniformLocation(program, 'u_threshold_t');
    const kernelEpsLoc = gl.getUniformLocation(program, 'u_kernel_eps');
    const kernelPowLoc = gl.getUniformLocation(program, 'u_kernel_pow');

    const stepFarLoc = gl.getUniformLocation(program, 'u_step_far');
    const stepNearLoc = gl.getUniformLocation(program, 'u_step_near');
    const fGateLoc = gl.getUniformLocation(program, 'u_f_gate');
    const epsHitLoc = gl.getUniformLocation(program, 'u_eps_hit');
    const maxStepsLoc = gl.getUniformLocation(program, 'u_max_steps');

    const lightDirLoc = gl.getUniformLocation(program, 'u_light_dir');
    const albedoLoc = gl.getUniformLocation(program, 'u_albedo');
    const ambientLoc = gl.getUniformLocation(program, 'u_ambient');

    const debugViewLoc = gl.getUniformLocation(program, 'u_debug_view');

    // 设置所有uniform值
    if (resolutionLoc) gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
    if (timeLoc) gl.uniform1f(timeLoc, params.t ?? Date.now() * 0.001);

    // 相机
    if (camPosLoc) gl.uniform3fv(camPosLoc, cameraConfig.pos);
    if (camDirLoc) gl.uniform3fv(camDirLoc, cameraConfig.dir);
    if (camRightLoc) gl.uniform3fv(camRightLoc, cameraConfig.right);
    if (camUpLoc) gl.uniform3fv(camUpLoc, cameraConfig.up);
    if (fovYLoc) gl.uniform1f(fovYLoc, cameraConfig.fovY);

    // 包围体
    if (boundsMinLoc) gl.uniform3fv(boundsMinLoc, aabb.bmin);
    if (boundsMaxLoc) gl.uniform3fv(boundsMaxLoc, aabb.bmax);

    // 场参数
    const sourceCount = sources3D.length;
    if (sourceCountLoc) gl.uniform1i(sourceCountLoc, Math.min(sourceCount, MAX_SOURCES));
    if (rCutLoc) gl.uniform1f(rCutLoc, raymarchParams.rCut);

    // Phase 6: SDF参数
    if (blendKLoc) gl.uniform1f(blendKLoc, raymarchParams.blendK);

    // Phase 5: 势场参数（仅在USE_SDF_METHOD=0时使用）
    if (thresholdTLoc) gl.uniform1f(thresholdTLoc, raymarchParams.thresholdT);
    if (kernelEpsLoc) gl.uniform1f(kernelEpsLoc, raymarchParams.kernelEps);
    if (kernelPowLoc) gl.uniform1f(kernelPowLoc, raymarchParams.kernelPow);

    // 步进参数
    if (stepFarLoc) gl.uniform1f(stepFarLoc, raymarchParams.stepFar);
    if (stepNearLoc) gl.uniform1f(stepNearLoc, raymarchParams.stepNear);
    if (fGateLoc) gl.uniform1f(fGateLoc, raymarchParams.fGate);
    if (epsHitLoc) gl.uniform1f(epsHitLoc, raymarchParams.epsHit);
    if (maxStepsLoc) gl.uniform1i(maxStepsLoc, raymarchParams.maxSteps);

    // 光照
    const lightDirNorm = raymarchParams.lightDir.map((v, _i, arr) => {
      const len = Math.sqrt(arr.reduce((sum, x) => sum + x*x, 0));
      return v / len;
    });
    if (lightDirLoc) gl.uniform3fv(lightDirLoc, lightDirNorm);
    if (albedoLoc) gl.uniform3fv(albedoLoc, raymarchParams.albedo);
    if (ambientLoc) gl.uniform1f(ambientLoc, raymarchParams.ambient);

    // 调试
    if (debugViewLoc) gl.uniform1i(debugViewLoc, raymarchParams.debugView);

    // 设置每个源的位置、半径、权重
    for (let i = 0; i < Math.min(sourceCount, MAX_SOURCES); i++) {
      const posLoc = gl.getUniformLocation(program, `u_source_pos[${i}]`);
      const radLoc = gl.getUniformLocation(program, `u_source_rad[${i}]`);
      const kLoc = gl.getUniformLocation(program, `u_source_k[${i}]`);

      if (posLoc) {
        gl.uniform3f(posLoc, sources3D[i].x, sources3D[i].y, sources3D[i].z);
      } else {
        console.warn(`[MetaCanvas] posLoc[${i}] is null`);
      }

      if (radLoc) {
        gl.uniform1f(radLoc, radii[i] || 0.5);
      } else {
        console.warn(`[MetaCanvas] radLoc[${i}] is null`);
      }

      if (kLoc) {
        gl.uniform1f(kLoc, 1.0);
      } else {
        console.warn(`[MetaCanvas] kLoc[${i}] is null`);
      }
    }

    // DEBUG: 始终输出关键参数（第一次渲染时）
    const firstRenderKey = '__raymarch_first_render__';
    if (!(gl as any)[firstRenderKey]) {
      (gl as any)[firstRenderKey] = true;
      console.log('[MetaCanvas-Raymarch] === FIRST RENDER DEBUG ===');
      console.log('[MetaCanvas-Raymarch] sourceCount:', sourceCount);
      console.log('[MetaCanvas-Raymarch] sources3D[0]: x=' + sources3D[0]?.x + ' y=' + sources3D[0]?.y + ' z=' + sources3D[0]?.z);
      console.log('[MetaCanvas-Raymarch] radii[0]:', radii[0]);
      console.log('[MetaCanvas-Raymarch] debugView:', raymarchParams.debugView);
      console.log('[MetaCanvas-Raymarch] thresholdT:', raymarchParams.thresholdT);
      console.log('[MetaCanvas-Raymarch] rCut:', raymarchParams.rCut);
      console.log('[MetaCanvas-Raymarch] AABB min: [' + aabb.bmin.join(', ') + ']');
      console.log('[MetaCanvas-Raymarch] AABB max: [' + aabb.bmax.join(', ') + ']');
      console.log('[MetaCanvas-Raymarch] camera pos: [' + cameraConfig.pos.join(', ') + ']');
      console.log('[MetaCanvas-Raymarch] resolution: ' + canvas.width + 'x' + canvas.height);
      console.log('[MetaCanvas-Raymarch] ========================');
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
  let isAnimating = false;

  const animate = () => {
    if (!isAnimating) return;
    render(currentParams);
    animationId = requestAnimationFrame(animate);
  };

  const runtimeAPI = {
    setInputs: (vars: SPInputs) => {
      currentParams = { ...currentParams, ...vars };
    },
    draw: () => render(currentParams),
    start: () => {
      if (!isAnimating) {
        isAnimating = true;
        animate();
      }
    },
    dispose: () => {
      isAnimating = false;
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      if (gl && program) {
        gl.deleteProgram(program);
      }
    }
  };

  return runtimeAPI;
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

    // 初始化参数（包含初始sources）
    const initialWebglSources = sources.map(source => ({
      x: 0.5 + source.pos[0] * 0.5,
      y: 0.5 - source.pos[1] * 0.5
    }));
    const r0 = 0.65;
    const alpha = 0.88;
    const initialRadii = sources.map(s => {
      const dpt = 0; // 初始时root节点深度为0
      const base = r0 * Math.pow(alpha, dpt);
      return Math.max(0.008, Math.min(0.60, base));
    });
    runtime.setInputs({
      k, r, d, sigma, gain, t: time,
      sources: initialWebglSources,
      radii: initialRadii
    });

    // 参数设置完成后启动渲染循环
    (runtime as any).start();

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
    const ly = (0.5 - y01) * 2; // -1..1，Y轴翻转
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
    // 写入锚定与节点表
    anchoredPosRef.current[id] = [lx, ly];
    if (nodeMapRef.current[id]) {
      nodeMapRef.current[id].pos = [lx, ly, 0];
    }

    // 立即更新sources状态
    const newSources = Object.keys(nodeMapRef.current).map(k => ({ ...nodeMapRef.current[k] }));
    setSources(newSources);

    // 同时直接更新WebGL uniforms以获得实时响应
    if (runtimeRef.current) {
      const webglSources = newSources.map(source => ({
        x: 0.5 + source.pos[0] * 0.5,
        y: 0.5 - source.pos[1] * 0.5
      }));

      const depthMap: Record<string, number> = {};
      const childrenOf = (id: string) => tree[id] || [];
      const dfsDepth = (id: string, d: number) => {
        depthMap[id] = d;
        childrenOf(id).forEach(cid => dfsDepth(cid, d + 1));
      };
      dfsDepth('root', 0);
      const r0 = 0.65;
      const alpha = 0.88;
      const radii = newSources.map(s => {
        const dpt = depthMap[s.id] ?? 1;
        const base = r0 * Math.pow(alpha, dpt);
        return Math.max(0.008, Math.min(0.60, base));
      });

      runtimeRef.current.setInputs({
        sources: webglSources,
        radii
      });
    }
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
          const y01 = 0.5 - s.pos[1] * 0.5; // Y轴翻转（屏幕坐标Y向下）
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
