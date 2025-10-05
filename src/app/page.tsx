'use client';
import dynamic from 'next/dynamic';
import React from 'react';

const Canvas = dynamic(() => import('@/components/Canvas'), { ssr: false });

export default function Page(){
  return (
    <div style={{ width: '100vw', height: '100svh' }}>
      <Canvas onReady={(api) => {
        try {
          api.setControls({ mixStrength: 0.8, colorCycleSpeed: 0.15, bgCycleSpeed: 0.2 });
          api.triggerPulse(0.7);
        } catch (err) {
          console.error('[Page] onReady error:', err);
        }
      }} />
    </div>
  );
}


