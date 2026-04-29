export async function initWebGPU(canvas: HTMLCanvasElement) {
    if (!navigator.gpu) throw new Error('This browser does not support WebGPU.')
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) throw new Error('No GPU adapter.')
    const device = await adapter.requestDevice()
    const context = canvas.getContext('webgpu') as GPUCanvasContext
    const format = navigator.gpu.getPreferredCanvasFormat()
    const configure = () => context.configure({ device, format, alphaMode: 'opaque' })
    configure()
    return { device, context, format, configure }
  }