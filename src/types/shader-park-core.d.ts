declare module "shader-park-core/dist/shader-park-core.esm.js" {
  export function sculptToFullGLSLSource(source: string | (() => void)): string;
  export const minimalVertexSource: string;
}
