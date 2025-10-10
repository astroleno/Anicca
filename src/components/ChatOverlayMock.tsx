'use client';
import React, { useMemo, useRef, useState } from 'react';
import { emit, Events } from '@/events/bus';

/**
 * ChatOverlayMock
 * - 目的：在主页上以“右侧浮层”的形式，模拟三大功能：
 *   1) 正/反分型（同一轮生成两个立场的回答）
 *   2) 独立种子（每侧独立可复现，支持重掷与锁定）
 *   3) merge 融合（选定一侧继续往下）
 * - 注意：纯前端 mock，不依赖服务端；日志充分，关键流程 try-catch
 */

type Side = 'thesis' | 'antithesis';
type BranchType = 'thesis' | 'antithesis' | 'synthesis';

type Branch = {
  seed: number;
  locked: boolean;
  text: string;
};

type Turn = {
  id: string;
  name: string;      // 人类可读的节点名
  user: string;
  thesis: Branch;
  antithesis: Branch;
  synthesis?: Branch;     // 合（可选）
  merged?: Side | null; // 选中的一侧
  summary?: string;     // ≤30 字摘要（演示）
};

// 简单确定性 PRNG（xorshift32）
function xorshift32(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return ((x >>> 0) % 0xFFFFFFFF) / 0xFFFFFFFF;
  };
}

// 基于种子的 mock 文本生成（可复现）
function generateMockText(seed: number, role: Side, prompt: string): string {
  try {
    const rnd = xorshift32(seed);
    const adjectives = role === 'thesis'
      ? ['积极', '建设性', '务实', '温和', '乐观']
      : ['批判', '谨慎', '怀疑', '保守', '冷静'];
    const verbs = ['建议', '认为', '主张', '提出', '强调'];
    const nouns = ['路径', '方法', '方案', '侧面', '要点'];
    const pick = (arr: string[]) => arr[Math.floor(rnd() * arr.length) % arr.length];
    const a = pick(adjectives), v = pick(verbs), n = pick(nouns);
    const sliceLen = 12 + Math.floor(rnd() * 18);
    const head = prompt.slice(0, sliceLen) || '这个主题';
    const body = `${head}，${a}${n}${v}如下：`;
    const bullets = Array.from({ length: 3 }, (_, i) => `(${i + 1}) ${pick(nouns)}-${pick(verbs)}`).join('；');
    return `${body}${bullets}。`;
  } catch (err) {
    console.error('[ChatOverlayMock] generateMockText error', err);
    return '（生成失败：请重试）';
  }
}

function summarize(text: string): string {
  const s = text.replace(/[。！!。\s]+$/g, '');
  return s.length > 30 ? s.slice(0, 30) : s;
}

function nextSeed(): number {
  // 使用高熵时间片段生成“看似随机”的种子
  return (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
}

export default function ChatOverlayMock() {
  const [input, setInput] = useState('请给出正反两种看法，并各自列出要点');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeBranchPath, setActiveBranchPath] = useState<Side | null>(null); // 对话层 merge 后沿哪侧继续
  const [currentParentNodeId, setCurrentParentNodeId] = useState<string>('root'); // 兼容旧字段（内部仍使用 id）
  const [currentParentName, setCurrentParentName] = useState<string>('root');     // 新：面向用户的名称
  const nameCounterRef = useRef(1);
  const listRef = useRef<HTMLDivElement | null>(null);
  // 全局操作面板：合并/叉接（4 个输入框）
  const [combineFrom, setCombineFrom] = useState('');
  const [combineTo, setCombineTo] = useState('');
  const [forkFrom, setForkFrom] = useState('');
  const [forkTo, setForkTo] = useState('');

  const canSend = input.trim().length > 0;

  const scrollToBottom = () => {
    try {
      listRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' });
    } catch (e) {
      // 非关键流程忽略
    }
  };

  const send = () => {
    if (!canSend) return;
    try {
      const user = input.trim();
      const seedA = nextSeed();
      const seedB = nextSeed();
      const th = generateMockText(seedA, 'thesis', user);
      const an = generateMockText(seedB, 'antithesis', user);
      const nodeName = `N${nameCounterRef.current++}`;
      const t: Turn = {
        id: `t_${Date.now()}`,
        name: nodeName,
        user,
        thesis: { seed: seedA, locked: false, text: th },
        antithesis: { seed: seedB, locked: false, text: an },
        merged: null,
        summary: summarize(th)
      };
      setTurns(prev => [...prev, t]);
      setInput('');
      // 通知画布：为该轮创建两个子节点（用于源点扩展与亲子关系展示）
      emit(Events.ChatAddChildren, {
        parentId: currentParentName || 'root',
        children: [
          { id: `${t.name}_thesis`, branch: 'thesis', label: '正' },
          { id: `${t.name}_antithesis`, branch: 'antithesis', label: '反' }
        ]
      });
      // 若已有 merge 路径，则只是标注，不限制生成两侧（方便对比）
      setTimeout(scrollToBottom, 50);
    } catch (err) {
      console.error('[ChatOverlayMock] send error', err);
    }
  };

  const reroll = (turnId: string, side: BranchType) => {
    setTurns(prev => prev.map(t => {
      if (t.id !== turnId) return t;
      const branch = side === 'thesis' ? t.thesis : side === 'antithesis' ? t.antithesis : (t.synthesis || { seed: nextSeed(), locked: false, text: '' });
      if (branch.locked) return t; // 锁定则忽略
      const newSeed = nextSeed();
      const newText = generateMockText(newSeed, (side === 'synthesis' ? 'thesis' : side) as Side, t.user);
      const updated: Branch = { ...branch, seed: newSeed, text: newText };
      if (side === 'thesis') return { ...t, thesis: updated, summary: summarize(newText) };
      if (side === 'antithesis') return { ...t, antithesis: updated };
      return { ...t, synthesis: updated };
    }));
  };

  const toggleLock = (turnId: string, side: Side) => {
    setTurns(prev => prev.map(t => {
      if (t.id !== turnId) return t;
      const branch = side === 'thesis' ? t.thesis : t.antithesis;
      const updated: Branch = { ...branch, locked: !branch.locked };
      return side === 'thesis' ? { ...t, thesis: updated } : { ...t, antithesis: updated };
    }));
  };

  // 生成“合（synthesis）”
  const synthesize = (turnId: string) => {
    setTurns(prev => prev.map(t => {
      if (t.id !== turnId) return t;
      const seed = nextSeed();
      // 简单组合“正/反”的摘要，作为合的 mock
      const base = `${summarize(t.thesis.text)} | ${summarize(t.antithesis.text)}`;
      const text = generateMockText(seed, 'thesis', base);
      const branch: Branch = { seed, locked: false, text };
      return { ...t, synthesis: branch };
    }));
    // 发事件：为该轮创建“合”分支节点
    const node = turns.find(x=>x.id===turnId);
    const nodeName = node?.name || `Nunknown`;
    emit(Events.ChatAddChildren, {
      parentId: currentParentName || 'root',
      children: [ { id: `${nodeName}_synthesis`, branch: 'synthesis', label: '合' } ]
    });
  };

  // 工具：根据 id 或 seed 解析为 nodeId
  function findNodeIdBySeed(seed: number): string | null {
    for (const t of turns) {
      if (t.thesis?.seed === seed) return `${t.name}_thesis`;
      if (t.antithesis?.seed === seed) return `${t.name}_antithesis`;
      if (t.synthesis?.seed === seed) return `${t.name}_synthesis`;
    }
    return null;
  }

  function resolveIdOrSeed(val: string): string | null {
    const v = val.trim();
    if (!v) return null;
    if (/^N\d+/.test(v) || v.endsWith('_thesis') || v.endsWith('_antithesis') || v.endsWith('_synthesis') || v === 'root') {
      return v; // 已是 nodeId
    }
    const num = Number(v);
    if (!Number.isNaN(num)) {
      return findNodeIdBySeed(num);
    }
    return null;
  }

  function doCombine() {
    const fromId = resolveIdOrSeed(combineFrom);
    const toId = resolveIdOrSeed(combineTo);
    if (!fromId || !toId || fromId === toId) return;
    emit(Events.CombineSeeds, { fromId, toId });
  }

  function doFork() {
    const fromId = resolveIdOrSeed(forkFrom);
    const toId = resolveIdOrSeed(forkTo);
    if (!fromId || !toId || fromId === toId) return;
    emit(Events.ForkSeed, { fromId, toId });
  }

  const mergePick = (turnId: string, side: Side) => {
    try {
      setTurns(prev => prev.map(t => t.id === turnId ? { ...t, merged: side } : t));
      setActiveBranchPath(side);
      // 联动：向画布发出 merge 事件，用于视觉上强化所选分支
      emit(Events.Merge, { turnId, side });
      // 将当前活跃母节点切换为选中的子节点，后续发送以其为 parent
      const node = turns.find(x=>x.id===turnId);
      const childName = node ? `${node.name}_${side}` : `unknown_${side}`;
      setCurrentParentName(childName);
    } catch (err) {
      console.error('[ChatOverlayMock] mergePick error', err);
    }
  };

  const exportJSON = () => {
    try {
      const data = { turns, activeBranchPath };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'chat_mock_state.json'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[ChatOverlayMock] export error', err);
    }
  };

  const importJSON = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (Array.isArray(data.turns)) setTurns(data.turns);
      if (data.activeBranchPath === 'thesis' || data.activeBranchPath === 'antithesis' || data.activeBranchPath === null) {
        setActiveBranchPath(data.activeBranchPath);
      }
      setTimeout(scrollToBottom, 50);
    } catch (err) {
      console.error('[ChatOverlayMock] import error', err);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        right: '20px',
        top: '20px',
        bottom: '20px',
        width: '520px',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'saturate(140%) blur(14px)',
        border: '1px solid rgba(0,0,0,0.12)',
        borderRadius: '12px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.25)'
      }}
    >
      {/* 顶部工具栏 */}
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <div style={{ fontWeight: 700 }}>Dual Chat（Mock）</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: '12px', color: '#555' }}>路径: {activeBranchPath || '未合并'}</div>
        <button onClick={exportJSON} style={{ marginLeft: '8px' }}>导出</button>
        <label style={{ marginLeft: '4px' }}>
          <span style={{ padding: '4px 8px', border: '1px solid #999', borderRadius: '6px', cursor: 'pointer', background: '#f6f6f6' }}>导入</span>
          <input type="file" accept="application/json" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) importJSON(f); }} />
        </label>
      </div>

      {/* 列表区域 */}
      <div ref={listRef} style={{ flex: 1, overflow: 'auto', padding: '12px 12px 0 12px' }}>
        {turns.map(t => (
          <div key={t.id} style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px' }}>用户：{t.user}</div>
            <div style={{ display: 'grid', gridTemplateColumns: t.synthesis ? '1fr 1fr 1fr' : '1fr 1fr', gap: '10px' }}>
              {/* 正 */}
              <div style={{ border: '1px solid rgba(0,0,0,0.12)', borderRadius: '10px', padding: '10px', background: t.merged === 'thesis' ? 'rgba(76,175,80,0.10)' : '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 700 }}>正</span>
                  <span style={{ fontSize: '12px', color: '#666' }}>Seed: {t.thesis.seed}</span>
                  <button onClick={() => reroll(t.id, 'thesis')} disabled={t.thesis.locked} style={{ marginLeft: 'auto' }}>换一换</button>
                  <button onClick={() => toggleLock(t.id, 'thesis')}>{t.thesis.locked ? '解锁' : '锁定'}</button>
                  <button onClick={() => mergePick(t.id, 'thesis')} style={{ background: '#4caf50', color: 'white' }}>选择并继续</button>
                </div>
              <div style={{ fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{t.thesis.text}</div>
              <div style={{ marginTop: '6px', fontSize: '11px', color: '#666' }}>节点: {`${t.name}_thesis`}（Seed: {t.thesis.seed}）</div>
              </div>

              {/* 反 */}
              <div style={{ border: '1px solid rgba(0,0,0,0.12)', borderRadius: '10px', padding: '10px', background: t.merged === 'antithesis' ? 'rgba(33,150,243,0.10)' : '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 700 }}>反</span>
                  <span style={{ fontSize: '12px', color: '#666' }}>Seed: {t.antithesis.seed}</span>
                  <button onClick={() => reroll(t.id, 'antithesis')} disabled={t.antithesis.locked} style={{ marginLeft: 'auto' }}>换一换</button>
                  <button onClick={() => toggleLock(t.id, 'antithesis')}>{t.antithesis.locked ? '解锁' : '锁定'}</button>
                  <button onClick={() => mergePick(t.id, 'antithesis')} style={{ background: '#2196f3', color: 'white' }}>选择并继续</button>
                </div>
                <div style={{ fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{t.antithesis.text}</div>
                <div style={{ marginTop: '6px', fontSize: '11px', color: '#666' }}>节点: {`${t.name}_antithesis`}（Seed: {t.antithesis.seed}）</div>
              </div>

              {/* 合（可选列） */}
              {t.synthesis ? (
                <div style={{ border: '1px solid rgba(0,0,0,0.12)', borderRadius: '10px', padding: '10px', background: 'rgba(255,193,7,0.10)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700 }}>合</span>
                    <span style={{ fontSize: '12px', color: '#666' }}>Seed: {t.synthesis.seed}</span>
                    <button onClick={() => reroll(t.id, 'synthesis')} disabled={t.synthesis.locked} style={{ marginLeft: 'auto' }}>换一换</button>
                    <button onClick={() => toggleLock(t.id, 'thesis')}>{t.synthesis.locked ? '解锁' : '锁定'}</button>
                  </div>
                  <div style={{ fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{t.synthesis.text}</div>
                  <div style={{ marginTop: '6px', fontSize: '11px', color: '#666' }}>节点: {`${t.name}_synthesis`}（Seed: {t.synthesis.seed}）</div>
                </div>
              ) : null}
            </div>
            {/* 摘要条 */}
            {t.summary ? (
              <div style={{ marginTop: '6px', fontSize: '12px', color: '#444' }}>摘要：{t.summary}</div>
            ) : null}
            {/* 工具区：已移除“生成合/合并/Fork”三个按钮，统一放到底部全局操作面板 */}
          </div>
        ))}
      </div>

      {/* 输入区 */}
      <div style={{ padding: '10px', borderTop: '1px solid rgba(0,0,0,0.08)', display: 'grid', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="输入你的问题，自动生成正/反两侧…"
            style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1px solid #bbb' }}
          />
          <button onClick={send} disabled={!canSend} style={{ padding: '10px 14px' }}>发送</button>
        </div>
        {/* 全局操作面板：两个命令四个输入框 */}
        <div style={{ display: 'grid', gap: '6px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ width: 56, fontSize: 12, color: '#444' }}>合并</span>
            <input value={combineFrom} onChange={e=>setCombineFrom(e.target.value)} placeholder="from: id 或 seed" style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #bbb' }} />
            <input value={combineTo} onChange={e=>setCombineTo(e.target.value)} placeholder="to: id 或 seed" style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #bbb' }} />
            <button onClick={doCombine} style={{ padding: '8px 12px' }}>执行合并</button>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ width: 56, fontSize: 12, color: '#444' }}>Fork</span>
            <input value={forkFrom} onChange={e=>setForkFrom(e.target.value)} placeholder="from: id 或 seed" style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #bbb' }} />
            <input value={forkTo} onChange={e=>setForkTo(e.target.value)} placeholder="to: id 或 seed" style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #bbb' }} />
            <button onClick={doFork} style={{ padding: '8px 12px' }}>执行 Fork</button>
          </div>
        </div>
      </div>
    </div>
  );
}


