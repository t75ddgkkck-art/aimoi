// World Football Elo ratings for national teams (approx, based on eloratings.net / FIFA 2026 cycle).
// Used to give the prediction engine realistic strengths for World Cup matches
// instead of a flat 1500 default that produces coin-flip 1-1 predictions.

export const NATIONAL_ELO: Record<string, number> = {
  "Argentina": 2150,
  "France": 2100,
  "Spain": 2095,
  "England": 2050,
  "Brazil": 2040,
  "Portugal": 2010,
  "Netherlands": 2000,
  "Belgium": 1970,
  "Italy": 1960,
  "Germany": 1955,
  "Croatia": 1930,
  "Uruguay": 1920,
  "Colombia": 1900,
  "Morocco": 1890,
  "Switzerland": 1880,
  "USA": 1870,
  "Mexico": 1860,
  "Japan": 1860,
  "Senegal": 1850,
  "Denmark": 1845,
  "South Korea": 1820,
  "Ecuador": 1810,
  "Austria": 1810,
  "Australia": 1800,
  "Iran": 1795,
  "Ukraine": 1790,
  "Serbia": 1785,
  "Poland": 1780,
  "Sweden": 1775,
  "Wales": 1770,
  "Nigeria": 1765,
  "Egypt": 1760,
  "Peru": 1755,
  "Turkey": 1755,
  "Chile": 1750,
  "Canada": 1745,
  "Ivory Coast": 1740,
  "Cameroon": 1735,
  "Czech Republic": 1730,
  "Norway": 1730,
  "Scotland": 1720,
  "Ghana": 1715,
  "Tunisia": 1710,
  "Algeria": 1705,
  "Qatar": 1680,
  "Saudi Arabia": 1670,
  "Costa Rica": 1660,
  "South Africa": 1650,
  "Paraguay": 1645,
  "Greece": 1640,
  "Panama": 1620,
  "Jamaica": 1600,
  "New Zealand": 1560,
};

const DEFAULT_NATIONAL_ELO = 1650;

export function getNationalElo(teamName: string): number {
  // Try exact match, then case-insensitive
  if (NATIONAL_ELO[teamName] != null) return NATIONAL_ELO[teamName];
  const lower = teamName.toLowerCase();
  for (const [name, elo] of Object.entries(NATIONAL_ELO)) {
    if (name.toLowerCase() === lower) return elo;
  }
  return DEFAULT_NATIONAL_ELO;
}

// Derive attack/defense multipliers from Elo relative to the field average (~1800)
export function nationalStrengths(elo: number): { attack: number; defense: number } {
  const ref = 1800;
  const diff = (elo - ref) / 400; // ~ +/-0.9 range
  return {
    attack: Math.max(0.7, Math.min(1.4, 1 + diff * 0.35)),
    defense: Math.max(0.7, Math.min(1.4, 1 - diff * 0.30)), // lower = stronger defense
  };
}
