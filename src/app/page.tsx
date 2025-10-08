'use client';
import React from 'react';
import dynamic from 'next/dynamic';

// 动态引入新的 Metaball MVP 组件（保留 SSR 关闭）
const MetaCanvas = dynamic(() => import('@/components/MetaCanvas'), { ssr: false });

export default function Page(){
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      margin: 0,
      padding: 0,
      overflow: 'hidden',
      position: 'fixed',
      top: 0,
      left: 0
    }}>
      <MetaCanvas />
    </div>
  );
}


