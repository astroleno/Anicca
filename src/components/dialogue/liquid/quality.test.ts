import {LiquidQuality} from "./quality";

it("does not lower resolution for isolated pauses among otherwise fluid frames",()=>{
  const quality=new LiquidQuality();let time=0,scale=1;
  for(let i=0;i<250;i++){time+=i%50===25?400:1000/60;scale=quality.step(time,true,true);}
  expect(scale).toBe(1);
});

it("adapts to sustained slow rendering and defers recovery until release",()=>{
  const quality=new LiquidQuality();let time=0,scale=1;
  for(let i=0;i<80;i++){time+=1000/30;scale=quality.step(time,true,true);}
  expect(scale).toBeLessThan(1);const reduced=scale;
  for(let i=0;i<500;i++){time+=1000/60;scale=quality.step(time,true,true);}
  expect(scale).toBe(reduced);expect(quality.step(time+16,false,false)).toBeGreaterThan(reduced);
});

it("ignores intentional idle throttling and does not carry a hidden interval into an active window",()=>{
  const quality=new LiquidQuality();let time=0;
  for(let i=0;i<100;i++){time+=100;expect(quality.step(time,false,false)).toBe(1);}
  quality.resetTiming();time+=60000;
  for(let i=0;i<90;i++){time+=1000/60;expect(quality.step(time,true,true)).toBe(1);}
});

it("reduces sustained severe stalls before a twelve-frame window can starve interaction",()=>{
  const quality=new LiquidQuality(); let time=0;
  expect(quality.step(time,true,true)).toBe(1);
  expect(quality.step(time+=1000,true,true)).toBe(1);
  expect(quality.step(time+=1000,true,true)).toBe(1);
  expect(quality.step(time+=1000,true,true)).toBeCloseTo(.65);
  for(let i=0;i<6;i++) quality.step(time+=300,true,true);
  expect(quality.step(time+=300,true,true)).toBe(.4);
  // A moderately slow window must not accidentally increase the pixel work.
  for(let i=0;i<50;i++) expect(quality.step(time+=40,true,true)).toBe(.4);
  for(let i=0;i<600;i++) expect(quality.step(time+=1000/60,true,true)).toBe(.4);
  expect(quality.step(time+16,false,false)).toBeGreaterThan(.4);
});

it("does not combine separate long pauses or hidden time into a severe slowdown",()=>{
  const quality=new LiquidQuality(); let time=0;
  quality.step(time,true,true);
  for(let i=0;i<5;i++) {
    expect(quality.step(time+=300,true,true)).toBe(1);
    expect(quality.step(time+=300,true,true)).toBe(1);
    for(let frame=0;frame<80;frame++) expect(quality.step(time+=1000/60,true,true)).toBe(1);
  }
  quality.resetTiming();
  expect(quality.step(time+=60000,true,true)).toBe(1);
});
