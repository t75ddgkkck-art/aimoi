import "server-only";

import type { MatchInput, PredictionResult } from "@/lib/ml";

export async function enhanceWithPythonML(
  input: MatchInput,
  base: PredictionResult
): Promise<{ result: PredictionResult; modelVersion?: string; ensembleUsed: boolean }> {
  const url = process.env.ML_SERVICE_URL;
  if (!url) return { result: base, ensembleUsed: false };

  try {
    // Hugging Face Spaces can be slow on cold start; allow up to 6s before
    // falling back to the local Dixon-Coles ensemble.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`${url.replace(/\/$/, "")}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        home: input.home,
        away: input.away,
        odds: input.odds,
        leagueCode: input.leagueCode,
        leagueAvgGoals: input.leagueAvgGoals,
        homeAdvantageBase: input.homeAdvantageBase,
        matchImportance: input.matchImportance,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      console.warn(`[ml-service] /predict returned ${res.status}`);
      return { result: base, ensembleUsed: false };
    }
    const data = await res.json();
    return {
      result: {
        ...base,
        homeWin: data.homeWin,
        draw: data.draw,
        awayWin: data.awayWin,
        over15: data.over15,
        over25: data.over25,
        over35: data.over35,
        under15: 1 - data.over15,
        under25: 1 - data.over25,
        under35: 1 - data.over35,
        bttsYes: data.bttsYes,
        bttsNo: data.bttsNo,
        expectedHomeGoals: data.expectedHomeGoals,
        expectedAwayGoals: data.expectedAwayGoals,
        exactScores: data.exactScores,
        confidence: data.confidence,
      },
      modelVersion: data.modelVersion,
      ensembleUsed: !!data.ensembleUsed,
    };
  } catch (err) {
    console.warn("[ml-service] unavailable, using local ensemble", err);
    return { result: base, ensembleUsed: false };
  }
}
