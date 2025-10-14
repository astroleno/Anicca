declare module 'shader-park-core/dist/shader-park-core.esm.js' {
  export function sculptToMinimalRenderer(
    canvas: HTMLCanvasElement,
    spCode: string,
    uniforms?: () => Record<string, number>
  ): void;
}

declare module 'shader-park-core' {
  export function sculptToMinimalRenderer(
    canvas: HTMLCanvasElement,
    spCode: string,
    uniforms?: () => Record<string, number>
  ): void;
}


