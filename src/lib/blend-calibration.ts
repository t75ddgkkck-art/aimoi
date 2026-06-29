import { db } from "@/db";
import { matches, predictions, leagues } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Computes the optimal model-vs-market blend weight per league by measuring, on
 * recent finished matches, whether our model or the market predicted better
 * (lower Brier). Leagues where our model is strong get a higher model weight.
 * Returns a map: leagueCode -> weight on our model (0.4 .. 0.85).
 */
export async function computeBlendWeights(): Promise<Record<string, number>> {
  const rows = await db
    .select({
      leagueCode: leagues.code,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      homeOdds: matches.homeOdds,
      drawOdds: matches.drawOdds,
      awayOdds: matches.awayOdds,
      markets: predictions.markets,
    })
    .from(matches)
    .innerJoin(predictions, eq(matches.id, predictions.matchId))
    .innerJoin(leagues, eq(matches.leagueId, leagues.id))
    .where(eq(matches.status, "finished"))
    .limit(6000);

  const agg: Record<string, { modelErr: number; marketErr: number; n: number }> = {};

  for (const r of rows) {
    if (r.homeScore == null || r.awayScore == null || !r.markets) continue;
    if (!r.homeOdds || !r.drawOdds || !r.awayOdds || r.homeOdds <= 1) continue;

    const yH = r.homeScore > r.awayScore ? 1 : 0;
    const yD = r.homeScore === r.awayScore ? 1 : 0;
    const yA = r.homeScore < r.awayScore ? 1 : 0;

    const mH = r.markets.homeWin, mD = r.markets.draw, mA = r.markets.awayWin;
    const modelBrier = (mH - yH) ** 2 + (mD - yD) ** 2 + (mA - yA) ** 2;

    const rH = 1 / r.homeOdds, rD = 1 / r.drawOdds, rA = 1 / r.awayOdds;
    const s = rH + rD + rA;
    const bH = rH / s, bD = rD / s, bA = rA / s;
    const marketBrier = (bH - yH) ** 2 + (bD - yD) ** 2 + (bA - yA) ** 2;

    const a = agg[r.leagueCode] ?? { modelErr: 0, marketErr: 0, n: 0 };
    a.modelErr += modelBrier;
    a.marketErr += marketBrier;
    a.n += 1;
    agg[r.leagueCode] = a;
  }

  const weights: Record<string, number> = {};
  for (const [code, a] of Object.entries(agg)) {
    if (a.n < 30) { weights[code] = 0.6; continue; } // default blend
    const modelAvg = a.modelErr / a.n;
    const marketAvg = a.marketErr / a.n;
    // If our model's Brier is lower (better), trust it more.
    // ratio < 1 means model better → push weight up toward 0.85.
    const ratio = modelAvg / (marketAvg || 1);
    let w = 0.6;
    if (ratio < 0.95) w = 0.8;
    else if (ratio < 1.0) w = 0.7;
    else if (ratio < 1.1) w = 0.55;
    else w = 0.45;
    weights[code] = w;
  }

  return weights;
}
