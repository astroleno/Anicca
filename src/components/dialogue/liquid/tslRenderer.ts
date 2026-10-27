import { LinearSRGBColorSpace, MeshBasicNodeMaterial, NearestFilter, NoBlending, NodeFrame, QuadMesh,
  RenderTarget, UnsignedByteType, Vector2, WebGPURenderer } from "three/webgpu";
import { Fn, int, texture, uniformArray, uv } from "three/tsl";
import { LiquidFrame } from "./frame";
import type { DialogueMetaballRenderer } from "./renderer";
import type { PixelPoint, PixelReadback } from "./pixelReadback";
import { createLiquidSurface } from "./tslSurface";

const MAX_INK_POINTS = 96;

function material(fragmentNode: MeshBasicNodeMaterial["fragmentNode"]) {
  const result = new MeshBasicNodeMaterial({ depthTest: false, depthWrite: false, blending: NoBlending, toneMapped: false });
  result.fragmentNode = fragmentNode;
  return result;
}

/** A tiny GPU gather pass avoids either a full-frame read or many round trips. */
export class TslPixelReadback<T> implements PixelReadback<T> {
  private readonly points = Array.from({ length: MAX_INK_POINTS }, () => new Vector2());
  private readonly target = new RenderTarget(MAX_INK_POINTS, 1, { type: UnsignedByteType, depthBuffer: false, stencilBuffer: false });
  private readonly quad: QuadMesh;
  private readonly positions;
  private readonly bufferFrame = new NodeFrame();
  private queued: { token: T; count: number; at: number; pixels?: Uint8Array } | null = null;
  private disposed = false;
  private disabled = false;
  private inFlight = false;

  constructor(private renderer: WebGPURenderer, source: RenderTarget) {
    this.positions = uniformArray(this.points, "vec2");
    const node = Fn(() => texture(source.texture, this.positions.element(int(uv().x.mul(MAX_INK_POINTS)))))();
    this.quad = new QuadMesh(material(node));
  }

  get pending() { return this.queued !== null; }
  async prepare() { await this.renderer.compileAsync(this.quad, this.quad.camera); }

  submit(points: readonly PixelPoint[], token: T, timestamp: number) {
    if (this.disabled || this.disposed || this.inFlight || !points.length || points.length > MAX_INK_POINTS) return false;
    const sourceSize = this.renderer.getDrawingBufferSize(new Vector2());
    points.forEach((point, index) => this.points[index].set((point.x + .5) / sourceSize.x, 1 - (point.y + .5) / sourceSize.y));
    this.positions.update(this.bufferFrame);
    const queued = { token, count: points.length, at: timestamp } as NonNullable<typeof this.queued>;
    const previous = this.renderer.getRenderTarget();
    try {
      this.queued = queued;
      this.renderer.setRenderTarget(this.target);
      this.quad.render(this.renderer);
      this.inFlight = true;
      void this.renderer.readRenderTargetPixelsAsync(this.target, 0, 0, MAX_INK_POINTS, 1).then(pixels => {
        if (!this.disposed && this.queued === queued) queued.pixels = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength).slice(0, points.length * 4);
      }).catch(() => { this.disabled = true; this.queued = null; })
        .finally(() => { this.inFlight = false; });
      return true;
    } catch {
      this.disabled = true; this.queued = null; return false;
    } finally { this.renderer.setRenderTarget(previous); }
  }

  poll(timestamp: number) {
    const queued = this.queued;
    if (!queued) return null;
    if (queued.pixels) { this.queued = null; return { token: queued.token, pixels: queued.pixels }; }
    if (timestamp - queued.at > 250) this.queued = null;
    return null;
  }

  private release() { this.target.dispose(); (this.quad.material as MeshBasicNodeMaterial).dispose(); }
  cancel() { this.queued = null; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.queued = null;
    // Release material listeners while the renderer's node/pipeline caches
    // still exist. Submitted copies retain their GPU operands; their promise
    // may finish later, but must never dispose a material after the renderer.
    this.release();
  }
}

export async function createTslMetaballRenderer(canvas: HTMLCanvasElement, forceWebGL: boolean, onLost: () => void, signal: AbortSignal) {
  const renderer = new WebGPURenderer({ canvas, forceWebGL, alpha: true, antialias: false, depth: false,
    stencil: false, powerPreference: "high-performance", colorBufferType: UnsignedByteType });
  // The port already reproduces the sketch's tone mapping and display gamma.
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.debug.onShaderError = (gl, program) => { throw new Error(`liquid_tsl_shader_failed: ${gl.getProgramInfoLog(program)}`); };
  renderer.setClearColor(0, 0);
  let disposed = false;
  let surface: ReturnType<typeof createLiquidSurface> | undefined;
  let surfaceMaterial: MeshBasicNodeMaterial | undefined, presentMaterial: MeshBasicNodeMaterial | undefined;
  let target: RenderTarget | undefined;
  const readbacks = new Set<PixelReadback<unknown>>();
  const lost = (event?: Event) => { event?.preventDefault(); if (!disposed && !signal.aborted) onLost(); };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener("webglcontextlost", lost);
    renderer.onDeviceLost = () => {};
    for (const readback of readbacks) readback.dispose();
    target?.dispose(); surfaceMaterial?.dispose(); presentMaterial?.dispose(); renderer.dispose();
  };
  try {
    await renderer.init();
    if (signal.aborted) throw new DOMException("Renderer superseded", "AbortError");
    surface = createLiquidSurface();
    surfaceMaterial = material(surface.fragmentNode);
    target = new RenderTarget(1, 1, { type: UnsignedByteType, depthBuffer: false, stencilBuffer: false,
      minFilter: NearestFilter, magFilter: NearestFilter });
    const quad = new QuadMesh(surfaceMaterial);
    presentMaterial = material(texture(target.texture, uv()));
    const present = new QuadMesh(presentMaterial);
    renderer.setRenderTarget(target);
    await renderer.compileAsync(quad, quad.camera);
    renderer.setRenderTarget(null);
    await renderer.compileAsync(present, present.camera);
    const readback = new TslPixelReadback<unknown>(renderer, target);
    readbacks.add(readback);
    await readback.prepare();
    if (signal.aborted) throw new DOMException("Renderer superseded", "AbortError");
    renderer.onDeviceLost = () => lost();
    canvas.addEventListener("webglcontextlost", lost);
    const frame = new LiquidFrame();
    let resized = true;
    const inputs = surface, sceneTarget = target;
    const result: DialogueMetaballRenderer = {
      resize(width, height, pixelRatio) {
        if (disposed) return;
        const ratio = Math.max(.35, Math.min(pixelRatio, 1));
        const w = Math.max(1, Math.round(Math.max(1, width) * ratio)), h = Math.max(1, Math.round(Math.max(1, height) * ratio));
        if (canvas.width === w && canvas.height === h && sceneTarget.width === w && sceneTarget.height === h) return;
        renderer.setSize(w, h, false); sceneTarget.setSize(w, h); inputs.resolution.value.set(w, h);
        resized = true;
      },
      render(nodes, time, interaction) {
        if (disposed) return;
        inputs.time.value = time;
        inputs.atmosphere.value = interaction?.atmosphere ? 1 : 0; inputs.dark.value = interaction?.dark ? 1 : 0;
        inputs.orbit.value.set(interaction?.orbit?.yaw || 0, interaction?.orbit?.pitch || 0);
        const ground = interaction?.ground || [248, 247, 249];
        inputs.ground.value.set(ground[0] / 255, ground[1] / 255, ground[2] / 255);
        frame.update(nodes, time, interaction, inputs.setUniform);
        inputs.syncBuffers();
        renderer.setRenderTarget(sceneTarget); quad.render(renderer);
        // Prime r181's newly allocated target/bindings before presentation.
        // Otherwise the first WebGPU frame after allocation can be empty.
        if (resized) quad.render(renderer);
        renderer.setRenderTarget(null); present.render(renderer);
        resized = false;
      }, dispose
    };
    return {
      renderer: result,
      backend: "isWebGPUBackend" in renderer.backend ? "webgpu" as const : "webgl2" as const,
      createReadback<T>(): PixelReadback<T> {
        return readback as PixelReadback<T>;
      }
    };
  } catch (error) { dispose(); throw error; }
}
