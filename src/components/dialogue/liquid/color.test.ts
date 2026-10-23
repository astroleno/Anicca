import {captionInk,seedColorPolarity,semanticSeedColor,semanticSeedHsl,perceptualChroma} from "./color";
import {annotatePerspective,defaultThinkingSpace} from "@/features/perspectives/model";

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
