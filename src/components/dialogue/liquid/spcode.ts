/**
 * Material and deformation from ref/sketch1638178/spCode.js.
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
      `let s${index}z = input();`,
      `let s${index}r = input();`,
      `let s${index}h = input();`,
      `let s${index}b = input();`,
      `let s${index}p = input();`
    );
    for (const channel of ["cr", "cg", "cb"]) declarations.push(`let s${index}${channel} = input();`);
  }

  declarations.push("let viewYaw = input();", "let viewPitch = input();");
  declarations.push("let materialR = input();", "let materialG = input();", "let materialB = input();", "let fieldMix = input();");

  // Resolve separated volumes reliably while retaining the reference material.
  lines.push("setMaxIterations(16);");
  lines.push("let n = vec3(materialR, materialG, materialB);");
  for (let index = 0; index < slots; index += 1) {
    // The sketch's .4 blend belongs to its .5-radius body. Keep that ratio
    // when rendering smaller seeds instead of joining the whole mobile stage.
    lines.push(`blend(s${index}b*s${index}r*2.);`);
    if (index === 0) {
      lines.push("displace(s0x, s0y, s0z);");
    } else {
      lines.push(`displace(s${index}x-s${index - 1}x, s${index}y-s${index - 1}y, s${index}z-s${index - 1}z);`);
    }
    lines.push(`let scale${index} = s${index}r*(1.+n.x*.055);`);
    lines.push("shape(() => {");
    lines.push(`  let seedColor = vec3(s${index}cr, s${index}cg, s${index}cb);`);
    lines.push("  let variation = vec3(clamp(n.x, 0., 3.), clamp(n.y, 0., 3.), clamp(n.z, 0., 3.));");
    lines.push("  let pearl = seedColor*(.8+clamp(n.x*.05, 0., .3))+variation*.012;");
    lines.push(`  color(mix(pearl, n, fieldMix)*s${index}p);`);
    lines.push("  rotateX(viewPitch);");
    lines.push("  rotateY(viewYaw);");
    lines.push("  rotateX(PI/2);");
    lines.push(`  torus(scale${index}, s${index}r*.4);`);
    lines.push("  reset();");
    lines.push(`  mixGeo(s${index}h);`);
    lines.push(`  sphere(scale${index});`);
    lines.push("})();");
  }

  return `${declarations.join("\n")}\n${lines.join("\n")}\n`;
}

/** The reference flow is initialized once per fragment, outside all SDF calls. */
export function buildLiquidFlowSource(slots = LIQUID_SEED_SLOTS): string {
  const weights = Array.from({ length: slots }, (_, i) => `
    if(s${i}r > .0015) {
      float perspective = 1.0+s${i}z/2.0;
      float radius = s${i}r/perspective;
      vec2 delta = projectionPlane-vec2(s${i}x,s${i}y)/perspective;
      float weight = clamp(1.0-length(delta)/(radius*3.2),0.0,1.0);
      if(length(delta) < radius*2.05) layers += 1.0;
      weight *= weight;
      localPlane += delta*(.5/radius)*weight;
      fieldWeight += weight;
    }`).join("\n");
  return `float flowCoverage = 0.0;
  float flowLayers = 0.0;
  vec3 aniccaFlow(vec3 ray) {
    vec2 projectionPlane = ray.xy/ray.z*2.0;
    vec2 localPlane = vec2(0.0);
    float fieldWeight = 0.0;
    float layers = 0.0;
    ${weights}
    flowCoverage = fieldWeight;
    flowLayers = layers;
    if(fieldWeight < .0001 && atmosphere < .5) return vec3(.3);
    vec3 localRay = normalize(vec3(localPlane/max(fieldWeight,.0001),2.0));
    vec3 s = mix(ray,localRay,clamp(fieldWeight*4.0,0.0,1.0));
    vec3 q = s+vec3(0.0,0.0,-time*.025);
    vec3 n = sin(vec3(noise(q),noise(q+.1),noise(q+.2))*2.0)*.5+.75;
    return pow(n,vec3(8.0));
  }`;
}

/** Same torus/sphere field as the DSL, skipping empty slots and resting tori. */
export function buildLiquidDistanceSource(slots = LIQUID_SEED_SLOTS): string {
  const primitives = Array.from({ length: slots }, (_, i) => `float aniccaBody${i}(vec3 p) {
      vec3 local = p-vec3(s${i}x,s${i}y,s${i}z);
      float radius = s${i}r*(1.0+materialR*.055);
      float body = sphere(local,radius);
      if(s${i}h > .0001) {
        vec3 rotated = local;
        rotated.yz = rotated.yz*rot2(viewPitch);
        rotated.xz = rotated.xz*rot2(viewYaw);
        rotated.yz = rotated.yz*rot2(1.57079633);
        body = mix(body,torus(rotated,radius,s${i}r*.4),s${i}h);
      }
      return body;
    }`).join("\n");
  const bodies = Array.from({ length: slots }, (_, i) => `if(s${i}r > .0015 && (liquidLayerMask & ${1 << i}) == 0) d=smoothAdd(aniccaBody${i}(p),d,s${i}b*s${i}r*2.0);`).join("\n");
  const restingHits = Array.from({ length: slots }, (_, i) => `
    if(s${i}r > .0015 && (liquidLayerMask & ${1 << i}) == 0) {
      if(s${i}h > .0001 || s${i}b > .0002) resting=false;
      vec3 offset=ro-vec3(s${i}x,s${i}y,s${i}z);
      float radius=s${i}r*(1.0+materialR*.055), b=dot(offset,rd);
      float discriminant=b*b-dot(offset,offset)+radius*radius;
      if(discriminant >= 0.0) { float hit=-b-sqrt(discriminant); if(hit > 0.0) nearest=min(nearest,hit); }
    }`).join("\n");
  return `int liquidLayerMask=0;\nint primarySeed=-1;\n${primitives}\nfloat surfaceDistance(vec3 p) { float d=100.0; ${bodies}\nreturn d; }
  // Exact resting spheres avoid a one-pixel gap when a finite grazing march
  // switches between layers. Deforming or joined layers retain the SDF path.
  float aniccaRestingLayerHit(vec3 ro, vec3 rd) {
    float nearest=100.0; bool resting=true; ${restingHits}
    return resting ? nearest : -1.0;
  }`;
}

/** Color follows the same smooth-min weights as geometry, including the soft neck. */
export function buildLiquidMaterialSource(slots = LIQUID_SEED_SLOTS): string {
  const layers = Array.from({ length: slots }, (_, i) => `
    if(s${i}r > .0015 && (liquidLayerMask & ${1 << i}) == 0) {
      float body=aniccaBody${i}(p), k=max(.000001,s${i}b*s${i}r*2.0);
      float incoming=clamp(.5+.5*(distance-body)/k,0.0,1.0);
      vec3 identity=pow(vec3(s${i}cr,s${i}cg,s${i}cb),vec3(2.2));
      vec3 pearl=mix(texture,identity,.56)*(.48+luma*.82);
      tint=mix(tint,mix(pearl,n,fieldMix),incoming);
      seedAttention=mix(seedAttention,s${i}p,incoming);
      if(incoming > .5) primarySeed=${i};
      distance=smoothAdd(body,distance,k);
    }`).join("\n");
  return `float seedAttention=1.0;\nvec3 aniccaAlbedo(vec3 p) {
    primarySeed=-1;
    seedAttention=1.0;
    vec3 n=vec3(materialR,materialG,materialB), compressed=n/(vec3(1.0)+n);
    float luma=dot(compressed,vec3(.2126,.7152,.0722));
    vec3 texture=mix(vec3(luma),compressed,.36), tint=vec3(.6);
    float distance=100.0;
    ${layers}
    return tint;
  }
  ShadedMaterial shade(vec3 p, vec3 normal) {
    vec3 tint=aniccaAlbedo(p);
    Material material=Material(tint,tint,.5,.7,1.0);
    return pbrLighting(worldPos.xyz,normal,vec3(0.0,1.0,0.0),material,vec3(1.0));
  }`;
}
