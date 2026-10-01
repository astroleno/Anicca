/**
 * Dynamically generates Shader Park source replicating the reference sketch
 * (the original spCode.js), extended with a fixed
 * pool of seed spheres driven by input() uniforms.
 *
 * Key replicated traits:
 *  - setMaxIterations(8): the marcher never truly "misses" — t is returned
 *    unconditionally, so every pixel shades through the fbm color field.
 *    That quirk IS the look: gauzy soft body + dreamy pastel background.
 *  - Exact color field: n = pow(sin(fbm(rayDir + drift)*2)*.5+.75, 8)
 *  - blend(.4) smooth-union goo between all spheres + cursor sphere(.2)
 */

export const SEED_SLOTS = 32

export function buildSpCode(slots: number = SEED_SLOTS): string {
  const lines: string[] = []

  lines.push(`setMaxIterations(8);`)
  lines.push(`let offset = .1;`)
  lines.push(`function fbm(p) {`)
  lines.push(`  return vec3(noise(p), noise(p+offset), noise(p+offset*2));`)
  lines.push(`}`)
  lines.push(`let s = getRayDirection();`)
  lines.push(`let n = sin(fbm(s+vec3(0, 0, -time*.1))*2)*.5+.75;`)
  lines.push(`n = pow(n, vec3(8));`)
  lines.push(``)

  // ---- per-seed color tint field, evaluated at the shaded point ----
  lines.push(`let sp = getSpace();`)
  lines.push(`let tw = 0.;`)
  lines.push(`let tint = vec3(0., 0., 0.);`)
  for (let i = 0; i < slots; i++) {
    lines.push(`let d${i} = length(sp-vec3(s${i}x, s${i}y, 0.));`)
    lines.push(`let w${i} = clamp(1.-d${i}/(s${i}r*2.4+.12), 0., 1.);`)
    lines.push(`w${i} = w${i}*w${i}*(1.+s${i}h*.5);`)
    lines.push(`tint = tint+vec3(s${i}cr, s${i}cg, s${i}cb)*w${i};`)
    lines.push(`tw = tw+w${i};`)
  }
  lines.push(`let seedCol = tint/max(tw, .0001);`)
  // multiplicative tint keeps the milky pow(n,8) texture; ~55% influence,
  // floor raised so small seeds don't collapse to muddy dark cores
  lines.push(`color(mix(n, seedCol*(n*1.5+.3), clamp(tw, 0., 1.)*.55));`)
  lines.push(``)

  // ---- geometry: seed spheres + cursor goo sphere ----
  // displace() is cumulative (p -= v), so chain absolute positions as deltas.
  lines.push(`blend(.4);`)
  for (let i = 0; i < slots; i++) {
    if (i === 0) {
      lines.push(`displace(s0x, s0y, 0.);`)
    } else {
      lines.push(`displace(s${i}x-s${i - 1}x, s${i}y-s${i - 1}y, 0.);`)
    }
    lines.push(`sphere(s${i}r*(1.+s${i}h*.3));`)
  }
  lines.push(`displace(mx-s${slots - 1}x, my-s${slots - 1}y, 0.);`)
  lines.push(`sphere(.2);`)

  // ---- input declarations (replaceSliderInput binds the variable names) ----
  // NOTE: declarations must appear where eval sees them; the DSL collects
  // uniforms at eval time regardless of position, but keep them up front for
  // clarity — hoisted to the top of the generated source below.
  const decls: string[] = []
  for (let i = 0; i < slots; i++) {
    decls.push(
      `let s${i}x = input();`,
      `let s${i}y = input();`,
      `let s${i}r = input();`,
      `let s${i}h = input();`,
      `let s${i}cr = input();`,
      `let s${i}cg = input();`,
      `let s${i}cb = input();`,
    )
  }
  decls.push(`let mx = input();`, `let my = input();`)

  return decls.join('\n') + '\n' + lines.join('\n') + '\n'
}
