import { db } from "@/db";
import { matches, teams, leagues } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { predictMatch, type MatchInput } from "@/lib/ml";
import { getLeagueConfig } from "@/lib/league-config";
import { updateElo } from "@/lib/elo";

/**
 * TRUE WALK-FORWARD BACKTEST (no look-ahead bias).
 * Processes finished matches chronologically. For each match we predict using
 * ONLY the Elo/strengths learned from prior matches, THEN update them.
 * This is the honest measure of predictive power, comparable to bookmakers.
 */
export async function walkForwardBacktest(maxMatches = 6000) {
  const rows = await db
    .select({
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      homeOdds: matches.homeOdds,
      drawOdds: matches.drawOdds,
      awayOdds: matches.awayOdds,
      leagueId: matches.leagueId,
      leagueCode: leagues.code,
    })
    .from(matches)
    .innerJoin(leagues, eq(matches.leagueId, leagues.id))
    .where(eq(matches.status, "finished"))
    .orderBy(asc(matches.kickoffAt))
    .limit(maxMatches);

  const valid = rows.filter((r) => r.homeScore != null && r.awayScore != null);

  const elo: Record<number, number> = {};
  const played: Record<number, number> = {};
  const gf: Record<number, number> = {};
  const ga: Record<number, number> = {};
  const leagueGoals: Record<number, { total: number; n: number }> = {};

  const clip = (p: number) => Math.min(0.9999, Math.max(0.0001, p));
  let brier = 0, log = 0, correct = 0, n = 0;
  let bmBrier = 0, bmLog = 0, bmCorrect = 0, bmN = 0;

  for (const m of valid) {
    const h = m.homeTeamId, a = m.awayTeamId;
    elo[h] = elo[h] ?? 1500;
    elo[a] = elo[a] ?? 1500;
    played[h] = played[h] ?? 0;
    played[a] = played[a] ?? 0;

    const lg = leagueGoals[m.leagueId] ?? { total: 0, n: 0 };
    const leagueAvg = lg.n > 4 ? lg.total / lg.n / 2 : getLeagueConfig(m.leagueCode).avgGoals;

    // Only predict once both teams have some history (>=4 games) to avoid noise
    if (played[h] >= 4 && played[a] >= 4) {
      const atkH = Math.max(0.5, Math.min(1.8, (gf[h] / played[h]) / leagueAvg));
      const defH = Math.max(0.5, Math.min(1.8, (ga[h] / played[h]) / leagueAvg));
      const atkA = Math.max(0.5, Math.min(1.8, (gf[a] / played[a]) / leagueAvg));
      const defA = Math.max(0.5, Math.min(1.8, (ga[a] / played[a]) / leagueAvg));

      const input: MatchInput = {
        home: { elo: elo[h], attackStrength: atkH, defenseStrength: defH, homeAdvantage: 0.25 },
        away: { elo: elo[a], attackStrength: atkA, defenseStrength: defA, homeAdvantage: 0 },
        leagueAvgGoals: leagueAvg,
        homeAdvantageBase: 0.15,
        odds: { home: m.homeOdds ?? 2.2, draw: m.drawOdds ?? 3.3, away: m.awayOdds ?? 3.2 },
        leagueCode: m.leagueCode,
        sampleSize: Math.min(played[h], played[a]),
      };
      const pred = predictMatch(input);

      const yH = m.homeScore! > m.awayScore! ? 1 : 0;
      const yD = m.homeScore! === m.awayScore! ? 1 : 0;
      const yA = m.homeScore! < m.awayScore! ? 1 : 0;
      const outcome = yH ? "h" : yD ? "d" : "a";

      brier += (pred.homeWin - yH) ** 2 + (pred.draw - yD) ** 2 + (pred.awayWin - yA) ** 2;
      log += -(yH * Math.log(clip(pred.homeWin)) + yD * Math.log(clip(pred.draw)) + yA * Math.log(clip(pred.awayWin)));
      const pick = pred.homeWin >= pred.draw && pred.homeWin >= pred.awayWin ? "h" : pred.draw >= pred.awayWin ? "d" : "a";
      if (pick === outcome) correct++;
      n++;

      if (m.homeOdds && m.drawOdds && m.awayOdds && m.homeOdds > 1) {
        const rH = 1 / m.homeOdds, rD = 1 / m.drawOdds, rA = 1 / m.awayOdds;
        const s = rH + rD + rA;
        const bH = rH / s, bD = rD / s, bA = rA / s;
        bmBrier += (bH - yH) ** 2 + (bD - yD) ** 2 + (bA - yA) ** 2;
        bmLog += -(yH * Math.log(clip(bH)) + yD * Math.log(clip(bD)) + yA * Math.log(clip(bA)));
        const bmPick = bH >= bD && bH >= bA ? "h" : bD >= bA ? "d" : "a";
        if (bmPick === outcome) bmCorrect++;
        bmN++;
      }
    }

    // Update state AFTER prediction (walk-forward)
    const upd = updateElo(elo[h], elo[a], m.homeScore!, m.awayScore!, played[h] < 30, played[a] < 30);
    elo[h] = upd.homeAfter;
    elo[a] = upd.awayAfter;
    played[h]++; played[a]++;
    gf[h] = (gf[h] ?? 0) + m.homeScore!; ga[h] = (ga[h] ?? 0) + m.awayScore!;
    gf[a] = (gf[a] ?? 0) + m.awayScore!; ga[a] = (ga[a] ?? 0) + m.homeScore!;
    lg.total += m.homeScore! + m.awayScore!; lg.n += 1;
    leagueGoals[m.leagueId] = lg;
  }

  return {
    ourModel: {
      name: "Notre IA (walk-forward, sans biais)",
      accuracy: n ? correct / n : 0,
      brierScore: n ? brier / n : 0,
      logLoss: n ? log / n : 0,
      evaluated: n,
    },
    bookmaker: {
      name: "Consensus Bookmakers",
      accuracy: bmN ? bmCorrect / bmN : 0,
      brierScore: bmN ? bmBrier / bmN : 0,
      logLoss: bmN ? bmLog / bmN : 0,
      evaluated: bmN,
    },
  };
}
