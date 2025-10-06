'use client';
import React, { useEffect, useRef } from 'react';
import { spCode } from '@/shaders/shader3';

// 动态导入 shader-park-core
let sculptToMinimalRenderer: any = null;

async function loadShaderParkCore() {
  if (!sculptToMinimalRenderer) {
    const module = await import('shader-park-core/dist/shader-park-core.esm.js');
    sculptToMinimalRenderer = module.sculptToMinimalRenderer;
  }
  return sculptToMinimalRenderer;
}

type Props = {
  className?: string;
};

export default function Shader3Canvas({ className }: Props){
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let stop: (() => void) | null = null;

    const initShader = async () => {
      try {
        if(!ref.current) return;
        const canvas = ref.current;

        // 确保 canvas 有明确的尺寸
        canvas.width = 800;
        canvas.height = 600;

        console.log('[Shader3Canvas] Canvas size:', canvas.width, canvas.height);
        console.log('[Shader3Canvas] Loading shader-park-core...');

        const renderer = await loadShaderParkCore();
        console.log('[Shader3Canvas] Initializing shader...');

        stop = renderer(canvas, spCode, () => ({}));
        console.log('[Shader3Canvas] Shader initialized successfully');
      } catch (err) {
        console.error('[Shader3Canvas] init error:', err);
      }
    };

    initShader();

    return () => {
      try {
        stop && stop();
      } catch(e){ console.error(e);}
    };
  }, []);
  return <canvas ref={ref} className={className} style={{ width: '800px', height: '600px', border: '1px solid red' }} />;
}


