import { NodeFrame, Vector2, Vector3, Vector4, type Node } from "three/webgpu";
import { Fn, If, Loop, Break, float, int, vec2, vec3, vec4, uniform, uniformArray, uv,
  sin, cos, pow, floor, fract, step, dot, length, normalize, mix, clamp, max, min,
  sqrt, smoothstep } from "three/tsl";
import { LIQUID_SEED_SLOTS } from "./spcode";

// The sketch's flow, surface and light are expressed in portable TSL. No raw
// GLSL/WGSL or volumetric integration is used by either Three backend.
const hash33 = Fn(([point]: [Node]) => {
  const p = fract(point.mul(vec3(.1031, .11369, .13787))).toVar();
  p.addAssign(dot(p, p.yxz.add(19.19)));
  return fract(vec3(p.x.add(p.y).mul(p.z), p.x.add(p.z).mul(p.y), p.y.add(p.z).mul(p.x))).mul(2).sub(1);
}).setLayout({ name: "liquidHash", type: "vec3", inputs: [{ name: "point", type: "vec3" }] });

const noise = Fn(([p]: [Node]) => {
  const i = floor(p.add(p.x.add(p.y).add(p.z).mul(1 / 3))).toVar();
  const d0 = p.sub(i.sub(i.x.add(i.y).add(i.z).mul(1 / 6))).toVar();
  const e = step(0, d0.sub(d0.yzx)).toVar();
  const i1 = e.mul(e.zxy.oneMinus()).toVar();
  const i2 = e.zxy.mul(e.oneMinus()).oneMinus().toVar();
  const d1 = d0.sub(i1.sub(1 / 6)), d2 = d0.sub(i2.sub(1 / 3)), d3 = d0.sub(.5);
  const h = max(vec4(.6).sub(vec4(dot(d0, d0), dot(d1, d1), dot(d2, d2), dot(d3, d3))), 0).toVar();
  return dot(vec4(31.316), pow(h, 4).mul(vec4(dot(d0, hash33(i)), dot(d1, hash33(i.add(i1))),
    dot(d2, hash33(i.add(i2))), dot(d3, hash33(i.add(1))))));
}).setLayout({ name: "liquidNoise", type: "float", inputs: [{ name: "p", type: "vec3" }] });

const rotate = (p: Node, angle: Node) => vec2(p.x.mul(cos(angle)).add(p.y.mul(sin(angle))),
  p.y.mul(cos(angle)).sub(p.x.mul(sin(angle))));

const smoothUnion = (a: Node, b: Node, k: Node) => {
  const h = clamp(float(.5).add(b.sub(a).mul(.5).div(max(k, .000001))), 0, 1);
  return mix(b, a, h).sub(k.mul(h).mul(h.oneMinus()));
};

/** RGBA contains display-space premultiplied color, matching the original canvas. */
export function createLiquidSurface() {
  const geometry = Array.from({ length: LIQUID_SEED_SLOTS }, () => new Vector4(999, 999, 0, .001));
  const bufferFrame = new NodeFrame();
  const dynamics = Array.from({ length: LIQUID_SEED_SLOTS }, () => new Vector4(0, 0, 1, 0));
  const colors = Array.from({ length: LIQUID_SEED_SLOTS }, () => new Vector3(.6, .6, .6));
  const seeds = uniformArray(geometry, "vec4"), states = uniformArray(dynamics, "vec4"), tints = uniformArray(colors, "vec3");
  const time = uniform(0), resolution = uniform(new Vector2(1, 1)), orbit = uniform(new Vector2());
  const atmosphere = uniform(0), dark = uniform(0), edge = uniform(.008), ground = uniform(new Vector3());

  const body = Fn(([p, slot, tone]: [Node, Node, Node]) => {
    const seed = seeds.element(int(slot)), state = states.element(int(slot));
    const local = p.sub(seed.xyz).toVar(), radius = seed.w.mul(float(1).add(tone.x.mul(.055)));
    const distance = length(local).sub(radius).toVar();
    If(state.x.greaterThan(.0001), () => {
      local.yz.assign(rotate(local.yz, orbit.y));
      local.xz.assign(rotate(local.xz, orbit.x));
      local.yz.assign(rotate(local.yz, float(Math.PI / 2)));
      distance.assign(mix(distance, length(vec2(length(local.xz).sub(radius), local.y)).sub(seed.w.mul(.4)), state.x));
    });
    return distance;
  }).setLayout({ name: "liquidBody", type: "float", inputs: [
    { name: "p", type: "vec3" }, { name: "slot", type: "int" }, { name: "tone", type: "vec3" }
  ] });

  const field = Fn(([p, tone, mask]: [Node, Node, Node]) => {
    const distance = float(100).toVar();
    for (let index = 0; index < LIQUID_SEED_SLOTS; index++) {
      const seed = seeds.element(int(index)), state = states.element(int(index));
      If(seed.w.greaterThan(.0015).and(int(mask).bitAnd(1 << index).equal(0)), () => {
        distance.assign(smoothUnion(body(p, int(index), tone), distance, state.y.mul(seed.w).mul(2)));
      });
    }
    return distance;
  }).setLayout({ name: "liquidField", type: "float", inputs: [
    { name: "p", type: "vec3" }, { name: "tone", type: "vec3" }, { name: "mask", type: "int" }
  ] });

  const bodyGradient = Fn(([p, slot, tone]: [Node, Node, Node]) => {
    const seed = seeds.element(int(slot)), state = states.element(int(slot));
    const local = p.sub(seed.xyz).toVar(), gradient = local.div(max(length(local), .000001)).toVar();
    If(state.x.greaterThan(.0001), () => {
      local.yz.assign(rotate(local.yz, orbit.y)); local.xz.assign(rotate(local.xz, orbit.x));
      local.yz.assign(rotate(local.yz, float(Math.PI / 2)));
      const radial = max(length(local.xz), .000001).toVar();
      const ring = vec2(radial.sub(seed.w.mul(float(1).add(tone.x.mul(.055)))), local.y).toVar();
      ring.divAssign(max(length(ring), .000001));
      const torusNormal = vec3(local.x.div(radial).mul(ring.x), ring.y, local.z.div(radial).mul(ring.x)).toVar();
      torusNormal.yz.assign(rotate(torusNormal.yz, float(-Math.PI / 2)));
      torusNormal.xz.assign(rotate(torusNormal.xz, orbit.x.negate()));
      torusNormal.yz.assign(rotate(torusNormal.yz, orbit.y.negate()));
      gradient.assign(mix(gradient, torusNormal, state.x));
    });
    return gradient;
  }).setLayout({ name: "liquidGradient", type: "vec3", inputs: [
    { name: "p", type: "vec3" }, { name: "slot", type: "int" }, { name: "tone", type: "vec3" }
  ] });

  const normalAt = Fn(([p, tone, mask]: [Node, Node, Node]) => {
    const distance = float(100).toVar(), gradient = vec3(0).toVar();
    for (let index = 0; index < LIQUID_SEED_SLOTS; index++) {
      const seed = seeds.element(int(index)), state = states.element(int(index));
      If(seed.w.greaterThan(.0015).and(int(mask).bitAnd(1 << index).equal(0)), () => {
        const surface = body(p, int(index), tone).toVar(), k = max(state.y.mul(seed.w).mul(2), .000001).toVar();
        const incoming = clamp(float(.5).add(distance.sub(surface).mul(.5).div(k)), 0, 1).toVar();
        If(incoming.greaterThan(0), () => { gradient.assign(mix(gradient, bodyGradient(p, int(index), tone), incoming)); });
        distance.assign(smoothUnion(surface, distance, k));
      });
    }
    return normalize(gradient);
  }).setLayout({ name: "liquidNormal", type: "vec3", inputs: [
    { name: "p", type: "vec3" }, { name: "tone", type: "vec3" }, { name: "mask", type: "int" }
  ] });

  const march = Fn(([ray, tone, mask, steps]: [Node, Node, Node, Node]) => {
    const travel = float(0).toVar(), sketch = float(0).toVar();
    Loop({ start: 0, end: steps }, ({ i }) => {
      const remaining = field(vec3(0, 0, -2).add(ray.mul(travel)), tone, mask).toVar();
      If(remaining.lessThan(.00001).or(travel.greaterThan(100)), () => { Break(); });
      travel.addAssign(remaining.mul(.85));
      If(i.lessThan(8), () => { sketch.assign(travel); });
    });
    return vec2(travel, sketch);
  }).setLayout({ name: "liquidMarch", type: "vec2", inputs: [
    { name: "ray", type: "vec3" }, { name: "tone", type: "vec3" },
    { name: "mask", type: "int" }, { name: "steps", type: "int" }
  ] });

  const restingHit = Fn(([ray, tone, mask]: [Node, Node, Node]) => {
    const nearest = float(100).toVar(), resting = float(1).toVar();
    for (let index = 0; index < LIQUID_SEED_SLOTS; index++) {
      const seed = seeds.element(int(index)), state = states.element(int(index));
      If(seed.w.greaterThan(.0015).and(int(mask).bitAnd(1 << index).equal(0)), () => {
        If(state.x.greaterThan(.0001).or(state.y.greaterThan(.0002)), () => { resting.assign(0); });
        const offset = vec3(0, 0, -2).sub(seed.xyz), radius = seed.w.mul(float(1).add(tone.x.mul(.055)));
        const b = dot(offset, ray).toVar(), disc = b.mul(b).sub(dot(offset, offset)).add(radius.mul(radius)).toVar();
        If(disc.greaterThanEqual(0), () => {
          const hit = b.negate().sub(sqrt(disc)).toVar();
          If(hit.greaterThan(0), () => { nearest.assign(min(nearest, hit)); });
        });
      });
    }
    return resting.greaterThan(.5).select(nearest, float(-1));
  }).setLayout({ name: "liquidRestingHit", type: "float", inputs: [
    { name: "ray", type: "vec3" }, { name: "tone", type: "vec3" }, { name: "mask", type: "int" }
  ] });

  const solidHit = Fn(([ray, tone, mask]: [Node, Node, Node]) => {
    const nearest = float(100).toVar();
    for (let index = 0; index < LIQUID_SEED_SLOTS; index++) {
      const seed = seeds.element(int(index)), state = states.element(int(index));
      If(seed.w.greaterThan(.0015).and(state.x.lessThanEqual(.0001)).and(int(mask).bitAnd(1 << index).equal(0)), () => {
        const offset = vec3(0, 0, -2).sub(seed.xyz), radius = seed.w.mul(float(1).add(tone.x.mul(.055)));
        const b = dot(offset, ray).toVar(), disc = b.mul(b).sub(dot(offset, offset)).add(radius.mul(radius)).toVar();
        If(disc.greaterThanEqual(0), () => {
          const hit = b.negate().sub(sqrt(disc)).toVar();
          If(hit.greaterThan(0), () => { nearest.assign(min(nearest, hit)); });
        });
      });
    }
    return nearest;
  }).setLayout({ name: "liquidSolidHit", type: "float", inputs: [
    { name: "ray", type: "vec3" }, { name: "tone", type: "vec3" }, { name: "mask", type: "int" }
  ] });

  const refineHit = Fn(([ray, tone, mask, travel]: [Node, Node, Node, Node]) => {
    const upper = solidHit(ray, tone, mask).toVar();
    const result = travel.toVar();
    If(upper.lessThan(100), () => {
      const lower = min(travel, upper).toVar();
      Loop(12, () => {
        const middle = lower.add(upper).mul(.5).toVar();
        If(field(vec3(0, 0, -2).add(ray.mul(middle)), tone, mask).greaterThan(0), () => { lower.assign(middle); })
          .Else(() => { upper.assign(middle); });
      });
      result.assign(upper);
    });
    return result;
  }).setLayout({ name: "liquidRefineHit", type: "float", inputs: [
    { name: "ray", type: "vec3" }, { name: "tone", type: "vec3" }, { name: "mask", type: "int" }, { name: "travel", type: "float" }
  ] });

  // Shader Park Material(tint, tint, .5, .7, 1): metallic=.5, roughness=.7.
  const light = Fn(([tint, normal, ray]: [Node, Node, Node]) => {
    const view = ray.negate(), direction = vec3(0, 1, 0), half = normalize(view.add(direction));
    const nv = max(dot(normal, view), 0).toVar(), nl = max(dot(normal, direction), 0).toVar();
    const nh = max(dot(normal, half), 0);
    const ndf = float(.2401).div(pow(nh.mul(nh).mul(-.7599).add(1), 2).mul(Math.PI));
    const smith = nv.div(nv.mul(.63875).add(.36125)).mul(nl.div(nl.mul(.63875).add(.36125)));
    const f0 = mix(vec3(.04), tint, .5), fresnel = f0.add(f0.oneMinus().mul(pow(max(dot(half, view), 0).oneMinus(), 5)));
    const specular = fresnel.mul(ndf).mul(smith).div(max(nv.mul(nl).mul(4), .001));
    const direct = fresnel.oneMinus().mul(.5).mul(tint).div(Math.PI).add(specular).mul(nl).mul(1.7);
    return tint.mul(nl.mul(1.25).add(1.2)).add(direct)
      .add(pow(nv.oneMinus(), 6).mul(16 * .5 * .6).mul(tint.add(.2)));
  }).setLayout({ name: "liquidLight", type: "vec3", inputs: [
    { name: "tint", type: "vec3" }, { name: "normal", type: "vec3" }, { name: "ray", type: "vec3" }
  ] });

  const shade = Fn(([p, normal, ray, tone, mask, presence, fieldMix]: [Node, Node, Node, Node, Node, Node, Node]) => {
    const compressed = tone.div(tone.add(1)), luma = dot(compressed, vec3(.2126, .7152, .0722));
    const texture = mix(vec3(luma), compressed, .36), tint = vec3(.6).toVar();
    const distance = float(100).toVar(), attention = float(1).toVar(), primary = float(-1).toVar(), generating = float(0).toVar();
    for (let index = 0; index < LIQUID_SEED_SLOTS; index++) {
      const seed = seeds.element(int(index)), state = states.element(int(index));
      If(seed.w.greaterThan(.0015).and(int(mask).bitAnd(1 << index).equal(0)), () => {
        const surface = body(p, int(index), tone).toVar(), k = max(state.y.mul(seed.w).mul(2), .000001).toVar();
        const incoming = clamp(float(.5).add(distance.sub(surface).mul(.5).div(k)), 0, 1).toVar();
        const pearl = mix(texture, pow(tints.element(int(index)), 2.2), .56).mul(luma.mul(.82).add(.48));
        tint.assign(mix(tint, mix(pearl, tone, fieldMix), incoming));
        attention.assign(mix(attention, state.z, incoming));
        generating.assign(mix(generating, state.w, incoming));
        If(incoming.greaterThan(.5), () => { primary.assign(index); });
        distance.assign(smoothUnion(surface, distance, k));
      });
    }
    If(generating.greaterThan(.001), () => {
      tint.mulAssign(float(1).add(generating.mul(noise(p.mul(120).add(vec3(time.mul(.12), 0, 0)))).mul(.24)));
    });
    const linear = light(tint, normal, ray).toVar();
    const output = pow(linear.div(linear.add(1)), 1 / 2.2).toVar();
    const outputLuma = dot(output, vec3(.2126, .7152, .0722));
    const pearl = mix(mix(vec3(outputLuma), output, .86), vec3(.94, .93, .96), .12);
    output.assign(mix(output, pearl, presence.mul(dark.oneMinus())));
    const darkBody = mix(pow(max(output, 0), .82), vec3(.48, .42, .58), .12)
      .mul(float(1).sub(smoothstep(.25, .8, min(output.r, min(output.g, output.b))).mul(.65)));
    const finished = mix(output, mix(ground.add(output.mul(.12)), darkBody, presence), dark);
    return vec4(mix(ground, finished, attention), primary);
  }).setLayout({ name: "liquidShade", type: "vec4", inputs: [
    { name: "p", type: "vec3" }, { name: "normal", type: "vec3" }, { name: "ray", type: "vec3" },
    { name: "tone", type: "vec3" }, { name: "mask", type: "int" },
    { name: "presence", type: "float" }, { name: "fieldMix", type: "float" }
  ] });

  const coverage = (p: Node, normal: Node, ray: Node, tone: Node, mask: Node) =>
    smoothstep(edge.mul(.08), edge, max(0, field(p, tone, mask))).oneMinus()
      .mul(smoothstep(0, .7, max(0, dot(normal, ray.negate()))));

  const fragmentNode = Fn(() => {
    // Quad UVs use the same top origin on both backends; invert only once for
    // the legacy camera's bottom-origin projection plane.
    const plane = vec2(uv().x.sub(.5).mul(resolution.x.div(resolution.y)), float(.5).sub(uv().y)).mul(1.75);
    const ray = normalize(vec3(plane, 2)).toVar(), origin = vec3(0, 0, -2);
    const projection = ray.xy.div(ray.z).mul(2), localPlane = vec2(0).toVar();
    const weightSum = float(0).toVar(), layers = float(0).toVar(), output = vec4(0).toVar();
    for (let index = 0; index < LIQUID_SEED_SLOTS; index++) {
      const seed = seeds.element(int(index));
      If(seed.w.greaterThan(.0015), () => {
        const perspective = seed.z.div(2).add(1), radius = seed.w.div(perspective);
        const delta = projection.sub(seed.xy.div(perspective)).toVar();
        const weight = pow(clamp(length(delta).div(radius.mul(3.2)).oneMinus(), 0, 1), 2).toVar();
        If(length(delta).lessThan(radius.mul(2.05)), () => { layers.addAssign(1); });
        localPlane.addAssign(delta.mul(float(.5).div(radius)).mul(weight));
        weightSum.addAssign(weight);
      });
    }
    If(weightSum.greaterThanEqual(.0001).or(atmosphere.greaterThan(.5)), () => {
      const localRay = normalize(vec3(localPlane.div(max(weightSum, .0001)), 2));
      const q = mix(ray, localRay, clamp(weightSum.mul(4), 0, 1)).add(vec3(0, 0, time.mul(-.025))).toVar();
      const tone = pow(sin(vec3(noise(q), noise(q.add(.1)), noise(q.add(.2))).mul(2)).mul(.5).add(.75), 8).toVar();
      const traced = march(ray, tone, int(0), int(16)).toVar(), travel = traced.x.toVar();
      If(layers.greaterThan(1.5), () => {
        const exact = restingHit(ray, tone, int(0)).toVar();
        If(exact.greaterThan(0).and(exact.lessThan(100)), () => { travel.assign(exact); })
          .ElseIf(exact.lessThan(0), () => {
            Loop(16, () => {
              const remaining = field(origin.add(ray.mul(travel)), tone, int(0)).toVar();
              If(remaining.lessThan(.00001).or(travel.greaterThan(100)), () => { Break(); });
              travel.addAssign(remaining.mul(.85));
            });
          });
        If(field(origin.add(ray.mul(travel)), tone, int(0)).greaterThan(.00001), () => {
          travel.assign(refineHit(ray, tone, int(0), travel));
        });
      });
      If(travel.lessThan(100).or(atmosphere.greaterThan(.5)), () => {
        const point = origin.add(ray.mul(travel.lessThan(100).select(travel, min(traced.y, 100)))).toVar();
        const normal = normalAt(point, tone, int(0)).toVar();
        const presence = coverage(point, normal, ray, tone, int(0)).toVar();
        If(atmosphere.greaterThan(.5), () => {
          normal.assign(normalize(mix(normalAt(origin.add(ray.mul(min(traced.y, 100))), tone, int(0)), normal, presence)));
        });
        const fieldMix = atmosphere.mul(smoothstep(.02, .3, weightSum).oneMinus());
        const front = shade(point, normal, ray, tone, int(0), presence, fieldMix).toVar();
        const behindColor = vec3(0).toVar(), behindPresence = float(0).toVar();
        If(front.w.greaterThanEqual(0).and(presence.lessThan(.995)).and(layers.greaterThan(1.5)), () => {
          const mask = int(1).shiftLeft(int(front.w)).toVar();
          If(front.w.lessThan(2).and(states.element(int(0)).y.greaterThan(.0002).or(states.element(int(1)).y.greaterThan(.0002))), () => { mask.assign(3); });
          const behindT = restingHit(ray, tone, mask).toVar();
          If(behindT.lessThan(0), () => { behindT.assign(march(ray, tone, mask, int(32)).x); });
          If(field(origin.add(ray.mul(behindT)), tone, mask).greaterThan(.00001), () => {
            behindT.assign(refineHit(ray, tone, mask, behindT));
          });
          If(behindT.lessThan(100), () => {
            const p = origin.add(ray.mul(behindT)).toVar(), n = normalAt(p, tone, mask).toVar();
            behindPresence.assign(coverage(p, n, ray, tone, mask));
            behindColor.assign(shade(p, n, ray, tone, mask, behindPresence, fieldMix).xyz);
          });
        });
        const visibility = presence.add(behindPresence.mul(presence.oneMinus())).toVar();
        const premultiplied = front.xyz.mul(presence).add(behindColor.mul(behindPresence).mul(presence.oneMinus())).toVar();
        If(atmosphere.greaterThan(.5), () => {
          premultiplied.assign(mix(front.xyz, behindColor, behindPresence.mul(presence.oneMinus()))); visibility.assign(1);
        });
        output.assign(vec4(premultiplied, visibility));
      });
    });
    return output;
  })();

  const setters = new Map<string, (value: number) => void>([["edgeSoftness", value => { edge.value = value; }]]);
  geometry.forEach((seed, index) => {
    for (const [suffix, vector, channel] of [
      ["x", seed, 0], ["y", seed, 1], ["z", seed, 2], ["r", seed, 3],
      ["h", dynamics[index], 0], ["b", dynamics[index], 1], ["p", dynamics[index], 2], ["g", dynamics[index], 3],
      ["cr", colors[index], 0], ["cg", colors[index], 1], ["cb", colors[index], 2]
    ] as const) setters.set(`s${index}${suffix}`, value => { vector.setComponent(channel, value); });
  });
  return { fragmentNode, time, resolution, orbit, atmosphere, dark, ground,
    setUniform: (name: string, value: number) => setters.get(name)?.(value),
    // r181 allocates these buffers during compilation. Fill them before the
    // first draw as well, including the one-shot reduced-motion path.
    syncBuffers: () => { seeds.update(bufferFrame); states.update(bufferFrame); tints.update(bufferFrame); } };
}
