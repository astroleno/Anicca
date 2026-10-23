import {
  minimalVertexSource,
  sculptToFullGLSLSource
} from "shader-park-core/dist/shader-park-core.esm.js";

import {
  MAX_DIALOGUE_METABALLS,
  type DialogueMetaballNode
} from "../metaball/model";
import { buildLiquidSpCode, buildLiquidFlowSource, buildLiquidDistanceSource, buildLiquidMaterialSource, LIQUID_SEED_SLOTS } from "./spcode";
import { liquidBlendTargets, RESTING_LIQUID_BLEND } from "./fusion";
import type { SeedOrbit } from "./space";

export const DIALOGUE_METABALL_SMOOTHNESS = 0.055;
let cachedFragmentSource: string | null = null;

const finishColorSource = `vec3 aniccaFinishColor(vec3 outputColor, float presence) {
  float luma=dot(outputColor,vec3(.2126,.7152,.0722));
  vec3 pearl=mix(mix(vec3(luma),outputColor,.86),vec3(.94,.93,.96),.12);
  outputColor=mix(outputColor,pearl,presence*(1.0-darkMode));
  vec3 darkBody=mix(pow(max(outputColor,vec3(0.0)),vec3(.82)),vec3(.48,.42,.58),.12);
  darkBody*=1.0-.65*smoothstep(.25,.8,min(outputColor.r,min(outputColor.g,outputColor.b)));
  vec3 finished=mix(outputColor,mix(stageGround+outputColor*.12,darkBody,presence),darkMode);
  return mix(stageGround,finished,seedAttention);
}`;

function replaceShaderFunction(source: string, signature: string, replacement: string) {
  const begin = source.indexOf(signature);
  if (begin < 0) throw new Error("liquid_distance_entry_missing");
  let braces = 0, end = source.indexOf("{", begin);
  for (; end < source.length; end++) {
    if (source[end] === "{") braces++;
    else if (source[end] === "}" && --braces === 0) break;
  }
  if (braces !== 0) throw new Error("liquid_distance_entry_incomplete");
  return source.slice(0, begin) + replacement + source.slice(end + 1);
}

export function buildLiquidFragmentSource(): string {
  // Keep a converged hit for spatial layers and the sketch's eight-step sample
  // for its continuous color field. Grazing coverage softens the actual surface,
  // including torus holes and necks, without a projected circle or a CSS blur.
  let material = sculptToFullGLSLSource(buildLiquidSpCode(LIQUID_SEED_SLOTS));
  for (const name of ["materialR", "materialG", "materialB", "fieldMix"]) {
    if (!material.includes(`uniform float ${name};`)) throw new Error("liquid_flow_input_missing");
    material = material.replace(`uniform float ${name};`, `float ${name};`);
  }
  material = replaceShaderFunction(material, "float surfaceDistance(vec3 p) {", buildLiquidDistanceSource());
  material = replaceShaderFunction(material, "ShadedMaterial shade(vec3 p, vec3 normal) {", buildLiquidMaterialSource());
  const intersect = "float intersect(vec3 ro, vec3 rd, float stepFraction) {";
  const advance = "t += h*STEP_SIZE_CONSTANT;";
  const march = "float t = intersect(rayOrigin, rayDirection, stepSize);";
  const hit = "if(t < max_dist) {";
  const point = "vec3 p = (rayOrigin + rayDirection*t);";
  const normal = "vec3 normal = calcNormal(p);";
  const output = "pc_fragColor = vec4(outputColor, opacity);";
  if (![intersect, advance, march, hit, point, normal, output].every(entry => material.includes(entry))) {
    throw new Error("liquid_shader_entry_missing");
  }
  return material
    .replace(intersect, `float sketchTravel = 0.0;\n${intersect}`)
    .replace(advance, `${advance}\n        if(i < 8) sketchTravel = t;`)
    .replace("void main()", `uniform float atmosphere;\nuniform float edgeSoftness;\nuniform float darkMode;\nuniform vec3 stageGround;\n${finishColorSource}\n${buildLiquidFlowSource()}\nvoid main()`)
    .replace(march, `vec3 sketchTone = aniccaFlow(rayDirection);
    liquidLayerMask=0;
    materialR=sketchTone.r; materialG=sketchTone.g; materialB=sketchTone.b; fieldMix=0.0;
    ${march}
    if(flowLayers > 1.5) {
      float exactHit=aniccaRestingLayerHit(rayOrigin,rayDirection);
      if(exactHit > 0.0 && exactHit < max_dist) t=exactHit;
      else if(exactHit < 0.0) for(int layerStep=0;layerStep<8;layerStep++) {
        float remaining=surfaceDistance(rayOrigin+rayDirection*t);
        if(remaining < intersection_threshold || t > max_dist) break;
        t+=remaining*STEP_SIZE_CONSTANT;
      }
    }
    float residual=max(0.0,surfaceDistance(rayOrigin+rayDirection*t));
    float presence=0.0;
    int frontSeed=-1;`)
    .replace(hit, "if(t < max_dist || atmosphere > .5) {")
    .replace(point, "vec3 p = rayOrigin + rayDirection*(t < max_dist ? t : min(sketchTravel, max_dist));")
    .replace(normal, `${normal}
        float contourFacing = max(0.0, dot(normal, -rayDirection));
        presence = (1.0-smoothstep(edgeSoftness*.08, edgeSoftness, residual))
            * smoothstep(0.0, .7, contourFacing);
        if(atmosphere > .5) {
            vec3 fieldNormal = calcNormal(rayOrigin + rayDirection*min(sketchTravel, max_dist));
            normal = normalize(mix(fieldNormal, normal, presence));
        }`)
    .replace("col = shade(p, normal);", "fieldMix = atmosphere*(1.0-smoothstep(.02,.3,flowCoverage));\n        col = shade(p, normal);\n        frontSeed=primarySeed;")
    .replace(output, `outputColor=aniccaFinishColor(outputColor,presence);
    vec3 behindColor=vec3(0.0); float behindPresence=0.0;
    // Trace the real surface behind a grazing edge; fading into the ground
    // would otherwise draw a white crescent around overlapping soft seeds.
    if(frontSeed >= 0 && presence < .995 && flowLayers > 1.5) {
      liquidLayerMask=1 << frontSeed;
      if(frontSeed < 2 && (s0b > .0002 || s1b > .0002)) liquidLayerMask=3;
      float behindT=aniccaRestingLayerHit(rayOrigin,rayDirection);
      if(behindT < 0.0) behindT=intersect(rayOrigin,rayDirection,stepSize);
      if(behindT < max_dist) {
        vec3 behindPoint=rayOrigin+rayDirection*behindT;
        vec3 behindNormal=calcNormal(behindPoint);
        float behindResidual=max(0.0,surfaceDistance(behindPoint));
        behindPresence=(1.0-smoothstep(edgeSoftness*.08,edgeSoftness,behindResidual))
          *smoothstep(0.0,.7,max(0.0,dot(behindNormal,-rayDirection)));
        vec3 linear=shade(behindPoint,behindNormal).color;
        behindColor=aniccaFinishColor(pow(linear/(linear+vec3(1.0)),vec3(1.0/2.2)),behindPresence);
      }
    }
    float visibility=presence+behindPresence*(1.0-presence);
    vec3 premultiplied=outputColor*presence+behindColor*behindPresence*(1.0-presence);
    if(atmosphere > .5) {
      premultiplied=mix(outputColor,behindColor,behindPresence*(1.0-presence)); visibility=1.0;
    }
    pc_fragColor=vec4(premultiplied,opacity*visibility);`);
}

export type LiquidRenderInteraction = {
  draggedId?: string | null;
  partnerId?: string | null;
  atmosphere?: boolean;
  dark?: boolean;
  ground?: readonly [number, number, number];
  orbit?: SeedOrbit;
};

export type DialogueMetaballRenderer = {
  resize(width: number, height: number, pixelRatio: number): void;
  render(nodes: DialogueMetaballNode[], timeSeconds: number, interaction?: LiquidRenderInteraction): void;
  dispose(): void;
};

function requireShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("liquid_shader_create_failed");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || "unknown shader compile error";
    gl.deleteShader(shader);
    throw new Error(`liquid_shader_compile_failed: ${info}`);
  }
  return shader;
}

function requireProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): { program: WebGLProgram; vertex: WebGLShader; fragment: WebGLShader } {
  const vertex = requireShader(gl, gl.VERTEX_SHADER, vertexSource);
  let fragment: WebGLShader;
  try { fragment = requireShader(gl, gl.FRAGMENT_SHADER, fragmentSource); }
  catch (error) { gl.deleteShader(vertex); throw error; }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error("liquid_program_create_failed");
  }

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) || "unknown program link error";
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error(`liquid_program_link_failed: ${info}`);
  }

  return { program, vertex, fragment };
}

export function createDialogueMetaballRenderer(
  canvas: HTMLCanvasElement,
  onContextLost: () => void
): DialogueMetaballRenderer {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: "high-performance"
  });
  if (!gl) {
    throw new Error("liquid_webgl2_unavailable");
  }

  const fragmentSource = cachedFragmentSource ??= buildLiquidFragmentSource();
  const { program, vertex, fragment } = requireProgram(gl, minimalVertexSource, fragmentSource);
  const buffer = gl.createBuffer();
  if (!buffer) {
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error("liquid_buffer_create_failed");
  }

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]),
    gl.STATIC_DRAW
  );
  const coordinate = gl.getAttribLocation(program, "coordinates");
  gl.enableVertexAttribArray(coordinate);
  gl.vertexAttribPointer(coordinate, 3, gl.FLOAT, false, 0, 0);

  const locations = new Map<string, WebGLUniformLocation | null>();
  const uniformNames = ["time", "resolution", "opacity", "_scale", "atmosphere", "edgeSoftness", "darkMode", "stageGround", "viewYaw", "viewPitch"];
  for (let index = 0; index < LIQUID_SEED_SLOTS; index += 1) {
    for (const suffix of ["x", "y", "z", "r", "h", "b", "p", "cr", "cg", "cb"]) {
      uniformNames.push(`s${index}${suffix}`);
    }
  }
  for (const name of uniformNames) {
    locations.set(name, gl.getUniformLocation(program, name));
  }

  const set1f = (name: string, value: number) => {
    const location = locations.get(name);
    if (location !== null && location !== undefined) {
      gl.uniform1f(location, value);
    }
  };

  gl.clearColor(0, 0, 0, 0);
  gl.disable(gl.DEPTH_TEST);
  set1f("opacity", 1);
  set1f("_scale", 1);

  let disposed = false;
  let cssWidth = 1;
  let cssHeight = 1;
  let previousNodes: DialogueMetaballNode[] | null = null;
  let previousOrder = "";
  const blends = new Map<string, number>();
  const pressures = new Map<string, number>();
  const attentions = new Map<string, number>();
  const attentionTargets = new Map<string, number>();
  let fusionPair: string[] = [];
  const previousSlotBlends: number[] = [];
  const previousSlotPressures: number[] = [];
  const previousSlotAttentions: number[] = [];
  let previousTime: number | null = null;
  let previousDraggedId: string | null = null;
  let previousPartnerId: string | null = null;

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    onContextLost();
  };
  canvas.addEventListener("webglcontextlost", handleContextLost);

  return {
    resize(width, height, pixelRatio) {
      if (disposed) return;
      cssWidth = Math.max(1, width);
      cssHeight = Math.max(1, height);
      const safePixelRatio = Math.max(0.35, Math.min(pixelRatio, 1));
      const widthPx = Math.max(1, Math.round(cssWidth * safePixelRatio));
      const heightPx = Math.max(1, Math.round(cssHeight * safePixelRatio));
      if (canvas.width === widthPx && canvas.height === heightPx) return;
      if (canvas.width !== widthPx) canvas.width = widthPx;
      if (canvas.height !== heightPx) canvas.height = heightPx;
    },

    render(nodes, timeSeconds, interaction) {
      if (disposed) return;
      const count = Math.min(nodes.length, MAX_DIALOGUE_METABALLS, LIQUID_SEED_SLOTS);
      gl.useProgram(program);
      set1f("time", timeSeconds);
      set1f("atmosphere", interaction?.atmosphere ? 1 : 0);
      set1f("darkMode", interaction?.dark ? 1 : 0);
      set1f("viewYaw", interaction?.orbit?.yaw || 0);
      set1f("viewPitch", interaction?.orbit?.pitch || 0);
      const ground = interaction?.ground || [248,247,249];
      const groundLocation = locations.get("stageGround");
      if (groundLocation !== null && groundLocation !== undefined) gl.uniform3f(groundLocation,ground[0]/255,ground[1]/255,ground[2]/255);
      const resolution = locations.get("resolution");
      if (resolution !== null && resolution !== undefined) {
        gl.uniform2f(resolution, canvas.width, canvas.height);
      }

      // The soft union is ordered: join the chosen pair first, then add every
      // unrelated surface with a hard union so a third seed cannot grow a neck.
      if (interaction?.draggedId && interaction.partnerId) fusionPair = [interaction.draggedId, interaction.partnerId];
      else if (!fusionPair.some(id => (blends.get(id) || 0) > RESTING_LIQUID_BLEND + .0001)) fusionPair = [];
      const pair = fusionPair;
      const visibleNodes = [...nodes.slice(0, count)].sort((a, b) => {
        const rank = (id: string) => { const i = pair.indexOf(id); return i < 0 ? 2 : i; };
        return rank(a.id) - rank(b.id);
      });
      set1f("edgeSoftness", Math.max(.008, ...visibleNodes.map(node => node.radius*1.75*.18)));
      const targets = liquidBlendTargets(visibleNodes, interaction?.draggedId, interaction?.partnerId);
      // time=0 is the reduced-motion path: update geometry without interpolation.
      const draggedId = interaction?.draggedId || null, partnerId = interaction?.partnerId || null;
      const changedInteraction = draggedId !== previousDraggedId || partnerId !== previousPartnerId;
      const elapsed = Math.max(0,timeSeconds-(previousTime ?? timeSeconds));
      const dt = changedInteraction ? Math.min(1 / 60, elapsed) : elapsed;
      previousDraggedId = draggedId; previousPartnerId = partnerId;
      const immediate = previousTime === null || timeSeconds === 0;
      const pressureAmount = previousTime === null || timeSeconds === 0 ? 1
        : 1 - Math.exp(-5 * dt);
      previousTime = timeSeconds;
      const ids = new Set(visibleNodes.map(node => node.id));
      for (const id of blends.keys()) if (!ids.has(id)) blends.delete(id);
      for (const id of pressures.keys()) if (!ids.has(id)) pressures.delete(id);
      for (const id of attentions.keys()) if (!ids.has(id)) attentions.delete(id);
      for (const id of attentionTargets.keys()) if (!ids.has(id)) attentionTargets.delete(id);
      for (let index = 0; index < LIQUID_SEED_SLOTS; index++) {
        const node = visibleNodes[index];
        const attentionTarget = node?.attention ?? 1;
        const previousAttention = node ? attentions.get(node.id) ?? attentionTarget : 1;
        const attentionDt = node && attentionTargets.get(node.id) !== attentionTarget ? Math.min(1 / 60, dt) : dt;
        const attention = immediate || Math.abs(attentionTarget - previousAttention) < .001 ? attentionTarget
          : previousAttention + (attentionTarget - previousAttention) * (1 - Math.exp(-12 * attentionDt));
        if (node) { attentions.set(node.id, attention); attentionTargets.set(node.id, attentionTarget); }
        if (previousSlotAttentions[index] !== attention) set1f(`s${index}p`, attention);
        previousSlotAttentions[index] = attention;
        const target = targets[index] ?? RESTING_LIQUID_BLEND;
        const current = node ? (blends.get(node.id) ?? RESTING_LIQUID_BLEND) : RESTING_LIQUID_BLEND;
        const amount = immediate ? 1 : 1-Math.exp(-(target > current ? 16 : 10)*dt);
        const value = !pair.includes(node?.id || "") && interaction?.partnerId ? RESTING_LIQUID_BLEND
          : Math.abs(target - current) < 0.0001 ? target : current + (target - current) * amount;
        if (node) blends.set(node.id, value);
        if (previousSlotBlends[index] !== value) set1f(`s${index}b`, value);
        previousSlotBlends[index] = value;
        const pressureTarget = node && node.id === interaction?.draggedId ? 1 : 0;
        const previousPressure = node ? (pressures.get(node.id) || 0) : 0;
        const pressure = Math.abs(pressureTarget-previousPressure) < .0001 ? pressureTarget
          : previousPressure+(pressureTarget-previousPressure)*pressureAmount;
        if (node) pressures.set(node.id, pressure);
        if (previousSlotPressures[index] !== pressure) set1f(`s${index}h`, pressure);
        previousSlotPressures[index] = pressure;
      }

      const order = visibleNodes.map(node => node.id).join("\0");
      if (nodes !== previousNodes || order !== previousOrder) {
        previousNodes = nodes;
        previousOrder = order;
        for (let index = 0; index < LIQUID_SEED_SLOTS; index += 1) {
          const node = visibleNodes[index] || null;
          const prefix = `s${index}`;
          if (node) {
            const z = (node.depth || 0) * 1.75;
            const perspective = 1 + z / 2;
            set1f(`${prefix}x`, node.center[0] * 1.75 * perspective);
            set1f(`${prefix}y`, node.center[1] * 1.75 * perspective);
            set1f(`${prefix}z`, z);
            set1f(`${prefix}r`, Math.max(0.001, node.radius * 1.75 * perspective));
            set1f(`${prefix}cr`, node.color[0]);
            set1f(`${prefix}cg`, node.color[1]);
            set1f(`${prefix}cb`, node.color[2]);
          } else {
            set1f(`${prefix}x`, 999);
            set1f(`${prefix}y`, 999);
            set1f(`${prefix}z`, 0);
            set1f(`${prefix}r`, 0.001);
          }
        }
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    }
  };
}
