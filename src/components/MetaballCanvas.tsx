'use client'
import { useEffect, useRef } from 'react'
import { useMetaballStore } from '@/store/metaballStore'
import { initWebGPU } from '@/utils/webgpuInit'
import computeWGSL from '@/shaders/metaball_compute.wgsl'
import shadeWGSL from '@/shaders/shade_fullscreen.wgsl'

// 为了通过类型检查，声明 WebGPU 用到的常量命名空间（运行时由浏览器提供）
declare const GPUBufferUsage: any
declare const GPUTextureUsage: any

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
  const { device, context, format, configure } = await initWebGPU(canvas)

  // 尺寸
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(320, Math.floor(canvas.clientWidth * dpr))
    const h = Math.max(320, Math.floor(canvas.clientHeight * dpr))
    canvas.width = w; canvas.height = h
    try { configure() } catch (e) { console.warn('reconfigure failed', e) }
  }
  resize()
  window.addEventListener('resize', resize)

  // 着色器
  const csModule = device.createShaderModule({ code: computeWGSL })
  const fsModule = device.createShaderModule({ code: shadeWGSL })

  // metaball SSBO：布局  (vec2 + f32 + f32) = 16 bytes 对齐
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
      tmp[o + 3] = b.level
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
  const SCALE = (navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('Android')) ? 0.6 : 0.8
  const texWidth = () => Math.max(256, Math.floor(canvas.width * SCALE))
  const texHeight = () => Math.max(256, Math.floor(canvas.height * SCALE))

  const updateSize = () => {
    const f = new Float32Array([texWidth(), texHeight()])
    device.queue.writeBuffer(sizeBuffer, 0, f)
  }
  device.queue.writeBuffer(countBuffer, 0, new Uint32Array([ballsInit.length]).buffer)
  updateSize()

  // 输出纹理（compute 写 / fragment 读）
  const makeOutputTex = () =>
    device.createTexture({
      size: { width: texWidth(), height: texHeight() },
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
  // WebGPU uniform buffer 对齐，且布局自动推导的 minBindingSize 可能为 32
  const timeBuffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })

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

  // 交互：拖动最近的球
  let dragging = false
  let draggingId = 0
  const toNDC = (clientX: number, clientY: number): [number, number] => {
    const rect = canvas.getBoundingClientRect()
    const x = (clientX - rect.left) / rect.width
    const y = (clientY - rect.top) / rect.height
    return [x * 2 - 1, (1 - y) * 2 - 1] // NDC
  }
  const onDown = (e: PointerEvent) => {
    dragging = true
    canvas.setPointerCapture(e.pointerId)
    const [nx, ny] = toNDC(e.clientX, e.clientY)
    // 选择最近球
    const state = useMetaballStore.getState()
    let best = 0
    let bestD = Infinity
    for (const b of state.balls) {
      const dx = b.pos[0] - nx
      const dy = b.pos[1] - ny
      const d = dx*dx + dy*dy
      if (d < bestD) { bestD = d; best = b.id }
    }
    draggingId = best
  }
  const onMove = (e: PointerEvent) => {
    if (!dragging) return
    const [nx, ny] = toNDC(e.clientX, e.clientY)
    setPos(draggingId, [nx, ny]) // 更新 store
    // 增量写回 GPU 仅根节点段
    const tmp = new Float32Array(STRIDE / 4)
    const b = useMetaballStore.getState().balls[draggingId]
    tmp[0] = nx; tmp[1] = ny; tmp[2] = b.radius; tmp[3] = b.level
    device.queue.writeBuffer(ballsBuffer, draggingId * STRIDE, tmp.buffer)
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
    // 强制重新配置以解决 TextureView/Device 关联问题
    try { configure() } catch (e) { console.warn('reconfigure failed', e) }
    
    // 临时注释掉时间更新
    // const now = performance.now() * 0.001
    // device.queue.writeBuffer(timeBuffer, 0, new Float32Array([now]).buffer)

    // 计算 pass
    const encoder = device.createCommandEncoder()
    const cpass = encoder.beginComputePass()
    cpass.setPipeline(computePipeline)
    cpass.setBindGroup(0, computeBind)
    const wx = Math.ceil(canvas.width / 8)
    const wy = Math.ceil(canvas.height / 8)
    cpass.dispatchWorkgroups(wx, wy, 1)
    cpass.end()

    // 渲染 pass - 加入错误恢复
    let view
    try {
      view = context.getCurrentTexture().createView()
    } catch (e) {
      console.warn('getCurrentTexture failed, reconfiguring...', e)
      try { configure() } catch (e2) { console.error('reconfigure failed', e2) }
      view = context.getCurrentTexture().createView()
    }
    
    const rpass = encoder.beginRenderPass({
      colorAttachments: [{ view, clearValue: { r: 0.02, g: 0.02, b: 0.03, a: 1 }, loadOp: 'clear', storeOp: 'store' }]
    })
    rpass.setPipeline(renderPipeline)
    rpass.setBindGroup(0, renderBind)
    rpass.draw(6, 1, 0, 0)
    rpass.end()

    try {
      device.queue.submit([encoder.finish()])
    } catch (e) {
      console.warn('queue.submit failed', e)
    }
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