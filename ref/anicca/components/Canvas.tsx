import React, { useState, useRef, useEffect, useCallback } from 'react';
import { BlobVisual, BlobContent } from './BlobNode';
import { NodeData, NodeType, Connection } from '../types';
import * as Gemini from '../services/gemini';
import { nanoid } from 'nanoid';

// Relaxed threshold for synthesis (makes it easier to trigger merge)
const MIN_DRAG_FOR_SYNTHESIS = 80;
const DETACH_DISTANCE = 250;
const WORLD_BOUNDARY = 1500;

const PHYSICS = {
  // Drastically reduced repulsion to allow nodes to touch/merge easily
  REPULSION_FORCE: 5,
  REPULSION_RANGE: 150,

  // Removed spring strength for adhesion (set to 0 effectively)
  // Nodes will not snap back to parents anymore once moved
  SPRING_STRENGTH: 0,

  // Kept for initial spawn visuals, but applied weakly in code
  STICKY_DISTANCE: 100,
  DAMPING: 0.85,
  CENTER_GRAVITY: 0.005,
};

export const Canvas: React.FC = () => {
  const [nodes, setNodes] = useState<NodeData[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [connections, setConnections] = useState<Connection[]>([]);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [topicInput, setTopicInput] = useState('');
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);

  const dragRef = useRef<{
    active: boolean;
    nodeId: string | null;
    startX: number;
    startY: number;
    initialNodePositions: Record<string, {x: number, y: number}>;
    isCanvas: boolean;
    hasMoved: boolean;
  }>({
    active: false,
    nodeId: null,
    startX: 0,
    startY: 0,
    initialNodePositions: {},
    isCanvas: false,
    hasMoved: false
  });

  const rafRef = useRef<number>(null);

  const applyPhysics = useCallback(() => {
    setNodes(prevNodes => {
      const newNodes = prevNodes.map(node => ({
        ...node,
        velocity: node.velocity || { x: 0, y: 0 }
      }));

      // 1. Repulsion (Inter-node) - Very weak now
      for (let i = 0; i < newNodes.length; i++) {
        for (let j = i + 1; j < newNodes.length; j++) {
          const a = newNodes[i];
          const b = newNodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distSq = dx * dx + dy * dy;
          const dist = Math.sqrt(distSq) || 0.1;

          if (dist < PHYSICS.REPULSION_RANGE) {
            const force = (1 - dist / PHYSICS.REPULSION_RANGE) * PHYSICS.REPULSION_FORCE;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            a.velocity!.x += fx;
            a.velocity!.y += fy;
            b.velocity!.x -= fx;
            b.velocity!.y -= fy;
          }
        }
      }

      // 2. Spring Connections - REMOVED/DISABLED
      // We no longer apply spring forces to keep nodes attached to parents.
      // Once dragged, they stay where they are.

      // 3. Center Gravity (Weakly keeps things in viewport)
      newNodes.forEach(node => {
        const distToCenter = Math.sqrt(node.x * node.x + node.y * node.y);
        // Very weak pull to center
        node.velocity!.x -= node.x * PHYSICS.CENTER_GRAVITY;
        node.velocity!.y -= node.y * PHYSICS.CENTER_GRAVITY;

        // Soft boundary
        if (distToCenter > WORLD_BOUNDARY) {
            const strength = 0.05 * (distToCenter - WORLD_BOUNDARY);
            node.velocity!.x -= (node.x / distToCenter) * strength;
            node.velocity!.y -= (node.y / distToCenter) * strength;
        }
      });

      return newNodes.map(node => {
        if (dragRef.current.active && dragRef.current.nodeId === node.id) {
            return { ...node, velocity: { x: 0, y: 0 } };
        }
        return {
          ...node,
          x: node.x + (node.velocity?.x || 0),
          y: node.y + (node.velocity?.y || 0),
          velocity: {
            x: (node.velocity?.x || 0) * PHYSICS.DAMPING,
            y: (node.velocity?.y || 0) * PHYSICS.DAMPING,
          }
        };
      });
    });

    rafRef.current = requestAnimationFrame(applyPhysics);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(applyPhysics);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [applyPhysics]);

  const handleStartTopic = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!topicInput.trim()) return;

    setLoading(true);

    const rootId = nanoid();
    const thesisId = nanoid();
    const antithesisId = nanoid();
    const cx = 0;
    const cy = 0;

    const newNodes: NodeData[] = [
      {
        id: rootId,
        type: NodeType.ROOT,
        label: topicInput,
        text: topicInput,
        topic: topicInput,
        x: cx,
        y: cy - 100,
        velocity: {x:0, y:0}
      },
      {
        id: thesisId,
        type: NodeType.THESIS,
        label: "Thesis...",
        text: "Generating...",
        x: cx - 40,
        y: cy - 40,
        parentId: rootId,
        isGenerating: true,
        velocity: {x:0, y:0}
      },
      {
        id: antithesisId,
        type: NodeType.ANTITHESIS,
        label: "Antithesis...",
        text: "Generating...",
        x: cx + 40,
        y: cy - 40,
        parentId: rootId,
        isGenerating: true,
        velocity: {x:0, y:0}
      }
    ];

    setNodes(newNodes);
    setConnections([
        { id: nanoid(), from: rootId, to: thesisId },
        { id: nanoid(), from: rootId, to: antithesisId }
    ]);
    setTopicInput('');

    Promise.all([
        Gemini.generateThesis(topicInput).then(res => {
            setNodes(prev => prev.map(n => n.id === thesisId ? { ...n, label: res.label, text: res.content, isGenerating: false } : n));
        }),
        Gemini.generateAntithesis(topicInput).then(res => {
            setNodes(prev => prev.map(n => n.id === antithesisId ? { ...n, label: res.label, text: res.content, isGenerating: false } : n));
        })
    ]).finally(() => setLoading(false));
  };

  // SPLIT: Now creates TWO nodes (Thesis + Antithesis) from the selected node
  const handleSplit = async (nodeId: string) => {
    const parentNode = nodes.find(n => n.id === nodeId);
    if (!parentNode) return;

    const thesisId = nanoid();
    const antithesisId = nanoid();
    const offset = 60;

    // Create placeholders
    const newThesis: NodeData = {
        id: thesisId,
        type: NodeType.THESIS,
        label: "Split Thesis...",
        text: "Thinking...",
        x: parentNode.x - offset,
        y: parentNode.y + offset,
        parentId: nodeId,
        isGenerating: true,
        velocity: { x: 0, y: 0 }
    };

    const newAntithesis: NodeData = {
        id: antithesisId,
        type: NodeType.ANTITHESIS,
        label: "Split Antithesis...",
        text: "Thinking...",
        x: parentNode.x + offset,
        y: parentNode.y + offset,
        parentId: nodeId,
        isGenerating: true,
        velocity: { x: 0, y: 0 }
    };

    setNodes(prev => [...prev, newThesis, newAntithesis]);

    // Generate content based on parent's text
    const topic = parentNode.text || parentNode.label;

    Promise.all([
        Gemini.generateThesis(topic).then(res => {
            setNodes(prev => prev.map(n => n.id === thesisId ? { ...n, label: res.label, text: res.content, isGenerating: false } : n));
        }),
        Gemini.generateAntithesis(topic).then(res => {
            setNodes(prev => prev.map(n => n.id === antithesisId ? { ...n, label: res.label, text: res.content, isGenerating: false } : n));
        })
    ]);
  };

  // CLONE: Creates a direct copy of the node
  const handleClone = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
        const newId = nanoid();
        const clone: NodeData = {
            ...node,
            id: newId,
            x: node.x + 50, // Slight offset
            y: node.y + 50,
            velocity: { x: 0, y: 0 },
            parentId: undefined, // Clone is independent
            synthesisParents: undefined
        };
        setNodes(prev => [...prev, clone]);
    }
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent, nodeId?: string) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const worldX = (clientX - window.innerWidth / 2 - pan.x) / zoom;
    const worldY = (clientY - window.innerHeight / 2 - pan.y) / zoom;

    dragRef.current = {
      active: true,
      nodeId: nodeId || null,
      startX: clientX,
      startY: clientY,
      isCanvas: !nodeId,
      hasMoved: false,
      initialNodePositions: nodes.reduce((acc, n) => ({ ...acc, [n.id]: { x: n.x, y: n.y } }), {} as Record<string, {x: number, y: number}>)
    };

    if (nodeId) {
      setSelectedNodeId(nodeId);
    }
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!dragRef.current.active) return;

    dragRef.current.hasMoved = true;

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;

    if (dragRef.current.isCanvas) {
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      dragRef.current.startX = clientX;
      dragRef.current.startY = clientY;
      setIsDraggingCanvas(true);
    } else if (dragRef.current.nodeId) {
       const draggedId = dragRef.current.nodeId;
       setNodes(prev => prev.map(n => {
           if (n.id === draggedId) {
               const wDx = dx / zoom;
               const wDy = dy / zoom;
               const newX = n.x + wDx;
               const newY = n.y + wDy;
               return { ...n, x: newX, y: newY };
           }
           return n;
       }));
       dragRef.current.startX = clientX;
       dragRef.current.startY = clientY;
    }
  };

  const handleMouseUp = () => {
    dragRef.current.active = false;
    setIsDraggingCanvas(false);

    if (dragRef.current.nodeId && dragRef.current.hasMoved) {
        const draggedNode = nodes.find(n => n.id === dragRef.current.nodeId);
        // Synthesis Check
        if (draggedNode && !draggedNode.synthesisParents) {
            const target = nodes.find(n =>
                n.id !== draggedNode.id &&
                Math.sqrt(Math.pow(n.x - draggedNode.x, 2) + Math.pow(n.y - draggedNode.y, 2)) < MIN_DRAG_FOR_SYNTHESIS * 1.5
            );

            if (target) {
                attemptSynthesis(draggedNode, target);
            }
        }
    }
  };

  const attemptSynthesis = async (nodeA: NodeData, nodeB: NodeData) => {
      // Allow any combination to synthesize for creative freedom,
      // but typically we want different types.
      if (nodeA.id === nodeB.id) return;

      const newId = nanoid();
      const midX = (nodeA.x + nodeB.x) / 2;
      const midY = (nodeA.y + nodeB.y) / 2;

      const synthesisNode: NodeData = {
          id: newId,
          type: NodeType.SYNTHESIS,
          label: "Synthesis...",
          text: "Synthesizing...",
          x: midX,
          y: midY,
          synthesisParents: [nodeA.id, nodeB.id],
          isGenerating: true,
          velocity: {x:0, y:0}
      };

      setNodes(prev => [...prev, synthesisNode]);

      try {
          const res = await Gemini.generateSynthesis(nodeA.text, nodeB.text);
          setNodes(prev => prev.map(n => n.id === newId ? { ...n, label: res.label, text: res.content, isGenerating: false } : n));
      } catch (e) {
          setNodes(prev => prev.filter(n => n.id !== newId));
      }
  };

  const transformStyle = {
    transform: `translate(${window.innerWidth / 2 + pan.x}px, ${window.innerHeight / 2 + pan.y}px) scale(${zoom})`,
    transformOrigin: '0 0',
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden touch-none select-none cursor-grab active:cursor-grabbing bg-transparent"
      onMouseDown={(e) => handleMouseDown(e)}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={(e) => handleMouseDown(e)}
      onTouchMove={handleMouseMove}
      onTouchEnd={handleMouseUp}
    >
        {/* Empty State / Brand - Weakened */}
        {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.05]">
                <div className="text-6xl md:text-9xl font-black text-white tracking-[0.2em] uppercase blur-[4px]">Anicca</div>
            </div>
        )}

      <div style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, ...transformStyle }}>

        {/* Gooey Layer */}
        <div className="gooey-layer absolute inset-0 w-full h-full pointer-events-none">
            {nodes.map(node => (
                <BlobVisual key={`visual-${node.id}`} node={node} isSelected={selectedNodeId === node.id} />
            ))}
        </div>

        {/* Content Layer */}
        {nodes.map(node => (
            <React.Fragment key={`content-${node.id}`}>
                <BlobContent
                    node={node}
                    isSelected={selectedNodeId === node.id}
                    onDragStart={handleMouseDown}
                />

                {/* Context Menu */}
                {selectedNodeId === node.id && !isDraggingCanvas && (
                    <div
                        className="absolute z-50 flex gap-2"
                        style={{
                            left: node.x,
                            top: node.y + (node.type === NodeType.ROOT ? 100 : 80),
                            transform: 'translate(-50%, 0)'
                        }}
                    >
                        <button
                            className="bg-slate-900/80 backdrop-blur-md text-emerald-300 text-xs px-4 py-2 rounded-full shadow-xl hover:bg-slate-800 hover:scale-105 transition-all border border-emerald-500/30 font-medium tracking-wide"
                            onClick={(e) => { e.stopPropagation(); handleSplit(node.id); }}
                        >
                            Split
                        </button>
                        <button
                            className="bg-slate-900/80 backdrop-blur-md text-white/80 text-xs px-4 py-2 rounded-full shadow-xl hover:bg-slate-800 hover:scale-105 transition-all border border-white/10 font-medium tracking-wide"
                            onClick={(e) => { e.stopPropagation(); handleClone(node.id); }}
                        >
                            Clone
                        </button>
                    </div>
                )}
            </React.Fragment>
        ))}

      </div>

      {/* Modern Floating Input Bar */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-lg px-6 z-50">
        <form onSubmit={handleStartTopic} className="relative group transition-all duration-300">
            {/* Input Glow matches theme */}
            <div className={`absolute inset-0 bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-cyan-500/20 rounded-2xl blur-xl opacity-0 transition-opacity duration-500 ${topicInput ? 'opacity-100' : 'group-hover:opacity-50'}`}></div>
            <div className="relative flex items-center bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-2 transition-all focus-within:ring-1 focus-within:ring-white/20 focus-within:bg-slate-900/80">
                <input
                    type="text"
                    className="flex-1 bg-transparent px-4 py-3 text-white placeholder-slate-400 focus:outline-none text-base font-light tracking-wide"
                    placeholder="Contemplate a concept..."
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    disabled={loading}
                />
                <button
                    type="submit"
                    className="p-3 bg-emerald-500/20 hover:bg-emerald-500/30 rounded-xl text-emerald-300 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={loading}
                >
                    {loading ? (
                        <div className="w-5 h-5 border-2 border-emerald-300/30 border-t-emerald-300 rounded-full animate-spin" />
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    )}
                </button>
            </div>
        </form>
      </div>

      {/* Floating Controls */}
      <div className="absolute bottom-8 right-8 flex flex-col gap-3 z-50">
          <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-full p-1.5 shadow-xl flex flex-col gap-1">
            <button
                className="w-10 h-10 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                onClick={() => setZoom(z => Math.min(z + 0.1, 2))}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
            </button>
            <button
                className="w-10 h-10 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                onClick={() => setZoom(z => Math.max(z - 0.1, 0.5))}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
            </button>
          </div>

          <button
            className="w-14 h-14 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-full shadow-xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-all hover:rotate-90"
            onClick={() => { setPan({x:0, y:0}); setZoom(1); }}
            title="Reset View"
          >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
          </button>
      </div>
    </div>
  );
};