import { db } from "@/db";
import { leagues, teams } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import * as understat from "@/lib/apis/understat";
import { matchTeamNames } from "@/lib/team-matcher";

/**
 * Pulls real xG / xGA from Understat for the top 5 leagues when available.
 * NOTE: Understat/FBref now block server-side scraping, so this is best-effort.
 * When unavailable, the recompute step already derives reliable goal-based xG
 * proxies from real match results (goals-for/against per game), so prediction
 * quality is preserved.
 */
export async function syncRealXG(season = 2024): Promise<{ leagues: number; teamsUpdated: number }> {
  const codes = Object.keys(understat.UNDERSTAT_LEAGUES); // PL, LL, SA, BL1, FL1
  let leaguesDone = 0;
  let teamsUpdated = 0;

  for (const code of codes) {
    let xgMap: Map<string, understat.UnderstatTeamStats>;
    try {
      xgMap = await understat.fetchLeagueXG(code, season);
    } catch {
      continue;
    }
    if (!xgMap || xgMap.size === 0) continue;
    leaguesDone++;

    const league = await db.select({ id: leagues.id }).from(leagues).where(eq(leagues.code, code)).limit(1);
    if (!league[0]) continue;

    const leagueTeams = await db.select().from(teams).where(eq(teams.leagueId, league[0].id));
    const xgEntries = Array.from(xgMap.values());

    for (const team of leagueTeams) {
      // Fuzzy-match our team to an Understat entry
      let best: { stats: understat.UnderstatTeamStats; score: number } | null = null;
      for (const s of xgEntries) {
        const score = matchTeamNames(team.name, s.title);
        if (score > 0.7 && (!best || score > best.score)) best = { stats: s, score };
      }
      if (!best) continue;

      // Understat xg/xga are season totals; estimate per-game using ~matches played.
      // We store per-90 averages; Understat already returns reasonable values via the client.
      const perGameXg = best.stats.xg > 5 ? best.stats.xg / 38 : best.stats.xg;
      const perGameXga = best.stats.xga > 5 ? best.stats.xga / 38 : best.stats.xga;

      await db
        .update(teams)
        .set({
          xgScoredAvg: Math.round(Math.max(0.3, Math.min(3.5, perGameXg)) * 100) / 100,
          xgConcededAvg: Math.round(Math.max(0.3, Math.min(3.5, perGameXga)) * 100) / 100,
        })
        .where(eq(teams.id, team.id));
      teamsUpdated++;
    }
  }

  return { leagues: leaguesDone, teamsUpdated };
}
