import React, { useEffect, useMemo, useRef, useState, PointerEvent } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";

/**
 * 可拖动的序号句柄
 */
type Handle = { id: number; x: number; y: number; r: number };

const MAX_BALLS = 6;

/** 将像素坐标转为 [0,1] 归一化 */
function pxToUV(x: number, y: number, w: number, h: number) {
  return [x / w, 1.0 - y / h] as const;
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

/**
 * 片元着色器：噪波背景 + metaball 软并 + 弥散圆风格
 * - 背景：fbm + sin 映射 + pow 压缩，参照 ShaderPark 风格的“柔光彩云”
 * - 场：sum(exp(-k * d^2) * strength) 形成软并，二级 smoothstep 打造弥散边缘
 */
const frag = /* glsl */ `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform int u_count;
uniform vec2 u_centers[${MAX_BALLS}];
uniform float u_radii[${MAX_BALLS}];

//
// 2D hash + noise + fbm
//
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=hash(i);
  float b=hash(i+vec2(1.,0.));
  float c=hash(i+vec2(0.,1.));
  float d=hash(i+vec2(1.,1.));
  vec2 u=f*f*(3.-2.*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v=0.0;
  float a=0.5;
  mat2 m = mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<5;i++){
    v += a*noise(p);
    p = m*p + 0.03;
    a *= 0.5;
  }
  return v;
}

vec3 sparkColor(vec2 uv, float t){
  // 参考 ShaderPark: sin(fbm)*0.5+0.75 -> pow(...,8.)
  vec2 q = uv*1.3 + vec2(0.0, -t*0.05);
  float n = sin(fbm(q)*2.0)*0.5 + 0.75;
  vec3 c = vec3(n, fbm(q+0.17), fbm(q+0.37));
  c = pow(c, vec3(8.0));            // 拉亮中心，压暗边缘
  return c;
}

// 计算多心高斯场（屏幕空间）
float field(vec2 uv, int count){
  // k 控制衰减斜率；建议与半径匹配
  float sumv = 0.0;
  for(int i=0;i<${MAX_BALLS};++i){
    if(i>=count) break;
    vec2 c = u_centers[i];
    float r  = u_radii[i];
    float d2 = dot(uv-c, uv-c);
    float k = 2.5 / max(r*r, 1e-4);     // 半径越大，衰减越缓
    float w = exp(-k * d2);             // 高斯核
    sumv += w;
  }
  return sumv;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = u_time;

  // 背景
  vec3 bg = sparkColor(uv, t);

  // metaball 场
  float f = field(uv, u_count);

  // 单一阈值：越接近 1.0 越像传统 metaball
  float th  = 0.85;
  float edge = smoothstep(th-0.08, th+0.08, f);

  // 弥散边缘（额外一圈更宽的羽化）
  float glow = smoothstep(th-0.22, th-0.02, f) * 0.65;

  // 球内色彩：对背景做“亮度提拉 + 轻微色偏”，与 ShaderPark 背景同源，保持一致性
  // 根据场值生成“中心高亮”的感受
  float lift = smoothstep(th, 1.2, f);
  vec3 ball = bg;
  ball = mix(ball, ball*1.35 + vec3(0.06,0.03,-0.02), clamp(lift, 0.0, 1.0)); // 轻微暖黄提亮

  // 将弥散光晕叠加到背景
  vec3 col = mix(bg, ball, edge);
  col += glow * (0.18 + 0.12*fbm(uv*3.0 + t*0.02)); // 外缘漂浮

  gl_FragColor = vec4(col, 1.0);
}
`;

const vert = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

function FullscreenShader({
  centers,
  radii,
}: {
  centers: Handle[];
  radii: number[];
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const { size, gl } = useThree();

  const material = useMemo(() => {
    const uniforms: Record<string, THREE.IUniform> = {
      u_resolution: { value: new THREE.Vector2(size.width, size.height) },
      u_time: { value: 0 },
      u_count: { value: centers.length },
      u_centers: { value: new Array(MAX_BALLS).fill(new THREE.Vector2()) },
      u_radii: { value: new Array(MAX_BALLS).fill(0.2) },
    };
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: vert,
      fragmentShader: frag,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 每帧更新
  useFrame((state) => {
    if (!material) return;
    const t = state.clock.getElapsedTime();
    material.uniforms.u_time.value = t;
    material.uniforms.u_resolution.value.set(size.width, size.height);
    material.uniforms.u_count.value = centers.length;

    // 将像素坐标转 uv，写入 uniform 数组
    const uvCenters: THREE.Vector2[] = [];
    for (let i = 0; i < MAX_BALLS; i++) {
      if (i < centers.length) {
        const [u, v] = pxToUV(centers[i].x, centers[i].y, size.width, size.height);
        uvCenters.push(new THREE.Vector2(clamp01(u), clamp01(v)));
      } else {
        uvCenters.push(new THREE.Vector2(-10, -10)); // 放到视野外
      }
    }
    material.uniforms.u_centers.value = uvCenters;

    const rs: number[] = [];
    for (let i = 0; i < MAX_BALLS; i++) {
      rs.push(i < radii.length ? radii[i] : 0.18);
    }
    material.uniforms.u_radii.value = rs;
  });

  // 自适应像素比，保证噪波细腻
  useEffect(() => {
    gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }, [gl]);

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      {/* @ts-ignore */}
      <shaderMaterial args={[material]} />
    </mesh>
  );
}

/**
 * 外层容器：管理句柄拖动与半径
 */
export default function MetaballPlayground() {
  const containerRef = useRef<HTMLDivElement>(null);

  // 初始 3 个点，半径与屏幕尺寸无关（着色器里按 uv 解释）
  const [handles, setHandles] = useState<Handle[]>(() => [
    { id: 1, x: 0.42 * window.innerWidth, y: 0.46 * window.innerHeight, r: 0.24 },
    { id: 2, x: 0.55 * window.innerWidth, y: 0.52 * window.innerHeight, r: 0.22 },
    { id: 3, x: 0.48 * window.innerWidth, y: 0.35 * window.innerHeight, r: 0.20 },
  ]);
  const [dragId, setDragId] = useState<number | null>(null);

  // radii 数组传入 shader（与句柄数量同步）
  const radii = useMemo(() => handles.map((h) => h.r), [handles]);

  function onPointerDown(e: PointerEvent<HTMLDivElement>, id: number) {
    e.preventDefault();
    setDragId(id);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (dragId === null) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setHandles((prev) =>
      prev.map((h) => (h.id === dragId ? { ...h, x, y } : h))
    );
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (dragId === null) return;
    setDragId(null);
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }

  // 添加/删除球（可按需接到按钮或键盘）
  function addBall() {
    setHandles((prev) => {
      if (prev.length >= MAX_BALLS) return prev;
      const id = (prev[prev.length - 1]?.id ?? 0) + 1;
      return [
        ...prev,
        {
          id,
          x: window.innerWidth * (0.35 + 0.3 * Math.random()),
          y: window.innerHeight * (0.35 + 0.3 * Math.random()),
          r: 0.22,
        },
      ];
    });
  }
  function removeBall() {
    setHandles((p) => (p.length > 1 ? p.slice(0, -1) : p));
  }

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden", background: "#fff" }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <Canvas orthographic={false} gl={{ antialias: true }} camera={{ position: [0, 0, 1], fov: 50 }}>
        <FullscreenShader centers={handles} radii={radii} />
      </Canvas>

      {/* 叠加在画布之上的序号可拖动句柄 */}
      {handles.map((h) => (
        <div
          key={h.id}
          onPointerDown={(e) => onPointerDown(e, h.id)}
          style={{
            position: "absolute",
            left: h.x - 14,
            top: h.y - 14,
            width: 28,
            height: 28,
            lineHeight: "28px",
            textAlign: "center",
            borderRadius: 16,
            background: "rgba(255,255,255,0.9)",
            color: "#111",
            fontSize: 14,
            fontWeight: 600,
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            userSelect: "none",
            cursor: "grab",
          }}
          title={`中心 ${h.id}（拖动）`}
        >
          {h.id}
        </div>
      ))}

      {/* 简单控制（可删） */}
      <div style={{ position: "absolute", right: 16, bottom: 16, display: "flex", gap: 8 }}>
        <button onClick={addBall} style={btnStyle}>+ 球</button>
        <button onClick={removeBall} style={btnStyle}>- 球</button>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "6px 10px",
  background: "rgba(255,255,255,0.85)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 8,
  fontSize: 12,
  cursor: "pointer",
};