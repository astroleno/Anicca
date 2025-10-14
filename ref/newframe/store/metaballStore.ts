import { create } from 'zustand'

export type Ball2D = {
  id: number
  parent: number
  pos: [number, number]   // 屏幕空间归一化 [-1,1]
  radius: number          // 屏幕空间半径（与分辨率无关）
  level: number
}

type State = {
  balls: Ball2D[]
  setPos: (id: number, pos: [number, number]) => void
}

const makeTree = (): Ball2D[] => {
  // 7层上限，先给一个简化树（根 + 几个子）
  const balls: Ball2D[] = []
  const alpha = 0.7
  const root: Ball2D = { id: 0, parent: -1, pos: [0, 0], radius: 0.35, level: 0 }
  balls.push(root)
  // 先放 1 层子节点（演示融合效果），后续你可扩到 255 个
  for (let i = 1; i <= 6; i++) {
    const theta = (i / 6) * Math.PI * 2
    const r = 0.22
    balls.push({
      id: i,
      parent: 0,
      pos: [Math.cos(theta) * r, Math.sin(theta) * r],
      radius: root.radius * Math.pow(alpha, 1 + (i % 2)),
      level: 1
    })
  }
  return balls
}

export const useMetaballStore = create<State>((set) => ({
  balls: makeTree(),
  setPos: (id, pos) => set((s) => ({
    balls: s.balls.map(b => (b.id === id ? { ...b, pos } : b))
  }))
}))