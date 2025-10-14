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
    if (!canvas) {
      console.error("ShaderParkLayer: Canvas not found");
      window.dispatchEvent(new CustomEvent('component-load', { 
        detail: { component: 'shaderPark', loaded: false } 
      }));
      return;
    }
    
    console.log("ShaderParkLayer: Initializing...");

    // 简化的背景噪波代码
    const spCode = `
      setMaxIterations(4);
      
      let s = getRayDirection();
      let n = noise(s + vec3(0, 0, -time * 0.1));
      n = sin(n * 3.0) * 0.5 + 0.5;
      color(vec3(n * 0.8, n * 0.9, n * 1.0))
      
      sphere(50.0)
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
            // 发送组件加载失败事件
            window.dispatchEvent(new CustomEvent('component-load', { 
              detail: { component: 'shaderPark', loaded: false } 
            }));
            return;
          }

          console.log('[ShaderParkLayer] Calling sculptToMinimalRenderer...');
          try {
            disposeFunc = sculptFunc(canvas, spCode, () => ({}));
            console.log('[ShaderParkLayer] Render SUCCESS!');
            
            // 发送组件加载成功事件
            window.dispatchEvent(new CustomEvent('component-load', { 
              detail: { component: 'shaderPark', loaded: true } 
            }));
          } catch (renderError) {
            console.error('[ShaderParkLayer] Render error:', renderError);
            // 发送组件加载失败事件
            window.dispatchEvent(new CustomEvent('component-load', { 
              detail: { component: 'shaderPark', loaded: false } 
            }));
          }
        })
        .catch((err: any) => {
          console.error('[ShaderParkLayer] Import error:', err);
          // 发送组件加载失败事件
          window.dispatchEvent(new CustomEvent('component-load', { 
            detail: { component: 'shaderPark', loaded: false } 
          }));
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
        pointerEvents: 'none',
        background: '#000' // 添加黑色背景
      }}
    />
  );
}
