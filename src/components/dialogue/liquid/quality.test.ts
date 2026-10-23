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
