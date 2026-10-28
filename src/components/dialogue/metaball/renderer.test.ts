import {
  createDialogueMetaballRenderer,
  DIALOGUE_METABALL_SMOOTHNESS
} from "./renderer";
import { buildLiquidSpCode, LIQUID_SEED_SLOTS } from "../liquid/spcode";
import { RESTING_LIQUID_BLEND, DRAGGED_LIQUID_BLEND } from "../liquid/fusion";

vi.mock("shader-park-core/dist/shader-park-core.esm.js", () => ({
  minimalVertexSource: "attribute vec3 coordinates; void main(){ gl_Position = vec4(coordinates, 1.0); }",
  sculptToFullGLSLSource: vi.fn(() => `uniform float materialR;
uniform float materialG;
uniform float materialB;
uniform float fieldMix;
float surfaceDistance(vec3 p) { return length(p); }
vec3 calcNormal( vec3 pos ) { return normalize(pos); }
ShadedMaterial shade(vec3 p, vec3 normal) { return ShadedMaterial(); }
float intersect(vec3 ro, vec3 rd, float stepFraction) {
  float t = 0.0;
  for(int i = 0; i < MAX_ITERATIONS; ++i) {
    float h = surfaceDistance(ro + rd*t);
    if(h < intersection_threshold || t > max_dist) break;
    t += h*STEP_SIZE_CONSTANT;
  }
  return t;
}
void main() {
  vec3 rayOrigin = vec3(0.0), rayDirection = vec3(0.0,0.0,1.0);
  float t = intersect(rayOrigin, rayDirection, stepSize);
  if(t < max_dist) {
  vec3 p = (rayOrigin + rayDirection*t);
  vec3 normal = calcNormal(p);
  }
  vec3 outputColor = vec3(1.0);
  pc_fragColor = vec4(outputColor, opacity);
}`)
}));

function createGlMock() {
  const shader = {} as WebGLShader;
  const program = {} as WebGLProgram;
  const buffer = {} as WebGLBuffer;
  return {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    FLOAT: 7,
    DEPTH_TEST: 8,
    COLOR_BUFFER_BIT: 9,
    TRIANGLES: 10,
    createShader: vi.fn(() => shader),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ""),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => program),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ""),
    deleteProgram: vi.fn(),
    createBuffer: vi.fn(() => buffer),
    deleteBuffer: vi.fn(),
    useProgram: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    getUniformLocation: vi.fn((_program, name: string) => ({ name }) as unknown as WebGLUniformLocation),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform3f: vi.fn(),
    clearColor: vi.fn(),
    disable: vi.fn(),
    viewport: vi.fn(),
    clear: vi.fn(),
    drawArrays: vi.fn()
  };
}

describe("dialogue liquid renderer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ships the sketch1638178 material and scale contract", () => {
    const source = buildLiquidSpCode();
    expect(LIQUID_SEED_SLOTS).toBe(8);
    expect(DIALOGUE_METABALL_SMOOTHNESS).toBeGreaterThan(0);
    expect(source).toContain("setMaxIterations(16)");
    expect(source).toContain("let n = vec3(materialR, materialG, materialB)");
    expect(source).toContain("color(mix(pearl, n, fieldMix)*s0p)");
    expect(source).toContain("vec3(s0cr, s0cg, s0cb)");
    expect(source).toContain("blend(s0b*s0r*2.)");
    expect(source).not.toContain("let mx");
    expect(source).not.toContain("sphere(.2)");
    expect(source).toContain("mixGeo(s7h)");
  });

  it("updates fixed uniforms and backing size without reallocating resources", () => {
    const gl = createGlMock();
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(gl as unknown as GPUCanvasContext);
    const renderer = createDialogueMetaballRenderer(canvas, vi.fn());

    renderer.resize(800, 600, 0.88);
    renderer.resize(800, 600, 0.88);
    renderer.render([
      {
        id: "root",
        center: [-0.1, 0.2],
        radius: 0.14,
        color: [0.76, 0.7, 0.9],
        emphasis: 1
      }
    ], 2.5);

    expect(canvas.width).toBe(704);
    expect(canvas.height).toBe(528);
    expect(gl.createProgram).toHaveBeenCalledOnce();
    expect(gl.uniform1f).toHaveBeenCalled();
    expect(gl.uniform1f).toHaveBeenCalledWith(expect.objectContaining({ name: "s0cr" }), .76);
    expect(gl.uniform1f).toHaveBeenCalledWith(expect.objectContaining({ name: "s0cg" }), .7);
    expect(gl.uniform1f).toHaveBeenCalledWith(expect.objectContaining({ name: "s0cb" }), .9);
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 3);
  });

  it("clears waiting grain when a seed completes or a liquid slot is reused", () => {
    const gl = createGlMock(), canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(gl as unknown as GPUCanvasContext);
    const renderer = createDialogueMetaballRenderer(canvas, vi.fn());
    const node = { id: "waiting", center: [0, 0] as [number, number], radius: .1,
      color: [.5, .5, .5] as [number, number, number], emphasis: 1 };
    const grain = () => gl.uniform1f.mock.calls.filter(([location]) =>
      (location as unknown as { name: string }).name === "s0g").at(-1)?.[1];
    renderer.render([{ ...node, generating: true }], 0);
    expect(grain()).toBe(1);
    renderer.render([node], 0);
    expect(grain()).toBe(0);
    renderer.render([{ ...node, generating: true }], 2);
    renderer.render([{ ...node, id: "unrelated" }], 3);
    expect(grain()).toBe(0);
    renderer.dispose();
  });

  it("releases the vertex shader if fragment compilation fails", () => {
    const gl = createGlMock();
    gl.getShaderParameter.mockReturnValueOnce(true).mockReturnValueOnce(false);
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(gl as unknown as GPUCanvasContext);
    expect(() => createDialogueMetaballRenderer(canvas, vi.fn())).toThrow("liquid_shader_compile_failed");
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(gl.createProgram).not.toHaveBeenCalled();
  });

  it("changes the approaching pair's liquid neck through uniforms and relaxes after release", () => {
    const gl = createGlMock();
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(gl as unknown as GPUCanvasContext);
    const renderer = createDialogueMetaballRenderer(canvas, vi.fn());
    const nodes = [0, 0.2, 1].map((x, index) => ({ id: `seed-${index}`, center: [x, 0] as [number, number],
      radius: 0.1, color: [0.5, 0.5, 0.5] as [number, number, number], emphasis: 1 }));
    const blend = (index: number) => gl.uniform1f.mock.calls.filter(([location]) =>
      (location as unknown as { name: string }).name === `s${index}b`).at(-1)?.[1];
    renderer.render(nodes, 1);
    expect(blend(0)).toBe(RESTING_LIQUID_BLEND);
    renderer.render(nodes, 2, { draggedId: "seed-0" });
    expect(blend(0)).toBeGreaterThan(RESTING_LIQUID_BLEND);
    expect(blend(0)).toBeLessThan(DRAGGED_LIQUID_BLEND);
    for (let time=2.016;time<3;time+=.016) renderer.render(nodes,time,{draggedId:"seed-0"});
    expect(blend(0)).toBeCloseTo(DRAGGED_LIQUID_BLEND);
    expect(blend(1)).toBeCloseTo(DRAGGED_LIQUID_BLEND);
    expect(blend(2)).toBe(RESTING_LIQUID_BLEND);
    renderer.render(nodes, 3);
    expect(blend(0)).toBeGreaterThan(RESTING_LIQUID_BLEND);
    for (let time=3.016;time<4.2;time+=.016) renderer.render(nodes,time);
    expect(blend(0)).toBeCloseTo(RESTING_LIQUID_BLEND);
    expect(gl.createProgram).toHaveBeenCalledOnce();
    renderer.dispose();
  });

  it("does not reset the drawing buffer for equivalent rounded pixel dimensions",()=>{
    const gl=createGlMock(),canvas=document.createElement("canvas");
    vi.spyOn(canvas,"getContext").mockReturnValue(gl as unknown as GPUCanvasContext);
    const width=vi.spyOn(canvas,"width","set"),height=vi.spyOn(canvas,"height","set");
    const renderer=createDialogueMetaballRenderer(canvas,vi.fn());
    renderer.resize(800,600,.8);renderer.resize(800.1,600.1,.80001);
    expect(width).toHaveBeenCalledTimes(1);expect(height).toHaveBeenCalledTimes(1);
    renderer.resize(801,600,.8);expect(width).toHaveBeenCalledTimes(2);expect(height).toHaveBeenCalledTimes(1);
    renderer.dispose();
  });

  it("falls back on context loss and disposes owned resources once", () => {
    const gl = createGlMock();
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(gl as unknown as GPUCanvasContext);
    const onContextLost = vi.fn();
    const renderer = createDialogueMetaballRenderer(canvas, onContextLost);
    const event = new Event("webglcontextlost", { cancelable: true });

    canvas.dispatchEvent(event);
    renderer.dispose();
    renderer.dispose();
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));

    expect(event.defaultPrevented).toBe(true);
    expect(onContextLost).toHaveBeenCalledOnce();
    expect(gl.deleteBuffer).toHaveBeenCalledOnce();
    expect(gl.deleteProgram).toHaveBeenCalledOnce();
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
  });

  it("changes appearance through uniforms while retaining the same GPU resources", () => {
    const gl = createGlMock(), canvas = document.createElement("canvas");
    vi.spyOn(canvas,"getContext").mockReturnValue(gl as unknown as GPUCanvasContext);
    const renderer = createDialogueMetaballRenderer(canvas,vi.fn());
    renderer.resize(390,844,.62);
    renderer.render([],1,{dark:true,ground:[25,22,32]});
    expect(gl.uniform1f.mock.calls.some(([location,value]) => (location as unknown as {name:string}).name === "darkMode" && value === 1)).toBe(true);
    expect(gl.uniform3f).toHaveBeenCalledWith(expect.anything(),25/255,22/255,32/255);
    renderer.render([],2,{dark:false});
    expect(gl.createProgram).toHaveBeenCalledOnce();
    expect(gl.createBuffer).toHaveBeenCalledOnce();
    renderer.dispose();
  });

  it("begins pressure and contact with a normal step after an idle interval", () => {
    const gl = createGlMock(), canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(gl as unknown as GPUCanvasContext);
    const renderer = createDialogueMetaballRenderer(canvas, vi.fn());
    const nodes = ["source", "partner"].map((id, i) => ({ id, center: [i * .1, 0] as [number, number],
      radius: .1, color: [.5, .5, .5] as [number, number, number], emphasis: 1 }));
    const value = (name: string) => gl.uniform1f.mock.calls.filter(([location]) =>
      (location as unknown as { name: string }).name === name).at(-1)?.[1] as number;
    renderer.render(nodes, 1);
    renderer.render(nodes, 5, { draggedId: "source", partnerId: "partner" });
    expect(value("s0h")).toBeGreaterThan(0); expect(value("s0h")).toBeLessThan(.1);
    expect(value("s0b")).toBeGreaterThan(RESTING_LIQUID_BLEND); expect(value("s0b")).toBeLessThan(.14);
    renderer.render(nodes, 7, { draggedId: "source", partnerId: "partner" });
    expect(value("s0h")).toBeCloseTo(1, 3); expect(value("s0b")).toBeCloseTo(DRAGGED_LIQUID_BLEND);
    renderer.render(nodes, 0, { draggedId: "source", partnerId: "partner" });
    expect(value("s0h")).toBe(1); expect(value("s0b")).toBeCloseTo(DRAGGED_LIQUID_BLEND);
    renderer.dispose();
  });

  it("eases attention in the existing program and applies reduced-motion changes immediately", () => {
    const gl = createGlMock(), canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(gl as unknown as GPUCanvasContext);
    const renderer = createDialogueMetaballRenderer(canvas, vi.fn());
    const node = { id: "a", center: [0, 0] as [number, number], radius: .1,
      color: [.5, .5, .5] as [number, number, number], emphasis: 1, attention: 1 };
    const value = () => gl.uniform1f.mock.calls.filter(([location]) =>
      (location as unknown as { name: string }).name === "s0p").at(-1)?.[1] as number;
    renderer.render([node], 1);
    expect(value()).toBe(1);
    renderer.render([{ ...node, attention: .3 }], 5);
    expect(value()).toBeGreaterThan(.3); expect(value()).toBeLessThan(1);
    renderer.render([{ ...node, attention: .3 }], 7);
    expect(value()).toBeCloseTo(.3, 4);
    renderer.render([{ ...node, attention: .3 }], 0);
    expect(value()).toBe(.3); expect(gl.createProgram).toHaveBeenCalledOnce();
    renderer.dispose();
  });

  it("projects depth and orders the selected pair before an unrelated surface", () => {
    const gl = createGlMock(), canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(gl as unknown as GPUCanvasContext);
    const renderer = createDialogueMetaballRenderer(canvas, vi.fn());
    const nodes = ["unrelated", "target", "source"].map((id, i) => ({ id,
      center: [i * .1, 0] as [number, number], radius: .1, depth: .2,
      color: [.5,.5,.5] as [number, number, number], emphasis: 1 }));
    renderer.render(nodes, 1, { draggedId: "source", partnerId: "target", orbit: { yaw: .3, pitch: -.2 } });
    const value = (name: string) => gl.uniform1f.mock.calls.filter(([location]) =>
      (location as unknown as {name:string}).name === name).at(-1)?.[1];
    expect(value("s0x")).toBeCloseTo(.2 * 1.75 * 1.175);
    expect(value("s0z")).toBeCloseTo(.35);
    expect(value("s1x")).toBeCloseTo(.1 * 1.75 * 1.175);
    expect(value("s2x")).toBe(0);
    expect(value("s2b")).toBe(RESTING_LIQUID_BLEND);
    expect(value("viewYaw")).toBe(.3);
    expect(value("viewPitch")).toBe(-.2);
    renderer.dispose();
  });
});
