'use client'
import { useEffect, useRef } from 'react'
import { useMetaballStore } from '@/store/metaballStore'
import { initWebGPU } from '@/utils/webgpuInit'
import computeWGSL from '@/shaders/metaball_compute.wgsl?raw'
import shadeWGSL from '@/shaders/shade_fullscreen.wgsl?raw'

export default function MetaballCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const balls = useMetaballStore(s => s.balls)
  const setPos = useMetaballStore(s => s.setPos)

  useEffect(() => {
    if (!canvasRef.current) return
    let cleanup: (() => void) | undefined
    run(canvasRef.current, balls, setPos).then(stop => (cleanup = stop)).catch(console.error)
    return () => { if (cleanup) cleanup() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', touchAction: 'none' }} />
}

async function run(canvas: HTMLCanvasElement, ballsInit: any[], setPos: (id: number, p: [number, number]) => void) {
  const { device, context, format } = await initWebGPU(canvas)

  // 尺寸
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(320, Math.floor(canvas.clientWidth * dpr))
    const h = Math.max(320, Math.floor(canvas.clientHeight * dpr))
    canvas.width = w; canvas.height = h
  }
  resize()
  window.addEventListener('resize', resize)

  // 着色器
  const csModule = device.createShaderModule({ code: computeWGSL })
  const fsModule = device.createShaderModule({ code: shadeWGSL })

  // metaball SSBO：布局  (vec2 + f32 + u32) = 16 bytes 对齐
  const MAX = 256
  const STRIDE = 16
  const ballsBuffer = device.createBuffer({
    size: MAX * STRIDE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  })

  // 填初值
  const writeBalls = (arr: typeof ballsInit) => {
    const tmp = new Float32Array(MAX * (STRIDE / 4))
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i]
      const o = i * (STRIDE / 4)
      tmp[o + 0] = b.pos[0]
      tmp[o + 1] = b.pos[1]
      tmp[o + 2] = b.radius
      tmp[o + 3] = b.level // 作为 u32 传，float32 写入，WGSL 侧读取再转
    }
    device.queue.writeBuffer(ballsBuffer, 0, tmp.buffer)
  }
  writeBalls(ballsInit)

  // 画布尺寸 / 计数
  const sizeBuffer = device.createBuffer({
    size: 8, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  })
  const countBuffer = device.createBuffer({
    size: 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  })
  const updateSize = () => {
    const f = new Float32Array([canvas.width, canvas.height])
    device.queue.writeBuffer(sizeBuffer, 0, f)
  }
  device.queue.writeBuffer(countBuffer, 0, new Uint32Array([ballsInit.length]).buffer)
  updateSize()

  // 输出纹理（compute 写 / fragment 读）
  const makeOutputTex = () =>
    device.createTexture({
      size: { width: canvas.width, height: canvas.height },
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    })
  let outTex = makeOutputTex()

  // BindGroups
  const computePipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: csModule, entryPoint: 'main' }
  })

  const renderPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: fsModule, entryPoint: 'vs_main' },
    fragment: { module: fsModule, entryPoint: 'fs_main', targets: [{ format }] },
    primitive: { topology: 'triangle-list' }
  })

  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' })

  const getComputeBind = () =>
    device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: ballsBuffer } },
        { binding: 1, resource: outTex.createView() },
        { binding: 2, resource: { buffer: sizeBuffer } },
        { binding: 3, resource: { buffer: countBuffer } }
      ]
    })
  let computeBind = getComputeBind()

  const getRenderBind = () =>
    device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: outTex.createView() },
        { binding: 1, resource: sampler }
      ]
    })
  let renderBind = getRenderBind()

  // 交互：拖动根节点（id=0）
  let dragging = false
  const toNDC = (clientX: number, clientY: number): [number, number] => {
    const rect = canvas.getBoundingClientRect()
    const x = (clientX - rect.left) / rect.width
    const y = (clientY - rect.top) / rect.height
    return [x * 2 - 1, (1 - y) * 2 - 1] // NDC
  }
  const onDown = (e: PointerEvent) => {
    dragging = true
    canvas.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (!dragging) return
    const [nx, ny] = toNDC(e.clientX, e.clientY)
    setPos(0, [nx, ny]) // 更新 store
    // 增量写回 GPU 仅根节点段
    const tmp = new Float32Array(STRIDE / 4)
    tmp[0] = nx; tmp[1] = ny; tmp[2] = (useMetaballStore.getState().balls[0].radius); tmp[3] = 0
    device.queue.writeBuffer(ballsBuffer, 0, tmp.buffer) // 偏移 0 对应 id=0
  }
  const onUp = (e: PointerEvent) => { dragging = false; canvas.releasePointerCapture(e.pointerId) }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)

  // resize 重新创建输出纹理与 bindGroups
  const onResize = () => {
    updateSize()
    outTex.destroy()
    outTex = makeOutputTex()
    computeBind = getComputeBind()
    renderBind = getRenderBind()
  }
  window.addEventListener('resize', onResize)

  let raf = 0
  const frame = () => {
    // 计算 pass
    const encoder = device.createCommandEncoder()
    const cpass = encoder.beginComputePass()
    cpass.setPipeline(computePipeline)
    cpass.setBindGroup(0, computeBind)
    const wx = Math.ceil(canvas.width / 8)
    const wy = Math.ceil(canvas.height / 8)
    cpass.dispatchWorkgroups(wx, wy, 1)
    cpass.end()

    // 渲染 pass
    const view = context.getCurrentTexture().createView()
    const rpass = encoder.beginRenderPass({
      colorAttachments: [{ view, clearValue: { r: 0.98, g: 0.98, b: 0.98, a: 1 }, loadOp: 'clear', storeOp: 'store' }]
    })
    rpass.setPipeline(renderPipeline)
    rpass.setBindGroup(0, renderBind)
    rpass.draw(6, 1, 0, 0)
    rpass.end()

    device.queue.submit([encoder.finish()])
    raf = requestAnimationFrame(frame)
  }
  frame()

  // 清理
  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
    window.removeEventListener('resize', onResize)
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
    outTex.destroy()
    ballsBuffer.destroy()
    sizeBuffer.destroy()
    countBuffer.destroy()
  }
}