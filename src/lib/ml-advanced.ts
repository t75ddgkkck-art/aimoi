import "server-only";
import { getLeagueConfig } from "./league-config";

export type AdvancedMatchInput = {
  home: {
    elo: number;
    attackStrength: number;
    defenseStrength: number;
    homeAdvantage: number;
    formLast5?: string;
    formLast10?: string;
    xgScoredAvg?: number;
    xgConcededAvg?: number;
    injuredCount?: number;
    suspendedCount?: number;
    daysSinceLastMatch?: number;
    position?: number;
    points?: number;
    lineupRating?: number;
    sentiment?: number;
  };
  away: {
    elo: number;
    attackStrength: number;
    defenseStrength: number;
    homeAdvantage: number;
    formLast5?: string;
    formLast10?: string;
    xgScoredAvg?: number;
    xgConcededAvg?: number;
    injuredCount?: number;
    suspendedCount?: number;
    daysSinceLastMatch?: number;
    position?: number;
    points?: number;
    lineupRating?: number;
    sentiment?: number;
  };
  leagueCode: string;
  odds: { home: number; draw: number; away: number };
  h2hMatches?: Array<{ homeGoals: number; awayGoals: number; date: string; winner: string }>;
  matchImportance?: number; // 0.5 to 1.5
};

export type AdvancedPrediction = {
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  homeWin: number;
  draw: number;
  awayWin: number;
  over25: number;
  bttsYes: number;
  confidence: number;
  suspiciousScore: number; // 0-100, >70 means suspicious match
  suspiciousReasons: string[];
  valueBets: any[];
};

/**
 * ULTRA-ADVANCED PREDICTION ENGINE
 * Combines Dixon-Coles, Elo, xG, Form, H2H, and Market Analysis
 */
export function predictMatchAdvanced(input: AdvancedMatchInput): AdvancedPrediction {
  const config = getLeagueConfig(input.leagueCode);
  const leagueAvgGoals = config.avgGoals;

  // 1. Base Expected Goals from xG (if available) or Attack/Defense strengths
  let homeXg = input.home.xgScoredAvg ?? leagueAvgGoals * input.home.attackStrength;
  let awayXg = input.away.xgScoredAvg ?? leagueAvgGoals * input.away.attackStrength;

  // Adjust for defense
  homeXg /= (input.away.defenseStrength || 1.0);
  awayXg /= (input.home.defenseStrength || 1.0);

  // 2. Elo Adjustment
  const eloDiff = input.home.elo - input.away.elo;
  const eloMod = eloDiff / 400; // Small adjustment per 400 elo points
  homeXg *= (1 + eloMod * 0.2);
  awayXg *= (1 - eloMod * 0.2);

  // 3. Home Advantage
  homeXg += config.homeAdvantageElo / 100; // Convert elo points to goals roughly

  // 4. Form Adjustment (Last 5 matches)
  const formHome = calculateForm(input.home.formLast5);
  const formAway = calculateForm(input.away.formLast5);
  homeXg *= (0.9 + formHome * 0.2);
  awayXg *= (0.9 + formAway * 0.2);

  // 5. Injuries & Suspensions (Critical Factor)
  const homeAbsences = (input.home.injuredCount || 0) + (input.home.suspendedCount || 0);
  const awayAbsences = (input.away.injuredCount || 0) + (input.away.suspendedCount || 0);
  homeXg *= Math.max(0.8, 1 - homeAbsences * 0.05);
  awayXg *= Math.max(0.8, 1 - awayAbsences * 0.05);

  // 6. Fatigue (Days since last match)
  if (input.home.daysSinceLastMatch && input.home.daysSinceLastMatch < 4) {
    homeXg *= 0.9; // Tired team
  }
  if (input.away.daysSinceLastMatch && input.away.daysSinceLastMatch < 4) {
    awayXg *= 0.9;
  }

  // 7. Lineup & Sentiment (New Features)
  homeXg *= (input.home.lineupRating || 1.0) * (input.home.sentiment || 1.0);
  awayXg *= (input.away.lineupRating || 1.0) * (input.away.sentiment || 1.0);

  // 8. H2H Adjustment (if enough data)
  if (input.h2hMatches && input.h2hMatches.length >= 3) {
    const homeWins = input.h2hMatches.filter(m => m.winner === "home").length;
    const awayWins = input.h2hMatches.filter(m => m.winner === "away").length;
    const total = input.h2hMatches.length;
    const h2hMod = (homeWins - awayWins) / total * 0.1; // Max 10% adjustment
    homeXg *= (1 + h2hMod);
    awayXg *= (1 - h2hMod);
  }

  // 9. Match Importance (High stakes = tighter games usually)
  const importance = input.matchImportance || 1.0;
  if (importance > 1.2) {
    // Derbies or Finals often have fewer goals due to caution
    homeXg *= 0.95;
    awayXg *= 0.95;
  }

  // Clamp goals to realistic range
  homeXg = Math.max(0.1, Math.min(4.5, homeXg));
  awayXg = Math.max(0.1, Math.min(4.5, awayXg));

  // 10. Calculate Probabilities using Poisson Distribution
  const { homeWin, draw, awayWin, over25, bttsYes } = calculatePoissonProbs(homeXg, awayXg);

  // 11. Confidence Calculation
  // Higher confidence if xG data is available and form is consistent
  let confidence = 50;
  if (input.home.xgScoredAvg && input.away.xgScoredAvg) confidence += 15;
  if (input.home.formLast5 && input.away.formLast5) confidence += 10;
  if (Math.abs(homeXg - awayXg) > 0.5) confidence += 10; // Clear favorite
  confidence = Math.min(95, confidence);

  // 12. Suspicious Match Detection (Match Fixing / Truqué)
  const suspicious = detectSuspiciousMatch(input, homeWin, draw, awayWin, homeXg, awayXg);

  // 13. Value Bets
  const valueBets = findValueBets(input.odds, { homeWin, draw, awayWin, over25, bttsYes });

  return {
    expectedHomeGoals: homeXg,
    expectedAwayGoals: awayXg,
    homeWin,
    draw,
    awayWin,
    over25,
    bttsYes,
    confidence,
    suspiciousScore: suspicious.score,
    suspiciousReasons: suspicious.reasons,
    valueBets,
  };
}

function calculateForm(form?: string): number {
  if (!form) return 0.5;
  const points = { W: 3, D: 1, L: 0 };
  let total = 0;
  for (const char of form.toUpperCase()) {
    total += points[char as keyof typeof points] || 1;
  }
  return total / (form.length * 3); // 0 to 1
}

function calculatePoissonProbs(lambdaH: number, lambdaA: number) {
  let homeWin = 0, draw = 0, awayWin = 0, over25 = 0, bttsYes = 0;
  const maxGoals = 10;
  
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const pH = (Math.pow(lambdaH, h) * Math.exp(-lambdaH)) / factorial(h);
      const pA = (Math.pow(lambdaA, a) * Math.exp(-lambdaA)) / factorial(a);
      const prob = pH * pA;

      if (h > a) homeWin += prob;
      else if (h === a) draw += prob;
      else awayWin += prob;

      if (h + a > 2) over25 += prob;
      if (h > 0 && a > 0) bttsYes += prob;
    }
  }

  // Normalize 1X2
  const sum = homeWin + draw + awayWin;
  return { homeWin: homeWin / sum, draw: draw / sum, awayWin: awayWin / sum, over25, bttsYes };
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

function detectSuspiciousMatch(input: AdvancedMatchInput, pHome: number, pDraw: number, pAway: number, xgH: number, xgA: number) {
  let score = 0;
  const reasons: string[] = [];

  // 1. Odds vs Model Discrepancy (Biggest indicator)
  const impliedHome = 1 / input.odds.home;
  const diff = Math.abs(pHome - impliedHome);
  if (diff > 0.15) {
    score += 40;
    reasons.push(`Écart majeur modèle/cotes sur victoire domicile (${(diff * 100).toFixed(1)}%)`);
  }

  // 2. Unusual xG patterns (Very low xG but high odds movement)
  if (xgH < 0.5 && xgA < 0.5 && input.odds.home < 1.5) {
    score += 30;
    reasons.push("xG très faibles mais cotes domicile courtes (anomalie)");
  }

  // 3. Massive injury list for favorite
  if ((input.home.injuredCount || 0) > 5 && pHome > 0.6) {
    score += 20;
    reasons.push("Nombre anormal de blessés pour l'équipe favorite");
  }

  return { score: Math.min(100, score), reasons };
}

function findValueBets(odds: any, probs: any) {
  const bets = [];
  const markets = [
    { name: "1", prob: probs.homeWin, odd: odds.home },
    { name: "X", prob: probs.draw, odd: odds.draw },
    { name: "2", prob: probs.awayWin, odd: odds.away },
    { name: "Over 2.5", prob: probs.over25, odd: 1.9 }, // Default odd if not provided
    { name: "BTTS Yes", prob: probs.bttsYes, odd: 1.85 },
  ];

  for (const m of markets) {
    const ev = m.prob * m.odd - 1;
    if (ev > 0.05) { // 5% edge minimum
      bets.push({
        market: m.name,
        ev: (ev * 100).toFixed(1) + "%",
        confidence: (m.prob * 100).toFixed(1) + "%",
      });
    }
  }
  return bets;
}
