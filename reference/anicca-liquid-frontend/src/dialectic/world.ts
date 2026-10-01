import { antithesisColor, synthesisColor, thesisColor } from './color'

export type SeedKind = 'thesis' | 'antithesis' | 'synthesis'

export interface Seed {
  id: string
  text: string
  kind: SeedKind
  /** rgb, each channel 0..1 — the dense core colour. */
  color: [number, number, number]
  /** position in CSS px, origin top-left. */
  x: number
  y: number
  vx: number
  vy: number
  r: number
  /** jelly wobble: phase is fixed per seed, amp is smoothed toward ampTarget. */
  phase: number
  amp: number
  ampTarget: number
  /** squash & stretch spring (amount, velocity, direction angle in rad). */
  squash: number
  squashVel: number
  squashAngle: number
  /** set while this seed is being absorbed into a merge. */
  merge: MergeState | null
  createdAt: number
}

interface MergeState {
  mx: number
  my: number
  t: number
  dur: number
  baseR: number
}

const STORAGE_KEY = 'anicca.seeds.v1'
export const MAX_SEEDS = 32

const AMP_LERP = 0.08 // viscous smoothing, per frame at 60fps
let uid = 0
const nextId = () => `s${Date.now().toString(36)}-${(uid++).toString(36)}`

interface StoredSeed {
  id: string
  text: string
  kind: SeedKind
  color: [number, number, number]
  x: number
  y: number
  r: number
  createdAt: number
}

export class World {
  seeds: Seed[] = []
  dragging: Seed | null = null
  hovered: Seed | null = null
  pointerX = -9999
  pointerY = -9999

  onStructure: () => void = () => {}
  onHint: (msg: string) => void = () => {}

  private pendingMerge: { a: Seed; b: Seed } | null = null
  private width = 0
  private height = 0

  constructor() {
    this.load()
  }

  // ---------- structural ops ----------

  /** Split an idea into 正 + 反 bursting from screen center. Returns false when full. */
  addIdea(raw: string): boolean {
    const text = raw.trim().slice(0, 40)
    if (!text) return false
    if (this.seeds.length + 2 > MAX_SEEDS) {
      this.onHint('种子太多了 —— 先拖拽合并，或清空再来')
      return false
    }
    const cx = this.width / 2 || 400
    const cy = this.height * 0.42 || 300
    const angle = Math.random() * Math.PI * 2
    const speed = 340 + Math.random() * 120
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    const baseR = 84 + Math.random() * 14

    const mk = (kind: SeedKind, sign: 1 | -1): Seed => ({
      id: nextId(),
      text,
      kind,
      color: kind === 'thesis' ? thesisColor(text) : antithesisColor(text),
      x: cx + dx * sign * 2,
      y: cy + dy * sign * 2,
      vx: dx * speed * sign,
      vy: dy * speed * sign,
      r: baseR * (kind === 'thesis' ? 1 : 0.94),
      phase: Math.random() * Math.PI * 2,
      amp: 0.22, // born shivering, settles down
      ampTarget: 0.03,
      squash: 0.45,
      squashVel: 0,
      squashAngle: angle,
      merge: null,
      createdAt: Date.now(),
    })

    this.seeds.push(mk('thesis', 1), mk('antithesis', -1))
    this.save()
    this.onStructure()
    return true
  }

  clear(): void {
    this.seeds = []
    this.dragging = null
    this.hovered = null
    this.pendingMerge = null
    this.save()
    this.onStructure()
  }

  setText(id: string, text: string): void {
    const s = this.seeds.find((v) => v.id === id)
    if (!s) return
    s.text = text.trim().slice(0, 40) || s.text
    this.save()
    this.onStructure()
  }

  /** Dev-only (?demo): seed a 正/反 pair + a 合 + one extra 正 near center. */
  spawnDemo(width: number, height: number): void {
    if (this.seeds.length > 0) return
    const cx = width / 2
    const cy = height * 0.45
    const t1 = '自由与秩序'
    const t2 = '瞬间与永恒'
    const mk = (
      kind: SeedKind,
      text: string,
      color: [number, number, number],
      x: number,
      y: number,
      r: number,
    ): Seed => ({
      id: nextId(),
      text,
      kind,
      color,
      x,
      y,
      vx: 0,
      vy: 0,
      r,
      phase: Math.random() * Math.PI * 2,
      amp: 0.03,
      ampTarget: 0.03,
      squash: 0,
      squashVel: 0,
      squashAngle: 0,
      merge: null,
      createdAt: Date.now(),
    })
    const warm = thesisColor(t1)
    const cool = antithesisColor(t1)
    this.seeds.push(
      mk('thesis', t1, warm, cx - 150, cy - 30, 95),
      mk('antithesis', t1, cool, cx + 140, cy + 20, 90),
      mk('synthesis', `${t1} · ${t2}`, synthesisColor(warm, cool), cx + 10, cy + 190, 120),
      mk('thesis', t2, thesisColor(t2), cx + 260, cy - 120, 78),
    )
    this.save()
    this.onStructure()
  }

  hitTest(x: number, y: number): Seed | null {
    let best: Seed | null = null
    let bestScore = Infinity
    for (const s of this.seeds) {
      if (s.merge) continue
      const d = Math.hypot(x - s.x, y - s.y)
      if (d < s.r * 1.3) {
        const score = d / s.r
        if (score < bestScore) {
          bestScore = score
          best = s
        }
      }
    }
    return best
  }

  // ---------- pointer ----------

  pointerDown(x: number, y: number): void {
    this.pointerX = x
    this.pointerY = y
    const hit = this.hitTest(x, y)
    if (hit) {
      this.dragging = hit
      hit.ampTarget = 0.22
    }
  }

  pointerMove(x: number, y: number): void {
    this.pointerX = x
    this.pointerY = y
  }

  pointerUp(): void {
    const s = this.dragging
    if (!s) return
    this.dragging = null
    s.ampTarget = 0.03
    // jelly rebound kick
    s.squashVel -= 4

    // merge if dropped inside another blob
    for (const other of this.seeds) {
      if (other === s || other.merge) continue
      const d = Math.hypot(s.x - other.x, s.y - other.y)
      if (d < other.r) {
        this.startMerge(s, other)
        return
      }
    }
  }

  // ---------- merge ----------

  private startMerge(a: Seed, b: Seed): void {
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    const dur = 0.45
    a.merge = { mx, my, t: 0, dur, baseR: a.r }
    b.merge = { mx, my, t: 0, dur, baseR: b.r }
    a.vx = a.vy = b.vx = b.vy = 0
    this.pendingMerge = { a, b }
  }

  private finalizeMerge(): void {
    const pm = this.pendingMerge
    if (!pm) return
    this.pendingMerge = null
    const { a, b } = pm
    const ma = a.merge
    const mb = b.merge
    if (!ma || !mb) return

    const r = Math.min(210, Math.cbrt(ma.baseR ** 3 + mb.baseR ** 3) * 0.9)
    const merged: Seed = {
      id: nextId(),
      text: `${a.text} · ${b.text}`.slice(0, 40),
      kind: 'synthesis',
      color: synthesisColor(a.color, b.color),
      x: ma.mx,
      y: ma.my,
      vx: (Math.random() - 0.5) * 60,
      vy: (Math.random() - 0.5) * 60,
      r,
      phase: Math.random() * Math.PI * 2,
      amp: 0.3, // born jiggling
      ampTarget: 0.03,
      squash: -0.35, // pop outward
      squashVel: 3,
      squashAngle: Math.random() * Math.PI,
      merge: null,
      createdAt: Date.now(),
    }
    this.seeds = this.seeds.filter((s) => s !== a && s !== b)
    this.seeds.push(merged)
    this.save()
    this.onStructure()
  }

  // ---------- simulation ----------

  update(dt: number, width: number, height: number): void {
    this.width = width
    this.height = height
    const f60 = dt * 60 // frames at 60fps, for frame-rate independent lerps

    // hover detection (skip while dragging)
    if (!this.dragging) {
      this.hovered = this.hitTest(this.pointerX, this.pointerY)
    } else {
      this.hovered = null
    }

    let needsFinalize = false

    for (const s of this.seeds) {
      // viscous wobble smoothing: curr = curr*0.92 + target*0.08
      const k = 1 - Math.pow(1 - AMP_LERP, f60)
      s.amp += (s.ampTarget - s.amp) * k

      if (s.merge) {
        const m = s.merge
        m.t += dt / m.dur
        const pull = Math.min(1, dt * 9)
        s.x += (m.mx - s.x) * pull
        s.y += (m.my - s.y) * pull
        s.r = m.baseR * (1 - 0.3 * Math.min(1, m.t))
        s.amp = 0.16
        if (m.t >= 1) needsFinalize = true
        continue
      }

      // amp targets
      if (this.dragging === s) s.ampTarget = 0.2
      else if (this.hovered === s) s.ampTarget = 0.15
      else s.ampTarget = 0.03

      // brownian drift
      const jitter = 42
      s.vx += (Math.random() - 0.5) * jitter * f60 * 0.08
      s.vy += (Math.random() - 0.5) * jitter * f60 * 0.08

      // soft wall repulsion
      const margin = s.r * 1.1
      const push = 26
      if (s.x < margin) s.vx += (margin - s.x) * push * dt
      if (s.x > width - margin) s.vx -= (s.x - (width - margin)) * push * dt
      if (s.y < margin) s.vy += (margin - s.y) * push * dt
      if (s.y > height - margin) s.vy -= (s.y - (height - margin)) * push * dt

      if (this.dragging === s) {
        // stiff spring toward pointer; lag creates stretch
        const stiff = 110
        s.vx += (this.pointerX - s.x) * stiff * dt
        s.vy += (this.pointerY - s.y) * stiff * dt
        const damp = Math.pow(0.78, f60)
        s.vx *= damp
        s.vy *= damp
      } else {
        const damp = Math.pow(0.955, f60)
        s.vx *= damp
        s.vy *= damp
      }

      const speed = Math.hypot(s.vx, s.vy)
      const maxSpeed = 1600
      if (speed > maxSpeed) {
        s.vx = (s.vx / speed) * maxSpeed
        s.vy = (s.vy / speed) * maxSpeed
      }

      s.x += s.vx * dt
      s.y += s.vy * dt

      // hard clamp on screen
      const rr = s.r * 0.45
      if (s.x < rr) {
        s.x = rr
        s.vx = Math.abs(s.vx) * 0.5
      }
      if (s.x > width - rr) {
        s.x = width - rr
        s.vx = -Math.abs(s.vx) * 0.5
      }
      if (s.y < rr) {
        s.y = rr
        s.vy = Math.abs(s.vy) * 0.5
      }
      if (s.y > height - rr) {
        s.y = height - rr
        s.vy = -Math.abs(s.vy) * 0.5
      }

      // squash spring: target from speed, underdamped for jelly rebound
      const squashTarget = Math.min(0.5, speed / 1000)
      const acc = (squashTarget - s.squash) * 150 - s.squashVel * 11
      s.squashVel += acc * dt
      s.squash += s.squashVel * dt
      if (speed > 30) s.squashAngle = Math.atan2(s.vy, s.vx)
    }

    if (needsFinalize) this.finalizeMerge()
  }

  // ---------- persistence ----------

  private save(): void {
    try {
      const data: StoredSeed[] = this.seeds
        .filter((s) => !s.merge)
        .map((s) => ({
          id: s.id,
          text: s.text,
          kind: s.kind,
          color: s.color,
          x: s.x,
          y: s.y,
          r: s.r,
          createdAt: s.createdAt,
        }))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      /* storage unavailable — non-fatal */
    }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const data = JSON.parse(raw) as StoredSeed[]
      if (!Array.isArray(data)) return
      this.seeds = data
        .filter((s) => s && typeof s.x === 'number' && typeof s.r === 'number')
        .slice(0, MAX_SEEDS)
        .map((s) => ({
          ...s,
          vx: 0,
          vy: 0,
          phase: Math.random() * Math.PI * 2,
          amp: 0.03,
          ampTarget: 0.03,
          squash: 0,
          squashVel: 0,
          squashAngle: 0,
          merge: null,
        }))
    } catch {
      /* corrupted state — start fresh */
    }
  }
}
