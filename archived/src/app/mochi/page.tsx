'use client';

import React from 'react';
import MochiCanvas from '@/components/MochiCanvas';

export default function MochiPage() {
  return (
    <div className="min-h-screen bg-black">
      {/* 页面标题和控制面板 */}
      <div className="absolute top-4 left-4 z-10 text-white">
        <div className="bg-gray-900/80 backdrop-blur-sm rounded-xl p-6 max-w-sm">
          <h1 className="text-2xl font-bold mb-3 text-blue-200">麻薯质感弥散圆</h1>
          <p className="text-sm text-gray-300 mb-4">
            基于 Shader Park 的麻薯质感效果复刻
          </p>
          
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold mb-2 text-green-200">交互说明</h3>
              <ul className="text-xs space-y-1 text-gray-300">
                <li>• 鼠标悬停：激活效果</li>
                <li>• 鼠标点击：旋转交互</li>
                <li>• 拖拽：位移效果</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-sm font-semibold mb-2 text-purple-200">技术栈</h3>
              <p className="text-xs text-gray-300">Shader Park + React</p>
              <p className="text-xs text-gray-300">WebGL 着色器渲染</p>
            </div>
          </div>
        </div>
      </div>

      {/* 性能指标 */}
      <div className="absolute bottom-4 left-4 z-10 text-white">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-3">
          <div className="text-xs text-gray-300">
            <div>技术栈: Shader Park + React</div>
            <div>渲染: WebGL 着色器</div>
          </div>
        </div>
      </div>

      {/* 返回按钮 */}
      <div className="absolute bottom-4 right-4 z-10">
        <a 
          href="/"
          className="bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white px-4 py-2 rounded-lg transition-colors text-sm"
        >
          返回首页
        </a>
      </div>

      {/* 主画布 */}
      <MochiCanvas className="w-full h-screen" />
    </div>
  );
}
