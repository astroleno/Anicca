export const LIQUID_RENDERER_KEY = "anicca.dialogue.renderer.v1";
export type LiquidRendererMode = "original" | "tsl" | "tsl-webgl";
export type LiquidBackend = "original" | "webgpu" | "webgl2" | "unavailable";
export type LiquidRendererStatus = {
  requested: LiquidRendererMode;
  backend: LiquidBackend;
  fallback: boolean;
};
export const LIQUID_RENDERER_OPTIONS = [
  ["original", "原版"], ["tsl", "TSL 自动"], ["tsl-webgl", "TSL WebGL2"]
] as const;
export const isLiquidRendererMode = (value: unknown): value is LiquidRendererMode =>
  value === "original" || value === "tsl" || value === "tsl-webgl";
