import { Material, RenderTarget, UniformArrayNode, Vector2, type WebGPURenderer } from "three/webgpu";
import { TslPixelReadback } from "./tslRenderer";

function harness() {
  let resolve!: (pixels: Uint8Array) => void;
  let reject!: (error: Error) => void;
  const read = new Promise<Uint8Array>((yes, no) => { resolve = yes; reject = no; });
  const renderer = {
    getDrawingBufferSize: (size: Vector2) => size.set(300, 150),
    getRenderTarget: () => null,
    setRenderTarget: vi.fn(),
    render: vi.fn(),
    readRenderTargetPixelsAsync: vi.fn(() => read)
  };
  // Compilation normally allocates the uniform buffer; this test exercises
  // ownership and asynchronous completion without creating a GPU device.
  vi.spyOn(UniformArrayNode.prototype, "update").mockImplementation(() => {});
  const readback = new TslPixelReadback<string>(renderer as unknown as WebGPURenderer, new RenderTarget(300, 150));
  return { readback, renderer, resolve, reject };
}

async function flushRead() {
  for (let step = 0; step < 5; step++) await Promise.resolve();
}

describe("TSL pixel readback ownership", () => {
  afterEach(() => vi.restoreAllMocks());

  it("releases resources synchronously before renderer disposal, including an outstanding read", async () => {
    const { readback, resolve } = harness();
    const targetDispose = vi.spyOn(RenderTarget.prototype, "dispose");
    const materialDispose = vi.spyOn(Material.prototype, "dispose");
    expect(readback.submit([{ x: 30, y: 40 }], "old scene", 0)).toBe(true);
    readback.dispose();
    expect(readback.pending).toBe(false);
    expect(targetDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    // Renderer caches may now be gone. Late completion must not invoke any
    // material/target callbacks or publish pixels belonging to the old scene.
    materialDispose.mockImplementation(() => { throw new Error("renderer caches already released"); });
    resolve(new Uint8Array(96 * 4)); await flushRead();
    expect(readback.poll(100)).toBeNull();
    readback.dispose();
    expect(targetDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it("cancels a token without admitting a second concurrent GPU copy", async () => {
    const { readback, renderer, resolve } = harness();
    readback.submit([{ x: 10, y: 20 }], "before resize", 0);
    readback.cancel();
    expect(readback.submit([{ x: 10, y: 20 }], "after resize", 10)).toBe(false);
    resolve(new Uint8Array(96 * 4).fill(200)); await flushRead();
    expect(readback.poll(20)).toBeNull();
    expect(renderer.readRenderTargetPixelsAsync).toHaveBeenCalledOnce();
    readback.dispose();
  });

  it("returns only the requested pixels and the matching scene token", async () => {
    const { readback, resolve } = harness();
    expect(readback.submit([{ x: 10, y: 20 }, { x: 15, y: 25 }], "current scene", 0)).toBe(true);
    expect(readback.poll(10)).toBeNull();
    resolve(new Uint8Array(96 * 4).fill(120)); await flushRead();
    expect(readback.poll(20)).toEqual({ token: "current scene", pixels: new Uint8Array(8).fill(120) });
    expect(readback.pending).toBe(false);
    readback.dispose();
  });

  it("handles a failed copy after disposal without a late release or unhandled rejection", async () => {
    const { readback, reject } = harness();
    const materialDispose = vi.spyOn(Material.prototype, "dispose");
    readback.submit([{ x: 10, y: 20 }], "lost context", 0);
    readback.dispose();
    reject(new Error("device lost")); await flushRead();
    expect(readback.poll(100)).toBeNull();
    expect(readback.submit([{ x: 10, y: 20 }], "stale", 100)).toBe(false);
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});
