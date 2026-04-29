import React, { useEffect, useState } from 'react';
import { NodeType, NodeData } from '../types';

// Updated Color mapping based on Theme #168866 (Emerald Green)
const GRADIENTS = {
  [NodeType.ROOT]: 'from-slate-100 via-zinc-200 to-gray-300', // Pearl/White (Neutral)

  // THEME COLOR: #168866 (Emerald/Jade)
  // Using arbitrary values to match exact request
  [NodeType.THESIS]: 'from-[#23d9a1] via-[#168866] to-[#0f5c45]',

  // COMPLEMENTARY: Rose/Magenta (The opposite of Green)
  [NodeType.ANTITHESIS]: 'from-rose-400 via-rose-600 to-red-800',

  // SYNTHESIS: Gold/Amber (The "Enlightened" State)
  [NodeType.SYNTHESIS]: 'from-amber-300 via-amber-500 to-yellow-600',
};

// Text color helper
const TEXT_COLORS = {
  [NodeType.ROOT]: 'text-slate-900',
  [NodeType.THESIS]: 'text-white',
  [NodeType.ANTITHESIS]: 'text-white',
  [NodeType.SYNTHESIS]: 'text-white', // Dark text on bright gold, or white on dark gold? White looks better on deep amber.
};

interface BlobProps {
  node: NodeData;
  isSelected?: boolean;
}

// --- Component 1: The Visual Blob (Gooey) ---
export const BlobVisual: React.FC<BlobProps> = ({ node, isSelected }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const scale = mounted ? 1 : 0.01;
  const baseSize = node.type === NodeType.ROOT ? 180 : 140;

  return (
    <div
      className={`absolute flex items-center justify-center rounded-full transition-transform duration-700 cubic-bezier(0.34, 1.56, 0.64, 1)`}
      style={{
        left: node.x,
        top: node.y,
        width: baseSize,
        height: baseSize,
        transform: `translate(-50%, -50%) scale(${scale})`,
      }}
    >
      {/* The Liquid Blob Layer */}
      <div
        className={`absolute inset-0 rounded-full bg-gradient-to-br ${GRADIENTS[node.type]} opacity-90 blur-[0px] transition-all duration-300 shadow-[0_0_40px_rgba(0,0,0,0.3)] ${isSelected ? 'brightness-110 scale-105' : ''}`}
      />

      {/* Inner Highlight for Volume */}
      <div
        className={`absolute inset-4 rounded-full bg-gradient-to-tl from-white/40 to-transparent opacity-60 blur-[4px]`}
      />
    </div>
  );
};

interface BlobContentProps extends BlobProps {
  onDragStart: (e: React.MouseEvent | React.TouchEvent, id: string) => void;
}

// --- Component 2: The Content & Interaction (Sharp) ---
export const BlobContent: React.FC<BlobContentProps> = ({ node, isSelected, onDragStart }) => {
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => setMounted(true), []);

  const scale = mounted ? 1 : 0.01;
  const baseSize = node.type === NodeType.ROOT ? 180 : 140;
  const textColor = TEXT_COLORS[node.type];

  const handleCopyText = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(node.text || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`absolute flex flex-col items-center justify-center rounded-full cursor-grab active:cursor-grabbing select-none transition-transform duration-700 cubic-bezier(0.34, 1.56, 0.64, 1) z-10 group`}
      style={{
        left: node.x,
        top: node.y,
        width: baseSize,
        height: baseSize,
        transform: `translate(-50%, -50%) scale(${scale})`,
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onDragStart(e, node.id);
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
        onDragStart(e, node.id);
      }}
    >
      {/* Selection Ring (Animated) */}
      {isSelected && (
        <div className="absolute -inset-4 rounded-full border border-white/30 border-dashed animate-spin-slow pointer-events-none" />
      )}
      {isSelected && (
        <div className="absolute -inset-4 rounded-full border border-white/10 animate-pulse-soft pointer-events-none" />
      )}

      {/* Content Container */}
      <div className={`relative z-20 p-4 text-center w-full h-full flex flex-col items-center justify-center ${textColor}`}>
        {node.isGenerating ? (
          <div className={`animate-spin rounded-full h-6 w-6 border-b-2 ${node.type === NodeType.ROOT ? 'border-slate-800' : 'border-white'} mb-2 opacity-80`}></div>
        ) : (
          <>
            <div className={`font-bold text-[9px] uppercase tracking-[0.2em] opacity-60 mb-1`}>
              {node.type}
            </div>
            {/* Main Label */}
            <div className="font-bold text-lg leading-tight px-2 line-clamp-3 drop-shadow-sm">
              {node.label}
            </div>

            {/* Hover Tooltip - Dark Glass Theme */}
            <div
                className="absolute top-[80%] mt-4 w-80 bg-slate-900/80 backdrop-blur-xl border border-white/10 p-5 rounded-2xl text-left text-slate-200 shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none group-hover:pointer-events-auto select-text cursor-auto z-[60] scale-95 group-hover:scale-100 origin-top shadow-black/50"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-900/50 border-l border-t border-white/10 rotate-45 backdrop-blur-xl"></div>

                {/* Header */}
                <div className="flex items-start justify-between border-b border-white/10 pb-3 mb-3 gap-2">
                    <h4 className="font-bold text-white text-lg leading-tight tracking-tight">{node.label}</h4>
                    <button
                        onClick={handleCopyText}
                        className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 flex-shrink-0"
                        title="Copy text to clipboard"
                    >
                        {copied ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                        )}
                    </button>
                </div>

                <p className="leading-relaxed text-sm text-slate-300 whitespace-pre-wrap font-light tracking-wide">{node.text}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};