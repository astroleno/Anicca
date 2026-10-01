/** FNV-1a keeps each semantic seed's tint stable across sessions. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = (((hue % 360) + 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime < 1) [red, green, blue] = [chroma, x, 0];
  else if (huePrime < 2) [red, green, blue] = [x, chroma, 0];
  else if (huePrime < 3) [red, green, blue] = [0, chroma, x];
  else if (huePrime < 4) [red, green, blue] = [0, x, chroma];
  else if (huePrime < 5) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];

  const offset = lightness - chroma / 2;
  return [red + offset, green + offset, blue + offset];
}

export function mixRgb(
  left: [number, number, number],
  right: [number, number, number],
  amount: number
): [number, number, number] {
  return [
    left[0] + (right[0] - left[0]) * amount,
    left[1] + (right[1] - left[1]) * amount,
    left[2] + (right[2] - left[2]) * amount
  ];
}

export function thesisColor(key: string): [number, number, number] {
  const hash = hashString(key);
  return hslToRgb(8 + (hash % 32), 0.86, 0.52);
}

export function antithesisColor(key: string): [number, number, number] {
  const hash = hashString(key);
  return hslToRgb(185 + ((hash >>> 8) % 60), 0.8, 0.48);
}

export function synthesisColor(
  thesis: [number, number, number],
  antithesis: [number, number, number]
): [number, number, number] {
  const mixed = mixRgb(thesis, antithesis, 0.5);
  const luma = 0.299 * mixed[0] + 0.587 * mixed[1] + 0.114 * mixed[2];
  const boost = 1.5;
  return [
    Math.min(1, Math.max(0, luma + (mixed[0] - luma) * boost)),
    Math.min(1, Math.max(0, luma + (mixed[1] - luma) * boost)),
    Math.min(1, Math.max(0, luma + (mixed[2] - luma) * boost))
  ];
}
