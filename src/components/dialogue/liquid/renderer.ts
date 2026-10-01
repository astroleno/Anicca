import {
  minimalVertexSource,
  sculptToFullGLSLSource
} from "shader-park-core/dist/shader-park-core.esm.js";

import {
  MAX_DIALOGUE_METABALLS,
  type DialogueMetaballNode
} from "../metaball/model";
import { buildLiquidSpCode, LIQUID_SEED_SLOTS } from "./spcode";
import { liquidBlendTargets, RESTING_LIQUID_BLEND } from "./fusion";

export const DIALOGUE_METABALL_SMOOTHNESS = 0.055;
let cachedFragmentSource: string | null = null;

export function buildLiquidFragmentSource(): string {
  // The reference intentionally shades the eight-step approximation, including
  // its pastel background. A strict hit/discard marcher destroys that material.
  return sculptToFullGLSLSource(buildLiquidSpCode(LIQUID_SEED_SLOTS));
}

export type DialogueMetaballRenderer = {
  resize(width: number, height: number, pixelRatio: number): void;
  render(nodes: DialogueMetaballNode[], timeSeconds: number, interaction?: { draggedId?: string | null }): void;
  dispose(): void;
};

function requireShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("liquid_shader_create_failed");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || "unknown shader compile error";
    gl.deleteShader(shader);
    throw new Error(`liquid_shader_compile_failed: ${info}`);
  }
  return shader;
}

function requireProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): { program: WebGLProgram; vertex: WebGLShader; fragment: WebGLShader } {
  const vertex = requireShader(gl, gl.VERTEX_SHADER, vertexSource);
  let fragment: WebGLShader;
  try { fragment = requireShader(gl, gl.FRAGMENT_SHADER, fragmentSource); }
  catch (error) { gl.deleteShader(vertex); throw error; }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error("liquid_program_create_failed");
  }

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) || "unknown program link error";
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error(`liquid_program_link_failed: ${info}`);
  }

  return { program, vertex, fragment };
}

export function createDialogueMetaballRenderer(
  canvas: HTMLCanvasElement,
  onContextLost: () => void
): DialogueMetaballRenderer {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: "high-performance"
  });
  if (!gl) {
    throw new Error("liquid_webgl2_unavailable");
  }

  const fragmentSource = cachedFragmentSource ??= buildLiquidFragmentSource();
  const { program, vertex, fragment } = requireProgram(gl, minimalVertexSource, fragmentSource);
  const buffer = gl.createBuffer();
  if (!buffer) {
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error("liquid_buffer_create_failed");
  }

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]),
    gl.STATIC_DRAW
  );
  const coordinate = gl.getAttribLocation(program, "coordinates");
  gl.enableVertexAttribArray(coordinate);
  gl.vertexAttribPointer(coordinate, 3, gl.FLOAT, false, 0, 0);

  const locations = new Map<string, WebGLUniformLocation | null>();
  const uniformNames = ["time", "resolution", "opacity", "_scale"];
  for (let index = 0; index < LIQUID_SEED_SLOTS; index += 1) {
    for (const suffix of ["x", "y", "r", "h", "b", "cr", "cg", "cb"]) {
      uniformNames.push(`s${index}${suffix}`);
    }
  }
  for (const name of uniformNames) {
    locations.set(name, gl.getUniformLocation(program, name));
  }

  const set1f = (name: string, value: number) => {
    const location = locations.get(name);
    if (location !== null && location !== undefined) {
      gl.uniform1f(location, value);
    }
  };

  gl.clearColor(0, 0, 0, 0);
  gl.disable(gl.DEPTH_TEST);
  set1f("opacity", 1);
  set1f("_scale", 1);

  let disposed = false;
  let resizeKey = "";
  let cssWidth = 1;
  let cssHeight = 1;
  let previousNodes: DialogueMetaballNode[] | null = null;
  const blends = new Map<string, number>();
  const previousSlotBlends: number[] = [];
  let previousTime: number | null = null;

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    onContextLost();
  };
  canvas.addEventListener("webglcontextlost", handleContextLost);

  return {
    resize(width, height, pixelRatio) {
      if (disposed) return;
      cssWidth = Math.max(1, width);
      cssHeight = Math.max(1, height);
      const safePixelRatio = Math.max(0.35, Math.min(pixelRatio, 1));
      const nextResizeKey = `${cssWidth}:${cssHeight}:${safePixelRatio}`;
      if (nextResizeKey === resizeKey) return;

      resizeKey = nextResizeKey;
      canvas.width = Math.max(1, Math.round(cssWidth * safePixelRatio));
      canvas.height = Math.max(1, Math.round(cssHeight * safePixelRatio));
    },

    render(nodes, timeSeconds, interaction) {
      if (disposed) return;
      const count = Math.min(nodes.length, MAX_DIALOGUE_METABALLS, LIQUID_SEED_SLOTS);
      gl.useProgram(program);
      set1f("time", timeSeconds);
      const resolution = locations.get("resolution");
      if (resolution !== null && resolution !== undefined) {
        gl.uniform2f(resolution, canvas.width, canvas.height);
      }

      const visibleNodes = nodes.slice(0, count);
      const targets = liquidBlendTargets(visibleNodes, interaction?.draggedId);
      // time=0 is the reduced-motion path: update geometry without interpolation.
      const amount = previousTime === null || timeSeconds === 0 ? 1
        : 1 - Math.exp(-18 * Math.max(0, timeSeconds - previousTime));
      previousTime = timeSeconds;
      const ids = new Set(visibleNodes.map(node => node.id));
      for (const id of blends.keys()) if (!ids.has(id)) blends.delete(id);
      for (let index = 0; index < LIQUID_SEED_SLOTS; index++) {
        const node = visibleNodes[index];
        const target = targets[index] ?? RESTING_LIQUID_BLEND;
        const current = node ? (blends.get(node.id) ?? RESTING_LIQUID_BLEND) : RESTING_LIQUID_BLEND;
        const value = Math.abs(target - current) < 0.0001 ? target : current + (target - current) * amount;
        if (node) blends.set(node.id, value);
        if (previousSlotBlends[index] !== value) set1f(`s${index}b`, value);
        previousSlotBlends[index] = value;
      }

      if (nodes !== previousNodes) {
        previousNodes = nodes;
        for (let index = 0; index < LIQUID_SEED_SLOTS; index += 1) {
          const node = index < count ? nodes[index] : null;
          const prefix = `s${index}`;
          if (node) {
            set1f(`${prefix}x`, node.center[0] * 1.75);
            set1f(`${prefix}y`, node.center[1] * 1.75);
            set1f(`${prefix}r`, Math.max(0.001, node.radius * 1.75));
            set1f(`${prefix}h`, Math.max(0, Math.min(1, node.emphasis * 0.18)));
            set1f(`${prefix}cr`, node.color[0]);
            set1f(`${prefix}cg`, node.color[1]);
            set1f(`${prefix}cb`, node.color[2]);
          } else {
            set1f(`${prefix}x`, 999);
            set1f(`${prefix}y`, 999);
            set1f(`${prefix}r`, 0.001);
            set1f(`${prefix}h`, 0);
            set1f(`${prefix}cr`, 0);
            set1f(`${prefix}cg`, 0);
            set1f(`${prefix}cb`, 0);
          }
        }
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    }
  };
}
