import { Canvas, useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import RainStreaks from './RainStreaks';
import SnowParticles from './SnowParticles';
import WeatherPostFX from './WeatherPostFX';

// Converts elevation/azimuth (degrees) into a unit direction vector for the sun.
function sunDirectionFromAngles(elevationDeg, azimuthDeg) {
  const elevation = THREE.MathUtils.degToRad(elevationDeg);
  const azimuth = THREE.MathUtils.degToRad(azimuthDeg);
  const x = Math.cos(elevation) * Math.sin(azimuth);
  const y = Math.sin(elevation);
  const z = Math.cos(elevation) * Math.cos(azimuth);
  return new THREE.Vector3(x, y, z);
}

// ---- Custom gradient sky dome ----
// We use our own shader instead of a physically-based clear-sky model
// because sky COLOR needs to react to weather state (overcast/storm skies
// look different from clear ones), which a clear-sky model can't express.
const skyVertexShader = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragmentShader = `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 bottomColor;
  uniform vec3 sunDirection;
  uniform vec3 sunColor;
  uniform float sunSize;
  uniform float exponent;
  varying vec3 vWorldPosition;

  void main() {
    float h = normalize(vWorldPosition).y;
    float t = pow(clamp(h, 0.0, 1.0), exponent);

    vec3 sky;
    if (h > 0.0) {
      sky = mix(horizonColor, topColor, t);
    } else {
      sky = mix(horizonColor, bottomColor, pow(clamp(-h, 0.0, 1.0), 0.5));
    }

    float sunDot = max(dot(normalize(vWorldPosition), sunDirection), 0.0);
    float sunDisc = smoothstep(1.0 - sunSize, 1.0 - sunSize * 0.3, sunDot);
    float sunGlow = pow(sunDot, 6.0) * 0.6;
    sky += sunColor * (sunDisc * 1.3 + sunGlow);

    gl_FragColor = vec4(sky, 1.0);
  }
`;

function SkyDome({ topColor, horizonColor, bottomColor, sunDirection, sunColor, sunSize }) {
  const materialRef = useRef();

  const uniforms = useMemo(() => ({
    topColor: { value: new THREE.Color(topColor) },
    horizonColor: { value: new THREE.Color(horizonColor) },
    bottomColor: { value: new THREE.Color(bottomColor) },
    sunDirection: { value: sunDirection.clone() },
    sunColor: { value: new THREE.Color(sunColor) },
    sunSize: { value: sunSize },
    exponent: { value: 0.9 },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  // update in place each render rather than recreating the material
  uniforms.topColor.value.set(topColor);
  uniforms.horizonColor.value.set(horizonColor);
  uniforms.bottomColor.value.set(bottomColor);
  uniforms.sunDirection.value.copy(sunDirection);
  uniforms.sunColor.value.set(sunColor);
  uniforms.sunSize.value = sunSize;

  return (
    <mesh>
      <sphereGeometry args={[400, 32, 32]} />
      <shaderMaterial
        ref={materialRef}
        side={THREE.BackSide}
        vertexShader={skyVertexShader}
        fragmentShader={skyFragmentShader}
        uniforms={uniforms}
        depthWrite={false}
      />
    </mesh>
  );
}

// ---- Cloud field: soft sprite clusters, procedural texture (no network) ----
function makePuffTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.92)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function CloudField({ coverage = 0.5, opacity = 1, tint = '#ffffff', windSpeed = 0.2 }) {
  const texture = useMemo(() => makePuffTexture(), []);
  const groupRef = useRef();

  const clusters = useMemo(() => {
    const arr = [];
    const count = Math.round(4 + coverage * 11);
    for (let i = 0; i < count; i++) {
      const cx = (Math.random() - 0.5) * 70;
      const cy = 3 + Math.random() * 9;
      const cz = -10 + (Math.random() - 0.5) * 35;
      const puffs = [];
      const puffCount = 6 + Math.floor(Math.random() * 6);
      for (let j = 0; j < puffCount; j++) {
        puffs.push({
          offset: [(Math.random() - 0.5) * 10, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 8],
          scale: 5 + Math.random() * 6,
        });
      }
      arr.push({ center: [cx, cy, cz], puffs, drift: 0.1 + Math.random() * 0.2 });
    }
    return arr;
  }, [coverage]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    groupRef.current.children.forEach((cloud, i) => {
      cloud.position.x += clusters[i].drift * windSpeed * 5 * delta;
      if (cloud.position.x > 60) cloud.position.x = -60;
    });
  });

  return (
    <group ref={groupRef}>
      {clusters.map((c, i) => (
        <group key={i} position={c.center}>
          {c.puffs.map((p, j) => (
            <sprite key={j} position={p.offset} scale={[p.scale, p.scale * 0.6, 1]}>
              <spriteMaterial
                map={texture}
                transparent
                opacity={opacity * 0.9}
                depthWrite={false}
                color={tint}
              />
            </sprite>
          ))}
        </group>
      ))}
    </group>
  );
}

// ---- Weather -> color presets ----
// This is the mapping that gives each condition a genuinely different sky,
// not just a brightness knob on the same clear-sky look.
export const WEATHER_PRESETS = {
  clear: {
    top: '#1d5fd6', horizon: '#bcdcff', bottom: '#dff0ff',
    sunColor: '#fff6e0', sunSize: 0.02, cloudTint: '#ffffff', cloudOpacityMul: 0.15,
  },
  partlyCloudy: {
    top: '#3d7fd9', horizon: '#c9dcec', bottom: '#e4edf3',
    sunColor: '#fff2da', sunSize: 0.025, cloudTint: '#ffffff', cloudOpacityMul: 0.6,
  },
  cloudy: {
    top: '#7c8a9a', horizon: '#a9b4bd', bottom: '#c3cad1',
    sunColor: '#e8e4d8', sunSize: 0.04, cloudTint: '#cfd6dc', cloudOpacityMul: 0.95,
  },
  rain: {
    top: '#3a4450', horizon: '#5b6772', bottom: '#6d7986',
    sunColor: '#aab2ba', sunSize: 0.03, cloudTint: '#525d68', cloudOpacityMul: 1,
  },
  storm: {
    top: '#1c2129', horizon: '#333b45', bottom: '#454e58',
    sunColor: '#8a8f96', sunSize: 0.02, cloudTint: '#2e343c', cloudOpacityMul: 1,
  },
  snow: {
    top: '#8b96a3', horizon: '#c3cdd6', bottom: '#dbe2e8',
    sunColor: '#eef2f5', sunSize: 0.05, cloudTint: '#c9d1d8', cloudOpacityMul: 0.85,
  },
  night: {
    top: '#020409', horizon: '#0a1220', bottom: '#0d1a2c',
    sunColor: '#c8d6ff', sunSize: 0.012, cloudTint: '#1a2333', cloudOpacityMul: 0.5,
  },
};

export default function SkyScene({
  elevationDeg = 45,
  azimuthDeg = 90,
  cloudCoverage = 0.5,
  condition = 'clear',
  isNight = false,
  windSpeed = 0.2,
  rainIntensity = 0,
  snowIntensity = 0,
  onReady,
}) {
  const sunDirection = useMemo(
    () => sunDirectionFromAngles(elevationDeg, azimuthDeg),
    [elevationDeg, azimuthDeg]
  );

  const preset = isNight ? WEATHER_PRESETS.night : (WEATHER_PRESETS[condition] || WEATHER_PRESETS.clear);

  return (
    <Canvas
      camera={{ position: [0, 2, 10], fov: 60, near: 0.1, far: 2000 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
      onCreated={() => onReady?.()}
    >
      <Suspense fallback={null}>
        <SkyDome
          topColor={preset.top}
          horizonColor={preset.horizon}
          bottomColor={preset.bottom}
          sunDirection={sunDirection}
          sunColor={preset.sunColor}
          sunSize={preset.sunSize}
        />

        {isNight && <Stars radius={300} depth={60} count={3000} factor={4} fade speed={0.5} />}

        <ambientLight intensity={isNight ? 0.25 : 0.6} />
        <directionalLight
          position={sunDirection.clone().multiplyScalar(100)}
          intensity={isNight ? 0.15 : 1.4}
          color={preset.sunColor}
        />

        <CloudField
          coverage={cloudCoverage}
          opacity={preset.cloudOpacityMul}
          tint={preset.cloudTint}
          windSpeed={windSpeed}
        />

        {rainIntensity > 0 && <RainStreaks intensity={rainIntensity} />}
        {snowIntensity > 0 && <SnowParticles intensity={snowIntensity} />}

        <WeatherPostFX rainGlassIntensity={rainIntensity} />
      </Suspense>
    </Canvas>
  );
}
