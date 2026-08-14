import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function makeSnowTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// Gentle drifting snow — slower fall than rain, with horizontal sway so it
// doesn't read as "rain but white".
export default function SnowParticles({ count = 300, intensity = 1, area = 45 }) {
  const pointsRef = useRef();
  const texture = useMemo(() => makeSnowTexture(), []);

  const { geometry, seeds } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 2); // sway phase, fall speed mult
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * area;
      positions[i * 3 + 1] = Math.random() * 30;
      positions[i * 3 + 2] = -5 + (Math.random() - 0.5) * area;
      seeds[i * 2 + 0] = Math.random() * Math.PI * 2;
      seeds[i * 2 + 1] = 0.6 + Math.random() * 0.8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { geometry: geo, seeds };
  }, [count, area]);

  useFrame((state, delta) => {
    if (!pointsRef.current || intensity <= 0) return;
    const posAttr = pointsRef.current.geometry.attributes.position;
    const arr = posAttr.array;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const phase = seeds[i * 2 + 0];
      const speedMul = seeds[i * 2 + 1];
      arr[i * 3 + 1] -= speedMul * 1.6 * intensity * delta;
      arr[i * 3 + 0] += Math.sin(t * 0.6 + phase) * 0.15 * delta;
      if (arr[i * 3 + 1] < -3) {
        arr[i * 3 + 1] = 28 + Math.random() * 5;
      }
    }
    posAttr.needsUpdate = true;
  });

  if (intensity <= 0) return null;

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        map={texture}
        size={0.35}
        transparent
        opacity={0.85}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
