// Historical max-chroma candidate for the visual comparison.
const NEAR_GRAY_CHROMA = .02;
const normalizeHue = angle => (angle % 360 + 360) % 360;
const linear = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
const encode = value => value <= .0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - .055;

export function rgbToOklch(rgb) {
  const [r, g, b] = rgb.map(linear);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  const lightness = .2104542553 * l + .793617785 * m - .0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s;
  const beta = .0259040371 * l + .7827717662 * m - .808675766 * s;
  return { lightness, chroma: Math.hypot(a, beta), hue: normalizeHue(Math.atan2(beta, a) * 180 / Math.PI) };
}

function oklchToRgb(lightness, chroma, hue) {
  const angle = (hue ?? 0) * Math.PI / 180;
  const a = chroma * Math.cos(angle), beta = chroma * Math.sin(angle);
  const l = (lightness + .3963377774 * a + .2158037573 * beta) ** 3;
  const m = (lightness - .1055613458 * a - .0638541728 * beta) ** 3;
  const s = (lightness - .0894841775 * a - 1.291485548 * beta) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + .2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
    -.0041960863 * l - .7034186147 * m + 1.707614701 * s
  ].map(encode);
}

export function oklchPreview(left, right) {
  const [a, b] = [rgbToOklch(left), rgbToOklch(right)];
  const lightness = (a.lightness + b.lightness) / 2;
  const chroma = Math.max(a.chroma, b.chroma);
  const nearGray = [a, b].filter(color => color.chroma < NEAR_GRAY_CHROMA);
  let hue = null;
  if (nearGray.length === 1) hue = (a === nearGray[0] ? b : a).hue;
  if (!nearGray.length) {
    const [first, second] = [a.hue, b.hue].sort((x, y) => x - y);
    const delta = normalizeHue(second - first + 180) - 180;
    hue = normalizeHue(first + delta / 2);
  }
  // Preserve lightness and meaningful hue, backing off only chroma when the
  // target would exceed the display's sRGB gamut.
  const inGamut = rgb => rgb.every(value => value >= -1e-8 && value <= 1 + 1e-8);
  let applied = hue === null ? 0 : chroma;
  if (!inGamut(oklchToRgb(lightness, applied, hue))) {
    let low = 0, high = applied;
    for (let step = 0; step < 24; step++) {
      const mid = (low + high) / 2;
      if (inGamut(oklchToRgb(lightness, mid, hue))) low = mid;
      else high = mid;
    }
    applied = low;
  }
  const rgb = oklchToRgb(lightness, applied, hue).map(value => Math.max(0, Math.min(1, value)));
  return { rgb, lightness, hue, sourceChroma: chroma, appliedChroma: applied, ignoredHueBelowChroma: NEAR_GRAY_CHROMA };
}
