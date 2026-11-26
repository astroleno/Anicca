import {captionInk,seedColorPolarity,semanticSeedColor,semanticSeedHsl,perceptualChroma} from "./color";
import {annotatePerspective,defaultThinkingSpace} from "@/features/perspectives/model";
import { mixSemanticSeedColors, rgbToOklch } from "./color";

describe("semantic synthesis colors", () => {
  const positive = semanticSeedColor("thesis", 2);
  const negative = semanticSeedColor("antithesis", 2);
  const neutral = semanticSeedColor("neutral", 1);
  const otherGray: [number, number, number] = [.6605624647455958, .6767776889602556, .6371068378783511];

  it("averages unequal source chromas and takes the shorter hue arc", () => {
    const [a, b] = [positive, negative].map(rgbToOklch);
    const mixed = mixSemanticSeedColors(positive, negative);
    const color = rgbToOklch(mixed);
    expect(mixed).toEqual(mixSemanticSeedColors(negative, positive));
    expect(color.lightness).toBeCloseTo((a.lightness + b.lightness) / 2, 7);
    expect(color.chroma).toBeCloseTo(.0585, 7);
    expect(color.chroma).toBeLessThan(Math.max(a.chroma, b.chroma));
    expect(color.hue).toBeCloseTo(315, 3);
    expect(rgbToOklch(mixSemanticSeedColors(positive, semanticSeedColor("thesis", 3))).hue).toBeCloseTo(35, 3);
  });

  it("uses the colorful source hue for one near gray and hue zero for two", () => {
    const a = rgbToOklch(positive), b = rgbToOklch(neutral);
    const blend = mixSemanticSeedColors(positive, neutral);
    expect(blend).toEqual(mixSemanticSeedColors(neutral, positive));
    expect(rgbToOklch(blend).hue).toBeCloseTo(a.hue, 3);
    expect(rgbToOklch(blend).chroma).toBeCloseTo((a.chroma + b.chroma) / 2, 7);

    const grays = mixSemanticSeedColors(neutral, otherGray);
    const color = rgbToOklch(grays);
    expect(grays).toEqual(mixSemanticSeedColors(otherGray, neutral));
    expect(Math.min(color.hue, 360 - color.hue)).toBeLessThan(.001);
    expect(color.chroma).toBeCloseTo((b.chroma + rgbToOklch(otherGray).chroma) / 2, 7);
  });

  it("wraps across hue zero and picks the same midpoint for opposite hues in either order", () => {
    const acrossZeroA: [number, number, number] = [.7808556032120377, .5762815697959683, .6694981015573821]; // 350°
    const acrossZeroB: [number, number, number] = [.8397610358964608, .5526885838656544, .5946699969221458]; // 10°
    const wrapped = mixSemanticSeedColors(acrossZeroA, acrossZeroB);
    expect(wrapped).toEqual(mixSemanticSeedColors(acrossZeroB, acrossZeroA));
    const { hue } = rgbToOklch(wrapped);
    expect(Math.min(hue, 360 - hue)).toBeLessThan(.001);

    const oppositeA: [number, number, number] = [.8376007414942551, .5700763664564942, .47683310261516715]; // 40°
    const oppositeB: [number, number, number] = [.3650575517132164, .6977511808558743, .7984125842873436]; // 220°
    const opposite = mixSemanticSeedColors(oppositeA, oppositeB);
    expect(opposite).toEqual(mixSemanticSeedColors(oppositeB, oppositeA));
    expect(rgbToOklch(opposite).hue).toBeCloseTo(130, 3);
  });

  it("reduces only chroma at the gamut boundary", () => {
    const red: [number, number, number] = [1, 0, 0], green: [number, number, number] = [0, 1, 0];
    const a = rgbToOklch(red), b = rgbToOklch(green);
    const mixed = mixSemanticSeedColors(red, green);
    const color = rgbToOklch(mixed);
    expect(mixed).toEqual(mixSemanticSeedColors(green, red));
    expect(mixed.every(channel => channel >= 0 && channel <= 1)).toBe(true);
    expect(Math.min(...mixed)).toBeCloseTo(0, 5);
    expect(color.chroma).toBeLessThan((a.chroma + b.chroma) / 2);
    expect(color.lightness).toBeCloseTo((a.lightness + b.lightness) / 2, 7);
    expect(color.hue).toBeCloseTo((a.hue + b.hue) / 2, 4);
  });
});

it("uses dark ink on transparent canvas composited over the stage ground",()=>{
  expect(captionInk([[0,0,0,0]])).toBe("#302a42");
});

it("uses clear light ink when a merged dark surface passes under a caption",()=>{
  expect(captionInk([[20,15,35,255],[35,20,50,255],[40,25,45,255]])).toBe("#fcfbff");
});

it("accounts for premultiplied alpha instead of treating faint dark pixels as a dark surface",()=>{
  expect(captionInk([[0,0,0,30],[15,15,15,30]])).toBe("#302a42");
});

it("uses the dark appearance ground when the liquid is transparent",()=>{
  expect(captionInk([[0,0,0,0]],[25,22,32])).toBe("#fcfbff");
});

it("turns opposite saved poles into different hues within the same role family",()=>{
  const frame=defaultThinkingSpace(),positive=annotatePerspective(frame,{scale:1}),negative=annotatePerspective(frame,{scale:-1});
  const a=seedColorPolarity(positive)!,b=seedColorPolarity(negative)!;
  expect(a.hueShift).toBeCloseTo(-b.hueShift);expect(Math.abs(a.hueShift)).toBeGreaterThan(10);
  expect(semanticSeedColor("thesis",1,a)).not.toEqual(semanticSeedColor("thesis",1,b));
  const before=semanticSeedColor("thesis",1,a);frame.focus.scale=-1;frame.axes.reverse();
  expect(semanticSeedColor("thesis",1,seedColorPolarity(positive))).toEqual(before);
  expect(seedColorPolarity({...positive,axes:[...positive.axes].reverse()})).toEqual(a);
});

it("makes stronger polarity more saturated and generations only a little lighter",()=>{
  const muted=semanticSeedHsl("antithesis",0,{hueShift:0,strength:0}),strong=semanticSeedHsl("antithesis",0,{hueShift:0,strength:1});
  expect(strong[1]).toBeGreaterThan(muted[1]);expect(strong[2]).toBe(muted[2]);
  const later=semanticSeedHsl("antithesis",5,{hueShift:0,strength:1});
  expect(later[2]).toBeGreaterThan(strong[2]);expect(later[2]-strong[2]).toBeLessThan(.08);
  expect(seedColorPolarity(undefined)).toBeUndefined();
  expect(semanticSeedColor("thesis",0)).toEqual(semanticSeedColor("thesis",0,undefined));
});

it("keeps composite multi-axis colors stable, finite and perceptually muted",()=>{
  const snapshot=annotatePerspective(defaultThinkingSpace(),{scale:.8,concern:-.65,horizon:.3});
  const polarity=seedColorPolarity(snapshot)!;
  expect(seedColorPolarity({...snapshot,axes:snapshot.axes.map(a=>a.id==="horizon"?{...a,value:-.9}:a)})).not.toEqual(polarity);
  for(const role of ["thesis","antithesis","synthesis","user"])for(const generation of [0,3,5])for(const hueShift of [-18,0,18])for(const strength of [0,.5,1]){
    const rgb=semanticSeedColor(role,generation,{hueShift,strength});
    expect(rgb.every(v=>Number.isFinite(v)&&v>=0&&v<=1)).toBe(true);expect(perceptualChroma(rgb)).toBeLessThanOrEqual(.070001);
  }
});
