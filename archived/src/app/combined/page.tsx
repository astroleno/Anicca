'use client';

import React, { useEffect, useRef, useState } from 'react';

/** ----------------------------
 * MetaballTreeController Mock
 * ----------------------------
 * 管理一个三层 1-2-4 的树结构，
 * 每帧输出节点位置和半径，
 * 并支持 split / merge 事件（目前仅记录日志）。
 */
class MetaballTreeController {
  nodes: { id: string; level: number; pos: [number, number]; radius: number }[] = [];
  time = 0;

  constructor() {
    this.generateMockTree();
  }

  generateMockTree() {
    // 3级结构：1 + 2 + 4 = 7个节点
    this.nodes = [
      // 第0级：1个节点（中心）
      { id: '0', level: 0, pos: [0, 0], radius: 0.3 },

      // 第1级：2个节点
      { id: '0_0', level: 1, pos: [-0.4, 0], radius: 0.21 },
      { id: '0_1', level: 1, pos: [0.4, 0], radius: 0.21 },

      // 第2级：4个节点
      { id: '0_0_0', level: 2, pos: [-0.8, -0.2], radius: 0.147 },
      { id: '0_0_1', level: 2, pos: [-0.8, 0.2], radius: 0.147 },
      { id: '0_1_0', level: 2, pos: [0.8, -0.2], radius: 0.147 },
      { id: '0_1_1', level: 2, pos: [0.8, 0.2], radius: 0.147 },
    ];

    console.log('🌳 生成的树结构:', this.nodes.length, '个节点');
    console.log('🌳 3级结构: 1 + 2 + 4 =', this.nodes.length, '个节点');
  }

  update(dt: number) {
    this.time += dt;
    // 模拟轻微漂浮效果
    this.nodes.forEach(n => {
      const [x, y] = n.pos;
      n.pos = [
        x + Math.sin(this.time * 0.2 + n.level) * 0.002,
        y + Math.cos(this.time * 0.3 + n.level) * 0.002,
      ];
    });
  }

  getActiveNodes() {
    return this.nodes;
  }

  split(id: string) {
    console.log(`🌱 Split triggered on ${id}`);
    // 后续接入 ChatUI 事件：可以添加动态生成逻辑
  }

  merge(id1: string, id2: string) {
    console.log(`💫 Merge triggered between ${id1} and ${id2}`);
    // 后续接入 ChatUI 事件：可以添加动画逻辑
  }
}

// -------------------- ShaderPark 代码 --------------------
const spCode = `
  setMaxIterations(8);
  let click = input();
  let buttonHover = input();
  let ballCount = input();
  
  // 简化的 Mochi 质感
  let offset = .1;
  function fbm(p) {
    return vec3(
      noise(p),
      noise(p+offset),
      noise(p+offset*2),
    );
  }
  let s = getRayDirection();
  let n = sin(fbm(s+vec3(0, 0, -time*.1))*2)*.5+.75;
  n = pow(n, vec3(8));
  color(n);
  
  // 先显示几个固定的球体，确保渲染正常
  sphere(0.3);
  blend(0.2);

  shape(() => {
    displace(-0.4, 0, 0);
    sphere(0.21);
  })();
  blend(0.15);

  shape(() => {
    displace(0.4, 0, 0);
    sphere(0.21);
  })();
  blend(0.15);

  shape(() => {
    displace(-0.8, -0.2, 0);
    sphere(0.147);
  })();
  blend(0.1);

  shape(() => {
    displace(-0.8, 0.2, 0);
    sphere(0.147);
  })();
  blend(0.1);

  shape(() => {
    displace(0.8, -0.2, 0);
    sphere(0.147);
  })();
  blend(0.1);

  shape(() => {
    displace(0.8, 0.2, 0);
    sphere(0.147);
  })();
  blend(0.1);
`;

export default function CombinedPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [state, setState] = useState({
    buttonHover: 0.0,
    click: 0.0,
  });

  const treeRef = useRef<MetaballTreeController>();

  useEffect(() => {
    treeRef.current = new MetaballTreeController();

    const onSplit = (e: any) => {
      const id = e.detail?.nodeId || '0';
      treeRef.current?.split(id);
    };
    const onMerge = (e: any) => {
      const { nodeId1, nodeId2 } = e.detail || {};
      treeRef.current?.merge(nodeId1, nodeId2);
    };

    window.addEventListener('chat-split', onSplit);
    window.addEventListener('chat-merge', onMerge);

    return () => {
      window.removeEventListener('chat-split', onSplit);
      window.removeEventListener('chat-merge', onMerge);
    };
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const initShaderPark = async () => {
      try {
        console.log('🎨 初始化 Shader Park...');
        let attempts = 0;
        while (!(window as any).shaderParkReady && attempts < 100) {
          await new Promise(r => setTimeout(r, 100));
          attempts++;
        }
        const sculptToMinimalRenderer = (window as any).sculptToMinimalRenderer;
        if (!canvasRef.current || typeof sculptToMinimalRenderer !== 'function')
          throw new Error('Shader Park not ready');

        const canvas = canvasRef.current;
        const resizeCanvas = () => {
          const rect = canvas.getBoundingClientRect();
          const dpr = Math.min(window.devicePixelRatio, 2);
          canvas.width = rect.width * dpr;
          canvas.height = rect.height * dpr;
          canvas.style.width = rect.width + 'px';
          canvas.style.height = rect.height + 'px';
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        const handleMouseOver = () => setState(p => ({ ...p, buttonHover: 5 }));
        const handleMouseOut = () => setState(p => ({ ...p, buttonHover: 0 }));
        const handleMouseDown = () => setState(p => ({ ...p, click: 1 }));
        const handleMouseUp = () => setState(p => ({ ...p, click: 0 }));

        canvas.addEventListener('mouseover', handleMouseOver);
        canvas.addEventListener('mouseout', handleMouseOut);
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mouseup', handleMouseUp);

        sculptToMinimalRenderer(canvas, spCode, () => {
          try {
            return {
              buttonHover: state.buttonHover,
              click: state.click,
              ballCount: 7,
            };
          } catch (err) {
            console.error('❌ 渲染回调错误:', err);
            return { buttonHover: 0, click: 0, ballCount: 7 };
          }
        });

        setIsLoaded(true);

        cleanup = () => {
          window.removeEventListener('resize', resizeCanvas);
          canvas.removeEventListener('mouseover', handleMouseOver);
          canvas.removeEventListener('mouseout', handleMouseOut);
          canvas.removeEventListener('mousedown', handleMouseDown);
          canvas.removeEventListener('mouseup', handleMouseUp);
        };
      } catch (err) {
        console.error('❌ 初始化失败:', err);
        setError(String(err));
      }
    };

    initShaderPark();
    return () => cleanup?.();
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center bg-gray-900 text-red-400 min-h-screen">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">渲染错误</h3>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="absolute top-4 left-4 z-10 text-white">
        <div className="bg-gray-900/80 backdrop-blur-sm rounded-xl p-4">
          <h1 className="text-xl font-bold text-purple-200">Metaball 树形结构</h1>
          <p className="text-xs text-gray-300">支持分裂 / 融合事件</p>
        </div>
      </div>

      <div className="relative bg-black w-full h-screen">
        <canvas ref={canvasRef} className="w-full h-full cursor-pointer" />
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4" />
              <p>加载中...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
