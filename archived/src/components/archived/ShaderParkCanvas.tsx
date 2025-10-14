'use client';
import React, { useEffect, useRef, useState } from 'react';
import { on, off, Events } from '@/events/bus';

// 动态导入 shader-park-core（避免 SSR 问题）
let sculptToMinimalRenderer: any = null;

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

export default function ShaderParkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);
  const [linkedNodes, setLinkedNodes] = useState<Array<{ id: string; branch: 'thesis'|'antithesis'; label?: string }>>([]);
  const [tree, setTree] = useState<Record<string, string[]>>({ root: [] });
  const nodeMapRef = useRef<Record<string, Source>>({
    root: { id: 'root', seed: 0, pos: [0,0,0], radius: 0.5, weight: 1, phase: 0 }
  });
  const nodeBranchRef = useRef<Record<string, 'thesis'|'antithesis'|'synthesis'|'root'>>({ root: 'root' as any });
  const anchoredPosRef = useRef<Record<string, [number, number]>>({});

  // 源列表
  const [sources, setSources] = useState<Source[]>(() => [{
    ...makeSourceFromSeed(12345),
    pos: [0, 0, 0]
  }]);

  const [highlightBranch, setHighlightBranch] = useState<'thesis'|'antithesis'|'synthesis'|null>(null);

  // ShaderPark 代码 - 基于 Shader3，但支持多个动态 metaballs
  const generateShaderCode = (sources: Source[]) => {
    return `
      setMaxIterations(8);

      // FBM 噪声（与 Shader3 完全一致）
      let offset = 0.1;
      function fbm(p) {
        return vec3(
          noise(p),
          noise(p+offset),
          noise(p+offset*2)
        )
      }

      // 背景色（完全复刻 Shader3）
      let s = getRayDirection();
      let n = sin(fbm(s+vec3(0, 0, -time*.1))*2)*.5+.75;
      n = pow(n, vec3(8));
      color(n);

      // 动态 metaballs
      ${sources.map((src, i) => {
        const x = src.pos[0];
        const y = src.pos[1];
        const z = src.pos[2];
        const r = src.radius * 0.3; // 缩放半径

        return `
        // Metaball ${i}
        displace(${x}, ${y}, ${z});
        sphere(${r});
        reset();
        ${i < sources.length - 1 ? 'mixGeo(0.3);' : ''}
        `;
      }).join('\n')}

      blend(0.4);
    `;
  };

  // 初始化 ShaderPark
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 动态加载 shader-park-core
    import('shader-park-core').then((module) => {
      const sculptFunc = module.sculptToMinimalRenderer;

      if (!sculptFunc) {
        console.error('[ShaderPark] sculptToMinimalRenderer not found in module:', Object.keys(module));
        return;
      }

      sculptToMinimalRenderer = sculptFunc;

      // 渲染
      const shaderCode = generateShaderCode(sources);
      console.log('[ShaderPark] Shader code:', shaderCode);

      const dispose = sculptToMinimalRenderer(canvas, shaderCode, () => ({}));

      disposeRef.current = dispose;
    }).catch(err => {
      console.error('[ShaderPark] Failed to load shader-park-core:', err);
    });

    return () => {
      if (disposeRef.current) {
        disposeRef.current();
      }
    };
  }, []);

  // 更新 shader 代码（当 sources 变化时）
  useEffect(() => {
    if (!sculptToMinimalRenderer || !canvasRef.current) return;

    const canvas = canvasRef.current;

    // 清理旧的
    if (disposeRef.current) {
      disposeRef.current();
    }

    // 重新渲染
    const shaderCode = generateShaderCode(sources);
    const dispose = sculptToMinimalRenderer(canvas, shaderCode, () => ({}));
    disposeRef.current = dispose;
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
    const offAdd = on(Events.ChatAddChildren, (payload: { parentId: string; children: Array<{ id: string; branch: 'thesis'|'antithesis'; label?: string }> }) => {
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
        return t;
      });
    });

    const offMerge = on(Events.Merge, (payload: { turnId: string; side: 'thesis'|'antithesis' }) => {
      setHighlightBranch(payload.side);
    });

    const offCombine = on(Events.CombineSeeds as any, (payload: { fromId: string; toId: string }) => {
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
      setTree(prev => {
        const t = { ...prev } as Record<string,string[]>;
        const fromChildren = t[payload.fromId] || [];
        if (!t[payload.toId]) t[payload.toId] = [];
        fromChildren.forEach(cid => { if (!t[payload.toId].includes(cid)) t[payload.toId].push(cid); });
        t[payload.fromId] = [];
        Object.keys(t).forEach(pid => {
          const idx = t[pid].indexOf(payload.fromId);
          if (idx >= 0 && !t[pid].includes(payload.toId)) t[pid][idx] = payload.toId;
        });
        return t;
      });
    });

    const offFork = on(Events.ForkSeed as any, (payload: { fromId: string; toId: string }) => {
      const from = nodeMapRef.current[payload.fromId];
      const to = nodeMapRef.current[payload.toId];
      if (from && to) {
        from.pos = [...to.pos];
        anchoredPosRef.current[payload.fromId] = [to.pos[0], to.pos[1]];
      }
      setTree(prev => {
        const t = { ...prev } as Record<string,string[]>;
        t[payload.fromId] = [ ...(t[payload.toId] || []) ];
        Object.keys(t).forEach(pid => {
          if (t[pid].includes(payload.toId) && !t[pid].includes(payload.fromId)) {
            t[pid].push(payload.fromId);
          }
        });
        return t;
      });
    });

    return () => { offAdd(); offMerge(); offCombine(); offFork(); };
  }, []);

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
          ShaderPark 控制面板
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
