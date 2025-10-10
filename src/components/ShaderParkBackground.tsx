'use client';
import { useEffect, useRef, useState } from 'react';
import { on, off, Events } from '@/events/bus';

type Source = {
  id: string;
  seed: number;
  pos: [number, number, number];
  radius: number;
  weight: number;
  phase: number;
};

function prng(seed: number) {
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

// 直接从 ref 复制的 ShaderPark 代码
const BASE_SP_CODE = `
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
`;

export default function ShaderParkBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scriptLoadedRef = useRef(false);
  const [sources, setSources] = useState<Source[]>(() => [{
    ...makeSourceFromSeed(12345),
    pos: [0, 0, 0]
  }]);
  const [linkedNodes, setLinkedNodes] = useState<Array<{ id: string; branch: 'thesis'|'antithesis'; label?: string }>>([]);
  const [tree, setTree] = useState<Record<string, string[]>>({ root: [] });
  const nodeMapRef = useRef<Record<string, Source>>({
    root: { id: 'root', seed: 0, pos: [0,0,0], radius: 0.5, weight: 1, phase: 0 }
  });
  const nodeBranchRef = useRef<Record<string, 'thesis'|'antithesis'|'synthesis'|'root'>>({ root: 'root' as any });

  // 生成 ShaderPark 代码（背景 + 动态 metaballs）
  const generateShaderCode = (sources: Source[]) => {
    const metaballs = sources.map((src, i) => {
      const x = src.pos[0] * 0.8; // 缩放到合适范围
      const y = src.pos[1] * 0.8;
      const z = src.pos[2] * 0.8;
      const r = src.radius * 0.25;

      return `
  displace(${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)});
  sphere(${r.toFixed(3)});
  reset();${i < sources.length - 1 ? '\n  mixGeo(0.3);' : ''}`;
    }).join('\n');

    return `${BASE_SP_CODE}

  // 动态 metaballs
${metaballs}
  blend(.4)
`;
  };

  // 初始化 ShaderPark（使用本地包）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposeFunc: (() => void) | null = null;

    // 动态导入本地的 shader-park-core
    import('shader-park-core')
      .then((module: any) => {
        console.log('[ShaderPark] Module loaded, keys:', Object.keys(module).slice(0, 10));

        const sculptFunc = module.sculptToMinimalRenderer || module.default?.sculptToMinimalRenderer;

        if (!sculptFunc) {
          console.error('[ShaderPark] sculptToMinimalRenderer not found. Available:', Object.keys(module));
          return;
        }

        const shaderCode = generateShaderCode(sources);
        console.log('[ShaderPark] Shader code:', shaderCode);

        try {
          disposeFunc = sculptFunc(canvas, shaderCode, () => ({}));
          scriptLoadedRef.current = true;
          console.log('[ShaderPark] Rendering success');
        } catch (err) {
          console.error('[ShaderPark] Rendering failed:', err);
        }
      })
      .catch((err: any) => {
        console.error('[ShaderPark] Module import failed:', err);
      });

    return () => {
      if (disposeFunc) {
        try {
          disposeFunc();
        } catch (e) {
          console.warn('[ShaderPark] Dispose failed:', e);
        }
      }
    };
  }, [sources]);

  // Fork/Merge 操作
  const fork = () => {
    if (sources.length >= 12) return;
    const seedBase = Math.floor(Math.random() * 1e9);
    const add = makeSourceFromSeed(seedBase);

    setSources(prev => {
      const nextIndex = prev.length;
      if (nextIndex === 0) {
        add.pos = [0, 0, 0];
      } else {
        const ring = Math.floor((nextIndex - 1) / 6);
        const idxInRing = (nextIndex - 1) % 6;
        const angle = (Math.PI * 2 * idxInRing) / 6;
        const radius = Math.min(0.95, 0.18 + ring * 0.14);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        add.pos = [x, y, 0];
      }
      return [...prev, add];
    });
  };

  const merge = () => {
    if (sources.length <= 1) return;
    setSources(prev => prev.slice(0, prev.length - 1));
  };

  // 监听聊天联动
  useEffect(() => {
    const offAdd = on(Events.ChatAddChildren, (payload: any) => {
      setLinkedNodes(prev => [...prev, ...payload.children]);
      // 添加新的 metaball
      fork();
    });

    const offMerge = on(Events.Merge, () => {
      // Merge 时移除一个 metaball
      if (sources.length > 1) merge();
    });

    return () => { offAdd(); offMerge(); };
  }, [sources]);

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block"
        style={{ width: '100vw', height: '100vh' }}
      />

      {/* 控制面板 */}
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
          ShaderPark 控制
        </div>

        <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={fork}
            disabled={sources.length >= 12}
            style={{
              padding: '6px 12px',
              backgroundColor: sources.length >= 12 ? '#666' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: sources.length >= 12 ? 'not-allowed' : 'pointer'
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
            源: {sources.length}/12
          </div>
        </div>
      </div>
    </div>
  );
}
