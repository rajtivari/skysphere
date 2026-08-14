import { forwardRef, useEffect, useMemo } from 'react';
import { EffectComposer } from '@react-three/postprocessing';
import { RainGlassEffectImpl } from './RainGlassEffectImpl';

const RainGlassEffect = forwardRef(({ intensity }, ref) => {
  const effect = useMemo(() => new RainGlassEffectImpl({ intensity }), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    effect.setIntensity(intensity);
  }, [effect, intensity]);

  return <primitive ref={ref} object={effect} />;
});

export default function WeatherPostFX({ rainGlassIntensity = 0 }) {
  if (rainGlassIntensity <= 0) return null;
  return (
    <EffectComposer>
      <RainGlassEffect intensity={rainGlassIntensity} />
    </EffectComposer>
  );
}
