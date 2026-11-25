import { oklchPreview, rgbToOklch } from "./oklch-preview.mjs";

const positive = [.944663383, .735338114, .680971037];
const negative = [.653844533, .803308108, .894368144];
const otherPositive = [.956568374, .746622536, .692084463];
const bytes = rgb => rgb.map(value => Math.round(value * 255));

it("matches the short arc and retains the stronger source's chroma", () => {
  const candidate = oklchPreview(positive, negative);
  expect(candidate).toEqual(oklchPreview(negative, positive));
  expect(candidate.hue).toBeCloseTo(315, 3);
  expect(candidate.lightness).toBeCloseTo(.833, 6);
  expect(candidate.appliedChroma).toBeCloseTo(.065, 6);
  expect(bytes(candidate.rgb)).toEqual([217, 188, 230]);
  expect(bytes(oklchPreview(positive, otherPositive).rgb)).toEqual([242, 189, 175]);
});

it("ignores unstable hue under the near-gray chroma cutoff", () => {
  const gray = [.81, .81, .86];
  const candidate = oklchPreview(positive, gray);
  expect(rgbToOklch(gray).chroma).toBeLessThan(.02);
  expect(candidate.hue).toBe(rgbToOklch(positive).hue);
  expect(candidate).toEqual(oklchPreview(gray, positive));
  expect(oklchPreview(gray, [.5, .5, .5])).toMatchObject({ hue: null, appliedChroma: 0 });
});

it("backs off chroma to the sRGB boundary while preserving lightness and hue", () => {
  const candidate = oklchPreview([1, 0, 0], [0, 1, 0]);
  expect(candidate.appliedChroma).toBeLessThan(candidate.sourceChroma);
  expect(candidate.rgb.every(channel => channel >= 0 && channel <= 1)).toBe(true);
  expect(Math.min(...candidate.rgb)).toBeCloseTo(0, 5);
  expect(rgbToOklch(candidate.rgb)).toMatchObject({
    lightness: expect.closeTo(candidate.lightness, 6),
    hue: expect.closeTo(candidate.hue, 5)
  });
});
