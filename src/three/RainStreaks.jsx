import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Falling rain rendered as short line segments (streaks), recycled from the
// top once they fall below the camera. Cheap enough for hundreds of lines
// at 60fps, and reads convincingly as rain at typical camera distances.
export default function RainStreaks({ count = 500, intensity = 1, area = 45 }) {
  const lineRef = useRef();

  const { geometry, velocities, lengths } = useMemo(() => {
    const positions = new Float32Array(count * 2 * 3);
    const velocities = new Float32Array(count);
    const lengths = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * area;
      const y = Math.random() * 35;
      const z = -5 + (Math.random() - 0.5) * area;
      const len = 0.5 + Math.random() * 0.6;
      positions[i * 6 + 0] = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = z;
      positions[i * 6 + 3] = x - 0.05;
      positions[i * 6 + 4] = y - len;
      positions[i * 6 + 5] = z;
      velocities[i] = 14 + Math.random() * 12;
      lengths[i] = len;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { geometry: geo, velocities, lengths };
  }, [count, area]);

  useFrame((state, delta) => {
    if (!lineRef.current || intensity <= 0) return;
    const posAttr = lineRef.current.geometry.attributes.position;
    const arr = posAttr.array;
    for (let i = 0; i < count; i++) {
      const fall = velocities[i] * delta * intensity;
      arr[i * 6 + 1] -= fall;
      arr[i * 6 + 4] -= fall;
      if (arr[i * 6 + 1] < -3) {
        const resetY = 32 + Math.random() * 5;
        arr[i * 6 + 1] = resetY;
        arr[i * 6 + 4] = resetY - lengths[i];
      }
    }
    posAttr.needsUpdate = true;
  });

  if (intensity <= 0) return null;

  return (
    <lineSegments ref={lineRef} geometry={geometry}>
      <lineBasicMaterial color="#cddcec" transparent opacity={Math.min(0.55, 0.25 + intensity * 0.3)} />
    </lineSegments>
  );
}
