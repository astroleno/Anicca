'use client';
import { useEffect, useRef } from 'react';

// 声明全局变量类型
declare global {
  interface Window {
    sculptToMinimalRenderer?: any;
  }
}

export default function ShaderParkLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scriptLoadedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 只渲染纯背景噪波，完全按照ref配置
    const spCode = `
      setMaxIterations(8);
      let offset = .1;
      function fbm(p) {
        return vec3(
          noise(p),
          noise(p+offset),
          noise(p+offset*2),
        )
      }

      let s = getRayDirection();
      let n = sin(fbm(s+vec3(0, 0, -time*.1))*2)*.5+.75;
      n = pow(n, vec3(8));
      color(n)

      // 超大球体承载背景
      sphere(100.0)
    `;

    let disposeFunc: (() => void) | null = null;

    // 延迟执行，等待模块加载
    const timer = setTimeout(() => {
      // 动态导入（确保完整的导入路径）
      import('shader-park-core/dist/shader-park-core.esm.js')
        .then((module: any) => {
          console.log('[ShaderParkLayer] Module loaded successfully');
          console.log('[ShaderParkLayer] Module:', module);
          console.log('[ShaderParkLayer] Module keys:', Object.keys(module));

          const sculptFunc = module.sculptToMinimalRenderer;

          if (!sculptFunc) {
            console.error('[ShaderParkLayer] sculptToMinimalRenderer not found!');
            console.log('[ShaderParkLayer] Available:', Object.keys(module));
            return;
          }

          console.log('[ShaderParkLayer] Calling sculptToMinimalRenderer...');
          disposeFunc = sculptFunc(canvas, spCode, () => ({}));
          console.log('[ShaderParkLayer] Render SUCCESS!');
        })
        .catch((err: any) => {
          console.error('[ShaderParkLayer] Import error:', err);
        });
    }, 100);

    return () => {
      clearTimeout(timer);
      if (disposeFunc && typeof disposeFunc === 'function') {
        disposeFunc();
      }
    };
  }, []); // 只初始化一次

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 1,
        pointerEvents: 'none'
      }}
    />
  );
}
