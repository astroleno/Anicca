import { normalizeSeedPerspective, type SeedPerspective } from "@/features/perspectives/model";

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

export type SeedColorPolarity = { hueShift: number; strength: number };

/** Use the saved reading, never the camera or the current framework. Opposite
 * ends rotate the hue in opposite directions within the original role family. */
export function seedColorPolarity(perspective: SeedPerspective | undefined): SeedColorPolarity | undefined {
  const axes = normalizeSeedPerspective(perspective)?.axes;
  if (!axes?.length) return undefined;
  let signed = 0, total = 0, strength = 0;
  for (const axis of [...axes].sort((a,b) => a.id.localeCompare(b.id))) {
    const poles = [axis.negative, axis.positive].sort();
    const hash = hashString(`${axis.id}|${poles.join("|")}`);
    const weight = .55 + (hash >>> 1) / 0x7fffffff * .45;
    const direction = (hash & 1 ? 1 : -1) * (axis.positive === poles[1] ? 1 : -1);
    signed += axis.value * weight * direction;
    total += Math.abs(axis.value) * weight;
    strength = Math.max(strength, Math.abs(axis.value));
  }
  return { hueShift: total ? 18 * signed / total * strength : 0, strength };
}

/** Low-chroma anchors preserve the established sketch palette. */
function seedPaletteColor(role: string, generation: number): [number, number, number] {
  const palettes: Record<string, [number, number, number]> = {
    thesis: [.82, .065, 35], antithesis: [.81, .052, 235], synthesis: [.82, .052, 160],
    user: [.85, .03, 300], growth: [.82, .045, 284], pending: [.86, .014, 305], neutral: [.83, .018, 284]
  };
  const [base, chroma, hue] = palettes[role] || palettes.neutral;
  const lightness = base + Math.min(5, Math.max(0, Number.isFinite(generation) ? generation : 0)) * .009;
  const a = chroma * Math.cos(hue * Math.PI / 180), b = chroma * Math.sin(hue * Math.PI / 180);
  const l = (lightness + .3963377774 * a + .2158037573 * b) ** 3;
  const m = (lightness - .1055613458 * a - .0638541728 * b) ** 3;
  const s = (lightness - .0894841775 * a - 1.291485548 * b) ** 3;
  const srgb = (v: number) => Math.min(1, Math.max(0, v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055));
  return [srgb(4.0767416621*l - 3.3077115913*m + .2309699292*s),
    srgb(-1.2684380046*l + 2.6097574011*m - .3413193965*s),
    srgb(-.0041960863*l - .7034186147*m + 1.707614701*s)];
}

export function rgbToHsl([r,g,b]: readonly number[]): [number,number,number] {
  const high = Math.max(r,g,b), low = Math.min(r,g,b), delta = high-low, lightness = (high+low)/2;
  if (delta < 1e-9) return [0,0,lightness];
  const hue = high === r ? ((g-b)/delta+6)%6 : high === g ? (b-r)/delta+2 : (r-g)/delta+4;
  return [hue*60, delta/(1-Math.abs(2*lightness-1)), lightness];
}

export function perceptualChroma(rgb: readonly number[]): number {
  const [r,g,b] = rgb.map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  const l = Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b);
  const m = Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b);
  const s = Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return Math.hypot(1.9779984951*l-2.428592205*m+.4505937099*s, .0259040371*l+.7827717662*m-.808675766*s);
}

export function semanticSeedHsl(role: string, generation = 0, polarity?: SeedColorPolarity): [number,number,number] {
  const [baseHue,baseSaturation,lightness] = rgbToHsl(seedPaletteColor(role,generation));
  if (!polarity) return [baseHue,baseSaturation,lightness];
  const strength = Number.isFinite(polarity.strength) ? Math.max(0,Math.min(1,polarity.strength)) : 0;
  const shift = Number.isFinite(polarity.hueShift) ? Math.max(-18,Math.min(18,polarity.hueShift)) : 0;
  const hue = (baseHue+shift+360)%360;
  let saturation = baseSaturation*(.65+.35*strength);
  // HSL is the semantic control; perceived chroma remains bounded so even a
  // strong pole cannot turn the soft sketch material into a vivid signal.
  if (perceptualChroma(hslToRgb(hue,saturation,lightness)) > .07) {
    let low = 0, high = saturation;
    for (let i=0;i<10;i++) { const middle=(low+high)/2;
      if (perceptualChroma(hslToRgb(hue,middle,lightness))>.07) high=middle; else low=middle;
    }
    saturation=low;
  }
  return [hue,saturation,lightness];
}

const semanticColors = new Map<string,[number,number,number]>();
export function semanticSeedColor(role: string, generation = 0, polarity?: SeedColorPolarity): [number,number,number] {
  const key = `${role}:${generation}:${polarity?.hueShift ?? "legacy"}:${polarity?.strength ?? ""}`;
  let color = semanticColors.get(key);
  if (!color) {
    color = polarity ? hslToRgb(...semanticSeedHsl(role,generation,polarity)) : seedPaletteColor(role,generation);
    if (semanticColors.size >= 512) semanticColors.delete(semanticColors.keys().next().value!);
    semanticColors.set(key,color);
  }
  return [...color];
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

/** Choose ink against the actual premultiplied canvas, including its ground. */
export function captionInk(samples: readonly (readonly number[])[], ground: readonly number[] = [248,247,249]): string {
  const luminance = (rgb: readonly number[]) => rgb.map(value => {
    const channel = value/255;
    return channel <= .04045 ? channel/12.92 : ((channel+.055)/1.055)**2.4;
  }).reduce((sum,value,index) => sum+value*[.2126,.7152,.0722][index],0);
  const contrast = (a: number,b: number) => (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  const backgrounds = samples.map(sample => luminance(ground.map((channel,index) =>
    Math.min(255,sample[index]+channel*(1-sample[3]/255)))));
  const dark = luminance([48,42,66]), light = luminance([252,251,255]);
  const score = (ink: number) => Math.min(...backgrounds.map(background => contrast(ink,background)));
  return backgrounds.length && score(light)>score(dark) ? "#fcfbff" : "#302a42";
}
