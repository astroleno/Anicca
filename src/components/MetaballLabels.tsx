'use client'

import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useMetaballStore } from '@/store/metaballStore'

/** Only membership changes go through React; pointer updates move existing labels. */
export default function MetaballLabels({ highlighted, onSelect }: {
  highlighted: number | null
  onSelect?: (id: number) => void
}) {
  const ids = useMetaballStore(useShallow(s => s.balls.filter(b => b.active !== false).map(b => b.id)))
  const layer = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = layer.current
    if (!root) return
    let width = root.clientWidth, height = root.clientHeight
    let frame = 0
    const paint = () => {
      frame = 0
      for (const ball of useMetaballStore.getState().balls) {
        const label = root.querySelector<HTMLElement>(`[data-ball-id="${ball.id}"]`)
        if (label) label.style.transform = `translate(${(ball.pos[0] + 1) * .5 * width - 20}px, ${(1 - ball.pos[1]) * .5 * height - 10}px)`
      }
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint) }
    const observer = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width
      height = entry.contentRect.height
      schedule()
    })
    observer.observe(root)
    const unsubscribe = useMetaballStore.subscribe(schedule)
    paint()
    return () => { observer.disconnect(); unsubscribe(); cancelAnimationFrame(frame) }
  }, [ids])
  return <div ref={layer} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
    {ids.map(id => <button key={id} data-ball-id={id} onClick={() => onSelect?.(id)}
      aria-label={`球体 ${id}`} tabIndex={onSelect ? 0 : -1}
      style={{ position: 'absolute', left: 0, top: 0, width: 40, height: 20,
        background: 'rgba(255,255,255,.9)', color: '#333', borderRadius: 4,
        border: highlighted === id ? '2px solid #0af' : '1px solid rgba(0,0,0,.2)',
        pointerEvents: onSelect ? 'auto' : 'none', fontSize: 12, zIndex: 2 }}
    >{id}</button>)}
  </div>
}
