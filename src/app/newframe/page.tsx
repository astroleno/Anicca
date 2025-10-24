'use client'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'

const MetaballCanvas = dynamic(() => import('@/components/MetaballCanvas'), { ssr: false })

export default function Page() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <Suspense fallback={<div style={{padding:20}}>Loading WebGPU…</div>}>
        <MetaballCanvas />
      </Suspense>
    </div>
  )
}