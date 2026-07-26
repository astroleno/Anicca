'use client'
import { useEffect, useRef, useState } from 'react'
import { useMetaballStore } from '@/store/metaballStore'
import { initWebGPU } from '@/utils/webgpuInit'
import computeWGSL from '@/shaders/metaball_compute.wgsl'
import shadeWGSL from '@/shaders/shade_fullscreen.wgsl'
import GSAPChatInput from './GSAPChatInput'

type MetaballCanvasProps = {
  showLabUi?: boolean
}

// 为了通过类型检查，声明 WebGPU 用到的常量命名空间（运行时由浏览器提供）
declare const GPUBufferUsage: any
declare const GPUTextureUsage: any

const K_MERGE = 1.3
const K_UNMERGE = 1.6
const DWELL_MS = 1000

export default function MetaballCanvas({ showLabUi = false }: MetaballCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const balls = useMetaballStore(s => s.balls)
  const fusionRange = useMetaballStore(s => s.fusionRange)
  const adaptiveScale = useMetaballStore(s => s.adaptiveScale)
  const setPos = useMetaballStore(s => s.setPos)
  const split = useMetaballStore(s => s.split)
  const merge = useMetaballStore(s => s.merge)

  // 拖拽时的靠近候选与高亮
  const [hoverMergeCandidate, setHoverMergeCandidate] = useState<number | null>(null)

  // Chat UI状态
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [selectedBallId, setSelectedBallId] = useState<number | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)


  useEffect(() => {
    if (!canvasRef.current) return
    let cleanup: (() => void) | undefined
    run(canvasRef.current, balls, fusionRange, adaptiveScale, setPos, setHoverMergeCandidate, () => hoverMergeCandidate, merge)
      .then(stop => {
        setRenderError(null)
        cleanup = stop
      })
      .catch((error) => {
        setRenderError(error instanceof Error ? error.message : 'WebGPU 初始化失败。')
      })
    return () => { if (cleanup) cleanup() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 将 NDC 坐标转换为屏幕像素坐标
  const ndcToPixel = (ndc: [number, number]): [number, number] => {
    if (!containerRef.current) return [0, 0]
    const rect = containerRef.current.getBoundingClientRect()
    const x = (ndc[0] + 1) * 0.5 * rect.width
    const y = (1 - ndc[1]) * 0.5 * rect.height
    return [x, y]
  }

  // 强制重新渲染序号标签
  const [forceUpdate, setForceUpdate] = useState(0)
  const triggerUpdate = () => setForceUpdate(prev => prev + 1)

  // 容器挂载后强制更新序号标签
  useEffect(() => {
    if (containerRef.current) {
      const timer = setTimeout(() => {
        triggerUpdate()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [containerRef.current])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', touchAction: 'none' }} />

      {renderError ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            padding: 24,
            color: 'rgba(242, 247, 250, 0.82)',
            background:
              'radial-gradient(circle at 50% 38%, rgba(241, 191, 88, 0.14), transparent 28%), linear-gradient(180deg, rgba(5, 9, 12, 0.82), rgba(5, 9, 12, 0.96))',
            textAlign: 'center'
          }}
        >
          <div style={{ maxWidth: 420, lineHeight: 1.55 }}>
            <strong style={{ display: 'block', marginBottom: 8, color: '#f2f7fa' }}>当前设备没有可用 WebGPU adapter。</strong>
            <span>实验画布已安静收起，主体验请回到 /dialogue。</span>
            {showLabUi ? <small style={{ display: 'block', marginTop: 10, color: 'rgba(226, 239, 244, 0.58)' }}>{renderError}</small> : null}
          </div>
        </div>
      ) : null}

      {/* 球体序号标签（可点击触发chat） */}
      {showLabUi ? balls.filter(b=>b.active!==false).map((ball) => {
        const [x, y] = ndcToPixel(ball.pos)
        const isHoverMerge = hoverMergeCandidate === ball.id

        if (showLabUi) {
          console.log(`球体${ball.id}: NDC=${ball.pos}, 像素=${[x, y]}, 容器=${containerRef.current?.getBoundingClientRect()}`)
        }

        // 暂时不隐藏任何标签，先让所有序号都显示
        // if (typeof window !== 'undefined' && (x < 20 || y < 20 || x > window.innerWidth - 20 || y > window.innerHeight - 20)) {
        //   console.log(`球体${ball.id}被隐藏: x=${x}, y=${y}, 窗口=${window.innerWidth}x${window.innerHeight}`)
        //   return null
        // }

        return (
          <div key={ball.id} style={{ position: 'absolute', left: x - 20, top: y - 10, zIndex: 1000 }}>
            <div
              style={{
                width: 40,
                height: 20,
                background: 'rgba(255, 255, 255, 0.9)',
                border: isHoverMerge ? '2px solid #0af' : '1px solid rgba(0,0,0,0.2)',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 'bold',
                color: '#333',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none',
                pointerEvents: 'auto', // 恢复点击功能
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
              }}
              onClick={(e) => {
                e.stopPropagation()
                setSelectedBallId(ball.id)
                setIsChatOpen(true)
              }}
            >
              {ball.id}
            </div>
          </div>
        )
      }) : null}

      {/* GSAP Chat Input */}
      {showLabUi ? (
        <GSAPChatInput
          isOpen={isChatOpen}
          onClose={() => {
            setIsChatOpen(false)
            setSelectedBallId(null)
          }}
          selectedBallId={selectedBallId}
        />
      ) : null}
    </div>
  )
}

// 初始化并运行 WebGPU 渲染循环
async function run(
  canvas: HTMLCanvasElement,
  ballsInit: any[],
  fusionRangeInit: number,
  adaptiveScaleInit: number,
  setPos: (id: number, p: [number, number]) => void,
  setHoverMergeCandidate: (id: number | null) => void,
  getHoverMergeCandidate: () => number | null,
  merge: (a: number, b: number) => void
) {
  const { device, context, format, configure } = await initWebGPU(canvas)

  // 设备丢失监听
  device.lost.then((info: any) => {
    console.warn('GPU device lost:', info)
    try { configure() } catch {}
  })

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
  const recomputeScale = (active: any[]) => {
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
  const SCALE = (navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('Android')) ? 0.6 : 0.8
  const texWidth = () => Math.max(256, Math.floor(canvas.width * SCALE))
  const texHeight = () => Math.max(256, Math.floor(canvas.height * SCALE))

  const sizeBuffer = device.createBuffer({ size: 8, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  const countBuffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  const fusionRangeBuffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  const adaptiveScaleBuffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
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

  // 交互：拖动最近的球 + 靠近合并（1s 停留自动合并）
  let dragging = false
  let draggingId = 0
  let mergeTargetId: number | null = null
  let dwellTimer: any = null

  const clearDwell = () => { if (dwellTimer) { clearTimeout(dwellTimer); dwellTimer = null } }

  const toNDC = (clientX: number, clientY: number): [number, number] => {
    const rect = canvas.getBoundingClientRect()
    const x = (clientX - rect.left) / rect.width
    const y = (clientY - rect.top) / rect.height
    return [x * 2 - 1, (1 - y) * 2 - 1]
  }
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return
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
    console.log(`选择拖拽球: ${draggingId}, 位置: [${nx.toFixed(3)}, ${ny.toFixed(3)}], 距离: ${Math.sqrt(bestD).toFixed(3)}`)
  }

  const tryUpdateMergeCandidate = () => {
    const state = useMetaballStore.getState()
    const draggingBall = state.balls.find(b => b.id === draggingId)
    if (!draggingBall) { setHoverMergeCandidate(null); mergeTargetId = null; clearDwell(); return }

    console.log(`检查合并候选: 拖拽球${draggingId} (半径=${draggingBall.radius.toFixed(3)})`)

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
          console.log(`退出合并范围: 距离=${d.toFixed(3)}, 退出阈值=${thrOut.toFixed(3)}`)
          mergeTargetId = null
          setHoverMergeCandidate(null)
          clearDwell()
        } else {
          console.log(`继续合并计时: 距离=${d.toFixed(3)}, 退出阈值=${thrOut.toFixed(3)}`)
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

      console.log(`  候选球${b.id}: 距离=${d.toFixed(3)}, 阈值=${thrIn.toFixed(3)}, 半径=${b.radius.toFixed(3)}, 缩放=${currentAdaptiveScale.toFixed(3)}`)

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
      console.log(`开始合并计时: 拖拽球${draggingId} 靠近球${bestCandidate}, 等待${DWELL_MS}ms`)
      dwellTimer = setTimeout(() => {
        if (mergeTargetId === bestCandidate) {
          console.log(`合并执行: ${draggingId} + ${bestCandidate}`)
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
    try { configure() } catch {}
    const encoder = device.createCommandEncoder()
    const cpass = encoder.beginComputePass()
    cpass.setPipeline(computePipeline)
    cpass.setBindGroup(0, computeBind)
    const wx = Math.ceil(canvas.width / 8)
    const wy = Math.ceil(canvas.height / 8)
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
    raf = requestAnimationFrame(frame)
  }
  frame()

  // 清理
  return () => {
    unsubscribe()
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
    window.removeEventListener('resize', onResize)
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
    window.removeEventListener('pointerup', onWindowUp)
    window.removeEventListener('blur', onWindowUp)
    outTex.destroy(); ballsBuffer.destroy(); sizeBuffer.destroy(); countBuffer.destroy(); fusionRangeBuffer.destroy(); adaptiveScaleBuffer.destroy()
  }
}
