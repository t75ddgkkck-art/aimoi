import { db } from "@/db";
import { matches, teams, predictions, leagues } from "@/db/schema";
import { eq, and, gte, inArray, sql } from "drizzle-orm";
import { getWeatherImpact } from "@/lib/apis/weather";
import { predictMatch, type MatchInput } from "@/lib/ml";
import { enhanceWithPythonML } from "@/lib/ml-service-client";
import { getLeagueConfig } from "@/lib/league-config";
import { computeBettingRisk } from "@/lib/betting-risk";
import { getNationalElo, nationalStrengths } from "@/lib/national-ratings";
import { computeBlendWeights } from "@/lib/blend-calibration";
import { computeMatchImportance } from "@/lib/match-importance";
import { altitudeImpact } from "@/lib/altitude";

/**
 * Recomputes predictions for all upcoming + live matches using the latest
 * team strengths (incl. realistic national-team ratings for the World Cup).
 * Fixes flat 1-1 "coin-flip" predictions.
 */
export async function refreshUpcomingPredictions(limit = 800): Promise<{ updated: number }> {
  const now = new Date();

  // Auto-calibrated per-league blend weights (model vs market), measured on history.
  const blendWeights = await computeBlendWeights().catch(() => ({} as Record<string, number>));

  const rows = await db
    .select({
      id: matches.id,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      kickoffAt: matches.kickoffAt,
      homeOdds: matches.homeOdds,
      drawOdds: matches.drawOdds,
      awayOdds: matches.awayOdds,
      openingHomeOdds: matches.openingHomeOdds, // set only by real odds sync
      matchImportance: matches.matchImportance,
      leagueCode: leagues.code,
      leagueCountry: leagues.country,
    })
    .from(matches)
    .innerJoin(leagues, eq(matches.leagueId, leagues.id))
    .where(and(gte(matches.kickoffAt, new Date(now.getTime() - 6 * 3600_000)), inArray(matches.status, ["scheduled", "live"])))
    .limit(limit);

  if (rows.length === 0) return { updated: 0 };

  const teamIds = Array.from(new Set(rows.flatMap((r) => [r.homeTeamId, r.awayTeamId])));
  const teamRows = await db.select().from(teams).where(inArray(teams.id, teamIds));
  const teamById = new Map(teamRows.map((t) => [t.id, t]));

  // Last finished-match date per team (for rest/fatigue computation).
  const lastMatchByTeam = new Map<number, Date>();
  try {
    const lastRows = await db.execute(
      sql.raw(`
        SELECT team_id, MAX(kickoff_at) AS last_kick FROM (
          SELECT home_team_id AS team_id, kickoff_at FROM matches WHERE status='finished'
          UNION ALL
          SELECT away_team_id AS team_id, kickoff_at FROM matches WHERE status='finished'
        ) x WHERE team_id = ANY(ARRAY[${teamIds.join(",")}]) GROUP BY team_id
      `)
    );
    for (const row of ((lastRows as any).rows ?? lastRows) as any[]) {
      lastMatchByTeam.set(Number(row.team_id), new Date(row.last_kick));
    }
  } catch { /* fatigue optional */ }

  const restDays = (teamId: number, kickoff: Date): number | undefined => {
    const last = lastMatchByTeam.get(teamId);
    if (!last) return undefined;
    return Math.max(0, (kickoff.getTime() - last.getTime()) / 86400_000);
  };

  let updated = 0;

  for (const r of rows) {
    const home = teamById.get(r.homeTeamId);
    const away = teamById.get(r.awayTeamId);
    if (!home || !away) continue;

    const config = getLeagueConfig(r.leagueCode);
    const isWC = r.leagueCode === "WC";

    // Dynamic match importance (derby, title race, relegation, late season)
    const isCup = ["UCL", "WC", "CLIB", "CSUD", "DFBP", "EFLC", "EURO"].includes(r.leagueCode);
    const dynImportance = computeMatchImportance({
      homeName: home.name,
      awayName: away.name,
      kickoff: r.kickoffAt,
      homePosition: home.position,
      awayPosition: away.position,
      homePoints: home.points,
      awayPoints: away.points,
      isCup,
    });

    // Altitude advantage (e.g. La Paz, Quito, Mexico City)
    const alt = altitudeImpact(home.name, r.leagueCountry ?? undefined, away.name, r.leagueCountry ?? undefined);

    // Blend overall Elo with time-decayed recent Elo (recent form matters more).
    const blendElo = (overall: number, recent: number | null | undefined) =>
      recent != null ? overall * 0.55 + recent * 0.45 : overall;

    let homeElo = blendElo(home.elo, (home as any).recentElo);
    let awayElo = blendElo(away.elo, (away as any).recentElo);

    // Use VENUE-SPECIFIC strengths: home team's home form, away team's away form.
    const homeVenueAtk = (home as any).homeAttack ?? home.attackStrength;
    const homeVenueDef = (home as any).homeDefense ?? home.defenseStrength;
    const awayVenueAtk = (away as any).awayAttack ?? away.attackStrength;
    const awayVenueDef = (away as any).awayDefense ?? away.defenseStrength;

    // Blend venue-specific with overall (70% venue / 30% overall) for stability.
    let homeAtk = homeVenueAtk * 0.7 + home.attackStrength * 0.3;
    let homeDef = homeVenueDef * 0.7 + home.defenseStrength * 0.3;
    let awayAtk = awayVenueAtk * 0.7 + away.attackStrength * 0.3;
    let awayDef = awayVenueDef * 0.7 + away.defenseStrength * 0.3;

    if (isWC) {
      homeElo = getNationalElo(home.name);
      awayElo = getNationalElo(away.name);
      const hs = nationalStrengths(homeElo);
      const as = nationalStrengths(awayElo);
      homeAtk = hs.attack; homeDef = hs.defense;
      awayAtk = as.attack; awayDef = as.defense;
    }

    const odds = {
      home: r.homeOdds ?? 2.2,
      draw: r.drawOdds ?? 3.3,
      away: r.awayOdds ?? 3.2,
    };

    const input: MatchInput = {
      home: {
        elo: homeElo,
        attackStrength: homeAtk,
        defenseStrength: homeDef,
        homeAdvantage: isWC ? 0.0 : 0.25,
        formLast5: home.formLast5 ?? undefined,
        xgScoredAvg: home.xgScoredAvg ?? undefined,
        xgConcededAvg: home.xgConcededAvg ?? undefined,
        injuredCount: home.injuredCount ?? 0,
      },
      away: {
        elo: awayElo,
        attackStrength: awayAtk,
        defenseStrength: awayDef,
        homeAdvantage: 0,
        formLast5: away.formLast5 ?? undefined,
        xgScoredAvg: away.xgScoredAvg ?? undefined,
        xgConcededAvg: away.xgConcededAvg ?? undefined,
        injuredCount: away.injuredCount ?? 0,
      },
      leagueAvgGoals: config.avgGoals,
      homeAdvantageBase: isWC ? 0.0 : 0.15,
      odds,
      leagueCode: r.leagueCode,
      sampleSize: 40,
      matchImportance: dynImportance.importance,
      homeRestDays: restDays(r.homeTeamId, r.kickoffAt),
      awayRestDays: restDays(r.awayTeamId, r.kickoffAt),
      altitudeHomeBoost: alt.homeBoost,
      altitudeAwayPenalty: alt.awayPenalty,
    };

    // Weather impact (rain/wind reduce goals) — only for matches in the next 14 days.
    try {
      const hoursUntil = (r.kickoffAt.getTime() - now.getTime()) / 3600_000;
      if (hoursUntil > -3 && hoursUntil < 14 * 24) {
        const wx = await getWeatherImpact(r.leagueCountry ?? "World", r.kickoffAt.toISOString());
        (input as any).weatherMultiplier = wx.goalMultiplier;
      }
    } catch { /* weather optional */ }

    let pred = predictMatch(input);
    const enhanced = await enhanceWithPythonML(input, pred).catch(() => ({ result: pred, modelVersion: undefined }));
    pred = enhanced.result;

    // Only REAL bookmaker odds (marked by openingHomeOdds being set by the odds
    // sync) are trustworthy for value bets. Seeded odds must NOT produce value bets.
    const hasRealOdds = r.openingHomeOdds != null && r.homeOdds != null && r.drawOdds != null && r.awayOdds != null;
    if (!hasRealOdds) {
      // No real market → clear any value bets to avoid misleading EV figures.
      pred = { ...pred, valueBets: [] };
    }
    if (hasRealOdds && odds.home > 1 && odds.draw > 1 && odds.away > 1) {
      const rH = 1 / odds.home, rD = 1 / odds.draw, rA = 1 / odds.away;
      const s = rH + rD + rA;
      const mH = rH / s, mD = rD / s, mA = rA / s;
      // Auto-calibrated weight: trust whichever (model/market) has historically been
      // more accurate for THIS league. Cups stay market-leaning (unpredictable).
      let w = blendWeights[r.leagueCode] ?? 0.7;
      if (r.leagueCode === "WC" || r.leagueCode === "UCL" || r.leagueCode === "CLIB") w = Math.min(w, 0.45);
      let bH = w * pred.homeWin + (1 - w) * mH;
      let bD = w * pred.draw + (1 - w) * mD;
      let bA = w * pred.awayWin + (1 - w) * mA;
      const norm = bH + bD + bA || 1;
      pred = { ...pred, homeWin: bH / norm, draw: bD / norm, awayWin: bA / norm };

      // Recompute value bets against real odds with the blended probabilities
      const implied = (o: number) => 1 / o;
      const evCalc = (p: number, o: number) => p * (o - 1) - (1 - p);
      const kellyCalc = (p: number, o: number) => Math.max(0, (p * o - 1) / (o - 1)) * 0.25;
      const cands = [
        { market: "Résultat du match", selection: "Home Win", p: pred.homeWin, o: odds.home },
        { market: "Résultat du match", selection: "Draw", p: pred.draw, o: odds.draw },
        { market: "Résultat du match", selection: "Away Win", p: pred.awayWin, o: odds.away },
      ];
      pred.valueBets = cands
        .filter((c) => c.p > implied(c.o) * 1.05 && evCalc(c.p, c.o) > 0.03)
        .map((c) => ({
          market: c.market,
          selection: c.selection,
          modelProb: c.p,
          impliedProb: implied(c.o),
          odds: c.o,
          ev: evCalc(c.p, c.o),
          kelly: kellyCalc(c.p, c.o),
        }))
        .sort((a, b) => b.ev - a.ev);
    }

    const bettingRisk = computeBettingRisk({
      odds,
      model: { home: pred.homeWin, draw: pred.draw, away: pred.awayWin, confidence: pred.confidence },
    });

    const markets = {
      homeWin: pred.homeWin, draw: pred.draw, awayWin: pred.awayWin,
      over15: pred.over15, over25: pred.over25, over35: pred.over35,
      bttsYes: pred.bttsYes, bttsNo: pred.bttsNo,
      expectedHomeGoals: pred.expectedHomeGoals,
      expectedAwayGoals: pred.expectedAwayGoals,
      exactScores: pred.exactScores,
      confidence: pred.confidence,
      bettingRisk,
    };

    await db
      .insert(predictions)
      .values({
        matchId: r.id,
        markets,
        valueBets: pred.valueBets,
        modelVersion: enhanced.modelVersion ?? "dixon-coles-refreshed-v3",
      })
      .onConflictDoUpdate({
        target: predictions.matchId,
        set: { markets, valueBets: pred.valueBets, modelVersion: enhanced.modelVersion ?? "dixon-coles-refreshed-v3" },
      });

    // Persist the dynamic importance so it can be surfaced in the UI.
    if (Math.abs((r.matchImportance ?? 1.0) - dynImportance.importance) > 0.01) {
      await db.update(matches).set({ matchImportance: dynImportance.importance }).where(eq(matches.id, r.id)).catch(() => {});
    }

    updated++;
  }

  return { updated };
}
