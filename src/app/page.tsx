'use client';
import dynamic from 'next/dynamic';
import React from 'react';

const Shader3Canvas = dynamic(() => import('@/components/Shader3Canvas'), { ssr: false });

export default function Page(){
  return (
    <div style={{ width: '100vw', height: '100svh' }}>
      <Shader3Canvas />
    </div>
  );
}


