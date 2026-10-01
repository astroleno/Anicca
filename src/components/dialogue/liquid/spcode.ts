/**
 * Production adaptation of reference/anicca-liquid-frontend/src/dialectic/spcode.ts.
 * The fixed slot budget limits only the visible liquid scene, never graph history.
 */
export const LIQUID_SEED_SLOTS = 8;

export function buildLiquidSpCode(slots: number = LIQUID_SEED_SLOTS): string {
  const declarations: string[] = [];
  const lines: string[] = [];

  for (let index = 0; index < slots; index += 1) {
    declarations.push(
      `let s${index}x = input();`,
      `let s${index}y = input();`,
      `let s${index}r = input();`,
      `let s${index}h = input();`,
      `let s${index}b = input();`,
      `let s${index}cr = input();`,
      `let s${index}cg = input();`,
      `let s${index}cb = input();`
    );
  }

  lines.push("setMaxIterations(8);");
  lines.push("let offset = .1;");
  lines.push("function fbm(p) {");
  lines.push("  return vec3(noise(p), noise(p+offset), noise(p+offset*2));");
  lines.push("}");
  lines.push("let s = getRayDirection();");
  lines.push("let n = sin(fbm(s+vec3(0, 0, -time*.1))*2)*.5+.75;");
  lines.push("n = pow(n, vec3(8));");
  lines.push("let sp = getSpace();");
  lines.push("let tw = 0.;");
  lines.push("let tint = vec3(0., 0., 0.);");

  for (let index = 0; index < slots; index += 1) {
    lines.push(`let d${index} = length(sp-vec3(s${index}x, s${index}y, 0.));`);
    lines.push(`let w${index} = clamp(1.-d${index}/(s${index}r*2.4+.12), 0., 1.);`);
    lines.push(`w${index} = w${index}*w${index}*(1.+s${index}h*.5);`);
    lines.push(`tint = tint+vec3(s${index}cr, s${index}cg, s${index}cb)*w${index};`);
    lines.push(`tw = tw+w${index};`);
  }

  lines.push("let seedCol = tint/max(tw, .0001);");
  lines.push("color(mix(n, seedCol*(n*1.5+.3), clamp(tw, 0., 1.)*.55));");
  for (let index = 0; index < slots; index += 1) {
    // A nearby dragged pair gets the reference's broader liquid neck without
    // joining every small seed in a crowded, resting scene.
    lines.push(`blend(s${index}b);`);
    if (index === 0) {
      lines.push("displace(s0x, s0y, 0.);");
    } else {
      lines.push(`displace(s${index}x-s${index - 1}x, s${index}y-s${index - 1}y, 0.);`);
    }
    lines.push(`sphere(s${index}r*(1.+s${index}h*.3));`);
  }

  return `${declarations.join("\n")}\n${lines.join("\n")}\n`;
}
