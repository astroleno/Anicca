'use client';

import React, { useState } from 'react';
import MetaballCanvas from '@/components/MetaballCanvas';

export default function MetaballPage() {

  return (
    <div className="min-h-screen bg-black">
      {/* 简化的标题 */}
      <div className="absolute top-4 left-4 z-10 text-white">
        <div className="bg-gray-900/80 backdrop-blur-sm rounded-xl p-4">
          <h1 className="text-xl font-bold text-purple-200">Metaball</h1>
          <p className="text-xs text-gray-300">鼠标移动控制</p>
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
      <MetaballCanvas className="w-full h-screen" />
    </div>
  );
}
