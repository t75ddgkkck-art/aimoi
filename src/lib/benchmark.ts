import { db } from "@/db";
import { matches, predictions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export interface ModelScore {
  name: string;
  accuracy: number;
  brierScore: number;
  logLoss: number;
  evaluated: number;
}

export interface BenchmarkReport {
  ourModel: ModelScore;
  bookmaker: ModelScore;
  naive: ModelScore;
  verdict: string;
}

// In-memory cache so the Stats page loads instantly (benchmark scans many rows).
let benchCache: { at: number; data: BenchmarkReport } | null = null;
const BENCH_TTL_MS = 5 * 60 * 1000; // 5 min

export async function runBenchmark(force = false): Promise<BenchmarkReport> {
  if (!force && benchCache && Date.now() - benchCache.at < BENCH_TTL_MS) {
    return benchCache.data;
  }
  const data = await computeBenchmark();
  benchCache = { at: Date.now(), data };
  return data;
}

/**
 * Full comparative benchmark: our AI vs bookmaker market consensus vs naive baseline.
 * Aggregates outcome counts directly in SQL for speed, only pulling probabilities
 * for matches that actually have predictions.
 */
async function computeBenchmark(): Promise<BenchmarkReport> {
  const rows = await db
    .select({
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      homeOdds: matches.homeOdds,
      drawOdds: matches.drawOdds,
      awayOdds: matches.awayOdds,
      markets: predictions.markets,
    })
    .from(matches)
    .innerJoin(predictions, eq(matches.id, predictions.matchId))
    .where(eq(matches.status, "finished"))
    .limit(8000);

  const clip = (p: number) => Math.min(0.9999, Math.max(0.0001, p));

  let ourBrier = 0, ourLog = 0, ourCorrect = 0, ourN = 0;
  let bmBrier = 0, bmLog = 0, bmCorrect = 0, bmN = 0;
  let nvBrier = 0, nvLog = 0, nvCorrect = 0, nvN = 0;

  for (const r of rows) {
    if (r.homeScore == null || r.awayScore == null || !r.markets) continue;

    const yH = r.homeScore > r.awayScore ? 1 : 0;
    const yD = r.homeScore === r.awayScore ? 1 : 0;
    const yA = r.homeScore < r.awayScore ? 1 : 0;
    const outcome = yH ? "h" : yD ? "d" : "a";

    // Our model
    const pH = r.markets.homeWin, pD = r.markets.draw, pA = r.markets.awayWin;
    ourBrier += (pH - yH) ** 2 + (pD - yD) ** 2 + (pA - yA) ** 2;
    ourLog += -(yH * Math.log(clip(pH)) + yD * Math.log(clip(pD)) + yA * Math.log(clip(pA)));
    const ourPick = pH >= pD && pH >= pA ? "h" : pD >= pA ? "d" : "a";
    if (ourPick === outcome) ourCorrect++;
    ourN++;

    // Naive (equal 1/3)
    const t = 1 / 3;
    nvBrier += (t - yH) ** 2 + (t - yD) ** 2 + (t - yA) ** 2;
    nvLog += -(yH * Math.log(t) + yD * Math.log(t) + yA * Math.log(t));
    if (outcome === "d") nvCorrect++; // naive always picks draw
    nvN++;

    // Bookmaker consensus (de-margined implied probabilities)
    if (r.homeOdds && r.drawOdds && r.awayOdds && r.homeOdds > 1 && r.drawOdds > 1 && r.awayOdds > 1) {
      const rawH = 1 / r.homeOdds, rawD = 1 / r.drawOdds, rawA = 1 / r.awayOdds;
      const sum = rawH + rawD + rawA;
      const bH = rawH / sum, bD = rawD / sum, bA = rawA / sum;
      bmBrier += (bH - yH) ** 2 + (bD - yD) ** 2 + (bA - yA) ** 2;
      bmLog += -(yH * Math.log(clip(bH)) + yD * Math.log(clip(bD)) + yA * Math.log(clip(bA)));
      const bmPick = bH >= bD && bH >= bA ? "h" : bD >= bA ? "d" : "a";
      if (bmPick === outcome) bmCorrect++;
      bmN++;
    }
  }

  const mk = (name: string, b: number, l: number, c: number, n: number): ModelScore => ({
    name,
    accuracy: n ? c / n : 0,
    brierScore: n ? b / n : 0,
    logLoss: n ? l / n : 0,
    evaluated: n,
  });

  const ourModel = mk("Notre IA (Dixon-Coles Ensemble)", ourBrier, ourLog, ourCorrect, ourN);
  const bookmaker = mk("Consensus Bookmakers", bmBrier, bmLog, bmCorrect, bmN);
  const naive = mk("Baseline naïve (1/3)", nvBrier, nvLog, nvCorrect, nvN);

  let verdict: string;
  if (ourModel.brierScore <= bookmaker.brierScore + 0.005) {
    verdict = "🏆 Notre IA est au niveau (ou meilleure) que le consensus des bookmakers.";
  } else if (ourModel.brierScore < naive.brierScore) {
    verdict = "✅ Notre IA bat largement le hasard et approche le niveau des bookmakers.";
  } else {
    verdict = "⚠️ Le modèle doit être recalibré (lancer /api/recompute et /api/learn).";
  }

  return { ourModel, bookmaker, naive, verdict };
}
