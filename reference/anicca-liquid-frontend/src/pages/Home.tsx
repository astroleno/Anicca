import { useEffect, useRef, useState } from 'react'
import { MAX_SEEDS, World } from '../dialectic/world'
import { SketchRenderer } from '../dialectic/renderer'

const KIND_LABEL = { thesis: '正', antithesis: '反', synthesis: '合' } as const

const SERIF = '"Songti SC", "Noto Serif SC", "STSong", "SimSun", serif'
const INK = 'rgba(48, 42, 66, 0.82)'

/** StrictMode mounts twice; the sketch engine owns its own rAF loop and
 *  GL context, so only ever attach one renderer per canvas element. */
const attachedCanvases = new WeakSet<HTMLCanvasElement>()

export default function Home() {
  const worldRef = useRef<World | null>(null)
  if (!worldRef.current) worldRef.current = new World()
  const world = worldRef.current

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelRefs = useRef(new Map<string, HTMLDivElement>())

  const [tick, setTick] = useState(0)
  const [input, setInput] = useState('')
  const [hint, setHint] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const hintTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    world.onStructure = () => setTick((t) => t + 1)
    world.onHint = (msg) => {
      setHint(msg)
      window.clearTimeout(hintTimer.current)
      hintTimer.current = window.setTimeout(() => setHint(''), 3200)
    }
    return () => {
      world.onStructure = () => {}
      world.onHint = () => {}
    }
  }, [world])

  // physics + label tracking loop; the sketch engine renders on its own loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!attachedCanvases.has(canvas)) {
      attachedCanvases.add(canvas)
      try {
        new SketchRenderer(canvas, world)
      } catch {
        setHint('当前浏览器不支持 WebGL2')
      }
    }

    if (
      new URLSearchParams(window.location.search).has('demo') &&
      world.seeds.length === 0
    ) {
      world.spawnDemo(window.innerWidth, window.innerHeight)
    }

    const onMove = (e: PointerEvent) => world.pointerMove(e.clientX, e.clientY)
    const onUp = () => world.pointerUp()
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      world.update(dt, window.innerWidth, window.innerHeight)
      for (const s of world.seeds) {
        const el = labelRefs.current.get(s.id)
        if (el) el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`
      }
      canvas.style.cursor = world.dragging ? 'grabbing' : world.hovered ? 'grab' : 'default'
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [world])

  const submit = () => {
    if (world.addIdea(input)) setInput('')
  }

  const startEdit = (id: string) => {
    const s = world.seeds.find((v) => v.id === id)
    if (!s) return
    setEditing(id)
    setEditText(s.text)
  }

  const commitEdit = () => {
    if (editing) world.setText(editing, editText)
    setEditing(null)
  }

  const editingSeed = editing ? world.seeds.find((s) => s.id === editing) : null

  return (
    <div className="fixed inset-0 overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={(e) => {
          world.pointerDown(e.clientX, e.clientY)
        }}
        onDoubleClick={(e) => {
          const hit = world.hitTest(e.clientX, e.clientY)
          if (hit) startEdit(hit.id)
        }}
      />

      {/* header */}
      <header className="pointer-events-none absolute left-7 top-6">
        <h1
          className="text-xl tracking-[0.18em] text-[#3a3450]/85"
          style={{ fontFamily: SERIF }}
        >
          anicca · 正反合
        </h1>
        <p className="mt-1.5 text-xs tracking-wide text-[#3a3450]/45">
          拖拽两颗种子相触，合而为一 · 双击可改写
        </p>
      </header>

      {/* counter + clear */}
      <div className="absolute right-7 top-7 flex items-center gap-4 text-xs text-[#3a3450]/40">
        {world.seeds.length > 0 && <span>{world.seeds.length} / {MAX_SEEDS} 颗种子</span>}
        {world.seeds.length > 0 && (
          <button
            onClick={() => world.clear()}
            className="pointer-events-auto text-[#3a3450]/40 transition-colors hover:text-[#3a3450]/75 hover:underline underline-offset-4"
          >
            清空
          </button>
        )}
      </div>

      {/* empty state */}
      {world.seeds.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-[38%] text-center">
          <p className="text-sm tracking-[0.3em] text-[#3a3450]/35" style={{ fontFamily: SERIF }}>
            在下方输入一个想法，看它分裂为正与反
          </p>
        </div>
      )}

      {/* blob labels */}
      <div className="pointer-events-none absolute inset-0" key={tick}>
        {world.seeds.map((s) => (
          <div
            key={s.id}
            ref={(el) => {
              if (el) labelRefs.current.set(s.id, el)
              else labelRefs.current.delete(s.id)
            }}
            className="absolute left-0 top-0 w-40 text-center will-change-transform"
            style={{ transform: `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)` }}
          >
            <div
              className="text-[11px] tracking-[0.35em]"
              style={{ fontFamily: SERIF, color: INK, textShadow: '0 1px 10px rgba(255,255,255,0.85)' }}
            >
              {KIND_LABEL[s.kind]}
            </div>
            <div
              className="mt-1 truncate text-sm font-medium"
              style={{
                color: INK,
                textShadow:
                  '0 1px 8px rgba(255,255,255,0.9), 0 0 3px rgba(255,255,255,0.95)',
              }}
            >
              {s.text}
            </div>
          </div>
        ))}
      </div>

      {/* inline editor */}
      {editingSeed && (
        <input
          autoFocus
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape') setEditing(null)
          }}
          className="absolute z-20 w-48 rounded-full bg-white/70 px-4 py-2 text-center text-sm text-[#3a3450] shadow-lg outline-none backdrop-blur-md"
          style={{
            left: editingSeed.x,
            top: editingSeed.y,
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}

      {/* hint toast */}
      {hint && (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 text-center text-xs text-[#3a3450]/55">
          {hint}
        </div>
      )}

      {/* input bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="absolute bottom-8 left-1/2 z-10 flex w-[min(560px,86vw)] -translate-x-1/2 items-center gap-2 rounded-full bg-white/40 py-2 pl-6 pr-2 shadow-[0_8px_32px_rgba(120,110,160,0.18)] backdrop-blur-xl"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入一个想法，让它分裂为正与反…"
          maxLength={40}
          className="flex-1 bg-transparent text-sm text-[#3a3450] outline-none placeholder:text-[#3a3450]/35"
        />
        <button
          type="submit"
          className="rounded-full px-4 py-2 text-sm text-[#3a3450]/60 transition-colors hover:bg-white/50 hover:text-[#3a3450]"
          style={{ fontFamily: SERIF }}
        >
          分裂
        </button>
      </form>
    </div>
  )
}
