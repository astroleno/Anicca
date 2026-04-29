'use client';
import { useEffect, useRef } from 'react';

export default function ShaderParkTest() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    console.log('[ShaderParkTest] Starting...');

    // 测试 shader-park-core 导入
    import('shader-park-core')
      .then((module) => {
        console.log('[ShaderParkTest] Module loaded:', Object.keys(module));

        const { sculptToMinimalRenderer } = module;

        if (!sculptToMinimalRenderer) {
          console.error('[ShaderParkTest] sculptToMinimalRenderer not found!');
          return;
        }

        console.log('[ShaderParkTest] sculptToMinimalRenderer found, type:', typeof sculptToMinimalRenderer);

        // 使用 Shader3 的代码
        const spCode = `
          setMaxIterations(8);

          let offset = 0.1;
          function fbm(p) {
            return vec3(
              noise(p),
              noise(p+offset),
              noise(p+offset*2)
            )
          }

          let s = getRayDirection();
          let n = sin(fbm(s+vec3(0, 0, -time*.1))*2)*.5+.75;
          n = pow(n, vec3(8));
          color(n);

          sphere(0.3);
          blend(0.4);
        `;

        console.log('[ShaderParkTest] Shader code:', spCode);

        try {
          const result = sculptToMinimalRenderer(canvas, spCode, () => ({}));
          console.log('[ShaderParkTest] Render success, result:', typeof result);
        } catch (err) {
          console.error('[ShaderParkTest] Render failed:', err);
        }
      })
      .catch((err) => {
        console.error('[ShaderParkTest] Module import failed:', err);
      });
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      <div style={{
        position: 'fixed',
        top: 20,
        left: 20,
        color: 'white',
        background: 'rgba(0,0,0,0.8)',
        padding: '10px',
        fontFamily: 'monospace'
      }}>
        ShaderPark Test - Check Console
      </div>
    </div>
  );
}
