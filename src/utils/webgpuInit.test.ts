import { initWebGPU } from "./webgpuInit";
import { createDeferred } from "../../tests/deferred";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("destroys a device that arrives after the canvas owner was cancelled", async () => {
  const request = createDeferred<GPUDevice>();
  const destroy = vi.fn();
  vi.stubGlobal("navigator", { gpu: { requestAdapter: async () => ({ requestDevice: () => request.promise }) } });
  const controller = new AbortController();
  const canvas = document.createElement("canvas");
  const getContext = vi.spyOn(canvas, "getContext");
  const result = initWebGPU(canvas, controller.signal);
  controller.abort();
  request.resolve({ destroy } as unknown as GPUDevice);
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(destroy).toHaveBeenCalledOnce();
  expect(getContext).not.toHaveBeenCalled();
});

it("destroys the acquired device if context configuration fails", async () => {
  const destroy = vi.fn();
  const configure = vi.fn(() => { throw Error("device lost"); });
  vi.stubGlobal("navigator", { gpu: { requestAdapter: async () => ({ requestDevice: async () => ({ destroy }) }), getPreferredCanvasFormat: () => "bgra8unorm" } });
  const canvas = document.createElement("canvas");
  vi.spyOn(canvas, "getContext").mockReturnValue({ configure } as unknown as GPUCanvasContext);
  await expect(initWebGPU(canvas)).rejects.toThrow("device lost");
  expect(destroy).toHaveBeenCalledOnce();
});
