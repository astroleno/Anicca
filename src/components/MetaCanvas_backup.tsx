"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";

// MetaCanvas: 使用 Shader Park 在 <canvas> 上渲染一个最小可运行的 Metaball MVP（平滑并集近似）
// 说明：
// - 不依赖 ref/ 目录中的任何文件；完全自包含
// - 采用固定上限的源数量（sourcesMax=4），通过 input() 逐个传入位置、半径、权重
// - 使用 mixGeo(k) 与 blend() 进行近似“液态融合”效果（非严格等值面，但观感接近）
// - 提供 hover/click 基本交互映射；保留 fbm 着色风格
// - 控制台输出关键流程日志，重要流程加 try/catch

type MetaSource = {
  seed: number;          // 确定性种子
  radius: number;        // 半径（影响范围）
  weight: number;        // 权重（融合强度）
  phase: number;         // 相位（用于位置/纹理的轻微摆动）
  basePosition: [number, number, number]; // 初始位置
};

// 简单确定性 PRNG（xorshift32）
function xorshift32(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // 归一化到 [0,1)
    return ((x >>> 0) % 0xFFFFFFFF) / 0xFFFFFFFF;
  };
}

function generateSource(seed: number, box: number): MetaSource {
  const rng = xorshift32(seed);
  // 将随机映射到 [-box, box]
  const rx = (rng() * 2 - 1) * box;
  const ry = (rng() * 2 - 1) * box;
  const rz = (rng() * 2 - 1) * box;
  const radius = 0.35 + rng() * 0.25; // 0.35 ~ 0.6
  const weight = 0.8 + rng() * 0.6;   // 0.8 ~ 1.4（用于融合强度）
  const phase = rng() * Math.PI * 2;
  return {
    seed,
    radius,
    weight,
    phase,
    basePosition: [rx, ry, rz]
  };
}

export default function MetaCanvas(){
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mounted, setMounted] = useState(false);

  // 交互态（指数平滑）
  const hoverTargetRef = useRef(0);
  const hoverRef = useRef(0);
  const clickTargetRef = useRef(0);
  const clickRef = useRef(0);

  // 源数据：固定上限 4 个，MVP 可运行
  const sourcesMax = 4;
  const initialSources = useMemo(() => {
    // 选择 4 个固定的起始种子，保证可复现
    const seeds = [12345, 54321, 98765, 11111];
    const box = 0.9; // 初始位置范围（单位场景坐标）
    let list: MetaSource[] = seeds.map(s => generateSource(s, box));
    // 将前两个源固定到左右，便于直观看到融合边界
    if (list.length >= 2) {
      list[0].basePosition = [-0.6, 0.0, 0.0];
      list[1].basePosition = [ 0.6, 0.0, 0.0];
      list[0].radius = 0.55; list[1].radius = 0.55;
      list[0].weight = 1.0;  list[1].weight = 1.0;
    }
    return list;
  }, []);

  // 动态参数（全局）：阈值/平滑系数，可按需映射交互
  // 使用 ref 存储阈值和平滑系数，避免每帧 setState 触发重渲染
  const thresholdRef = useRef(0.5);
  const smoothKRef = useRef(0.35);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 监听交互事件：hover/click
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onOver = () => { hoverTargetRef.current = 1.0; };
    const onOut = () => { hoverTargetRef.current = 0.0; };
    const onDown = () => { clickTargetRef.current = 1.0; };
    const onUp = () => { clickTargetRef.current = 0.0; };

    canvas.addEventListener("mouseover", onOver, false);
    canvas.addEventListener("mouseout", onOut, false);
    canvas.addEventListener("mousedown", onDown, false);
    canvas.addEventListener("mouseup", onUp, false);

    return () => {
      canvas.removeEventListener("mouseover", onOver);
      canvas.removeEventListener("mouseout", onOut);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mouseup", onUp);
    };
  }, []);

  // 独立的交互平滑 RAF，不更新 React 状态，只更新 ref
  useEffect(() => {
    if (!mounted) return;
    let raf = 0;
    const loop = () => {
      hoverRef.current = hoverRef.current * 0.985 + hoverTargetRef.current * 0.015;
      clickRef.current = clickRef.current * 0.85 + clickTargetRef.current * 0.15;
      // 根据交互轻度调制当前阈值和平滑系数（写入 ref）
      const t = 0.5 + (hoverRef.current * 0.06 - clickRef.current * 0.08);
      const k = 0.35 + (hoverRef.current * 0.10 + clickRef.current * 0.05);
      thresholdRef.current = thresholdRef.current * 0.9 + t * 0.1;
      smoothKRef.current = smoothKRef.current * 0.9 + k * 0.1;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mounted]);

  // 防重复初始化（只启动一次渲染器）
  const startedRef = useRef(false);

  useEffect(() => {
    if (!mounted || startedRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 动态导入 shader-park-core 的 ESM（浏览器端）
    const start = async () => {
      try {
        // 优先本地包导入，避免远程 ESM 跨域/网络问题
        let mod: any;
        try {
          mod = await import('shader-park-core/dist/shader-park-core.esm.js');
        } catch (e1) {
          console.warn('MetaCanvas: esm import fallback to main export', e1);
          mod = await import('shader-park-core');
        }
        const { sculptToMinimalRenderer } = mod as any;

        // 生成 Shader Park 代码字符串
        const spCode = `
setMaxIterations(8);

// 在同一 shape 内用 displace 分别放置两球：A -> mixGeo(k) -> reset -> B
color(vec3(0.86, 0.89, 0.95));
shape(() => {
  // A
  displace(-0.7, 0.0, 0.0);
  sphere(0.45);
  // 尝试先混合，再重置变换
  mixGeo(0.0); // 先设 0，确认能看到两个分离球
  reset();
  // B
  displace(0.7, 0.0, 0.0);
  sphere(0.45);
})();`;

        // 指数时间用于轻微摆动
        let t0 = performance.now();

        // 启动渲染器
        startedRef.current = true;
        sculptToMinimalRenderer(canvas, spCode, () => {
          try {
            // 当前最简版本不需要 uniforms，避免随机性
            return {} as any;
          } catch (err) {
            console.error("MetaCanvas uniforms update error", err);
            return { T: 0.5, K: 0.35 };
          }
        });
        // 限制日志，避免刷屏
        console.log("MetaCanvas started: Shader Park renderer initialized");
      } catch (err) {
        console.error("MetaCanvas start error", err);
      }
    };

    start();
  }, [mounted, initialSources]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100vw", height: "100svh", display: "block" }}
    />
  );
}


