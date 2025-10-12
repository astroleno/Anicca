'use client';
import React from 'react';
import dynamic from 'next/dynamic';

// ShaderPark 背景层 + MetaCanvas 交互层
const ShaderParkLayer = dynamic(() => import('@/components/ShaderParkLayer'), { ssr: false });
const MetaCanvas = dynamic(() => import('@/components/MetaCanvas'), { ssr: false });
const ChatOverlayMock = dynamic(() => import('@/components/ChatOverlayMock'), { ssr: false });

// 添加错误边界和调试信息
function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [hasError, setHasError] = React.useState(false);
  
  React.useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      // 忽略ResizeObserver错误，这是常见的非致命错误
      if (error.message && error.message.includes('ResizeObserver')) {
        console.warn('ResizeObserver error (ignored):', error.message);
        return;
      }
      console.error('Page error:', error);
      setHasError(true);
    };
    
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);
  
  if (hasError) {
    return (
      <div style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        width: '100vw', 
        height: '100vh', 
        background: '#ff0000', 
        color: 'white', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        zIndex: 99999
      }}>
        <div>
          <h1>页面加载错误</h1>
          <p>请检查控制台错误信息</p>
          <button onClick={() => setHasError(false)}>重试</button>
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
}

export default function Page(){
  const [showChat, setShowChat] = React.useState(true);
  const [componentsLoaded, setComponentsLoaded] = React.useState({
    shaderPark: false,
    metaCanvas: false,
    chatOverlay: false
  });
  const [currentTime, setCurrentTime] = React.useState('');

  // 只在客户端设置时间，避免Hydration错误
  React.useEffect(() => {
    setCurrentTime(new Date().toLocaleTimeString());
  }, []);

  console.log('Page rendering, components loaded:', componentsLoaded);

  // 监听组件加载事件
  React.useEffect(() => {
    const handleComponentLoad = (event: CustomEvent) => {
      const { component, loaded } = event.detail;
      console.log('Component load event:', component, loaded);
      setComponentsLoaded(prev => ({ ...prev, [component]: loaded }));
    };

    window.addEventListener('component-load', handleComponentLoad as EventListener);
    return () => window.removeEventListener('component-load', handleComponentLoad as EventListener);
  }, []);

  return (
    <ErrorBoundary>
      <div style={{
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        position: 'fixed',
        top: 0,
        left: 0,
        background: '#000'
      }}>
        {/* 调试信息 - 已移除 */}

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
    </ErrorBoundary>
  );
}


