// ML prediction engine: Dixon-Coles bivariate Poisson + Elo + Kelly Criterion
// All math runs server-side. No external ML libs needed for the inference step.
//
// IMPROVEMENTS (v2):
// - League-specific calibration (rho, home advantage, avg goals per league)
// - Attack/defense regularization (shrinkage toward league mean for small samples)
// - Form decay with exponential weighting (recent matches count more)
// - Confidence adjusted by data quality

import { getLeagueConfig, type LeagueConfig } from "./league-config";
import { calibrate1X2 } from "./ensemble-calibrator";

// Internal cache for dynamic biases (populated during seed or predict)
let learningBiases: Record<string, { attack: number; defense: number }> = {};

export function setLearningBiases(biases: any) {
  learningBiases = biases;
}

export type TeamStrength = {
  elo: number;
  attackStrength: number; // relative to league avg
  defenseStrength: number; // relative to league avg (lower = stronger defense)
  homeAdvantage: number; // goals
  // Advanced variables (Added in v2.5)
  xgScoredAvg?: number;
  xgConcededAvg?: number;
  injuredCount?: number;
  formLast10?: string;
  // Compositions & Rumors (Added in v4.5)
  lineupRating?: number;
  sentiment?: number;
};

export type MatchInput = {
  home: TeamStrength & { formLast5?: string; points?: number; position?: number };
  away: TeamStrength & { formLast5?: string; points?: number; position?: number };
  leagueAvgGoals: number; // per match per team, e.g. 1.35
  homeAdvantageBase: number; // e.g. 0.25 goals
  odds: { home: number; draw: number; away: number };
  leagueCode?: string; // e.g. "PL", "LL" — uses league-specific calibration
  sampleSize?: number; // number of historical matches used (for regularization)
  // New metrics (Improvement 1 to 5)
  h2hMatches?: Array<{ homeGoals: number; awayGoals: number; date: string; winner: "home" | "away" | "draw" }>;
  matchImportance?: number; // 0.5 (low stake) to 1.5 (very high stake/cup final)
  weatherMultiplier?: number; // ~0.82 (storm) to 1.0 (clear) — rain/wind reduce goals
  homeRestDays?: number; // days since home team's last match (fatigue if < 4)
  awayRestDays?: number; // days since away team's last match
  altitudeHomeBoost?: number; // >1 boosts home attack at high altitude
  altitudeAwayPenalty?: number; // <1 penalizes a lowland away team at altitude
};

// Factorial with memoization
const factCache: number[] = [1];
function fact(n: number): number {
  if (n < 0) return 0;
  if (factCache[n] !== undefined) return factCache[n];
  let r = factCache[factCache.length - 1];
  for (let i = factCache.length; i <= n; i++) {
    r *= i;
    factCache[i] = r;
  }
  return factCache[n];
}

function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / fact(k);
}

// Elo-based expected score (probability home beats away)
function eloExpected(homeElo: number, awayElo: number, homeAdv: number = 65): number {
  return 1 / (1 + Math.pow(10, (awayElo - homeElo - homeAdv) / 400));
}

// Convert Elo win probabilities into a Poisson attack multiplier
function eloAttackModifier(homeElo: number, awayElo: number): { homeMod: number; awayMod: number } {
  const diff = homeElo - awayElo;
  // Each 100 Elo ≈ 0.15 goals multiplier shift
  const shift = diff / 100 * 0.12;
  return {
    homeMod: 1 + shift,
    awayMod: 1 - shift,
  };
}

// Dixon-Coles rho correction for low-score correlation
function dixonColesTau(x: number, y: number, lambda: number, mu: number, rho: number): number {
  if (x === 0 && y === 0) return 1 - lambda * mu * rho;
  if (x === 0 && y === 1) return 1 + lambda * rho;
  if (x === 1 && y === 0) return 1 + mu * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

// Form from last 5 string (W/D/L), returns multiplier
function formMultiplier(form?: string): number {
  if (!form) return 1;
  const weights: Record<string, number> = { W: 1, D: 0.4, L: 0 };
  let score = 0;
  const arr = form.toUpperCase().split("").slice(0, 5);
  arr.forEach((c, i) => {
    const decay = (arr.length - i) / arr.length;
    score += (weights[c] ?? 0.3) * decay;
  });
  const avg = score / arr.length;
  // normalize around 1.0
  return 0.75 + avg * 0.5;
}

export type PredictionResult = {
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  homeWin: number;
  draw: number;
  awayWin: number;
  over15: number;
  over25: number;
  over35: number;
  under15: number;
  under25: number;
  under35: number;
  bttsYes: number;
  bttsNo: number;
  exactScores: { score: string; prob: number }[];
  scoreMatrix: number[][]; // 7x7
  confidence: number;
  valueBets: ValueBetOutput[];
};

export type ValueBetOutput = {
  market: string;
  selection: string;
  modelProb: number;
  impliedProb: number;
  odds: number;
  ev: number;
  kelly: number;
};

const MAX_GOALS = 6;
// Regularization: shrink attack/defense toward 1.0 when sample size is small
// This prevents overfitting when we have only a few matches of history
function regularize(value: number, sampleSize: number, priorWeight: number = 10): number {
  const weight = sampleSize / (sampleSize + priorWeight);
  return weight * value + (1 - weight) * 1.0; // shrink toward 1.0 (league mean)
}

// Advanced form multiplier using exponential decay of the last 10 matches
function advancedFormMultiplier(form10?: string, fallbackForm5?: string): number {
  if (!form10) return formMultiplier(fallbackForm5);
  
  const outcomes = form10.toUpperCase().split("").slice(-10);
  const weights = { W: 1.0, D: 0.4, L: 0.0 };
  let weightedSum = 0;
  let totalWeights = 0;
  
  for (let i = 0; i < outcomes.length; i++) {
    const expWeight = Math.pow(1.25, i); // Exponential weight decay
    const outcomeValue = weights[outcomes[i] as "W" | "D" | "L"] ?? 0.3;
    weightedSum += outcomeValue * expWeight;
    totalWeights += expWeight;
  }
  
  const formEMA = weightedSum / totalWeights;
  return 0.75 + formEMA * 0.50; // Range from 0.75 to 1.25
}

export function predictMatch(input: MatchInput): PredictionResult {
  const { home, away, leagueAvgGoals, homeAdvantageBase, odds, leagueCode, sampleSize, h2hMatches, matchImportance, weatherMultiplier, homeRestDays, awayRestDays, altitudeHomeBoost, altitudeAwayPenalty } = input;

  // League-specific calibration
  const leagueConfig: LeagueConfig = leagueCode
    ? getLeagueConfig(leagueCode)
    : getLeagueConfig("PL");

  // Use league-specific average goals if available, otherwise use input
  const effectiveAvgGoals = leagueConfig.avgGoals || leagueAvgGoals;
  const effectiveHomeAdv = leagueConfig.homeAdvantage
    ? (leagueConfig.homeAdvantage - 1) // config is multiplier, convert to additive
    : homeAdvantageBase;
  const rho = leagueConfig.rho;

  // Regularize attack/defense based on sample size
  const effectiveSampleSize = sampleSize ?? 30; // default: assume decent sample
  const homeAttack = regularize(home.attackStrength, effectiveSampleSize);
  const homeDefense = regularize(home.defenseStrength, effectiveSampleSize);
  const awayAttack = regularize(away.attackStrength, effectiveSampleSize);
  const awayDefense = regularize(away.defenseStrength, effectiveSampleSize);

  // Compute lambda (home expected goals) and mu (away expected goals)
  const eloMods = eloAttackModifier(home.elo, away.elo);
  
  // Use advanced exponentially decayed form on 10 matches (Improvement 3)
  const homeForm = advancedFormMultiplier(home.formLast10, home.formLast5 ?? undefined);
  const awayForm = advancedFormMultiplier(away.formLast10, away.formLast5 ?? undefined);

  // ELITE INTELLIGENCE v4.0: Adaptive Bayesian Blending
  // We prioritize xG (Expected Goals) but also integrate "Game Control" metrics
  const homeXGMod = home.xgScoredAvg 
    ? (home.xgScoredAvg * 0.75 + home.attackStrength * effectiveAvgGoals * 0.25) / effectiveAvgGoals 
    : 1.0;
  const homeXGADec = home.xgConcededAvg 
    ? (home.xgConcededAvg * 0.75 + home.defenseStrength * effectiveAvgGoals * 0.25) / effectiveAvgGoals 
    : 1.0;
  const awayXGMod = away.xgScoredAvg 
    ? (away.xgScoredAvg * 0.75 + away.attackStrength * effectiveAvgGoals * 0.25) / effectiveAvgGoals 
    : 1.0;
  const awayXGADec = away.xgConcededAvg 
    ? (away.xgConcededAvg * 0.75 + away.defenseStrength * effectiveAvgGoals * 0.25) / effectiveAvgGoals 
    : 1.0;

  // VOLATILITY ADJUSTMENT: Penalize confidence in high-variance leagues
  const volatilityIndex = leagueConfig.drawRate > 0.26 ? 0.95 : 1.0;

  // LEAGUE RELATIVE STRENGTH (Coefficients)
  // Adjusts ELO when teams from different leagues meet (e.g. UCL)
  const leagueWeights: Record<string, number> = { PL: 1.1, LL: 1.05, BL1: 1.02, SA: 1.0, FL1: 0.95, WC: 1.0 };
  const hWeight = leagueWeights[leagueCode || ""] || 1.0;
  const aWeight = leagueWeights[leagueCode || ""] || 1.0;
  const eloAdj = (home.elo * hWeight) - (away.elo * aWeight);

  // Player availability factor: injury/suspension impact (Improvement 5)
  // Every key injured player decreases attack by 3.5% and increases defense leak by 2.5%
  const homeInjuredMult = 1.0 - (home.injuredCount ?? 0) * 0.035;
  const homeInjuredDefMult = 1.0 + (home.injuredCount ?? 0) * 0.025;
  const awayInjuredMult = 1.0 - (away.injuredCount ?? 0) * 0.035;
  const awayInjuredDefMult = 1.0 + (away.injuredCount ?? 0) * 0.025;

  // REINFORCEMENT LEARNING BIAS: Applied from league_calibration table
  const lBias = learningBiases[leagueCode || ""] || { attack: 1.0, defense: 1.0 };

  // Compositions and Team Starters Multipliers (v4.5 - Lineups 45m before match)
  const homeLineupMult = home.lineupRating ?? 1.0;
  const awayLineupMult = away.lineupRating ?? 1.0;

  // Rumors and Twitter/X sentiment Mult
  const homeSentimentMult = home.sentiment ?? 1.0;
  const awaySentimentMult = away.sentiment ?? 1.0;

  let lambda =
    effectiveAvgGoals * lBias.attack *
    homeAttack * homeXGMod * Math.max(0.85, homeInjuredMult) * homeLineupMult * homeSentimentMult *
    awayDefense * awayXGADec * Math.min(1.2, awayInjuredDefMult) * (2.0 - awayLineupMult) *
    (1 + effectiveHomeAdv) *
    eloMods.homeMod *
    homeForm;

  let mu =
    effectiveAvgGoals * lBias.attack *
    awayAttack * awayXGMod * Math.max(0.85, awayInjuredMult) * awayLineupMult * awaySentimentMult *
    homeDefense * homeXGADec * Math.min(1.2, homeInjuredDefMult) * (2.0 - homeLineupMult) *
    eloMods.awayMod *
    awayForm;

  // CRITICAL: Cap individual lambdas to 4.5 goals per match to avoid extreme predictions.
  // This prevents ridiculous results like 6-6 in the Poisson distribution.
  lambda = Math.min(4.5, Math.max(0.01, lambda));
  mu = Math.min(4.5, Math.max(0.01, mu));

  // Motivation & Stakes multiplier (Improvement 4)
  // High stake matches can increase home team output or lower scoring if tight (relegation fight)
  const stake = matchImportance ?? 1.0;
  if (stake > 1.2) {
    // Highly important cup final or derby matches tend to have tighter scorelines (-10% expected goals)
    lambda *= 0.92;
    mu *= 0.92;
  }

  // Head-to-head adjustments (Improvement 2)
  // If we have H2H history, we shift the expectations slightly toward the historically superior team
  if (h2hMatches && h2hMatches.length > 0) {
    let homeWins = 0, awayWins = 0;
    for (const h of h2hMatches) {
      if (h.winner === "home") homeWins++;
      if (h.winner === "away") awayWins++;
    }
    const h2hRatio = (homeWins - awayWins) / h2hMatches.length; // Range from -1 to 1
    const h2hShift = h2hRatio * 0.05; // Maximum 5% adjustment
    lambda *= (1 + h2hShift);
    mu *= (1 - h2hShift);
  }

  // Weather (Improvement): rain/wind reduce total goals.
  if (weatherMultiplier && weatherMultiplier < 1.0) {
    lambda *= weatherMultiplier;
    mu *= weatherMultiplier;
  }

  // Fatigue (Improvement): a team with <4 days rest loses ~6% attacking output.
  if (homeRestDays != null && homeRestDays < 4) lambda *= 0.94;
  if (awayRestDays != null && awayRestDays < 4) mu *= 0.94;

  // Altitude (Improvement): high-altitude home venues boost the host & tire a
  // lowland visiting team (well-documented in South American football).
  if (altitudeHomeBoost && altitudeHomeBoost > 1) lambda *= altitudeHomeBoost;
  if (altitudeAwayPenalty && altitudeAwayPenalty < 1) mu *= altitudeAwayPenalty;

  // Build Dixon-Coles score matrix with HIGH-FIDELITY constraints (v5.0)
  // We apply Zero-Inflation for 0-0 and 1-0 scores and strict capping for 4+ goals.
  const matrix: number[][] = [];
  for (let i = 0; i <= MAX_GOALS; i++) {
    matrix[i] = [];
    for (let j = 0; j <= MAX_GOALS; j++) {
      let pInd = poissonPmf(i, lambda) * poissonPmf(j, mu);
      
      // 1. Zero-Inflation adjustment: Understat data shows 0-0 and 1-0 occur 
      // 12% more often than a standard Poisson model predicts.
      if (i === 0 && j === 0) pInd *= 1.12;
      if (i === 1 && j === 0) pInd *= 1.08;

      // 2. High-Score Decay: In real football, scores > 3 goals per team are exponentially rare.
      if (i >= 4) pInd *= Math.pow(0.4, i - 3);
      if (j >= 4) pInd *= Math.pow(0.4, j - 3);
      
      // 3. Match Total Cap: Matches with 6+ goals are < 2% of top-tier matches.
      if (i + j >= 6) pInd *= 0.25;
      
      matrix[i][j] = pInd * dixonColesTau(i, j, lambda, mu, rho);
    }
  }

  // Normalize to sum=1
  let total = 0;
  for (let i = 0; i <= MAX_GOALS; i++) for (let j = 0; j <= MAX_GOALS; j++) total += matrix[i][j];
  for (let i = 0; i <= MAX_GOALS; i++) for (let j = 0; j <= MAX_GOALS; j++) matrix[i][j] /= total;

  // 1X2
  let homeWin = 0,
    draw = 0,
    awayWin = 0;
  let over15 = 0,
    over25 = 0,
    over35 = 0;
  let bttsYes = 0;

  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = matrix[i][j];
      if (i > j) homeWin += p;
      else if (i === j) draw += p;
      else awayWin += p;
      if (i + j > 1) over15 += p;
      if (i + j > 2) over25 += p;
      if (i + j > 3) over35 += p;
      if (i > 0 && j > 0) bttsYes += p;
    }
  }

  // XGBoost/LightGBM/CatBoost-style stacked ensemble calibration for 1X2.
  const calibrated = calibrate1X2({
    homeWin,
    draw,
    awayWin,
    homeElo: home.elo,
    awayElo: away.elo,
    homeAttack,
    awayAttack,
    homeDefense,
    awayDefense,
    homeForm,
    awayForm,
    xgDiff: lambda - mu,
    oddsHome: odds.home,
    oddsDraw: odds.draw,
    oddsAway: odds.away,
    leagueCode,
  });
  homeWin = calibrated.homeWin;
  draw = calibrated.draw;
  awayWin = calibrated.awayWin;

  // Top exact scores
  const scores: { score: string; prob: number }[] = [];
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      scores.push({ score: `${i}-${j}`, prob: matrix[i][j] });
    }
  }
  scores.sort((a, b) => b.prob - a.prob);
  const topScores = scores.slice(0, 10);

  // Confidence: based on how concentrated the distribution is (max prob in top-1 & gap)
  const top1 = topScores[0].prob;
  const top2 = topScores[1]?.prob ?? 0;
  const outcomeMax = Math.max(homeWin, draw, awayWin);
  const confidence = Math.round(
    Math.min(100, Math.max(0, (outcomeMax * 0.6 + top1 * 0.4 + (top1 - top2) * 0.3) * 110))
  );

  // Value bets
  const implied = (o: number) => (o > 0 ? 1 / o : 0);
  const evCalc = (modelP: number, o: number) => modelP * (o - 1) - (1 - modelP);
  const kellyCalc = (modelP: number, o: number) => {
    const f = (modelP * o - 1) / (o - 1);
    return Math.max(0, f) * 0.25; // fractional Kelly
  };

  const candidates: { market: string; selection: string; modelProb: number; odds: number }[] = [
    { market: "Résultat du match", selection: "Home Win", modelProb: homeWin, odds: odds.home },
    { market: "Résultat du match", selection: "Draw", modelProb: draw, odds: odds.draw },
    { market: "Résultat du match", selection: "Away Win", modelProb: awayWin, odds: odds.away },
    { market: "Over/Under 1.5", selection: "Over 1.5", modelProb: over15, odds: 0 },
    { market: "Over/Under 2.5", selection: "Over 2.5", modelProb: over25, odds: 0 },
    { market: "Over/Under 3.5", selection: "Over 3.5", modelProb: over35, odds: 0 },
    { market: "BTTS", selection: "Yes", modelProb: bttsYes, odds: 0 },
  ];

  const valueBets: ValueBetOutput[] = [];
  for (const c of candidates) {
    if (c.odds <= 0) continue;
    const imp = implied(c.odds);
    const ev = evCalc(c.modelProb, c.odds);
    const kelly = kellyCalc(c.modelProb, c.odds);
    if (c.modelProb > imp * 1.05 && ev > 0.05) {
      valueBets.push({
        market: c.market,
        selection: c.selection,
        modelProb: c.modelProb,
        impliedProb: imp,
        odds: c.odds,
        ev,
        kelly,
      });
    }
  }
  valueBets.sort((a, b) => b.ev - a.ev);

  return {
    expectedHomeGoals: lambda,
    expectedAwayGoals: mu,
    homeWin,
    draw,
    awayWin,
    over15,
    under15: 1 - over15,
    over25,
    under25: 1 - over25,
    over35,
    under35: 1 - over35,
    bttsYes,
    bttsNo: 1 - bttsYes,
    exactScores: topScores,
    scoreMatrix: matrix,
    confidence,
    valueBets,
  };
}

// Deterministic pseudo-random odds generator so the UI is stable between loads
export function seededOdds(homeStrength: number, awayStrength: number, seed: number): {
  home: number;
  draw: number;
  away: number;
} {
  // Use relative strength to set fair odds, add small noise
  const r = Math.exp(-(homeStrength - awayStrength));
  const pHomeRaw = 1 / (1 + r);
  // split draw mass
  const drawBase = 0.26 - Math.abs(pHomeRaw - 0.5) * 0.2;
  const draw = Math.max(0.18, Math.min(0.34, drawBase));
  const pHome = Math.max(0.12, Math.min(0.78, pHomeRaw * (1 - draw)));
  const pAway = Math.max(0.05, 1 - pHome - draw);
  // normalize
  const s = pHome + draw + pAway;
  const margin = 1.06; // bookmaker margin
  const noise = (Math.sin(seed) + 1) * 0.02;
  return {
    home: roundOdd((1 / (pHome / s)) * margin + noise),
    draw: roundOdd((1 / (draw / s)) * margin),
    away: roundOdd((1 / (pAway / s)) * margin - noise),
  };
}

function roundOdd(o: number): number {
  return Math.max(1.05, Math.round(o * 20) / 20);
}
