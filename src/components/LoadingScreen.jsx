import { useEffect, useState } from 'react';
import './LoadingScreen.css';

const STAGES = [
  { key: 'locating', label: 'Finding your sky…' },
  { key: 'weather', label: 'Reading live weather…' },
  { key: 'atmosphere', label: 'Building the atmosphere…' },
  { key: 'ready', label: 'Ready.' },
];

export default function LoadingScreen({ stage, visible }) {
  const [displayPct, setDisplayPct] = useState(0);
  const stageIndex = Math.max(0, STAGES.findIndex((s) => s.key === stage));
  const targetPct = Math.round(((stageIndex + 1) / STAGES.length) * 100);

  // smoothly animate the percentage number rather than snapping
  useEffect(() => {
    let raf;
    const step = () => {
      setDisplayPct((p) => {
        if (p >= targetPct) return targetPct;
        return Math.min(targetPct, p + Math.max(1, (targetPct - p) * 0.12));
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [targetPct]);

  return (
    <div className={`loading-screen ${visible ? '' : 'is-hidden'}`} aria-hidden={!visible}>
      <div className="loading-sky">
        <div className="loading-sun" />
        <div className="loading-cloud c1" />
        <div className="loading-cloud c2" />
        <div className="loading-cloud c3" />
        <div className="loading-cloud c4" />
      </div>

      <div className="loading-content">
        <div className="loading-mark">
          <span className="loading-mark-icon">☁</span>
          <span className="loading-mark-text">SkySphere</span>
        </div>

        <div className="loading-ring-wrap">
          <svg className="loading-ring" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" className="loading-ring-track" />
            <circle
              cx="60" cy="60" r="52"
              className="loading-ring-fill"
              style={{ strokeDashoffset: 327 - (327 * displayPct) / 100 }}
            />
          </svg>
          <span className="loading-pct">{Math.round(displayPct)}%</span>
        </div>

        <p className="loading-stage">{STAGES[stageIndex]?.label}</p>

        <div className="loading-steps">
          {STAGES.map((s, i) => (
            <span key={s.key} className={`loading-step ${i <= stageIndex ? 'is-done' : ''}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
