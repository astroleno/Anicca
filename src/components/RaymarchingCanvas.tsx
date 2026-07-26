'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js'
import { useMetaballStore } from '@/store/metaballStore'

type RaymarchingCanvasProps = {
  showLabUi?: boolean
}

// 交互常量
const K_MERGE = 1.4
const K_UNMERGE = 1.7
const DWELL_MS = 1000

// 性能目标
const TARGET_FPS_DESKTOP = 55
const TARGET_FPS_MOBILE = 45
const MIN_SCALE = 0.6
const MAX_SCALE = 1.0

// Shader 常量
const MAX_STEPS_DESKTOP = 100
const MAX_STEPS_MOBILE = 60
const PRECISION = 0.001
const MAX_DIST = 10.0

/**
 * RaymarchingCanvas 组件
 * 基于 Three.js + WebGL 的 Raymarching 渲染，支持纹理表驱动的 metaball 渲染
 * 实现后期效果：Bloom、FXAA、Gamma 校正
 */
export default function RaymarchingCanvas({ showLabUi = false }: RaymarchingCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Store 状态
  const balls = useMetaballStore(s => s.balls)
  const setPos = useMetaballStore(s => s.setPos)
  const split = useMetaballStore(s => s.split)
  const merge = useMetaballStore(s => s.merge)

  // UI 状态
  const [hoverMergeCandidate, setHoverMergeCandidate] = useState<number | null>(null)
  const [fps, setFps] = useState(0)
  const [renderScale, setRenderScale] = useState(1.0)
  const [activeBallCount, setActiveBallCount] = useState(0)
  const [preset, setPreset] = useState<'soft' | 'neutral' | 'high'>('neutral')

  // 预设参数（参考 threejs-gsap 的设置）
  const [presets, setPresets] = useState({
    soft: {
      smoothK: 0.38,
      contrast: 1.15,
      fog: 0.07,
      bloomStrength: 0.5,
      bloomThreshold: 0.18,
      bloomRadius: 0.5,
      ambientIntensity: 0.08,
      diffuseIntensity: 0.3,
      specularIntensity: 0.6,
      specularPower: 36,
      fresnelPower: 2.6
    },
    neutral: {
      smoothK: 0.32,
      contrast: 1.25,
      fog: 0.10,
      bloomStrength: 0.6,
      bloomThreshold: 0.15,
      bloomRadius: 0.6,
      ambientIntensity: 0.2, // 增加环境光，让球体更亮
      diffuseIntensity: 0.6, // 增加漫反射，增强对比度
      specularIntensity: 1.2, // 增加高光
      specularPower: 24,
      fresnelPower: 2.5
    },
    high: {
      smoothK: 0.45,
      contrast: 1.45,
      fog: 0.12,
      bloomStrength: 0.9,
      bloomThreshold: 0.12,
      bloomRadius: 0.75,
      ambientIntensity: 0.14,
      diffuseIntensity: 0.65,
      specularIntensity: 1.1,
      specularPower: 22,
      fresnelPower: 2.8
    }
  })

  // 材质和 Bloom 的引用（用于实时更新参数）
  const materialRef = useRef<THREE.ShaderMaterial | null>(null)
  const bloomPassRef = useRef<UnrealBloomPass | null>(null)

  // 性能监测
  const fpsHistoryRef = useRef<number[]>([])
  const lastFpsUpdateRef = useRef(0)

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return

    let cleanup: (() => void) | undefined
    let rafId: number

    // 初始化 Three.js 场景
    const initScene = async () => {
      try {
        // 场景、相机、渲染器
        const scene = new THREE.Scene()
        scene.background = new THREE.Color(0x05090c)
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

        // 设备检测
        const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent)
        const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 2 : 2)

        const renderer = new THREE.WebGLRenderer({
          canvas: canvasRef.current!,
          antialias: false,
          powerPreference: 'high-performance',
          alpha: false // 不需要透明背景，使用场景背景色
        })
        renderer.setPixelRatio(dpr)
        renderer.setClearColor(0x05090c, 1.0)

        // 初始尺寸
        const updateSize = () => {
          const width = containerRef.current!.clientWidth
          const height = containerRef.current!.clientHeight
          const renderWidth = Math.floor(width * renderScale)
          const renderHeight = Math.floor(height * renderScale)

          renderer.setSize(renderWidth, renderHeight, false)
          camera.updateProjectionMatrix()
        }
        updateSize()

        // 能力探测：纹理格式支持
        const gl = renderer.getContext() as WebGL2RenderingContext
        const extFloat = gl.getExtension('EXT_color_buffer_float')
        const extTextureFloat = gl.getExtension('OES_texture_float')
        const extTextureHalfFloat = gl.getExtension('OES_texture_half_float')

        // 纹理表配置（根据能力降级）
        const MAX_BALLS = isMobile ? 32 : 64
        const TEX_SIZE = Math.ceil(Math.sqrt(MAX_BALLS)) // 8x8 或 6x6
        let textureType: 'float32' | 'float16' | 'ubo' = 'float32'
        const textureFormat = THREE.RGBAFormat
        let textureDataType: THREE.TextureDataType = THREE.FloatType

        if (!extFloat && !extTextureFloat) {
          if (extTextureHalfFloat) {
            textureType = 'float16'
            textureDataType = THREE.HalfFloatType
            console.log('降级到 float16 纹理')
          } else {
            textureType = 'ubo'
            console.log('降级到 UBO（纹理不支持浮点）')
          }
        }

        const capabilities = {
          webgl2: gl instanceof WebGL2RenderingContext,
          extFloat: !!extFloat,
          extTextureFloat: !!extTextureFloat,
          extTextureHalfFloat: !!extTextureHalfFloat
        }
        console.log('WebGL 能力探测:', capabilities)
        console.log('最终配置:', {
          textureType,
          maxBalls: MAX_BALLS,
          texSize: TEX_SIZE,
          isMobile
        })

        // 创建纹理表（总是创建，即使降级到 UBO 也创建占位纹理）
        const textureData = new Float32Array(TEX_SIZE * TEX_SIZE * 4)
        const ballsTexture = new THREE.DataTexture(
          textureData,
          TEX_SIZE,
          TEX_SIZE,
          textureFormat,
          textureDataType
        )
        ballsTexture.minFilter = THREE.NearestFilter
        ballsTexture.magFilter = THREE.NearestFilter
        ballsTexture.wrapS = THREE.ClampToEdgeWrapping
        ballsTexture.wrapT = THREE.ClampToEdgeWrapping
        ballsTexture.needsUpdate = true

        // 设置 WebGL 参数
        if (gl instanceof WebGL2RenderingContext) {
          gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
        }

        // 如果降级到 UBO，记录警告但继续使用纹理（简化实现）
        if (textureType === 'ubo') {
          console.warn('纹理不支持浮点，使用 UBO 降级模式（但纹理仍会创建）')
        }

        // 创建 Raymarching 材质
        const MAX_STEPS = isMobile ? MAX_STEPS_MOBILE : MAX_STEPS_DESKTOP

        const vertexShader = `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
          }
        `

        const fragmentShader = `
          precision highp float;
          uniform sampler2D uBallsTex;
          uniform int uCount;
          uniform ivec2 uTexDim;
          uniform vec2 uResolution;
          uniform float uTime;
          uniform float uSmoothK;
          uniform float uContrast;
          uniform float uFogDensity;
          uniform float uAmbientIntensity;
          uniform float uDiffuseIntensity;
          uniform float uSpecularIntensity;
          uniform float uSpecularPower;
          uniform float uFresnelPower;
          uniform vec3 uBackgroundColor;
          uniform vec3 uSphereColor;
          uniform vec3 uLightColor;
          uniform vec3 uLightPosition;
          varying vec2 vUv;

          const int MAX_STEPS = ${MAX_STEPS};
          const float PRECISION = ${PRECISION.toFixed(6)};
          const float MAX_DIST = ${MAX_DIST.toFixed(1)};
          const float EPSILON = 0.0001;

          // 从纹理表读取球数据
          vec4 readBall(int index) {
            int x = index % uTexDim.x;
            int y = index / uTexDim.x;
            return texelFetch(uBallsTex, ivec2(x, y), 0);
          }

          // 解包 groupId 与 blendType（w= (group<<1)|blend）
          void decodePack(float w, out int groupId, out int blendType) {
            int packed = int(floor(w + 0.5));
            groupId = packed >> 1;
            blendType = packed & 1; // 0=min, 1=smin
          }

          // SDF: 球体距离场
          float sdSphere(vec3 p, vec3 center, float radius) {
            return length(p - center) - radius;
          }

          // Smooth min (多项式混合)
          float smin(float a, float b, float k) {
            float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
            return mix(b, a, h) - k * h * (1.0 - h);
          }

          // 屏幕长宽比
          float getAspect() { return uResolution.x / uResolution.y; }

          // 计算指定组的SDF（blendType: 0=min 硬并集；1=smin 平滑并集）
          float sdfGroup(vec3 p, int targetGroup) {
            float distMin = MAX_DIST;
            bool initialized = false;
            float aspect = uResolution.x / uResolution.y;
            for (int j = 0; j < 64; j++) {
              if (j >= uCount) break;
              vec4 ball = readBall(j);
              int groupId; int blendType;
              decodePack(ball.w, groupId, blendType);
              if (groupId != targetGroup) continue;

              vec2 pos2d = ball.xy;
              float radiusRaw = ball.z;
              float radiusScale = 0.2; // 缩小半径使之更贴合 UI
              float radius = radiusRaw * radiusScale;
              // Apply same aspect scaling to center.x only
              vec3 center = vec3(pos2d.x * aspect, pos2d.y, 0.0);
              float d = sdSphere(p, center, radius);

              if (!initialized) { distMin = d; initialized = true; }
              else {
                if (blendType == 1) distMin = smin(distMin, d, uSmoothK);
                else distMin = min(distMin, d);
              }
            }
            return distMin;
          }

          // 计算场景 SDF：前景与背景的最小值（用于步进）
          float sceneSDF(vec3 p) {
            float dFg = sdfGroup(p, 0);
            float dBg = sdfGroup(p, 1);
            return min(dFg, dBg);
          }

          // Raymarching 主循环
          float raymarch(vec3 ro, vec3 rd) {
            float t = 0.0;

            for (int i = 0; i < MAX_STEPS; i++) {
              vec3 p = ro + rd * t;
              float dist = sceneSDF(p);

              if (dist < PRECISION) {
                return t;
              }

              // 自适应步进：远离时大步长，命中附近小步长
              float stepScale = 0.8;
              if (dist > 0.1) {
                stepScale = 1.2; // 远离时大步长
              } else if (dist < 0.05) {
                stepScale = 0.5; // 命中附近小步长
              }
              t += dist * stepScale;
              if (t > MAX_DIST) break;
            }

            return -1.0;
          }

          // 计算法线（有限差分）
          vec3 calcNormal(vec3 p) {
            vec2 e = vec2(EPSILON, 0.0);
            return normalize(vec3(
              sceneSDF(p + e.xyy) - sceneSDF(p - e.xyy),
              sceneSDF(p + e.yxy) - sceneSDF(p - e.yxy),
              sceneSDF(p + e.yyx) - sceneSDF(p - e.yyx)
            ));
          }

          // Ambient Occlusion（基于距离的近似）
          float ambientOcclusion(vec3 p, vec3 n) {
            float occ = 0.0;
            float weight = 1.0;

            for (int i = 0; i < 5; i++) {
              float dist = 0.01 + 0.02 * float(i * i);
              float h = sceneSDF(p + n * dist);
              occ += (dist - h) * weight;
              weight *= 0.85;
            }

            return clamp(1.0 - occ, 0.0, 1.0);
          }

          // Soft Shadows（可选，用于更真实的光影）
          float softShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
            float result = 1.0;
            float t = mint;

            for (int i = 0; i < 32; i++) {
              if (t >= maxt) break;

              float h = sceneSDF(ro + rd * t);

              if (h < EPSILON) {
                return 0.0;
              }

              result = min(result, k * h / t);
              t += h;
            }

            return result;
          }

          // 计算到表面的距离（用于麻薯质感）
          // 直接使用 sceneSDF 的值，正值表示在表面外，负值表示在表面内
          float getDistanceToSurface(vec3 p) {
            return sceneSDF(p);
          }

          void main() {
            vec2 uv = (gl_FragCoord.xy / uResolution.xy) * 2.0 - 1.0;
            float aspect = uResolution.x / uResolution.y;
            uv.x *= aspect;

            // 调试：显示 uCount
            if (uCount <= 0) {
              gl_FragColor = vec4(0.1, 0.0, 0.0, 1.0); // 红色表示没有球
              return;
            }

            // Orthographic ray setup: screen-aligned rays
            vec3 ro = vec3(uv, 2.0);
            vec3 rd = vec3(0.0, 0.0, -1.0);

            float t = raymarch(ro, rd);

            vec3 color = uBackgroundColor; // 使用背景色作为初始颜色
            float alpha = 0.0; // 初始化透明度

            if (t > 0.0) {
              vec3 p = ro + rd * t;

              // 判定命中组：比较前景/背景SDF
              float dFgHit = sdfGroup(p, 0);
              float dBgHit = sdfGroup(p, 1);
              bool hitForeground = (dFgHit <= dBgHit);

              // 计算法线
              vec3 normal = calcNormal(p);
              vec3 viewDir = -rd;

              // 基础颜色（使用深色球体 + 彩色光照）
              vec3 baseColor = uSphereColor;

              // Ambient light
              vec3 ambient = baseColor * uAmbientIntensity;

              // Directional light
              vec3 lightDir = normalize(uLightPosition);
              float diff = max(dot(normal, lightDir), 0.0);
              vec3 diffuse = baseColor * uLightColor * diff * uDiffuseIntensity;

              // Specular highlight
              vec3 reflectDir = reflect(-lightDir, normal);
              float spec = pow(max(dot(viewDir, reflectDir), 0.0), uSpecularPower);
              vec3 specular = uLightColor * spec * uSpecularIntensity;

              // Fresnel effect（边缘光，麻薯质感的关键）
              float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), uFresnelPower);
              specular *= fresnel;

              // Ambient Occlusion
              float ao = ambientOcclusion(p, normal);

              // Soft Shadows（可选，性能开销较大）
              // float shadow = softShadow(p, lightDir, 0.01, 10.0, 16.0);
              float shadow = 1.0; // 暂时关闭阴影以提升性能

              // 组合光照（前景使用麻薯质感，背景弱化为背景色+雾）
              if (hitForeground) {
                color = ambient * ao + (diffuse * shadow + specular) * ao;
              } else {
                color = uBackgroundColor;
              }

              // 麻薯质感：基于距离的透明度渐变
              // 计算到表面的距离（SDF 值），正值=表面外，负值=表面内
              float distToSurface = abs(getDistanceToSurface(p));
              // 边缘软化：距离表面越近，透明度越高；距离越远，透明度越低
              // 使用 smoothstep 创建柔和的边缘过渡
              float edgeSoftness = 0.2; // 边缘软化范围（可调）
              alpha = 1.0 - smoothstep(0.0, edgeSoftness, distToSurface);

              // 体积渐变：从中心到边缘的透明度变化
              // 基于法线和视角的关系，边缘更透明（fresnel 效果）
              float volumeAlpha = 1.0 - fresnel * 0.4; // 边缘稍微透明，增强麻薯质感
              if (hitForeground) {
                alpha *= volumeAlpha;
              } else {
                alpha = 0.0; // 背景不叠加前景透明度
              }

              // 确保 alpha 在合理范围内
              alpha = clamp(alpha, 0.0, 1.0);

              // 雾效果
              float fog = 1.0 - exp(-t * uFogDensity);
              color = mix(color, uBackgroundColor, fog);

              // 对比度调整
              color = pow(color, vec3(1.0 / uContrast));

              // 输出带透明度的颜色（用于麻薯质感）
              gl_FragColor = vec4(color, alpha);
            } else {
              // 透明背景
              gl_FragColor = vec4(uBackgroundColor, 0.0);
            }
          }
        `

        const material = new THREE.ShaderMaterial({
          uniforms: {
            uBallsTex: { value: ballsTexture },
            uCount: { value: 0 },
            uTexDim: { value: new THREE.Vector2(TEX_SIZE, TEX_SIZE) },
            uResolution: { value: new THREE.Vector2(renderer.domElement.width, renderer.domElement.height) },
            uTime: { value: 0 },
            // 质感参数（参考 threejs-gsap 的设置）
            uSmoothK: { value: presets[preset].smoothK },
            uContrast: { value: presets[preset].contrast },
            uFogDensity: { value: presets[preset].fog },
            uAmbientIntensity: { value: presets[preset].ambientIntensity },
            uDiffuseIntensity: { value: presets[preset].diffuseIntensity },
            uSpecularIntensity: { value: presets[preset].specularIntensity },
            uSpecularPower: { value: presets[preset].specularPower },
            uFresnelPower: { value: presets[preset].fresnelPower },
            uBackgroundColor: { value: new THREE.Color(0x05090c) },
            uSphereColor: { value: new THREE.Color(0x12382f) },
            uLightColor: { value: new THREE.Color(0xe6be62) },
            uLightPosition: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
          },
          vertexShader,
          fragmentShader,
          transparent: true, // 启用透明度支持麻薯质感
          depthWrite: false, // 透明物体不需要写入深度
        })

        // 检查 shader 编译错误
        material.onBeforeCompile = () => {
          console.log('Shader 开始编译...')
        }

        // 监听 shader 错误（在第一次渲染后检查）
        setTimeout(() => {
          const program = (material as any).program
          if (program) {
            const infoLog = gl.getProgramInfoLog(program)
            if (infoLog) {
              console.error('Shader Program 错误:', infoLog)
            } else {
              console.log('Shader Program 编译成功')
            }
          }
        }, 100)

        materialRef.current = material

        // 创建全屏平面
        const geometry = new THREE.PlaneGeometry(2, 2)
        const plane = new THREE.Mesh(geometry, material)
        scene.add(plane)

        // 后期处理链
        const composer = new EffectComposer(renderer)
        composer.addPass(new RenderPass(scene, camera))

        // Bloom Pass（参考 threejs-gsap 的设置）
        const bloomPass = new UnrealBloomPass(
          new THREE.Vector2(renderer.domElement.width, renderer.domElement.height),
          presets[preset].bloomStrength, // strength
          presets[preset].bloomRadius, // radius
          presets[preset].bloomThreshold // threshold
        )
        composer.addPass(bloomPass)
        bloomPassRef.current = bloomPass

        // FXAA Pass
        const fxaaPass = new ShaderPass(FXAAShader)
        fxaaPass.material.uniforms['resolution'].value.x = 1 / renderer.domElement.width
        fxaaPass.material.uniforms['resolution'].value.y = 1 / renderer.domElement.height
        composer.addPass(fxaaPass)

        // Gamma Pass
        const gammaPass = new ShaderPass(GammaCorrectionShader)
        composer.addPass(gammaPass)

        // 纹理表索引映射：ballId -> textureIndex
        const ballIdToIndex = new Map<number, number>()
        let lastActiveCount = 0

        // 屏幕裁剪：检查球是否在视锥内
        const isBallVisible = (ball: typeof balls[0]): boolean => {
          // 简单检查：球是否在屏幕范围内（加上半径缓冲）
          const margin = ball.radius + 0.2
          return ball.pos[0] >= -1 - margin && ball.pos[0] <= 1 + margin &&
                 ball.pos[1] >= -1 - margin && ball.pos[1] <= 1 + margin
        }

        // 分组/融合策略：示例
        // 前景组(0)：level==0 或 奇数 id；平滑并集(smin)
        // 背景组(1)：其他；硬并集(min)，仅用于视觉层次，不参与交互
        const computeGroupBlend = (ball: typeof balls[0], index: number) => {
          const isForeground = (ball.level === 0) || (ball.id % 2 === 1)
          const groupId = isForeground ? 0 : 1
          const blendType = 0 // 先用硬并集，便于查看 7 个独立球与序号对齐
          return { groupId, blendType }
        }

        // 更新纹理表数据（全量或增量）
        const updateTextureData = (fullUpdate = false) => {
          // 从 store 获取最新球数据
          const currentBalls = useMetaballStore.getState().balls
          // CPU 侧粗裁剪：只处理可见的球
          const activeBalls = currentBalls.filter(b => b.active !== false && isBallVisible(b))
          const textureData = ballsTexture.image.data as Float32Array
          const gl = renderer.getContext() as WebGL2RenderingContext

          // 如果球数量变化，需要全量更新并重建索引
          if (fullUpdate || activeBalls.length !== lastActiveCount) {
            textureData.fill(0)
            ballIdToIndex.clear()

            for (let i = 0; i < activeBalls.length && i < MAX_BALLS; i++) {
              const ball = activeBalls[i]
              ballIdToIndex.set(ball.id, i)
              const idx = i * 4
              textureData[idx + 0] = ball.pos[0]
              textureData[idx + 1] = ball.pos[1]
              textureData[idx + 2] = ball.radius
              // pack groupId and blendType into w channel: (group<<1)|blend
              const { groupId, blendType } = computeGroupBlend(ball, i)
              const packed = (groupId << 1) | blendType
              textureData[idx + 3] = packed
            }

            ballsTexture.needsUpdate = true
            if (materialRef.current) {
              const count = Math.min(activeBalls.length, MAX_BALLS)
              materialRef.current.uniforms.uCount.value = count
              console.log('updateTextureData 设置 uCount:', count, 'activeBalls:', activeBalls.length)
            }
            lastActiveCount = activeBalls.length

            // 日志：纹理表更新
            console.log(`纹理表更新: 全量更新, 球数=${activeBalls.length}, 耗时=0ms`)
            if (activeBalls.length > 0) {
              console.log('写入纹理的球数据:', activeBalls.slice(0, 3).map(b => ({
                id: b.id,
                pos: b.pos,
                radius: b.radius,
                textureIndex: ballIdToIndex.get(b.id)
              })))
              // 检查纹理数据是否正确写入
              const firstBallIndex = ballIdToIndex.get(activeBalls[0].id)!
              const idx = firstBallIndex * 4
              console.log('纹理数据验证:', {
                index: firstBallIndex,
                textureData: [
                  textureData[idx + 0],
                  textureData[idx + 1],
                  textureData[idx + 2],
                  textureData[idx + 3]
                ],
                expected: [activeBalls[0].pos[0], activeBalls[0].pos[1], activeBalls[0].radius, activeBalls[0].level]
              })
            }
          } else {
            // 增量更新：只更新变化的球
            const changedBalls: Array<{ index: number, ball: typeof currentBalls[0] }> = []
            for (const ball of activeBalls) {
              const index = ballIdToIndex.get(ball.id)
              if (index !== undefined) {
                changedBalls.push({ index, ball })
              }
            }

            // 批量更新：合并多个变更为单次 texSubImage2D
            if (changedBalls.length > 0) {
              const startTime = performance.now()

              for (const { index, ball } of changedBalls) {
                const idx = index * 4
                textureData[idx + 0] = ball.pos[0]
                textureData[idx + 1] = ball.pos[1]
                textureData[idx + 2] = ball.radius
                const { groupId, blendType } = computeGroupBlend(ball, index)
                const packed = (groupId << 1) | blendType
                textureData[idx + 3] = packed
              }

              // 使用 texSubImage2D 增量更新
              try {
                const textureHandle = (ballsTexture as unknown as {
                  source?: { data?: { texture?: WebGLTexture | null } };
                }).source?.data?.texture

                if (
                  gl instanceof WebGL2RenderingContext &&
                  (gl as any).texSubImage2D &&
                  textureHandle
                ) {
                  gl.bindTexture(gl.TEXTURE_2D, textureHandle)

                  // 更新整个纹理（为了简化，这里仍然更新全部，但可以优化为只更新变更区域）
                  gl.texSubImage2D(
                    gl.TEXTURE_2D,
                    0,
                    0,
                    0,
                    TEX_SIZE,
                    TEX_SIZE,
                    gl.RGBA,
                    gl.FLOAT,
                    textureData
                  )
                } else {
                  for (const { index, ball } of changedBalls) {
                    const idx = index * 4
                    textureData[idx + 0] = ball.pos[0]
                    textureData[idx + 1] = ball.pos[1]
                    textureData[idx + 2] = ball.radius
                    const { groupId, blendType } = computeGroupBlend(ball, index)
                    const packed = (groupId << 1) | blendType
                    textureData[idx + 3] = packed
                  }
                  ballsTexture.needsUpdate = true
                }
              } catch (error) {
                console.error('纹理上传失败:', error)
                // 降级到全量更新
                ballsTexture.needsUpdate = true
              }

              const elapsed = performance.now() - startTime
              if (elapsed > 1) { // 只记录耗时超过 1ms 的更新
                console.log(`纹理表增量更新: 变更=${changedBalls.length}, 耗时=${elapsed.toFixed(2)}ms`)
              }
            }
          }

          setActiveBallCount(activeBalls.length)
        }

        // 调试：检查初始球数据
        const initialBalls = useMetaballStore.getState().balls
        const initialActiveBalls = initialBalls.filter(b => b.active !== false)
        console.log('初始球数据:', {
          total: initialBalls.length,
          active: initialActiveBalls.length,
          balls: initialActiveBalls.map(b => ({ id: b.id, pos: b.pos, radius: b.radius }))
        })

        // 初始更新（必须在 material 创建后）
        updateTextureData(true)

        // 确保 uCount 被正确设置（延迟设置，等待material完全初始化）
        setTimeout(() => {
          if (materialRef.current) {
            const currentBalls = useMetaballStore.getState().balls
            const activeBalls = currentBalls.filter(b => b.active !== false && isBallVisible(b))
            const count = Math.min(activeBalls.length, MAX_BALLS)
            materialRef.current.uniforms.uCount.value = count
            console.log('设置 uCount:', count, 'activeBalls:', activeBalls.length, 'MAX_BALLS:', MAX_BALLS)
            console.log('uCount uniform 当前值:', materialRef.current.uniforms.uCount.value)
          } else {
            console.error('materialRef.current 为 null，无法设置 uCount')
          }
        }, 200)

        // 订阅 store 变化
        const unsubscribe = useMetaballStore.subscribe((state, prev) => {
          const currActive = state.balls.filter(b => b.active !== false).length
          const prevActive = prev?.balls ? prev.balls.filter(b => b.active !== false).length : currActive

          // 球数量变化时全量更新，否则增量更新
          updateTextureData(currActive !== prevActive)

          // 调试日志
          if (currActive !== prevActive) {
            console.log(`球数量变化: ${prevActive} -> ${currActive}`)
          }
        })

        // 交互处理（拖拽、合并检测）
        let dragging = false
        let draggingId = 0
        let mergeTargetId: number | null = null
        let dwellTimer: NodeJS.Timeout | null = null

        const clearDwell = () => {
          if (dwellTimer) {
            clearTimeout(dwellTimer)
            dwellTimer = null
          }
        }

        const toNDC = (clientX: number, clientY: number): [number, number] => {
          const rect = canvasRef.current!.getBoundingClientRect()
          const x = (clientX - rect.left) / rect.width
          const y = (clientY - rect.top) / rect.height
          return [x * 2 - 1, (1 - y) * 2 - 1]
        }

        // 双击检测
        let lastClickTime = 0
        let lastClickId = -1
        const DOUBLE_CLICK_DELAY = 300

        const onDown = (e: PointerEvent) => {
          if (e.button !== 0) return

          const [nx, ny] = toNDC(e.clientX, e.clientY)
          const state = useMetaballStore.getState()
          let best = -1, bestD = Infinity

          for (const b of state.balls) {
            if (b.active === false) continue
            const dx = b.pos[0] - nx
            const dy = b.pos[1] - ny
            const d = dx * dx + dy * dy
            if (d <= bestD) {
              bestD = d
              best = b.id
            }
          }

          // 双击检测：触发 split
          const now = Date.now()
          if (now - lastClickTime < DOUBLE_CLICK_DELAY && lastClickId === best) {
            try {
              console.log('双击触发 split:', best)
              split(best)
              console.log('split 完成:', best)
            } catch (error) {
              console.error('split 失败:', error, { ballId: best })
            }
            lastClickTime = 0
            lastClickId = -1
            return
          }

          lastClickTime = now
          lastClickId = best

          dragging = true
          canvasRef.current!.setPointerCapture(e.pointerId)
          draggingId = best
        }

        // 右键菜单：触发 split
        const onContextMenu = (e: MouseEvent) => {
          e.preventDefault()
          const [nx, ny] = toNDC(e.clientX, e.clientY)
          const state = useMetaballStore.getState()
          let best = 0, bestD = Infinity

          for (const b of state.balls) {
            if (b.active === false) continue
            const dx = b.pos[0] - nx
            const dy = b.pos[1] - ny
            const d = dx * dx + dy * dy
            if (d < bestD) {
              bestD = d
              best = b.id
            }
          }

          try {
            console.log('右键触发 split:', best)
            split(best)
            console.log('split 完成:', best)
          } catch (error) {
            console.error('split 失败:', error, { ballId: best })
          }
        }

        const tryUpdateMergeCandidate = () => {
          const state = useMetaballStore.getState()
          const draggingBall = state.balls.find(b => b.id === draggingId)
          if (!draggingBall) {
            setHoverMergeCandidate(null)
            mergeTargetId = null
            clearDwell()
            return
          }

          // 检查是否还在合并范围内
          if (mergeTargetId !== null) {
            const targetBall = state.balls.find(b => b.id === mergeTargetId)
            if (targetBall) {
              const dx = targetBall.pos[0] - draggingBall.pos[0]
              const dy = targetBall.pos[1] - draggingBall.pos[1]
              const d = Math.sqrt(dx * dx + dy * dy)
              const thrOut = K_UNMERGE * (targetBall.radius + draggingBall.radius)

              if (d > thrOut) {
                mergeTargetId = null
                setHoverMergeCandidate(null)
                clearDwell()
              }
              return
            }
          }

          // 寻找新的合并候选
          let bestCandidate: number | null = null
          for (const b of state.balls) {
            if (b.id === draggingId || b.active === false) continue
            const dx = b.pos[0] - draggingBall.pos[0]
            const dy = b.pos[1] - draggingBall.pos[1]
            const d = Math.sqrt(dx * dx + dy * dy)
            const thrIn = K_MERGE * (b.radius + draggingBall.radius)

            if (d <= thrIn) {
              bestCandidate = b.id
              break
            }
          }

            if (bestCandidate !== null && mergeTargetId !== bestCandidate) {
            mergeTargetId = bestCandidate
            setHoverMergeCandidate(bestCandidate)
            clearDwell()
            console.log(`开始合并计时: 拖拽球${draggingId} 靠近球${bestCandidate}, 等待${DWELL_MS}ms`)
            dwellTimer = setTimeout(() => {
              if (mergeTargetId === bestCandidate) {
                try {
                  console.log(`自动合并触发: ${draggingId} + ${bestCandidate}`)
                  merge(draggingId, bestCandidate)
                  console.log('自动合并完成')
                } catch (error) {
                  console.error('自动合并失败:', error, { ballA: draggingId, ballB: bestCandidate })
                }
                clearDwell()
              }
            }, DWELL_MS)
          }
        }

        const stopDrag = () => {
          dragging = false
          clearDwell()
          mergeTargetId = null
          setHoverMergeCandidate(null)
        }

        const onMove = (e: PointerEvent) => {
          if (!dragging) return
          requestAnimationFrame(() => {
            const [nx, ny] = toNDC(e.clientX, e.clientY)
            setPos(draggingId, [nx, ny])
            tryUpdateMergeCandidate()
          })
        }

        const onUp = (e: PointerEvent) => {
          stopDrag()
          try {
            canvasRef.current!.releasePointerCapture(e.pointerId)
          } catch {}
        }

        const canvas = canvasRef.current
        if (canvas) {
          canvas.addEventListener('pointerdown', onDown)
          canvas.addEventListener('pointermove', onMove)
          canvas.addEventListener('pointerup', onUp)
          canvas.addEventListener('pointercancel', onUp)
          canvas.addEventListener('contextmenu', onContextMenu)
          canvas.style.touchAction = 'none'
        }

        // 性能监测与动态分辨率
        let frameCount = 0
        let lastTime = performance.now()
        let lastScaleChange = 0
        const SCALE_CHANGE_COOLDOWN = 1000 // 1s 冷却

        const updatePerformance = () => {
          frameCount++
          const now = performance.now()
          if (now - lastTime >= 500) {
            const currentFps = (frameCount * 1000) / (now - lastTime)
            frameCount = 0
            lastTime = now

            // 更新 FPS 历史（1s 滑窗）
            fpsHistoryRef.current.push(currentFps)
            if (fpsHistoryRef.current.length > 2) {
              fpsHistoryRef.current.shift()
            }

            const avgFps = fpsHistoryRef.current.reduce((a, b) => a + b, 0) / fpsHistoryRef.current.length
            setFps(Math.round(avgFps))

            // 动态分辨率调整（带冷却）
            if (now - lastScaleChange >= SCALE_CHANGE_COOLDOWN) {
              const targetFps = isMobile ? TARGET_FPS_MOBILE : TARGET_FPS_DESKTOP
              const highFps = isMobile ? TARGET_FPS_MOBILE + 5 : TARGET_FPS_DESKTOP + 5

              if (avgFps < targetFps - 5 && renderScale > MIN_SCALE) {
                setRenderScale(prev => {
                  const newScale = Math.max(MIN_SCALE, prev - 0.1)
                  console.log(`动态分辨率触发: FPS=${avgFps.toFixed(1)}, scale=${newScale.toFixed(2)}`)
                  lastScaleChange = now
                  return newScale
                })
              } else if (avgFps > highFps && renderScale < MAX_SCALE) {
                // 检查连续 2s 高 FPS（需要在外部维护状态）
                setRenderScale(prev => {
                  const newScale = Math.min(MAX_SCALE, prev + 0.1)
                  console.log(`动态分辨率回弹: FPS=${avgFps.toFixed(1)}, scale=${newScale.toFixed(2)}`)
                  lastScaleChange = now
                  return newScale
                })
              }
            }
          }
        }

        // 渲染循环
        const clock = new THREE.Clock()
        const animate = () => {
          rafId = requestAnimationFrame(animate)

          updatePerformance()

          // 更新 uniforms
          if (materialRef.current) {
            materialRef.current.uniforms.uTime.value = clock.getElapsedTime()
            materialRef.current.uniforms.uResolution.value.set(
              renderer.domElement.width,
              renderer.domElement.height
            )

            // 更新质感参数（如果预设改变）
            const currentPreset = presets[preset]
            materialRef.current.uniforms.uSmoothK.value = currentPreset.smoothK
            materialRef.current.uniforms.uContrast.value = currentPreset.contrast
            materialRef.current.uniforms.uFogDensity.value = currentPreset.fog
            materialRef.current.uniforms.uAmbientIntensity.value = currentPreset.ambientIntensity
            materialRef.current.uniforms.uDiffuseIntensity.value = currentPreset.diffuseIntensity
            materialRef.current.uniforms.uSpecularIntensity.value = currentPreset.specularIntensity
            materialRef.current.uniforms.uSpecularPower.value = currentPreset.specularPower
            materialRef.current.uniforms.uFresnelPower.value = currentPreset.fresnelPower
          }

          // 更新 Bloom 参数（随分辨率缩放和预设）
          if (bloomPassRef.current) {
            const currentPreset = presets[preset]
            bloomPassRef.current.strength = currentPreset.bloomStrength * (0.7 + 0.3 * renderScale)
            bloomPassRef.current.threshold = currentPreset.bloomThreshold
            bloomPassRef.current.radius = currentPreset.bloomRadius
          }

          // 渲染
          composer.render()
        }
        animate()

        // 窗口大小变化
        const handleResize = () => {
          updateSize()
          composer.setSize(renderer.domElement.width, renderer.domElement.height)
          fxaaPass.material.uniforms['resolution'].value.x = 1 / renderer.domElement.width
          fxaaPass.material.uniforms['resolution'].value.y = 1 / renderer.domElement.height
        }
        window.addEventListener('resize', handleResize)

        // 清理函数
        cleanup = () => {
          cancelAnimationFrame(rafId)
          unsubscribe()
          window.removeEventListener('resize', handleResize)
          if (canvas) {
            canvas.removeEventListener('pointerdown', onDown)
            canvas.removeEventListener('pointermove', onMove)
            canvas.removeEventListener('pointerup', onUp)
            canvas.removeEventListener('pointercancel', onUp)
            canvas.removeEventListener('contextmenu', onContextMenu)
          }
          clearDwell()
          try {
            composer?.dispose()
            renderer?.dispose()
            ballsTexture?.dispose()
            material?.dispose()
            geometry?.dispose()
          } catch (e) {
            console.warn('清理资源时出错:', e)
          }
        }
      } catch (error) {
        console.error('RaymarchingCanvas 初始化失败:', error)
        // 记录错误详情
        if (error instanceof Error) {
          console.error('错误详情:', {
            message: error.message,
            stack: error.stack,
            name: error.name
          })
        }
      }
    }

    initScene().then(() => {
      console.log('RaymarchingCanvas 初始化完成')
    }).catch(console.error)

    return () => {
      if (cleanup) cleanup()
    }
  }, [balls, setPos, split, merge, renderScale, preset])

  // 将 NDC 坐标转换为屏幕像素坐标（用于标签显示）
  const ndcToPixel = (ndc: [number, number]): [number, number] => {
    if (!containerRef.current) return [0, 0]
    const rect = containerRef.current.getBoundingClientRect()
    const x = (ndc[0] + 1) * 0.5 * rect.width
    const y = (1 - ndc[1]) * 0.5 * rect.height
    return [x, y]
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      {showLabUi ? (
        <div style={{
          position: 'absolute',
          top: 20,
          left: 20,
          zIndex: 1000,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(10px)',
          color: '#fff',
          padding: '10px 15px',
          borderRadius: '8px',
          fontSize: '12px',
          fontFamily: 'monospace'
        }}>
          <div>FPS: {fps}</div>
          <div>分辨率: {Math.round(renderScale * 100)}%</div>
          <div>球数: {activeBallCount}</div>
        </div>
      ) : null}

      {showLabUi ? (
        <div style={{
          position: 'absolute',
          top: 20,
          right: 20,
          zIndex: 1000,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(10px)',
          color: '#fff',
          padding: '10px 15px',
          borderRadius: '8px',
          fontSize: '12px'
        }}>
          <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>预设</div>
          <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
            {(['soft', 'neutral', 'high'] as const).map((p) => (
              <button
                key={p}
                onClick={() => {
                  setPreset(p)
                  console.log(`切换预设: ${p}`, presets[p])
                }}
                style={{
                  padding: '4px 8px',
                  background: preset === p ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '4px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '11px'
                }}
              >
                {p === 'soft' ? '柔和' : p === 'neutral' ? '中性' : '高对比'}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {showLabUi ? (
        <div style={{
          position: 'absolute',
          bottom: 20,
          left: 20,
          zIndex: 1000,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(10px)',
          color: '#fff',
          padding: '10px 15px',
          borderRadius: '8px',
          fontSize: '11px',
          maxWidth: '200px'
        }}>
        <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>参数调整</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px' }}>
              SmoothK: {presets[preset].smoothK.toFixed(2)}
            </label>
            <input
              type="range"
              min="0.2"
              max="0.5"
              step="0.01"
              value={presets[preset].smoothK}
              onChange={(e) => {
                const value = parseFloat(e.target.value)
                setPresets(prev => ({
                  ...prev,
                  [preset]: { ...prev[preset], smoothK: value }
                }))
                if (materialRef.current) {
                  materialRef.current.uniforms.uSmoothK.value = value
                }
                console.log(`调整 smoothK: ${value.toFixed(2)}`)
              }}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px' }}>
              Contrast: {presets[preset].contrast.toFixed(2)}
            </label>
            <input
              type="range"
              min="1.0"
              max="2.0"
              step="0.05"
              value={presets[preset].contrast}
              onChange={(e) => {
                const value = parseFloat(e.target.value)
                setPresets(prev => ({
                  ...prev,
                  [preset]: { ...prev[preset], contrast: value }
                }))
                if (materialRef.current) {
                  materialRef.current.uniforms.uContrast.value = value
                }
                console.log(`调整 contrast: ${value.toFixed(2)}`)
              }}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px' }}>
              Fog: {presets[preset].fog.toFixed(2)}
            </label>
            <input
              type="range"
              min="0.0"
              max="0.2"
              step="0.01"
              value={presets[preset].fog}
              onChange={(e) => {
                const value = parseFloat(e.target.value)
                setPresets(prev => ({
                  ...prev,
                  [preset]: { ...prev[preset], fog: value }
                }))
                if (materialRef.current) {
                  materialRef.current.uniforms.uFogDensity.value = value
                }
                console.log(`调整 fog: ${value.toFixed(2)}`)
              }}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px' }}>
              Bloom: {presets[preset].bloomStrength.toFixed(2)}
            </label>
            <input
              type="range"
              min="0.0"
              max="1.5"
              step="0.05"
              value={presets[preset].bloomStrength}
              onChange={(e) => {
                const value = parseFloat(e.target.value)
                setPresets(prev => ({
                  ...prev,
                  [preset]: { ...prev[preset], bloomStrength: value }
                }))
                if (bloomPassRef.current) {
                  bloomPassRef.current.strength = value
                }
                console.log(`调整 bloomStrength: ${value.toFixed(2)}`)
              }}
              style={{ width: '100%' }}
            />
          </div>
        </div>
        </div>
      ) : null}

      {/* 球体序号标签 */}
      {showLabUi ? balls.filter(b => b.active !== false).map((ball) => {
        const [x, y] = ndcToPixel(ball.pos)
        const isHoverMerge = hoverMergeCandidate === ball.id

        return (
          <div
            key={ball.id}
            style={{
              position: 'absolute',
              left: x - 20,
              top: y - 10,
              zIndex: 1000,
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
              pointerEvents: 'auto',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
            }}
          >
            {ball.id}
          </div>
        )
      }) : null}
    </div>
  )
}
