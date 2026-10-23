import {sculptToFullGLSLSource} from "shader-park-core/dist/shader-park-core.esm.js";
import {buildLiquidSpCode} from "./spcode";
import {buildLiquidFragmentSource} from "./renderer";

it("compiles the complete material with the installed Shader Park DSL",()=>{
  expect(()=>sculptToFullGLSLSource(buildLiquidSpCode())).not.toThrow();
  expect(()=>buildLiquidFragmentSource()).not.toThrow();
});

it("hoists the sketch flow out of geometry while retaining converged hits, soft edges and semantic colors", () => {
  const source = buildLiquidFragmentSource();
  const distance = source.slice(source.indexOf("float aniccaBody0("), source.indexOf("ShadedMaterial shade("));
  expect(distance).not.toContain("noise(");
  expect(distance).toContain("if(s7r > .0015");
  expect(distance).toContain("if(s0h > .0001)");
  expect(source.match(/aniccaFlow\(rayDirection\)/g)).toHaveLength(1);
  expect(source).toContain("if(i < 8) sketchTravel = t");
  expect(source).toContain("smoothstep(0.0, .7, contourFacing)");
  expect(source).toContain("uniform float s0cr;");
  expect(source).toContain("fieldMix = atmosphere*(1.0-smoothstep(.02,.3,flowCoverage))");
  expect(source).toContain("float incoming=clamp(.5+.5*(distance-body)/k,0.0,1.0)");
  expect(source).toContain("presence+behindPresence*(1.0-presence)");
});
