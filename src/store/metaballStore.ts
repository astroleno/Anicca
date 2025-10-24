import { create } from 'zustand'

// 基础 2D 球类型（屏幕空间 NDC 坐标）
export type Ball2D = {
  id: number
  parent: number
  pos: [number, number]   // NDC [-1, 1]
  radius: number          // 屏幕空间半径（与分辨率无关）
  level: number
  label?: string
  active?: boolean
}

// Store 接口：兼容现有最小集，并扩展分裂/合并 API
type State = {
  balls: Ball2D[]
  nextId: number
  setPos: (id: number, pos: [number, number]) => void
  setLabel: (id: number, label: string) => void
  createBall: (pos: [number, number], radius: number, label?: string) => number
  removeBall: (id: number) => void
  split: (id: number) => void
  merge: (a: number, b: number) => void
}

// 初始化为"中心 + 6 个子球"的简单布局
function makeInitialBalls(): Ball2D[] {
  const balls: Ball2D[] = []
  const root: Ball2D = { id: 0, parent: -1, pos: [0, 0], radius: 0.35, level: 0, label: 'Root', active: true }
  balls.push(root)

  const alpha = 0.7
  const ringRadius = 0.15  // 减小半径，确保球都在中心区域
  for (let i = 1; i <= 6; i++) {
    const theta = (i / 6) * Math.PI * 2
    balls.push({
      id: i,
      parent: 0,
      pos: [Math.cos(theta) * ringRadius, Math.sin(theta) * ringRadius],
      radius: root.radius * Math.pow(alpha, 1 + (i % 2)),
      level: 1,
      label: `Child${i}`,
      active: true
    })
  }
  console.log('初始球数量:', balls.length, balls.map(b => ({ id: b.id, pos: b.pos, radius: b.radius })))
  return balls
}

// 导出可用的 Zustand store（向下兼容 balls / setPos）
export const useMetaballStore = create<State>((set, get) => ({
  balls: makeInitialBalls(),
  nextId: 7,

  setPos: (id, pos) => set((s) => ({
    balls: s.balls.map(b => (b.id === id ? { ...b, pos } : b))
  })),

  setLabel: (id, label) => set((s) => ({
    balls: s.balls.map(b => (b.id === id ? { ...b, label } : b))
  })),

  createBall: (pos, radius, label) => {
    const id = get().nextId
    set((s) => ({
      balls: [...s.balls, { id, parent: -1, pos, radius, level: 0, label: label || `Ball${id}`, active: true }],
      nextId: s.nextId + 1
    }))
    return id
  },

  removeBall: (id) => set((s) => ({
    balls: s.balls.filter(b => b.id !== id)
  })),

  split: (id) => {
    const s = get()
    const b = s.balls.find(x => x.id === id)
    if (!b) return
    const ratio = 0.5
    const r1 = b.radius * Math.sqrt(ratio)
    const r2 = b.radius * Math.sqrt(1 - ratio)
    const dir: [number, number] = [1, 0]
    const dist = 0.1
    const id1 = s.nextId
    const id2 = s.nextId + 1
    const child1: Ball2D = { id: id1, parent: id, pos: [b.pos[0] + dir[0]*dist, b.pos[1] + dir[1]*dist], radius: r1, level: b.level+1, label: 'Pos', active: true }
    const child2: Ball2D = { id: id2, parent: id, pos: [b.pos[0] - dir[0]*dist, b.pos[1] - dir[1]*dist], radius: r2, level: b.level+1, label: 'Neg', active: true }
    set({ balls: [...s.balls, child1, child2], nextId: s.nextId + 2 })
  },

  merge: (a, b) => {
    const s = get()
    const A = s.balls.find(x => x.id === a)
    const B = s.balls.find(x => x.id === b)
    if (!A || !B) {
      console.log('合并失败: 找不到球', { a, b, A, B })
      return
    }
    console.log('合并前:', s.balls.length, '个球')
    const wa = A.radius*A.radius, wb = B.radius*B.radius
    const pos: [number, number] = [ (A.pos[0]*wa + B.pos[0]*wb)/(wa+wb), (A.pos[1]*wa + B.pos[1]*wb)/(wa+wb) ]
    const radius = Math.sqrt(wa + wb)
    const idNew = s.nextId
    const C: Ball2D = { id: idNew, parent: -1, pos, radius, level: Math.max(A.level, B.level), label: `${A.label || A.id}+${B.label || B.id}`, active: true }
    const newBalls = s.balls.filter(x => x.id !== a && x.id !== b).concat([C])
    console.log('合并后:', newBalls.length, '个球', { 新球: C })
    set({ balls: newBalls, nextId: s.nextId + 1 })
  }
}))
