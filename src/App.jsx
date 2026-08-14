import { useEffect, useRef, useState } from 'react';
import SkyScene from './three/SkyScene';
import LoadingScreen from './components/LoadingScreen';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';
import {
  fetchWeather,
  getBrowserLocation,
  FALLBACK_LOCATION,
  FALLBACK_WEATHER,
} from './lib/weather';

const MIN_LOADING_MS = 1400; // avoid a flash-of-spinner on fast connections
const HARD_TIMEOUT_MS = 9000; // absolute ceiling — we always resolve to something

function SkyApp() {
  const [stage, setStage] = useState('locating');
  const [ready, setReady] = useState(false);
  const [sceneCreated, setSceneCreated] = useState(false);
  const [weather, setWeather] = useState(null);
  const [isFallback, setIsFallback] = useState(false);
  const [locationLabel, setLocationLabel] = useState('');
  const startedAt = useRef(Date.now());
  const resolvedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const finish = (weatherData, label, usedFallback) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      if (cancelled) return;
      setWeather(weatherData);
      setLocationLabel(label);
      setIsFallback(usedFallback);
      setStage('atmosphere');
    };

    // Absolute safety net: no matter what happens above, the app resolves
    // to the fallback preset rather than hanging on a loading screen forever.
    const hardTimeout = setTimeout(() => {
      finish(FALLBACK_WEATHER, FALLBACK_LOCATION.name, true);
    }, HARD_TIMEOUT_MS);

    (async () => {
      try {
        setStage('locating');
        const loc = await getBrowserLocation();
        const useLoc = loc || FALLBACK_LOCATION;
        const label = loc ? 'Your location' : FALLBACK_LOCATION.name;

        setStage('weather');
        const data = await fetchWeather(useLoc.lat, useLoc.lon);

        clearTimeout(hardTimeout);
        finish(data || FALLBACK_WEATHER, label, !data);
      } catch {
        clearTimeout(hardTimeout);
        finish(FALLBACK_WEATHER, FALLBACK_LOCATION.name, true);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(hardTimeout);
    };
  }, []);

  // Once weather is resolved AND the WebGL scene has actually mounted,
  // hold for the minimum display time, then reveal.
  useEffect(() => {
    if (stage !== 'atmosphere' || !sceneCreated) return;
    const elapsed = Date.now() - startedAt.current;
    const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
    const t = setTimeout(() => {
      setStage('ready');
      setReady(true);
    }, remaining);
    return () => clearTimeout(t);
  }, [stage, sceneCreated]);

  const activeWeather = weather || FALLBACK_WEATHER;

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#000' }}>
      <SkyScene
        elevationDeg={activeWeather.sunElevationDeg}
        azimuthDeg={120}
        cloudCoverage={activeWeather.cloudCoverage}
        condition={activeWeather.condition}
        isNight={activeWeather.isNight}
        windSpeed={Math.min(1, (activeWeather.windSpeedKmh || 10) / 40)}
        rainIntensity={activeWeather.rainIntensity}
        snowIntensity={activeWeather.snowIntensity}
        onReady={() => setSceneCreated(true)}
      />

      {ready && (
        <div className="live-readout">
          <div className="live-readout-loc">{locationLabel}</div>
          <div className="live-readout-temp">{Math.round(activeWeather.temperature)}°</div>
          <div className="live-readout-cond">{activeWeather.condition}</div>
          {isFallback && <div className="live-readout-fallback">showing default data — live fetch unavailable</div>}
        </div>
      )}

      <LoadingScreen stage={stage} visible={!ready} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SkyApp />
    </ErrorBoundary>
  );
}
