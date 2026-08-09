import * as THREE from "three";

import { MAX_DIALOGUE_METABALLS, type DialogueMetaballNode } from "./model";
import {
  DIALOGUE_METABALL_FRAGMENT_SHADER,
  DIALOGUE_METABALL_VERTEX_SHADER
} from "./shaders";

export const DIALOGUE_METABALL_SMOOTHNESS = 0.055;

export type DialogueMetaballRenderer = {
  resize(width: number, height: number, pixelRatio: number): void;
  render(nodes: DialogueMetaballNode[], timeSeconds: number): void;
  dispose(): void;
};

type DialogueMetaballUniforms = {
  uResolution: { value: THREE.Vector2 };
  uTime: { value: number };
  uSmoothness: { value: number };
  uCount: { value: number };
  uCenters: { value: THREE.Vector2[] };
  uRadii: { value: number[] };
  uColors: { value: THREE.Vector3[] };
  uEmphasis: { value: number[] };
};

export function createDialogueMetaballRenderer(
  canvas: HTMLCanvasElement,
  onContextLost: () => void
): DialogueMetaballRenderer {
  const webglRenderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: "high-performance"
  });
  webglRenderer.setClearColor(0x000000, 0);

  const uniforms: DialogueMetaballUniforms = {
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uSmoothness: { value: DIALOGUE_METABALL_SMOOTHNESS },
    uCount: { value: 0 },
    uCenters: {
      value: Array.from({ length: MAX_DIALOGUE_METABALLS }, () => new THREE.Vector2())
    },
    uRadii: { value: Array(MAX_DIALOGUE_METABALLS).fill(0) as number[] },
    uColors: {
      value: Array.from({ length: MAX_DIALOGUE_METABALLS }, () => new THREE.Vector3())
    },
    uEmphasis: { value: Array(MAX_DIALOGUE_METABALLS).fill(0) as number[] }
  };
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: DIALOGUE_METABALL_VERTEX_SHADER,
    fragmentShader: DIALOGUE_METABALL_FRAGMENT_SHADER,
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  let disposed = false;
  let resizeKey = "";

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    onContextLost();
  };
  canvas.addEventListener("webglcontextlost", handleContextLost);

  return {
    resize(width, height, pixelRatio) {
      if (disposed) return;

      const safeWidth = Math.max(1, width);
      const safeHeight = Math.max(1, height);
      const safePixelRatio = Math.max(0.1, pixelRatio);
      const nextResizeKey = `${safeWidth}:${safeHeight}:${safePixelRatio}`;
      if (nextResizeKey === resizeKey) return;

      resizeKey = nextResizeKey;
      webglRenderer.setPixelRatio(safePixelRatio);
      webglRenderer.setSize(safeWidth, safeHeight, false);
      uniforms.uResolution.value.set(
        Math.round(safeWidth * safePixelRatio),
        Math.round(safeHeight * safePixelRatio)
      );
    },

    render(nodes, timeSeconds) {
      if (disposed) return;

      const count = Math.min(nodes.length, MAX_DIALOGUE_METABALLS);
      uniforms.uCount.value = count;
      uniforms.uTime.value = timeSeconds;

      for (let index = 0; index < MAX_DIALOGUE_METABALLS; index += 1) {
        const node = index < count ? nodes[index] : undefined;
        if (node) {
          uniforms.uCenters.value[index].set(node.center[0], node.center[1]);
          uniforms.uRadii.value[index] = node.radius;
          uniforms.uColors.value[index].set(node.color[0], node.color[1], node.color[2]);
          uniforms.uEmphasis.value[index] = node.emphasis;
        } else {
          uniforms.uCenters.value[index].set(0, 0);
          uniforms.uRadii.value[index] = 0;
          uniforms.uColors.value[index].set(0, 0, 0);
          uniforms.uEmphasis.value[index] = 0;
        }
      }

      webglRenderer.render(scene, camera);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      geometry.dispose();
      material.dispose();
      webglRenderer.dispose();
    }
  };
}
