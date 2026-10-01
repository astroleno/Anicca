import {
  createDialogueMetaballRenderer,
  DIALOGUE_METABALL_SMOOTHNESS
} from "./renderer";
import { buildLiquidSpCode, LIQUID_SEED_SLOTS } from "../liquid/spcode";

vi.mock("shader-park-core", () => ({
  minimalVertexSource: "attribute vec3 coordinates; void main(){ gl_Position = vec4(coordinates, 1.0); }",
  sculptToFullGLSLSource: vi.fn(() => "float intersect(vec3 ro, vec3 rd, float stepFraction) {\nreturn 0.;\n}\nvoid main(){ gl_FragColor = vec4(1.0); }")
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

  it("ships the archived light-liquid Shader Park contract", () => {
    const source = buildLiquidSpCode();
    expect(LIQUID_SEED_SLOTS).toBe(8);
    expect(DIALOGUE_METABALL_SMOOTHNESS).toBeGreaterThan(0);
    expect(source).toContain("setMaxIterations(8)");
    expect(source).toContain("let n = sin(fbm");
    expect(source).toContain("blend(.14)");
    expect(source).toContain("sphere(s7r");
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
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 3);
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
});
