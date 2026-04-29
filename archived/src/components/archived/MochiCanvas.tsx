'use client';

import React, { useEffect, useRef, useState } from 'react';

// Shader Park 代码 - 复刻 ref/sketch1638178 的麻薯质感效果
const spCode = `
  setMaxIterations(8);
  let click = input();
  let buttonHover = input();
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
  let scale =.5+n.x*.05;
  
  shape(() => {
    rotateX(PI/2);
    rotateX(mouse.x* click)
    rotateZ(-1*mouse.y* click)
    torus(scale, .2)
    reset();
    mixGeo(click)
    sphere(scale);
  })()
  blend(.4)
  displace(mouse.x*2, mouse.y, 0)
  
  sphere(.2)
`;

interface MochiCanvasProps {
  className?: string;
}

export default function MochiCanvas({ className = '' }: MochiCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 交互状态管理
  const [state, setState] = useState({
    buttonHover: 0.0,
    currButtonHover: 0.0,
    click: 0.0,
    currClick: 0.0
  });

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const initShaderPark = async () => {
      try {
        console.log('🎨 初始化 Shader Park...');
        
        // 等待全局 Shader Park 加载完成
        console.log('🎯 等待全局 Shader Park 加载...');
        
        // 等待全局变量可用
        let attempts = 0;
        while (!(window as any).shaderParkReady && attempts < 100) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        if (!(window as any).shaderParkReady) {
          throw new Error('Shader Park 全局加载超时');
        }
        
        const sculptToMinimalRenderer = (window as any).sculptToMinimalRenderer;
        console.log('✅ 全局 Shader Park 已加载');
        console.log('🔍 sculptToMinimalRenderer 类型:', typeof sculptToMinimalRenderer);
        
        if (typeof sculptToMinimalRenderer !== 'function') {
          throw new Error(`sculptToMinimalRenderer is not a function, got: ${typeof sculptToMinimalRenderer}`);
        }
        
        if (!canvasRef.current) {
          setError('Canvas element not found');
          return;
        }

        const canvas = canvasRef.current;

        // 设置画布尺寸 - 优化性能
        const resizeCanvas = () => {
          const rect = canvas.getBoundingClientRect();
          const dpr = Math.min(window.devicePixelRatio, 2); // 限制最大 DPR 为 2
          canvas.width = rect.width * dpr;
          canvas.height = rect.height * dpr;
          canvas.style.width = rect.width + 'px';
          canvas.style.height = rect.height + 'px';
          console.log(`📐 画布尺寸: ${canvas.width}x${canvas.height}`);
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // 鼠标事件处理 - 优化性能
        const handleMouseOver = () => {
          setState(prev => ({ ...prev, buttonHover: 5 }));
        };

        const handleMouseOut = () => {
          setState(prev => ({ ...prev, buttonHover: 0.0 }));
        };

        const handleMouseDown = (e: MouseEvent) => {
          e.preventDefault();
          setState(prev => ({ ...prev, click: 1.0 }));
        };

        const handleMouseUp = (e: MouseEvent) => {
          e.preventDefault();
          setState(prev => ({ ...prev, click: 0.0 }));
        };

        // 添加事件监听器
        canvas.addEventListener('mouseover', handleMouseOver, false);
        canvas.addEventListener('mouseout', handleMouseOut, false);
        canvas.addEventListener('mousedown', handleMouseDown, false);
        canvas.addEventListener('mouseup', handleMouseUp, false);

        // 启动 Shader Park 渲染器
        console.log('🚀 启动 Shader Park 渲染器...');
        sculptToMinimalRenderer(canvas, spCode, () => {
          // 平滑的状态过渡
          setState(prev => ({
            ...prev,
            currButtonHover: prev.currButtonHover * 0.999 + prev.buttonHover * 0.001,
            currClick: prev.currClick * 0.92 + prev.click * 0.08
          }));
          
          return {
            'buttonHover': state.currButtonHover,
            'click': state.currClick
          };
        });

        console.log('✅ Shader Park 渲染器启动成功');
        setIsLoaded(true);

        // 清理函数
        cleanup = () => {
          console.log('🧹 清理 Shader Park 资源...');
          window.removeEventListener('resize', resizeCanvas);
          canvas.removeEventListener('mouseover', handleMouseOver);
          canvas.removeEventListener('mouseout', handleMouseOut);
          canvas.removeEventListener('mousedown', handleMouseDown);
          canvas.removeEventListener('mouseup', handleMouseUp);
        };

      } catch (err) {
        console.error('❌ Shader Park 初始化失败:', err);
        setError(`Failed to load Shader Park: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };

    initShaderPark();

    // 返回清理函数
    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, []);

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-gray-900 text-red-400 ${className}`}>
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">渲染错误</h3>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative bg-black ${className}`}>
      <canvas 
        ref={canvasRef}
        className="w-full h-full cursor-pointer"
        style={{ 
          width: '100%', 
          height: '100%',
          minHeight: '400px'
        }}
      />
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
            <p>加载中...</p>
          </div>
        </div>
      )}
    </div>
  );
}
