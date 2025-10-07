'use client';
import dynamic from 'next/dynamic';
import React from 'react';

const ChatBox = dynamic(() => import('@/components/ChatBox'), { ssr: false });

export default function ChatTestPage(){
  return (
    <div style={{ width: '100vw', height: '100svh', background: '#0a0f1a' }}>
      <ChatBox />
    </div>
  );
}


