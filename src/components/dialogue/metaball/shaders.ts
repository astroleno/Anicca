export const DIALOGUE_METABALL_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const DIALOGUE_METABALL_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

#define MAX_METABALLS 8
#define MAX_STEPS 52

uniform vec2 uResolution;
uniform float uTime;
uniform float uSmoothness;
uniform int uCount;
uniform vec2 uCenters[MAX_METABALLS];
uniform float uRadii[MAX_METABALLS];
uniform vec3 uColors[MAX_METABALLS];
uniform float uEmphasis[MAX_METABALLS];

varying vec2 vUv;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float valueNoise(vec3 p) {
  vec3 cell = floor(p);
  vec3 local = fract(p);
  vec3 smoothLocal = local * local * (3.0 - 2.0 * local);

  float n000 = hash31(cell + vec3(0.0, 0.0, 0.0));
  float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(cell + vec3(1.0, 1.0, 1.0));

  float nx00 = mix(n000, n100, smoothLocal.x);
  float nx10 = mix(n010, n110, smoothLocal.x);
  float nx01 = mix(n001, n101, smoothLocal.x);
  float nx11 = mix(n011, n111, smoothLocal.x);
  float nxy0 = mix(nx00, nx10, smoothLocal.y);
  float nxy1 = mix(nx01, nx11, smoothLocal.y);
  return mix(nxy0, nxy1, smoothLocal.z);
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.55;
  for (int octave = 0; octave < 3; octave++) {
    value += valueNoise(p) * amplitude;
    p = p * 2.03 + vec3(17.1, 9.2, 13.7);
    amplitude *= 0.5;
  }
  return value;
}

float sphereSdf(vec3 p, vec3 center, float radius) {
  return length(p - center) - radius;
}

float smin(float a, float b, float k, out float blend) {
  blend = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, blend) - k * blend * (1.0 - blend);
}

float sceneSdf(vec3 p, out vec3 semanticColor, out float emphasis) {
  semanticColor = vec3(0.0);
  emphasis = 0.0;
  float distanceToScene = 10.0;
  float disturbance = (fbm(p * 3.1 + vec3(uTime * 0.025)) - 0.5) * 0.008;

  for (int index = 0; index < MAX_METABALLS; index++) {
    if (index >= uCount) break;

    float sphereDistance = sphereSdf(p, vec3(uCenters[index], 0.0), uRadii[index]) + disturbance;
    if (index == 0) {
      distanceToScene = sphereDistance;
      semanticColor = uColors[index];
      emphasis = uEmphasis[index];
    } else {
      float blend = 0.0;
      distanceToScene = smin(distanceToScene, sphereDistance, uSmoothness, blend);
      semanticColor = mix(uColors[index], semanticColor, blend);
      emphasis = mix(uEmphasis[index], emphasis, blend);
    }
  }

  return distanceToScene;
}

float sampleDistance(vec3 p) {
  vec3 ignoredColor;
  float ignoredEmphasis;
  return sceneSdf(p, ignoredColor, ignoredEmphasis);
}

vec3 estimateNormal(vec3 p) {
  const float epsilon = 0.0012;
  float centerDistance = sampleDistance(p);
  return normalize(vec3(
    sampleDistance(p + vec3(epsilon, 0.0, 0.0)) - centerDistance,
    sampleDistance(p + vec3(0.0, epsilon, 0.0)) - centerDistance,
    sampleDistance(p + vec3(0.0, 0.0, epsilon)) - centerDistance
  ));
}

void main() {
  if (uCount == 0) discard;

  vec2 stagePoint = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;
  vec3 rayOrigin = vec3(stagePoint, 1.2);
  vec3 rayDirection = vec3(0.0, 0.0, -1.0);
  float travel = 0.0;
  bool hit = false;
  vec3 semanticColor = vec3(0.0);
  float emphasis = 0.0;
  vec3 hitPoint = rayOrigin;

  for (int stepIndex = 0; stepIndex < MAX_STEPS; stepIndex++) {
    hitPoint = rayOrigin + rayDirection * travel;
    float distanceToScene = sceneSdf(hitPoint, semanticColor, emphasis);
    if (abs(distanceToScene) < 0.0015) {
      hit = true;
      break;
    }
    travel += max(distanceToScene * 0.82, 0.0015);
    if (travel > 2.4) break;
  }

  if (!hit) discard;

  vec3 normal = estimateNormal(hitPoint);
  vec3 viewDirection = normalize(rayOrigin - hitPoint);
  vec3 lightDirection = normalize(vec3(-0.36, 0.54, 0.76));
  vec3 halfDirection = normalize(lightDirection + viewDirection);
  float diffuse = max(dot(normal, lightDirection), 0.0) * 0.48;
  float specular = pow(max(dot(normal, halfDirection), 0.0), 34.0);
  float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.2);

  float pearlNoise = fbm(hitPoint * 4.0 + vec3(uTime * 0.025));
  vec3 pearlCool = vec3(0.62, 0.84, 1.0);
  vec3 pearlWarm = vec3(1.0, 0.78, 0.9);
  vec3 pearlColor = mix(pearlCool, pearlWarm, smoothstep(0.18, 0.86, pearlNoise));
  vec3 baseColor = mix(semanticColor, pearlColor, 0.3);
  vec3 litColor = baseColor * (0.44 + diffuse);
  litColor += vec3(1.0, 0.96, 0.92) * specular * 0.52;
  litColor += pearlColor * fresnel * 0.34;
  litColor *= mix(0.82, 1.0, emphasis);

  float alpha = clamp(0.88 + fresnel * 0.1, 0.0, 0.98);
  gl_FragColor = vec4(litColor * alpha, alpha);
}
`;
