// Elo rating calculation from historical results
// K = 20 standard, K = 40 for new teams (first 30 matches)

const K_STANDARD = 20;
const K_NEW = 40;
const INITIAL_ELO = 1500;
const HOME_ADVANTAGE = 65; // Elo points equivalent to home advantage

export interface EloUpdate {
  homeBefore: number;
  awayBefore: number;
  homeAfter: number;
  awayAfter: number;
  actualHome: number; // 1=win, 0.5=draw, 0=loss
}

export function expectedScore(eloA: number, eloB: number, homeAdv = 0): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA - homeAdv) / 400));
}

export function updateElo(
  homeElo: number,
  awayElo: number,
  homeGoals: number,
  awayGoals: number,
  isHomeNew = false,
  isAwayNew = false
): EloUpdate {
  const Kh = isHomeNew ? K_NEW : K_STANDARD;
  const Ka = isAwayNew ? K_NEW : K_STANDARD;

  const expectedHome = expectedScore(homeElo, awayElo, HOME_ADVANTAGE);
  const actualHome =
    homeGoals > awayGoals ? 1 : homeGoals === awayGoals ? 0.5 : 0;
  const actualAway = 1 - actualHome;

  // Goal difference multiplier (FIFA-inspired)
  const diff = Math.abs(homeGoals - awayGoals);
  const goalMult = diff <= 1 ? 1 : diff === 2 ? 1.5 : (11 + diff) / 8;

  const homeAfter = homeElo + Kh * goalMult * (actualHome - expectedHome);
  const awayAfter = awayElo + Ka * goalMult * (actualAway - (1 - expectedHome));

  return {
    homeBefore: homeElo,
    awayBefore: awayElo,
    homeAfter: Math.round(homeAfter * 10) / 10,
    awayAfter: Math.round(awayAfter * 10) / 10,
    actualHome,
  };
}

export interface HistoricalResult {
  homeTeamId: string; // external id (TheSportsDB id)
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
  date: Date;
}

// Compute Elos for all teams from a chronological list of results
export function computeElosFromResults(
  results: HistoricalResult[],
  initialElo: number = INITIAL_ELO
): Map<string, number> {
  const elos = new Map<string, number>();
  const matchCounts = new Map<string, number>();

  // Sort chronologically ascending
  const sorted = [...results].sort((a, b) => a.date.getTime() - b.date.getTime());

  for (const r of sorted) {
    const hElo = elos.get(r.homeTeamId) ?? initialElo;
    const aElo = elos.get(r.awayTeamId) ?? initialElo;
    const hCount = matchCounts.get(r.homeTeamId) ?? 0;
    const aCount = matchCounts.get(r.awayTeamId) ?? 0;

    const update = updateElo(hElo, aElo, r.homeGoals, r.awayGoals, hCount < 30, aCount < 30);
    elos.set(r.homeTeamId, update.homeAfter);
    elos.set(r.awayTeamId, update.awayAfter);
    matchCounts.set(r.homeTeamId, hCount + 1);
    matchCounts.set(r.awayTeamId, aCount + 1);
  }

  return elos;
}

// Compute attack/defense strength from recent results
// Strength = (team's avg goals scored) / (league avg goals scored per match)
export interface TeamStrengthStats {
  attack: number; // >1 = stronger than league avg
  defense: number; // <1 = stronger defense
  formLast5: string; // "WWLDW"
  formLast10: string; // "WWLDWWDLLW"
  goalsScoredAvg: number;
  goalsConcededAvg: number;
  formWeight: number; // Exponentially decayed form multiplier
}

// Compute exponentially decayed form weight (more recent matches have higher influence)
// Decay factor alpha = 0.2 (typical for EMA of recent results)
export function computeExponentialFormWeight(outcomes: string[]): number {
  if (outcomes.length === 0) return 1.0;
  const recentOutcomes = outcomes.slice(-10); // Use last 10 matches
  
  const weights = { W: 1.0, D: 0.4, L: 0.0 };
  let weightedSum = 0;
  let totalWeights = 0;
  
  // EMA style: recent matches have much higher weights
  for (let i = 0; i < recentOutcomes.length; i++) {
    const exponentialWeight = Math.pow(1.3, i); // base 1.3 exponential growth
    const resultValue = weights[recentOutcomes[i] as "W" | "D" | "L"] ?? 0.3;
    weightedSum += resultValue * exponentialWeight;
    totalWeights += exponentialWeight;
  }
  
  const formEMA = weightedSum / totalWeights;
  // Center around 1.0 (range from 0.70 to 1.30)
  return 0.70 + formEMA * 0.60;
}

export function computeTeamStrengths(
  results: HistoricalResult[],
  leagueAvgGoals: number
): Map<string, TeamStrengthStats> {
  const stats = new Map<
    string,
    { scored: number[]; conceded: number[]; outcomes: string[] }
  >();

  const ensure = (id: string) => {
    if (!stats.has(id)) stats.set(id, { scored: [], conceded: [], outcomes: [] });
  };

  for (const r of results) {
    ensure(r.homeTeamId);
    ensure(r.awayTeamId);
    const home = stats.get(r.homeTeamId)!;
    const away = stats.get(r.awayTeamId)!;
    home.scored.push(r.homeGoals);
    home.conceded.push(r.awayGoals);
    home.outcomes.push(r.homeGoals > r.awayGoals ? "W" : r.homeGoals === r.awayGoals ? "D" : "L");
    away.scored.push(r.awayGoals);
    away.conceded.push(r.homeGoals);
    away.outcomes.push(r.awayGoals > r.homeGoals ? "W" : r.awayGoals === r.homeGoals ? "D" : "L");
  }

  const out = new Map<string, TeamStrengthStats>();
  for (const [id, s] of stats) {
    const recent = 10;
    const scored = s.scored.slice(-recent);
    const conceded = s.conceded.slice(-recent);
    const scoredAvg = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : leagueAvgGoals;
    const concededAvg = conceded.length ? conceded.reduce((a, b) => a + b, 0) / conceded.length : leagueAvgGoals;
    const form5 = s.outcomes.slice(-5).join("");
    const form10 = s.outcomes.slice(-10).join("");
    const formWeight = computeExponentialFormWeight(s.outcomes);

    out.set(id, {
      attack: Math.max(0.3, scoredAvg / Math.max(0.1, leagueAvgGoals)),
      defense: Math.max(0.3, concededAvg / Math.max(0.1, leagueAvgGoals)),
      formLast5: form5,
      formLast10: form10,
      goalsScoredAvg: scoredAvg,
      goalsConcededAvg: concededAvg,
      formWeight,
    });
  }
  return out;
}
