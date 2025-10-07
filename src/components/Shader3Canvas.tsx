'use client';
import React, { useEffect, useRef, useState } from 'react';
import { spCode } from '@/shaders/shader3';

// 动态导入 shader-park-core（优先使用 ESM 子路径，兼容导出差异）
let sculptToMinimalRenderer: any = null;

async function loadShaderParkCore() {
  try {
    if (!sculptToMinimalRenderer) {
      // 1) 直接导入 ESM 构建
      const module = await import('shader-park-core/dist/shader-park-core.esm.js');
      const candidates = [
        (module as any).sculptToMinimalRenderer,
        (module as any).default?.sculptToMinimalRenderer,
        (module as any).SculptToMinimalRenderer, // 极端情况下命名不同
      ].filter(Boolean);

      sculptToMinimalRenderer = candidates[0];

      if (!sculptToMinimalRenderer) {
        console.error('[Shader3Canvas] sculptToMinimalRenderer not found. module keys:', Object.keys(module || {}));
        // 2) 兜底：尝试从包入口再导一次
        const fallback = await import('shader-park-core');
        sculptToMinimalRenderer = (fallback as any).sculptToMinimalRenderer || (fallback as any).default?.sculptToMinimalRenderer;
        if (!sculptToMinimalRenderer) {
          console.error('[Shader3Canvas] fallback module keys:', Object.keys(fallback || {}));
        }
      }
    }
    return sculptToMinimalRenderer;
  } catch (e) {
    console.error('[Shader3Canvas] Failed to load shader-park-core:', e);
    throw e;
  }
}

type Props = {
  className?: string;
};

export default function Shader3Canvas({ className }: Props){
  const ref = useRef<HTMLCanvasElement>(null);
  // 目标开关：是否分裂
  const [isSplitTarget, setIsSplitTarget] = useState<boolean>(false);
  // 连续过渡值：splitProgress ∈ [0,1]
  const [splitProgress, setSplitProgress] = useState<number>(0);
  // 分裂代数：0（仅主球）~ 3（最多三代分裂）
  const [splitGeneration, setSplitGeneration] = useState<number>(1);
  // 自动播放：循环分裂/合并
  const [autoPlay, setAutoPlay] = useState<boolean>(false);
  // 显示分区线（仅调试）
  const [showEdges, setShowEdges] = useState<boolean>(false);
  const splitRef = useRef<number>(1);
  const splitGenerationRef = useRef<number>(1);
  useEffect(() => { splitRef.current = splitProgress; }, [splitProgress]);
  useEffect(() => { splitGenerationRef.current = splitGeneration; }, [splitGeneration]);
  const rafStateRef = useRef<{ rafId: number | null; startTs: number; from: number; to: number; duration: number }>({ rafId: null, startTs: 0, from: 0, to: 1, duration: 600 });
  const autoTimerRef = useRef<number | null>(null);
  // 防止在 React 严格模式（开发环境）下重复初始化 WebGL 上下文
  const initializedRef = useRef<boolean>(false);
  useEffect(() => {
    let stop: (() => void) | null = null;
    let disposed = false;
    let canvasEl: HTMLCanvasElement | null = null;
    let onMouseDown: (() => void) | null = null;
    let onMouseUp: (() => void) | null = null;
    let onMouseEnter: (() => void) | null = null;
    let onMouseLeave: (() => void) | null = null;
    let resizeHandler: (() => void) | null = null;
    let onKeyDown: ((e: KeyboardEvent) => void) | null = null;

    const initShader = async () => {
      try {
        if (initializedRef.current) {
          console.log('[Shader3Canvas] Skip duplicate init (StrictMode).');
          return;
        }
        if(!ref.current) return;
        // 关键：在任何 await 前就占位，防止并发双启动
        initializedRef.current = true;
        canvasEl = ref.current;

        // 设置 DPR 与自适应全屏（占满父容器）
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const resize = () => {
          if (!canvasEl) return;
          const parent = canvasEl.parentElement;
          const rect = parent ? parent.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight } as DOMRect;
          const cssWidth = Math.max(1, Math.floor(rect.width));
          const cssHeight = Math.max(1, Math.floor(rect.height));
          canvasEl.style.width = cssWidth + 'px';
          canvasEl.style.height = cssHeight + 'px';
          canvasEl.width = Math.floor(cssWidth * dpr);
          canvasEl.height = Math.floor(cssHeight * dpr);
          console.log('[Shader3Canvas] Resized ->', canvasEl.width, canvasEl.height, 'dpr:', dpr);
        };
        resize();
        resizeHandler = resize;
        window.addEventListener('resize', resizeHandler);

        console.log('[Shader3Canvas] Canvas size:', canvasEl.width, canvasEl.height);
        console.log('[Shader3Canvas] Loading shader-park-core...');

        const renderer = await loadShaderParkCore();
        console.log('[Shader3Canvas] Initializing shader... renderer exists?', !!renderer);

        if (typeof renderer !== 'function') {
          throw new Error('sculptToMinimalRenderer is not a function.');
        }

        if (disposed) return; // 已卸载则不再初始化

        // 初始化渲染，提供必要 uniforms（避免 uniform2fv 报错）
        // 将交互参数与时间传入，对应 spCode 中的 input()/mouse/time
        const startTime = performance.now();
        let clickVal = 0.0;
        let hoverVal = 0.0;

        onMouseDown = () => { clickVal = 1.0; };
        onMouseUp = () => { clickVal = 0.0; };
        onMouseEnter = () => { hoverVal = 1.0; };
        onMouseLeave = () => { hoverVal = 0.0; };
        canvasEl.addEventListener('mousedown', onMouseDown);
        canvasEl.addEventListener('mouseup', onMouseUp);
        canvasEl.addEventListener('mouseenter', onMouseEnter);
        canvasEl.addEventListener('mouseleave', onMouseLeave);
        // 键盘测试：按 S 键切换分裂
        onKeyDown = (e: KeyboardEvent) => {
          try {
            if (e.key.toLowerCase() === 's') {
              setIsSplitTarget(v => {
                const next = !v;
                console.log('[Shader3Canvas] toggle split target ->', next);
                startSplitAnimation(next ? 1 : 0, 320);
                return next;
              });
            }
          } catch(err){ console.error('[Shader3Canvas] onKeyDown error:', err); }
        };
        window.addEventListener('keydown', onKeyDown);

        const spCodeType = typeof spCode;
        const spCodeLen = spCodeType === 'string' ? spCode.length : null;
        const spHead = spCodeType === 'string' ? (spCode as string).slice(0, 220) : String(spCodeType);
        console.log('[Shader3Canvas] spCode meta', spCodeType, spCodeLen, '\nHEAD:\n' + spHead);
        stop = renderer(canvasEl, spCode, () => ({
          // Shader Park 会自动注入 mouse/time，这里只提供 input 对应的参数
          click: clickVal,
          buttonHover: hoverVal,
          // 同时提供 split 与 splitProgress，确保不同输入顺序/命名下都能正确读取
          split: splitRef.current,
          splitProgress: splitRef.current,
          showEdges: showEdges ? 1 : 0,
          splitGeneration: splitGenerationRef.current,
        }));
        console.log('[Shader3Canvas] Shader initialized successfully');
        // 初始化：根据起始目标将进度同步
        startSplitAnimation(isSplitTarget ? 1 : 0, 10);
      } catch (err) {
        console.error('[Shader3Canvas] init error:', err);
        initializedRef.current = false;
      }
    };

    initShader();

    return () => {
      try {
        disposed = true;
        if (canvasEl) {
          if (onMouseDown) canvasEl.removeEventListener('mousedown', onMouseDown);
          if (onMouseUp) canvasEl.removeEventListener('mouseup', onMouseUp);
          if (onMouseEnter) canvasEl.removeEventListener('mouseenter', onMouseEnter);
          if (onMouseLeave) canvasEl.removeEventListener('mouseleave', onMouseLeave);
        }
        if (resizeHandler) window.removeEventListener('resize', resizeHandler);
        if (onKeyDown) window.removeEventListener('keydown', onKeyDown);
        if (autoTimerRef.current){ clearInterval(autoTimerRef.current as any); autoTimerRef.current = null; }
        if (stop) stop();
        stop = null;
        initializedRef.current = false;
      } catch(e){ console.error(e);}
    };
  }, []);
  // 启动或更新 splitProgress 的缓动动画
  function startSplitAnimation(target: number, durationMs: number){
    try {
      const clamp = (v: number) => Math.max(0, Math.min(1, v));
      // 符合文档：ease-out-cubic（更快到达目标，尾部减速）
      const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
      const now = performance.now();
      const from = splitRef.current;
      const to = clamp(target);
      const dur = Math.max(16, durationMs | 0);
      if (rafStateRef.current.rafId) cancelAnimationFrame(rafStateRef.current.rafId!);
      rafStateRef.current = { rafId: null, startTs: now, from, to, duration: dur };
      const tick = (ts: number) => {
        const t = Math.min(1, (ts - rafStateRef.current.startTs) / rafStateRef.current.duration);
        const v = from + (to - from) * easeOutCubic(t);
        setSplitProgress(v);
        if (t < 1) {
          rafStateRef.current.rafId = requestAnimationFrame(tick);
        } else {
          rafStateRef.current.rafId = null;
          console.log('[Shader3Canvas] splitProgress reached', to);
        }
      };
      rafStateRef.current.rafId = requestAnimationFrame(tick);
    } catch(err){ console.error('[Shader3Canvas] startSplitAnimation error:', err); }
  }

  // 自动播放：每 1200ms 在分裂/合并间切换
  useEffect(() => {
    try {
      if (autoTimerRef.current){ clearInterval(autoTimerRef.current as any); autoTimerRef.current = null; }
      if (autoPlay){
        autoTimerRef.current = setInterval(() => {
          setIsSplitTarget(v => {
            const next = !v;
            startSplitAnimation(next ? 1 : 0, 320);
            return next;
          });
        }, 1200) as unknown as number;
      }
    } catch(e){ console.error('[Shader3Canvas] autoplay error:', e); }
    return () => { if (autoTimerRef.current){ clearInterval(autoTimerRef.current as any); autoTimerRef.current = null; } };
  }, [autoPlay]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={ref} className={className} style={{ width: '100%', height: '100%', display: 'block' }} />
      <button
        onClick={() => {
          try {
            setIsSplitTarget(v => {
              const next = !v;
              startSplitAnimation(next ? 1 : 0, 320);
              return next;
            });
          } catch(err){ console.error('[Shader3Canvas] button toggle error:', err); }
        }}
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 10,
          padding: '8px 12px',
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer'
        }}
      >{isSplitTarget ? '合并' : '分裂'}</button>

      <div style={{ position: 'absolute', top: 16, left: 90, zIndex: 10, display: 'flex', gap: 8 }}>
        <button onClick={() => setAutoPlay(v => !v)} style={{ padding: '6px 10px', background: autoPlay ? 'rgba(0,128,0,0.7)' : 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>{autoPlay ? '停止' : '自动播放'}</button>
        <button onClick={() => setShowEdges(v => !v)} style={{ padding: '6px 10px', background: showEdges ? 'rgba(128,128,0,0.8)' : 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>{showEdges ? '隐藏分区线' : '显示分区线'}</button>
        <button onClick={() => setSplitGeneration(g => Math.max(0, Math.min(3, g - 1)))} style={{ padding: '6px 10px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>-代</button>
        <div style={{ padding: '6px 8px', background: 'rgba(0,0,0,0.4)', color: '#fff', borderRadius: 8 }}>代:{splitGeneration}</div>
        <button onClick={() => setSplitGeneration(g => Math.max(0, Math.min(3, g + 1)))} style={{ padding: '6px 10px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>+代</button>
        <button onClick={() => { try { setIsSplitTarget(true); startSplitAnimation(0, 10); requestAnimationFrame(() => startSplitAnimation(1, 320)); } catch(e){ console.error(e);} }} style={{ padding: '6px 10px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>再分裂一次</button>
      </div>
    </div>
  );
}
