declare module 'shader-park-core' {
  /** Converts Shader Park source into a raymarched shader and renders it
   *  onto the canvas with its own internal rAF loop. `updateUniforms` is
   *  called every frame; the keys present on its FIRST returned object
   *  determine which uniforms can ever be updated. */
  export function sculptToMinimalRenderer(
    canvas: HTMLCanvasElement,
    source: string | (() => void),
    updateUniforms?: () => Record<string, number>,
  ): unknown
  export function sculptToGLSL(source: string): {
    uniforms: { name: string; type: string }[]
    stepSizeConstant: number
    maxIterations: number
    maxReflections: number
    userGLSL: string
    geoGLSL: string
    colorGLSL: string
    error?: unknown
  }
  /** Full self-contained fragment-shader source for the minimal renderer. */
  export function sculptToFullGLSLSource(source: string | (() => void)): string
  /** Fullscreen-triangle vertex shader used by the minimal renderer. */
  export const minimalVertexSource: string
}
