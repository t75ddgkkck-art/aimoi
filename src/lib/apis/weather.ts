// Open-Meteo — free weather API, no key required.
// Rain & strong wind statistically reduce goals; we compute a goal multiplier.

export interface WeatherImpact {
  goalMultiplier: number; // ~0.85 (storm) to 1.0 (clear)
  precipitation: number; // mm/h
  windSpeed: number; // km/h
  temperature: number; // °C
  label: string;
}

// Approximate coordinates per country/league for stadium-area weather.
// (City-level is enough for a goal-rate adjustment.)
const COUNTRY_COORDS: Record<string, { lat: number; lon: number }> = {
  England: { lat: 52.5, lon: -1.5 },
  Spain: { lat: 40.4, lon: -3.7 },
  Italy: { lat: 41.9, lon: 12.5 },
  Germany: { lat: 51.0, lon: 10.0 },
  France: { lat: 47.0, lon: 2.0 },
  Netherlands: { lat: 52.1, lon: 5.3 },
  Portugal: { lat: 39.4, lon: -8.2 },
  Turkey: { lat: 39.0, lon: 35.0 },
  Belgium: { lat: 50.6, lon: 4.7 },
  Scotland: { lat: 56.5, lon: -4.2 },
  Greece: { lat: 39.0, lon: 22.0 },
  Brazil: { lat: -14.2, lon: -51.9 },
  Norway: { lat: 62.0, lon: 10.0 },
  Sweden: { lat: 62.0, lon: 15.0 },
  Mexico: { lat: 23.6, lon: -102.5 },
  World: { lat: 39.0, lon: -98.0 }, // World Cup hosts (US center)
};

function impactFromConditions(precip: number, wind: number): { mult: number; label: string } {
  let mult = 1.0;
  const reasons: string[] = [];
  if (precip > 2) { mult -= 0.08; reasons.push("forte pluie"); }
  else if (precip > 0.3) { mult -= 0.03; reasons.push("pluie"); }
  if (wind > 40) { mult -= 0.07; reasons.push("vent violent"); }
  else if (wind > 25) { mult -= 0.03; reasons.push("vent"); }
  mult = Math.max(0.82, mult);
  const label = reasons.length ? reasons.join(" + ") : "conditions normales";
  return { mult, label };
}

// In-memory cache keyed by country+day to respect rate limits.
const cache = new Map<string, { at: number; data: WeatherImpact }>();
const TTL = 6 * 60 * 60 * 1000; // 6h

export async function getWeatherImpact(country: string, kickoffISO: string): Promise<WeatherImpact> {
  const coords = COUNTRY_COORDS[country] ?? COUNTRY_COORDS.World;
  const day = kickoffISO.slice(0, 10);
  const key = `${country}|${day}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL) return cached.data;

  const fallback: WeatherImpact = { goalMultiplier: 1.0, precipitation: 0, windSpeed: 0, temperature: 15, label: "n/a" };

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&hourly=precipitation,wind_speed_10m,temperature_2m&forecast_days=16`;
    const res = await fetch(url, { next: { revalidate: 0 }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return fallback;
    const data = await res.json();
    const times: string[] = data.hourly?.time ?? [];
    // Find the hour closest to kickoff
    const target = new Date(kickoffISO).getTime();
    let bestIdx = 0, bestDiff = Infinity;
    for (let i = 0; i < times.length; i++) {
      const diff = Math.abs(new Date(times[i]).getTime() - target);
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    }
    const precip = data.hourly?.precipitation?.[bestIdx] ?? 0;
    const wind = data.hourly?.wind_speed_10m?.[bestIdx] ?? 0;
    const temp = data.hourly?.temperature_2m?.[bestIdx] ?? 15;
    const { mult, label } = impactFromConditions(precip, wind);
    const result: WeatherImpact = { goalMultiplier: mult, precipitation: precip, windSpeed: wind, temperature: temp, label };
    cache.set(key, { at: Date.now(), data: result });
    return result;
  } catch {
    return fallback;
  }
}
