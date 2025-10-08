'use client';
import React, { useMemo, useState } from 'react';
import { branchGraphStore } from '@/store/branchGraph';
import { exportGraph, importGraph } from '@/lib/io/json';
import { MockProvider } from '@/llm/provider';
import { rerunBranch } from '@/engine/rerun';
import { generateDualBranches } from '@/engine/dual';

export default function GraphPreviewPage(){
  const [, setTick] = useState(0);
  const [providerName, setProviderName] = useState<'mock'|'openai'>('mock');
  const provider = useMemo(() => new MockProvider(), []); // 仅用于读出 name='mock'

  const g = branchGraphStore.getGraph();
  const refresh = () => setTick(v => v + 1);

  const onCreateUser = () => {
    const id = branchGraphStore.createUserNode('写下第一句想法…');
    console.log('createUser', id);
    refresh();
  };

  const onFork = (baseId: string, branchType?: '正'|'反') => {
    const id = branchGraphStore.forkNode(baseId, { branchType, model: 'mock-echo' });
    console.log('fork', baseId, '=>', id);
    refresh();
  };

  const onMerge = (ids: string[]) => {
    const id = branchGraphStore.mergeNodes(ids, '合');
    console.log('merge', ids, '=>', id);
    refresh();
  };

  const onRerun = async (fromId: string) => {
    const name = providerName === 'openai' ? 'openai' : 'mock';
    const model = providerName === 'openai' ? 'gpt-4o-mini' : 'mock-echo';
    await rerunBranch(name, fromId, model);
    refresh();
  };

  const onExport = () => {
    const blob = exportGraph(g);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'anicca-graph.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onGenerateDual = async (baseId: string) => {
    await generateDualBranches(baseId, provider.name, 'mock-echo');
    refresh();
  };

  // 独立分支入口移除：统一通过“生成 正/反”裂变产生两泡

  const onImport = async (file: File) => {
    try {
      const graph = await importGraph(file);
      branchGraphStore.setGraph(graph);
      refresh();
    } catch (e){
      console.error('import failed', e);
      alert('导入失败：JSON 结构不合法');
    }
  };

  return (
    <div style={{ padding: 16, color: '#e5e7eb', background: '#0a0f1a', minHeight: '100svh' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={onCreateUser}>新建 user</button>
        <select value={providerName} onChange={e => setProviderName(e.target.value as any)}>
          <option value="mock">mock</option>
          <option value="openai">openai</option>
        </select>
        <button onClick={onExport}>导出 JSON</button>
        <label style={{ cursor: 'pointer' }}>
          导入 JSON
          <input type="file" accept="application/json" style={{ display: 'none' }}
                 onChange={e => e.currentTarget.files && onImport(e.currentTarget.files[0])} />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <h3>Nodes</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.values(g.nodes).map(n => (
              <div key={n.id} style={{ background: '#111827', padding: 12, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: '#93c5fd' }}>{n.id}</div>
                <div>kind: {n.kind} {n.branchType ? `(${n.branchType})` : ''}</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>text: {n.text || '—'}</div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>parents: {n.parents.join(', ') || '—'}</div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>children: {n.children.join(', ') || '—'}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={() => onGenerateDual(n.id)}>生成 正/反</button>
                  <button onClick={() => onRerun(n.id)}>从此重跑</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3>Edges</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.values(g.edges).map(e => (
              <div key={e.id} style={{ background: '#0b1220', padding: 12, borderRadius: 8 }}>
                {e.from} → {e.to} {e.reason ? `(${e.reason})` : ''}
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: 16 }}>选中两节点合并</h3>
          <MergeForm onMerge={onMerge} />
        </div>
      </div>
    </div>
  );
}

function MergeForm({ onMerge }:{ onMerge: (ids: string[]) => void }){
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input placeholder="nodeA id" value={a} onChange={e => setA(e.target.value)} />
      <input placeholder="nodeB id" value={b} onChange={e => setB(e.target.value)} />
      <button onClick={() => a && b && onMerge([a,b])}>合并</button>
    </div>
  );
}


