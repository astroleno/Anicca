'use client'
import { useEffect, useRef, useState } from 'react'
import { type Ball2D, useMetaballStore } from '@/store/metaballStore'
import { initWebGPU } from '@/utils/webgpuInit'
import computeWGSL from '@/shaders/metaball_compute.wgsl'
import shadeWGSL from '@/shaders/shade_fullscreen.wgsl'
import { ResourceScope } from '@/utils/resourceScope'
import MetaballLabels from './MetaballLabels'
import GSAPChatInput from './GSAPChatInput'

const K_MERGE = 1.3
const K_UNMERGE = 1.6
const DWELL_MS = 1000

export default function MetaballCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  // 拖拽时的靠近候选与高亮
  const [hoverMergeCandidate, setHoverMergeCandidate] = useState<number | null>(null)

  // Chat UI状态
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [selectedBallId, setSelectedBallId] = useState<number | null>(null)
  const [renderError, setRenderError] = useState(false)

  useEffect(() => {
    if (!canvasRef.current) return
    const controller = new AbortController()
    let cleanup: (() => void) | undefined
    const state = useMetaballStore.getState()
    run(canvasRef.current, state.balls, state.fusionRange, state.adaptiveScale, state.setPos, setHoverMergeCandidate, state.merge, controller.signal)
      .then(stop => { if (controller.signal.aborted) stop(); else cleanup = stop })
      .catch(() => { if (!controller.signal.aborted) setRenderError(true) })
    return () => { controller.abort(); cleanup?.() }
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', touchAction: 'none' }} />
      {renderError ? <p role="alert" style={{ position: 'absolute', inset: '45% 24px auto', color: '#fff', textAlign: 'center' }}>当前浏览器无法运行这个画布，请返回实验目录选择其他效果。</p> : null}

      <MetaballLabels highlighted={hoverMergeCandidate} onSelect={id => { setSelectedBallId(id); setIsChatOpen(true) }} />

      {/* GSAP Chat Input */}
      <GSAPChatInput
        isOpen={isChatOpen}
        onClose={() => {
          setIsChatOpen(false)
          setSelectedBallId(null)
        }}
        selectedBallId={selectedBallId}
      />
    </div>
  )
}

// 初始化并运行 WebGPU 渲染循环
async function run(
  canvas: HTMLCanvasElement,
  ballsInit: Ball2D[],
  fusionRangeInit: number,
  adaptiveScaleInit: number,
  setPos: (id: number, p: [number, number]) => void,
  setHoverMergeCandidate: (id: number | null) => void,
  merge: (a: number, b: number) => void,
  signal: AbortSignal
) {
  const { device, context, format, configure } = await initWebGPU(canvas, signal)
  if (signal.aborted) { context.unconfigure(); device.destroy(); throw new DOMException('Aborted', 'AbortError') }

  ballsInit = useMetaballStore.getState().balls.filter(ball => ball.active !== false).slice(0, 256)
  const resources = new ResourceScope()
  resources.add(() => { context.unconfigure(); device.destroy() })
  try {
  // 记录初始总“面积”（r^2 之和），用于全局归一化
  const initialTotalArea = ballsInit.reduce((acc, b) => acc + b.radius * b.radius, 0)
  let currentScale = 1.0

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
  resources.add(() => window.removeEventListener('resize', resize))

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

  resources.add(() => ballsBuffer.destroy())
  // 槽位映射：ballId -> slot 索引（0..count-1）
  const idToSlot = new Map<number, number>()
  let countRef = 0

  // 增量写入封装（基于 slot）——半径写入按 currentScale 归一化
  const writeSlot = (slot: number, x: number, y: number, radius: number, level: number) => {
    if (slot < 0) return
    const tmp = new Float32Array(STRIDE / 4)
    tmp[0] = x; tmp[1] = y; tmp[2] = radius * currentScale; tmp[3] = level
    device.queue.writeBuffer(ballsBuffer, slot * STRIDE, tmp.buffer)
  }

  // 计算当前 scale（保持总面积约等于 initialTotalArea）
  const recomputeScale = (active: Ball2D[]) => {
    const sum = active.reduce((acc, b) => acc + b.radius * b.radius, 0)
    currentScale = sum > 1e-6 ? Math.sqrt(initialTotalArea / sum) : 1.0
  }

  // 全量重建：当球数量变化时调用
  const rebuildFromStore = () => {
    const balls = useMetaballStore.getState().balls
    const active = balls.filter(b => b.active !== false)
    recomputeScale(active)
    const tmp = new Float32Array(MAX * (STRIDE / 4))
    idToSlot.clear()
    for (let i = 0; i < active.length && i < MAX; i++) {
      const b = active[i]
      idToSlot.set(b.id, i)
      const o = i * (STRIDE / 4)
      tmp[o+0] = b.pos[0]
      tmp[o+1] = b.pos[1]
      tmp[o+2] = b.radius * currentScale
      tmp[o+3] = b.level
    }
    device.queue.writeBuffer(ballsBuffer, 0, tmp.buffer)
    countRef = Math.min(active.length, MAX)
    device.queue.writeBuffer(countBuffer, 0, new Uint32Array([countRef]).buffer)
  }

  // 初始写入
  const initArray = new Float32Array(MAX * (STRIDE / 4))
  recomputeScale(ballsInit)
  for (let i = 0; i < ballsInit.length; i++) {
    const b = ballsInit[i]
    idToSlot.set(b.id, i)
    const o = i * (STRIDE / 4)
    initArray[o + 0] = b.pos[0]
    initArray[o + 1] = b.pos[1]
    initArray[o + 2] = b.radius * currentScale
    initArray[o + 3] = b.level
  }
  device.queue.writeBuffer(ballsBuffer, 0, initArray.buffer)

  // 画布尺寸 / 计数
  const SCALE = window.matchMedia('(pointer: coarse)').matches ? 0.6 : 0.8
  const texWidth = () => Math.max(256, Math.floor(canvas.width * SCALE))
  const texHeight = () => Math.max(256, Math.floor(canvas.height * SCALE))

  const sizeBuffer = device.createBuffer({ size: 8, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  const countBuffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  const fusionRangeBuffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  const adaptiveScaleBuffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  resources.add(() => { sizeBuffer.destroy(); countBuffer.destroy(); fusionRangeBuffer.destroy(); adaptiveScaleBuffer.destroy() })
  const updateSize = () => {
    device.queue.writeBuffer(sizeBuffer, 0, new Float32Array([texWidth(), texHeight()]))
  }
  countRef = ballsInit.length
  device.queue.writeBuffer(countBuffer, 0, new Uint32Array([countRef]).buffer)
  device.queue.writeBuffer(fusionRangeBuffer, 0, new Float32Array([fusionRangeInit]))
  device.queue.writeBuffer(adaptiveScaleBuffer, 0, new Float32Array([adaptiveScaleInit]))
  updateSize()

  // 输出纹理（compute 写 / fragment 读）
  const makeOutputTex = () => device.createTexture({
    size: { width: texWidth(), height: texHeight() },
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    })
  let outTex = makeOutputTex()
  resources.add(() => outTex.destroy())

  // BindGroups
  const computePipeline = device.createComputePipeline({ layout: 'auto', compute: { module: csModule, entryPoint: 'main' } })
  const renderPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: fsModule, entryPoint: 'vs_main' },
    fragment: { module: fsModule, entryPoint: 'fs_main', targets: [{ format }] },
    primitive: { topology: 'triangle-list' }
  })

  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' })

  const getComputeBind = () => device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: ballsBuffer } },
        { binding: 1, resource: outTex.createView() },
        { binding: 2, resource: { buffer: sizeBuffer } },
        { binding: 3, resource: { buffer: countBuffer } },
        { binding: 4, resource: { buffer: fusionRangeBuffer } },
        { binding: 5, resource: { buffer: adaptiveScaleBuffer } }
      ]
    })
  let computeBind = getComputeBind()

  const getRenderBind = () => device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: outTex.createView() },
        { binding: 1, resource: sampler }
      ]
    })
  let renderBind = getRenderBind()

  // 订阅 store：当球数量变化时重建 buffer / uCount，融合范围和自适应缩放变化时更新
  const unsubscribe = useMetaballStore.subscribe((state, prev) => {
    const currActive = state.balls.filter(b => b.active !== false).length
    const prevActive = prev?.balls ? prev.balls.filter(b => b.active !== false).length : currActive
    if (currActive !== prevActive) {
      rebuildFromStore()
    }
    // 融合范围变化时更新uniform
    if (prev && state.fusionRange !== prev.fusionRange) {
      device.queue.writeBuffer(fusionRangeBuffer, 0, new Float32Array([state.fusionRange]))
    }
    // 自适应缩放变化时更新uniform
    if (prev && state.adaptiveScale !== prev.adaptiveScale) {
      device.queue.writeBuffer(adaptiveScaleBuffer, 0, new Float32Array([state.adaptiveScale]))
    }
  })

  resources.add(unsubscribe)
  // 交互：拖动最近的球 + 靠近合并（1s 停留自动合并）
  let dragging = false
  let draggingId = 0
  let mergeTargetId: number | null = null
  let dwellTimer: ReturnType<typeof setTimeout> | null = null

  const clearDwell = () => { if (dwellTimer) { clearTimeout(dwellTimer); dwellTimer = null } }

  let bounds = canvas.getBoundingClientRect()
  const refreshBounds = () => { bounds = canvas.getBoundingClientRect() }
  window.addEventListener('scroll', refreshBounds, true)
  resources.add(() => window.removeEventListener('scroll', refreshBounds, true))
  const toNDC = (clientX: number, clientY: number): [number, number] => {
    const rect = bounds
    const x = (clientX - rect.left) / rect.width
    const y = (clientY - rect.top) / rect.height
    return [x * 2 - 1, (1 - y) * 2 - 1]
  }
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    refreshBounds()
    dragging = true
    canvas.setPointerCapture(e.pointerId)
    const [nx, ny] = toNDC(e.clientX, e.clientY)
    const state = useMetaballStore.getState()
    let best = 0, bestD = Infinity
    for (const b of state.balls) {
      if (b.active === false) continue
      const dx = b.pos[0] - nx
      const dy = b.pos[1] - ny
      const d = dx*dx + dy*dy
      if (d < bestD) { bestD = d; best = b.id }
    }
    draggingId = best
  }

  const tryUpdateMergeCandidate = () => {
    const state = useMetaballStore.getState()
    const draggingBall = state.balls.find(b => b.id === draggingId)
    if (!draggingBall) { setHoverMergeCandidate(null); mergeTargetId = null; clearDwell(); return }

    // 如果已经在合并计时中，检查是否还在范围内
    if (mergeTargetId !== null) {
      const targetBall = state.balls.find(b => b.id === mergeTargetId)
      if (targetBall) {
        const dx = targetBall.pos[0] - draggingBall.pos[0]
        const dy = targetBall.pos[1] - draggingBall.pos[1]
        const d = Math.sqrt(dx*dx + dy*dy)
        const currentAdaptiveScale = state.adaptiveScale
        const thrOut = K_UNMERGE * (targetBall.radius * currentAdaptiveScale + draggingBall.radius * currentAdaptiveScale)

        if (d > thrOut) {
          mergeTargetId = null
          setHoverMergeCandidate(null)
          clearDwell()
        } else {
        }
        return
      }
    }

    // 寻找新的合并候选
    let nearest: number | null = null
    let nearestDist = Infinity
    let bestCandidate: number | null = null

    for (const b of state.balls) {
      if (b.id === draggingId || b.active === false) continue
      const dx = b.pos[0] - draggingBall.pos[0]
      const dy = b.pos[1] - draggingBall.pos[1]
      const d = Math.sqrt(dx*dx + dy*dy)
      const currentAdaptiveScale = state.adaptiveScale
      const thrIn = K_MERGE * (b.radius * currentAdaptiveScale + draggingBall.radius * currentAdaptiveScale)

      if (d < nearestDist) { nearestDist = d; nearest = b.id }

      if (d <= thrIn) {
        bestCandidate = b.id
        break // 找到第一个符合条件的就停止
      }
    }

    // 如果找到新的合并候选
    if (bestCandidate !== null && mergeTargetId !== bestCandidate) {
      mergeTargetId = bestCandidate
      setHoverMergeCandidate(bestCandidate)
      clearDwell()
      dwellTimer = setTimeout(() => {
        if (mergeTargetId === bestCandidate) {
          merge(draggingId, bestCandidate)
          clearDwell()
        }
      }, DWELL_MS)
    } else if (mergeTargetId === null && nearest !== null) {
      setHoverMergeCandidate(nearest)
    }
  }

  const stopDrag = () => { dragging = false; clearDwell(); mergeTargetId = null; setHoverMergeCandidate(null) }

  const onMove = (e: PointerEvent) => {
    if (!dragging) return
    const [nx, ny] = toNDC(e.clientX, e.clientY)
    setPos(draggingId, [nx, ny])
    const b = useMetaballStore.getState().balls.find(bb => bb.id === draggingId)
    const slot = idToSlot.get(draggingId)
    if (b && slot !== undefined) writeSlot(slot, nx, ny, b.radius, b.level)
    tryUpdateMergeCandidate()
  }
  const onUp = (e: PointerEvent) => { stopDrag(); try { canvas.releasePointerCapture(e.pointerId) } catch {} }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  const onWindowUp = () => stopDrag()
  window.addEventListener('pointerup', onWindowUp)
  window.addEventListener('blur', onWindowUp)
  resources.add(() => {
    clearDwell()
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
    window.removeEventListener('pointerup', onWindowUp)
    window.removeEventListener('blur', onWindowUp)
  })

  // resize 重新创建输出纹理与 bindGroups
  const onResize = () => {
    refreshBounds()
    updateSize()
    outTex.destroy()
    outTex = makeOutputTex()
    computeBind = getComputeBind()
    renderBind = getRenderBind()
  }
  window.addEventListener('resize', onResize)
  resources.add(() => window.removeEventListener('resize', onResize))

  let raf = 0
  let stopped = false
  resources.add(() => { stopped = true; cancelAnimationFrame(raf) })
  const wake = () => { if (!stopped && !document.hidden && !raf) raf = requestAnimationFrame(frame) }
  const frame = () => {
    raf = 0
    if (stopped || document.hidden) return
    const encoder = device.createCommandEncoder()
    const cpass = encoder.beginComputePass()
    cpass.setPipeline(computePipeline)
    cpass.setBindGroup(0, computeBind)
    const wx = Math.ceil(texWidth() / 8)
    const wy = Math.ceil(texHeight() / 8)
    cpass.dispatchWorkgroups(wx, wy, 1)
    cpass.end()

    let view
    try { view = context.getCurrentTexture().createView() } catch { try { configure() } catch {}; view = context.getCurrentTexture().createView() }

    const rpass = encoder.beginRenderPass({
      colorAttachments: [{ view, clearValue: { r: 0.02, g: 0.02, b: 0.03, a: 1 }, loadOp: 'clear', storeOp: 'store' }]
    })
    rpass.setPipeline(renderPipeline)
    rpass.setBindGroup(0, renderBind)
    rpass.draw(6, 1, 0, 0)
    rpass.end()

    try { device.queue.submit([encoder.finish()]) } catch {}
  }
  const wakeSubscription = useMetaballStore.subscribe(wake)
  resources.add(wakeSubscription)
  const visibility = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; stopDrag() } else wake() }
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('resize', wake)
  resources.add(() => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('resize', wake) })
  wake()

  return resources.dispose
  } catch (error) { resources.dispose(); throw error }
}
