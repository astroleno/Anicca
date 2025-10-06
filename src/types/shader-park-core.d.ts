declare module 'shader-park-core' {
  export function sculptToMinimalRenderer(
    canvas: HTMLCanvasElement,
    spCode: string,
    inputFn: () => any
  ): () => void;

  export function sculptToGLSL(spCode: string): any;
  export function sculptToFullGLSLSource(spCode: string): any;
  export function sculptToHydraRenderer(spCode: string): any;
  export function sculptToThreeJSMesh(spCode: string): any;
  export function sculptToThreeJSMaterial(spCode: string): any;
  export function sculptToThreeJSShaderSource(spCode: string): any;
  export function sculptToOfflineRenderer(spCode: string): any;
  export function sculptToMinimalHTMLRenderer(spCode: string): any;
  export function sculptToTouchDesignerShaderSource(spCode: string): any;

  export function glslToMinimalRenderer(glslCode: string): any;
  export function glslToHydraGLSL(glslCode: string): any;
  export function glslToThreeJSMaterial(glslCode: string): any;
  export function glslToThreeJSMesh(glslCode: string): any;
  export function glslToThreeJSShaderSource(glslCode: string): any;
  export function glslToOfflineRenderer(glslCode: string): any;
  export function glslToMinimalHTMLRenderer(glslCode: string): any;
  export function glslToTouchDesignerShaderSource(glslCode: string): any;

  export function baseUniforms(): any;
  export function bindStaticData(data: any): any;
  export function createSculpture(spCode: string): any;
  export function createSculptureWithGeometry(spCode: string): any;
  export function uniformsToGLSL(uniforms: any): string;
}

declare module 'shader-park-core/dist/shader-park-core.esm.js' {
  export function sculptToMinimalRenderer(
    canvas: HTMLCanvasElement,
    spCode: string,
    inputFn: () => any
  ): () => void;

  export function sculptToGLSL(spCode: string): any;
  export function sculptToFullGLSLSource(spCode: string): any;
  export function sculptToHydraRenderer(spCode: string): any;
  export function sculptToThreeJSMesh(spCode: string): any;
  export function sculptToThreeJSMaterial(spCode: string): any;
  export function sculptToThreeJSShaderSource(spCode: string): any;
  export function sculptToOfflineRenderer(spCode: string): any;
  export function sculptToMinimalHTMLRenderer(spCode: string): any;
  export function sculptToTouchDesignerShaderSource(spCode: string): any;

  export function glslToMinimalRenderer(glslCode: string): any;
  export function glslToHydraGLSL(glslCode: string): any;
  export function glslToThreeJSMaterial(glslCode: string): any;
  export function glslToThreeJSMesh(glslCode: string): any;
  export function glslToThreeJSShaderSource(glslCode: string): any;
  export function glslToOfflineRenderer(glslCode: string): any;
  export function glslToMinimalHTMLRenderer(glslCode: string): any;
  export function glslToTouchDesignerShaderSource(glslCode: string): any;

  export function baseUniforms(): any;
  export function bindStaticData(data: any): any;
  export function createSculpture(spCode: string): any;
  export function createSculptureWithGeometry(spCode: string): any;
  export function uniformsToGLSL(uniforms: any): string;
}