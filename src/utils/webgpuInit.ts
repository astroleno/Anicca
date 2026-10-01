export async function initWebGPU(canvas: HTMLCanvasElement, signal?: AbortSignal) {
    if (!navigator.gpu) throw new Error('This browser does not support WebGPU.')
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) throw new Error('No GPU adapter.')
    const device = await adapter.requestDevice()
    if (signal?.aborted) { device.destroy(); throw new DOMException('Aborted', 'AbortError') }
    const context = canvas.getContext('webgpu') as GPUCanvasContext
    if (!context) { device.destroy(); throw new Error('WebGPU canvas unavailable.') }
    const format = navigator.gpu.getPreferredCanvasFormat()
    const configure = () => context.configure({ device, format, alphaMode: 'opaque' })
    try { configure() } catch (error) { device.destroy(); throw error }
    return { device, context, format, configure }
  }
