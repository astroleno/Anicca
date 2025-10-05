import React, { useEffect, useRef } from 'react';
import { createMochiSketch, type SketchHandles } from '../p5/createMochiSketch';

type Props = {
  className?: string;
  onReady?: (api: SketchHandles) => void;
};

export default function Canvas(props: Props){
  const containerRef = useRef<HTMLDivElement>(null);
  const sketchRef = useRef<SketchHandles | null>(null);

  useEffect(() => {
    try {
      if(!containerRef.current) return;
      const api = createMochiSketch(containerRef.current);
      sketchRef.current = api;
      props.onReady?.(api);
      return () => {
        try { sketchRef.current?.dispose(); } catch(e){ console.error(e); }
      };
    } catch (err) {
      console.error('[Canvas] create error:', err);
    }
  }, []);

  return (
    <div ref={containerRef} className={props.className} style={{ width: '100%', height: '100%', position: 'relative' }} />
  );
}


