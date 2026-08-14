import { Effect } from 'postprocessing';
import { Uniform } from 'three';

// Real screen-space refraction, not a decorative overlay: this samples the
// already-rendered scene and bends the UVs through procedural droplet
// shapes, so what's "behind" each droplet visibly warps — the way water
// actually behaves on glass.
const fragmentShader = `
  uniform float uTime;
  uniform float uIntensity;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // One layer of falling droplet cells at a given grid density/speed.
  vec3 dropletLayer(vec2 uv, float cellSize, float speed, float seedOffset) {
    vec2 grid = uv * cellSize;
    vec2 cellId = floor(grid);
    vec2 cellUv = fract(grid) - 0.5;

    float rand = hash(cellId + seedOffset);
    float fallT = fract(uTime * speed * (0.4 + rand) + rand * 12.0);
    float dropY = mix(0.65, -0.65, fallT);
    vec2 dropPos = vec2((rand - 0.5) * 0.55, dropY);

    float dist = length((cellUv - dropPos) * vec2(1.0, 1.3));
    float dropRadius = mix(0.07, 0.17, hash(cellId + seedOffset + 3.3));
    float mask = smoothstep(dropRadius, dropRadius * 0.35, dist);

    float trail = smoothstep(0.045, 0.0, abs(cellUv.x - dropPos.x)) *
                  smoothstep(dropPos.y - 0.05, dropPos.y + 0.5, cellUv.y) *
                  smoothstep(dropPos.y + 0.6, dropPos.y + 0.15, cellUv.y) * 0.3;

    vec2 offset = (cellUv - dropPos) * mask * -0.4;
    return vec3(offset, clamp(mask + trail, 0.0, 1.0));
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    if (uIntensity <= 0.001) {
      outputColor = inputColor;
      return;
    }

    vec3 d1 = dropletLayer(uv, 8.0, 0.14, 1.0);
    vec3 d2 = dropletLayer(uv, 13.0, 0.2, 7.0);
    vec3 d3 = dropletLayer(uv, 19.0, 0.27, 13.0);

    vec2 distortion = (d1.xy + d2.xy + d3.xy) * uIntensity;
    float mask = clamp(d1.z + d2.z + d3.z, 0.0, 1.0) * uIntensity;

    vec2 sampleUv = clamp(uv + distortion * 0.05, 0.0, 1.0);
    vec4 refracted = texture2D(inputBuffer, sampleUv);

    float highlight = mask * 0.12;
    vec4 dropColor = vec4(refracted.rgb + highlight, 1.0);

    outputColor = mix(inputColor, dropColor, mask);
  }
`;

export class RainGlassEffectImpl extends Effect {
  constructor({ intensity = 0 } = {}) {
    super('RainGlassEffect', fragmentShader, {
      uniforms: new Map([
        ['uTime', new Uniform(0)],
        ['uIntensity', new Uniform(intensity)],
      ]),
    });
  }

  update(renderer, inputBuffer, deltaTime) {
    this.uniforms.get('uTime').value += deltaTime;
  }

  setIntensity(v) {
    this.uniforms.get('uIntensity').value = v;
  }
}
