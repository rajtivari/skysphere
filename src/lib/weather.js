// Wraps Open-Meteo (no API key needed) and normalizes its response into
// exactly what SkyScene needs. Every function here is defensive: bad network,
// bad response shape, or a thrown error all resolve to `null` rather than
// throwing further, so callers can always fall back cleanly.

const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

// Open-Meteo "weather code" -> our scene condition key.
// https://open-meteo.com/en/docs (WMO code table)
function conditionFromCode(code, cloudCoverPct) {
  if (code >= 95) return 'storm';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'rain';
  if (code >= 61 && code <= 67) return 'rain';
  if (code >= 51 && code <= 57) return 'rain';
  if (code === 45 || code === 48) return 'cloudy';
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partlyCloudy';
  if (code === 3) return 'cloudy';
  // fallback purely off cloud cover if code is unrecognized
  if (cloudCoverPct > 70) return 'cloudy';
  if (cloudCoverPct > 30) return 'partlyCloudy';
  return 'clear';
}

function rainIntensityFromCode(code, precipProb) {
  if (code >= 95) return 0.9;
  if (code >= 80 && code <= 82) return 0.7;
  if (code >= 61 && code <= 67) return code >= 65 ? 0.8 : 0.5;
  if (code >= 51 && code <= 57) return 0.3;
  if (precipProb > 60) return 0.3;
  return 0;
}

function snowIntensityFromCode(code) {
  if (code >= 71 && code <= 77) return code === 75 ? 0.9 : 0.5;
  if (code === 85 || code === 86) return 0.6;
  return 0;
}

// Approximate sun elevation from time-of-day relative to sunrise/sunset.
// Not full solar-position astronomy, but visually correct: 0° at sunrise/
// sunset, peak around solar noon, negative (below horizon) at night.
function estimateSunElevation(nowMs, sunriseMs, sunsetMs) {
  if (nowMs < sunriseMs || nowMs > sunsetMs) {
    // night: how far below the horizon, capped for lighting purposes
    const nightRef = nowMs < sunriseMs ? sunriseMs - nowMs : nowMs - sunsetMs;
    const hoursAway = nightRef / 3600000;
    return Math.max(-20, -hoursAway * 4);
  }
  const dayLength = sunsetMs - sunriseMs;
  const progress = (nowMs - sunriseMs) / dayLength; // 0..1
  return Math.sin(progress * Math.PI) * 68; // peaks ~68° at solar noon
}

export async function fetchWeather(lat, lon, { timeoutMs = 6000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,precipitation,uv_index',
      daily: 'sunrise,sunset,temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max',
      hourly: 'precipitation_probability',
      timezone: 'auto',
      forecast_days: '7',
    });

    const res = await fetch(`${WEATHER_URL}?${params}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data?.current || !data?.daily) return null;

    const code = data.current.weather_code ?? 0;
    const cloudCover = data.current.cloud_cover ?? 0;
    const precipProb = data.daily.precipitation_probability_max?.[0] ?? 0;

    const sunriseMs = new Date(data.daily.sunrise[0]).getTime();
    const sunsetMs = new Date(data.daily.sunset[0]).getTime();
    const nowMs = Date.now();
    const isNight = nowMs < sunriseMs || nowMs > sunsetMs;
    const elevation = estimateSunElevation(nowMs, sunriseMs, sunsetMs);

    return {
      condition: conditionFromCode(code, cloudCover),
      cloudCoverage: Math.min(1, cloudCover / 100),
      rainIntensity: rainIntensityFromCode(code, precipProb),
      snowIntensity: snowIntensityFromCode(code),
      isNight,
      sunElevationDeg: elevation,
      windSpeedKmh: data.current.wind_speed_10m ?? 10,
      windDirectionDeg: data.current.wind_direction_10m ?? 0,
      temperature: data.current.temperature_2m,
      feelsLike: data.current.apparent_temperature,
      humidity: data.current.relative_humidity_2m,
      uvIndex: data.current.uv_index,
      sunrise: data.daily.sunrise[0],
      sunset: data.daily.sunset[0],
      weatherCode: code,
      daily: data.daily,
      raw: data,
    };
  } catch {
    clearTimeout(timeout);
    return null; // network error, abort/timeout, parse failure — caller falls back
  }
}

export async function geocodeCity(name, { timeoutMs = 5000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const params = new URLSearchParams({ name, count: '5', language: 'en', format: 'json' });
    const res = await fetch(`${GEOCODE_URL}?${params}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.results || []).map((r) => ({
      name: r.name,
      admin1: r.admin1,
      country: r.country,
      lat: r.latitude,
      lon: r.longitude,
    }));
  } catch {
    clearTimeout(timeout);
    return [];
  }
}

// Browser geolocation wrapped as a promise that never rejects — resolves to
// null on denial/timeout/unsupported so the caller can fall back silently.
export function getBrowserLocation({ timeoutMs = 6000 } = {}) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => resolve(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { timeout: timeoutMs, maximumAge: 300000 }
    );
  });
}

// Used whenever geolocation + fetch both fail — the app should never show
// a blank/broken state, it should show something real.
export const FALLBACK_LOCATION = { lat: 12.9716, lon: 77.5946, name: 'Bangalore' };
export const FALLBACK_WEATHER = {
  condition: 'clear',
  cloudCoverage: 0.3,
  rainIntensity: 0,
  snowIntensity: 0,
  isNight: false,
  sunElevationDeg: 45,
  windSpeedKmh: 10,
  windDirectionDeg: 180,
  temperature: 27,
  feelsLike: 29,
  humidity: 60,
  uvIndex: 5,
};
