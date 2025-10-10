'use client';
import React from 'react';
import dynamic from 'next/dynamic';

// ShaderPark 背景层 + MetaCanvas 交互层
const ShaderParkLayer = dynamic(() => import('@/components/ShaderParkLayer'), { ssr: false });
const MetaCanvas = dynamic(() => import('@/components/MetaCanvas'), { ssr: false });
const ChatOverlayMock = dynamic(() => import('@/components/ChatOverlayMock'), { ssr: false });

export default function Page(){
  const [showChat, setShowChat] = React.useState(true);

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
      {/* ShaderPark 背景层（纯噪波） */}
      <ShaderParkLayer />

      {/* MetaCanvas 交互层（渲染弥散球 + 标记 + 控制面板） */}
      <MetaCanvas />
      {/* 右侧浮层：保持挂载以保留状态，用 display 切换可见性 */}
      <div style={{ display: showChat ? 'block' : 'none' }}>
        <ChatOverlayMock />
      </div>
      {/* 隐藏/显示开关（右下角悬浮） */}
      <button
        onClick={()=>setShowChat(v=>!v)}
        style={{
          position: 'fixed',
          right: '20px',
          bottom: '20px',
          zIndex: 10001,
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          border: '1px solid rgba(0,0,0,0.15)',
          background: 'rgba(255,255,255,0.9)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
          cursor: 'pointer'
        }}
        title={showChat ? '隐藏聊天' : '显示聊天'}
      >
        {showChat ? '×' : '💬'}
      </button>
    </div>
  );
}


