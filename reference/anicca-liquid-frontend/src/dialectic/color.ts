/** FNV-1a hash so each idea text gets a stable hue jitter. */
export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** h in degrees [0,360), s/l in [0,1] → rgb each in [0,1]. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = l - c / 2
  return [r + m, g + m, b + m]
}

export function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** 正 — warm saturated vermilion/coral family, hue jittered by the idea text. */
export function thesisColor(text: string): [number, number, number] {
  const h = hashString(text)
  return hslToRgb(8 + (h % 32), 0.86, 0.52)
}

/** 反 — contrasting cool teal/indigo family, jittered differently. */
export function antithesisColor(text: string): [number, number, number] {
  const h = hashString(text)
  return hslToRgb(185 + ((h >>> 8) % 60), 0.8, 0.48)
}

/** 合 — blend parents, then re-saturate so warm+cool doesn't turn muddy. */
export function synthesisColor(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  const m = mixRgb(a, b, 0.5)
  const luma = 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]
  const boost = 1.5
  return [
    Math.min(1, Math.max(0, luma + (m[0] - luma) * boost)),
    Math.min(1, Math.max(0, luma + (m[1] - luma) * boost)),
    Math.min(1, Math.max(0, luma + (m[2] - luma) * boost)),
  ]
}
