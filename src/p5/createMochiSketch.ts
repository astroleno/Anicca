// p5 初始化与绘制封装：
// - 负责创建着色器、更新 uniforms、调用 draw
// - 暴露销毁/截图等最小 API

import type p5Types from 'p5';
import { MOCHI_FRAGMENT, MOCHI_VERTEX, applyMochiUniforms, drawMochi, type MochiControls, type MochiAudioUniforms } from '../shaders/mochi';

export type SketchHandles = {
  getCanvas: () => HTMLCanvasElement | null;
  setAudio: (audio: Partial<MochiAudioUniforms>) => void;
  setControls: (controls: Partial<MochiControls>) => void;
  setSensitivity: (v: number) => void;
  triggerPulse: (v?: number) => void;
  snapshot: () => string | null; // dataURL
  dispose: () => void;
};

export function createMochiSketch(container: HTMLElement): SketchHandles {
  // 内部状态：音频/控制参数/敏感度
  let audio: MochiAudioUniforms = {
    level: 0,
    flux: 0,
    centroid: 0.5,
    flatness: 0,
    zcr: 0,
    mfcc: [0, 0, 0, 0],
    pulse: 0,
  };
  let controls: MochiControls = {};
  let sensitivity = 1.2;

  // p5 实例与着色器
  let p5Instance: p5Types | null = null;
  let shader: any = null;

  // 节流/去抖：点击触发的 pulse 逐帧衰减
  function decayPulse(delta: number){
    audio.pulse = Math.max(0, audio.pulse - delta * 0.0025);
  }

  const P5Ctor = require('p5');
  const sketch = (p: p5Types) => {
    p5Instance = p;
    let lastMs = 0;
    p.setup = () => {
      try {
        const canvas = p.createCanvas(container.clientWidth, container.clientHeight, (p as any).WEBGL);
        canvas.parent(container);
        shader = (p as any).createShader(MOCHI_VERTEX, MOCHI_FRAGMENT);
        p.noStroke();
      } catch (err) {
        console.error('[Sketch] setup error:', err);
      }
    };

    p.windowResized = () => {
      try {
        p.resizeCanvas(container.clientWidth, container.clientHeight);
      } catch (err) {
        console.error('[Sketch] resize error:', err);
      }
    };

    p.mousePressed = () => { try { audio.pulse = Math.min(1, audio.pulse + 0.5); } catch(e){ console.error(e);} };
    p.keyPressed = () => { try { audio.pulse = Math.min(1, audio.pulse + 0.3); } catch(e){ console.error(e);} };

    p.draw = () => {
      try {
        const now = p.millis();
        const dt = Math.max(0, now - lastMs);
        lastMs = now;
        decayPulse(dt);
        if (!shader) return;
        applyMochiUniforms(p, shader, audio, sensitivity, controls);
        drawMochi(p, shader);
      } catch (err) {
        console.error('[Sketch] draw error:', err);
      }
    };
  };

  const inst = new P5Ctor(sketch, container);

  return {
    getCanvas: () => {
      try {
        return (inst as any)?._renderer?.canvas ?? null;
      } catch { return null; }
    },
    setAudio: (patch) => {
      try { audio = { ...audio, ...(patch as any) }; } catch(err){ console.error('[Sketch] setAudio error:', err); }
    },
    setControls: (patch) => {
      try { controls = { ...controls, ...(patch as any) }; } catch(err){ console.error('[Sketch] setControls error:', err); }
    },
    setSensitivity: (v: number) => { try { sensitivity = Math.max(0.5, Math.min(3, v||1.2)); } catch(err){ console.error(err);} },
    triggerPulse: (v?: number) => { try { audio.pulse = Math.max(audio.pulse, Math.min(1, (v ?? 0.6))); } catch(err){ console.error(err);} },
    snapshot: () => {
      try {
        const canvas = (inst as any)?._renderer?.canvas as HTMLCanvasElement | undefined;
        return canvas ? canvas.toDataURL('image/png') : null;
      } catch (err) {
        console.error('[Sketch] snapshot error:', err);
        return null;
      }
    },
    dispose: () => {
      try { inst?.remove?.(); } catch (err) { console.error('[Sketch] dispose error:', err);} finally { p5Instance = null; shader = null; }
    },
  };
}


