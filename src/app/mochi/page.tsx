'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import MochiCanvas from '@/components/archived/MochiCanvas';

export default function MochiPage() {
  const [showLabUi, setShowLabUi] = useState(false);

  useEffect(() => {
    setShowLabUi(new URLSearchParams(window.location.search).get('lab') === '1');
  }, []);

  return (
    <div className="min-h-screen bg-[#05090c]">
      {showLabUi ? (
        <div className="absolute top-4 left-4 z-10 text-white">
          <div className="max-w-sm rounded-[20px] border border-white/10 bg-[#071319]/80 p-6 backdrop-blur-sm">
            <h1 className="mb-3 text-2xl font-bold text-[#f2f7fa]">Mochi visual lab</h1>
            <p className="mb-4 text-sm text-[#dcebf2]/75">
              Shader Park 质感实验，默认成品视图不展示说明卡。
            </p>

            <div className="space-y-3">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-[#37d3ad]">交互说明</h3>
                <ul className="space-y-1 text-xs text-[#dcebf2]/72">
                  <li>鼠标悬停：激活效果</li>
                  <li>鼠标点击：旋转交互</li>
                  <li>拖拽：位移效果</li>
                </ul>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-[#e6be62]">技术栈</h3>
                <p className="text-xs text-[#dcebf2]/72">Shader Park + React</p>
                <p className="text-xs text-[#dcebf2]/72">WebGL 着色器渲染</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showLabUi ? (
        <div className="absolute bottom-4 left-4 z-10 text-white">
          <div className="rounded-lg bg-[#071319]/60 p-3 backdrop-blur-sm">
            <div className="text-xs text-[#dcebf2]/70">
              <div>技术栈: Shader Park + React</div>
              <div>渲染: WebGL 着色器</div>
            </div>
          </div>
        </div>
      ) : null}

      {showLabUi ? (
        <div className="absolute bottom-4 right-4 z-10">
        <Link
          href="/dialogue"
          className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white backdrop-blur-sm transition-colors hover:bg-white/20"
        >
          回到 /dialogue
        </Link>
        </div>
      ) : null}

      {/* 主画布 */}
      <MochiCanvas className="w-full h-screen" />
    </div>
  );
}
