'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Suspense } from 'react'

// 动态导入 RaymarchingCanvas（禁用 SSR，因为需要 WebGL）
const RaymarchingCanvas = dynamic(() => import('@/components/RaymarchingCanvas'), { ssr: false })

export default function RaymarchingPage() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', background: '#000' }}>
      <Suspense fallback={<div style={{ padding: 20, color: '#fff' }}>Loading Raymarching…</div>}>
        <RaymarchingCanvas />
      </Suspense>

      {/* 返回按钮 */}
      <div style={{ position: 'absolute', bottom: 20, right: 20, zIndex: 1000 }}>
        <Link
          href="/"
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontSize: '14px',
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
        >
          返回首页
        </Link>
      </div>
    </div>
  )
}
