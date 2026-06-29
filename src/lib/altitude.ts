// Altitude advantage: home teams playing at high altitude have a significant
// edge (visiting players tire faster, ball behaves differently). This is a
// well-documented effect in South American football (La Paz, Quito, Bogotá).

// Altitude (meters) keyed by normalized team/city name fragments.
const HIGH_ALTITUDE_VENUES: Array<{ match: string; meters: number; city: string }> = [
  { match: "bolivar", meters: 3640, city: "La Paz" },
  { match: "the strongest", meters: 3640, city: "La Paz" },
  { match: "always ready", meters: 3640, city: "El Alto" },
  { match: "nacional potosi", meters: 3960, city: "Potosí" },
  { match: "real potosi", meters: 3960, city: "Potosí" },
  { match: "wilstermann", meters: 2558, city: "Cochabamba" },
  { match: "ldu quito", meters: 2850, city: "Quito" },
  { match: "liga de quito", meters: 2850, city: "Quito" },
  { match: "aucas", meters: 2850, city: "Quito" },
  { match: "el nacional", meters: 2850, city: "Quito" },
  { match: "independiente del valle", meters: 2500, city: "Sangolquí" },
  { match: "millonarios", meters: 2640, city: "Bogotá" },
  { match: "santa fe", meters: 2640, city: "Bogotá" },
  { match: "america de cali", meters: 1000, city: "Cali" },
  { match: "atletico nacional", meters: 1495, city: "Medellín" },
  { match: "pachuca", meters: 2400, city: "Pachuca" },
  { match: "toluca", meters: 2660, city: "Toluca" },
  { match: "club america", meters: 2240, city: "Mexico City" },
  { match: "cruz azul", meters: 2240, city: "Mexico City" },
  { match: "pumas", meters: 2240, city: "Mexico City" },
  { match: "necaxa", meters: 1880, city: "Aguascalientes" },
  { match: "leon", meters: 1815, city: "León" },
];

// Country-level fallback altitude for World Cup / national teams.
const COUNTRY_ALTITUDE: Record<string, number> = {
  Bolivia: 3640,
  Ecuador: 2850,
  Colombia: 2640,
  Mexico: 2240,
  Peru: 150, // Lima is coastal
};

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function venueAltitude(homeTeamName: string, homeCountry?: string): number {
  const n = normalize(homeTeamName);
  for (const v of HIGH_ALTITUDE_VENUES) {
    if (n.includes(v.match)) return v.meters;
  }
  if (homeCountry && COUNTRY_ALTITUDE[homeCountry]) return COUNTRY_ALTITUDE[homeCountry];
  return 0;
}

/**
 * Returns a home goal multiplier and away penalty based on the altitude gap.
 * Above ~2000m the effect kicks in; above ~3000m it's strong.
 * Only applies when the AWAY team comes from a much lower altitude.
 */
export function altitudeImpact(
  homeTeamName: string,
  homeCountry: string | undefined,
  awayTeamName: string,
  awayCountry: string | undefined
): { homeBoost: number; awayPenalty: number; meters: number } {
  const homeAlt = venueAltitude(homeTeamName, homeCountry);
  if (homeAlt < 1800) return { homeBoost: 1.0, awayPenalty: 1.0, meters: homeAlt };

  const awayAlt = venueAltitude(awayTeamName, awayCountry);
  const gap = homeAlt - awayAlt;
  if (gap < 1000) return { homeBoost: 1.0, awayPenalty: 1.0, meters: homeAlt }; // away team also altitude-adapted

  // Scale: 2000m -> small, 3640m -> strong
  const intensity = Math.min(1, (homeAlt - 1800) / 1840); // 0..1
  return {
    homeBoost: 1 + 0.10 * intensity, // up to +10% home attack
    awayPenalty: 1 - 0.12 * intensity, // up to -12% away attack
    meters: homeAlt,
  };
}
