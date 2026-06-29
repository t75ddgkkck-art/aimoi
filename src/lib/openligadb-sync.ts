import { db } from "@/db";
import { leagues, teams, matches, predictions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import * as olb from "@/lib/apis/openligadb";
import { findBestTeamMatch, normalizeTeamName } from "@/lib/team-matcher";
import { predictMatch, seededOdds, type MatchInput } from "@/lib/ml";
import { getLeagueConfig } from "@/lib/league-config";

const SHORTCUT_TO_CODE: Record<string, string> = {
  bl1: "BL1",
  bl2: "BL2",
  bl3: "BL3",
  dfb: "DFBP",
};

const CODE_META: Record<string, { name: string; country: string; logo: string }> = {
  BL1: { name: "Bundesliga", country: "Germany", logo: "🇩🇪" },
  BL2: { name: "2. Bundesliga", country: "Germany", logo: "🇩🇪" },
  BL3: { name: "3. Liga", country: "Germany", logo: "🇩🇪" },
  DFBP: { name: "DFB-Pokal", country: "Germany", logo: "🇩🇪" },
};

async function ensureLeague(code: string): Promise<number | null> {
  const meta = CODE_META[code];
  if (!meta) return null;
  const existing = await db.select({ id: leagues.id }).from(leagues).where(eq(leagues.code, code)).limit(1);
  if (existing[0]) return existing[0].id;
  const [created] = await db
    .insert(leagues)
    .values({ name: meta.name, country: meta.country, code, logo: meta.logo, season: "2025-26", isActive: true })
    .onConflictDoUpdate({ target: leagues.code, set: { name: meta.name } })
    .returning({ id: leagues.id });
  return created.id;
}

async function resolveTeam(leagueId: number, name: string, logo: string | null): Promise<number> {
  const list = await db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.leagueId, leagueId));
  const matched = findBestTeamMatch(name, list);
  if (matched) return Number(matched.id);
  const norm = normalizeTeamName(name);
  const [created] = await db
    .insert(teams)
    .values({
      name: norm, shortName: norm.slice(0, 4).toUpperCase(), country: "Germany", leagueId,
      elo: 1500, attackStrength: 1.0, defenseStrength: 1.0,
      logo: logo || "⚽", position: 10, points: 0, goalDifference: 0,
    })
    .onConflictDoUpdate({ target: [teams.leagueId, teams.name], set: { name: norm } })
    .returning({ id: teams.id });
  return created.id;
}

/**
 * Free German-football live source (OpenLigaDB, no key) covering BL1/BL2/3.Liga/DFB,
 * including night & lower-division games that football-data may miss.
 */
export async function syncOpenLigaDB(): Promise<{ added: number; updated: number; live: number }> {
  let added = 0, updated = 0, live = 0;

  for (const shortcut of olb.LIVE_SCAN_SHORTCUTS) {
    const code = SHORTCUT_TO_CODE[shortcut];
    if (!code) continue;
    let olbMatches: olb.OLBMatch[] = [];
    try {
      olbMatches = await olb.getMatchData(shortcut);
    } catch {
      continue;
    }
    if (!olbMatches.length) continue;

    const leagueId = await ensureLeague(code);
    if (!leagueId) continue;

    for (const m of olbMatches) {
      if (!m.Team1?.TeamName || !m.Team2?.TeamName) continue;

      const kickoff = new Date(m.MatchDateTime);
      if (isNaN(kickoff.getTime())) continue;
      // Only care about matches within +/- 1 day for live/today coverage
      const diffH = Math.abs(Date.now() - kickoff.getTime()) / 3600_000;
      if (diffH > 36) continue;

      const homeId = await resolveTeam(leagueId, m.Team1.TeamName, m.Team1.TeamIconUrl);
      const awayId = await resolveTeam(leagueId, m.Team2.TeamName, m.Team2.TeamIconUrl);

      const finalResult = m.MatchResults?.find((r) => r.ResultTypeID === 2) || m.MatchResults?.[m.MatchResults.length - 1];
      const homeScore = finalResult ? finalResult.PointsTeam1 : null;
      const awayScore = finalResult ? finalResult.PointsTeam2 : null;

      // Determine status: started (kickoff passed) but not finished = live
      const started = Date.now() >= kickoff.getTime();
      let status = "scheduled";
      if (m.MatchIsFinished) status = "finished";
      else if (started && diffH < 3) status = "live";
      if (status === "live") live++;

      const elapsedMin = Math.floor((Date.now() - kickoff.getTime()) / 60000);
      const minute = status === "live" ? Math.max(1, Math.min(90, elapsedMin > 60 ? elapsedMin - 15 : elapsedMin)) : null;

      const existing = await db
        .select({ id: matches.id })
        .from(matches)
        .where(and(eq(matches.homeTeamId, homeId), eq(matches.awayTeamId, awayId), eq(matches.kickoffAt, kickoff)))
        .limit(1);

      if (existing[0]) {
        await db.update(matches).set({ status, homeScore, awayScore, minute }).where(eq(matches.id, existing[0].id));
        updated++;
      } else {
        const odds = seededOdds(0, 0, homeId * 31 + awayId * 17);
        const [created] = await db
          .insert(matches)
          .values({
            leagueId, homeTeamId: homeId, awayTeamId: awayId, kickoffAt: kickoff,
            status, matchday: m.Group?.GroupOrderID ?? 1, homeScore, awayScore, minute,
            homeOdds: odds.home, drawOdds: odds.draw, awayOdds: odds.away,
          })
          .onConflictDoUpdate({
            target: [matches.homeTeamId, matches.awayTeamId, matches.kickoffAt],
            set: { status, homeScore, awayScore, minute },
          })
          .returning({ id: matches.id });
        added++;

        if (status === "scheduled") {
          const config = getLeagueConfig(code);
          const input: MatchInput = {
            home: { elo: 1500, attackStrength: 1.0, defenseStrength: 1.0, homeAdvantage: 0.25 },
            away: { elo: 1500, attackStrength: 1.0, defenseStrength: 1.0, homeAdvantage: 0 },
            leagueAvgGoals: config.avgGoals, homeAdvantageBase: 0.15, odds, leagueCode: code, sampleSize: 10,
          };
          const pred = predictMatch(input);
          await db.insert(predictions).values({
            matchId: created.id,
            markets: {
              homeWin: pred.homeWin, draw: pred.draw, awayWin: pred.awayWin,
              over15: pred.over15, over25: pred.over25, over35: pred.over35,
              bttsYes: pred.bttsYes, bttsNo: pred.bttsNo,
              expectedHomeGoals: pred.expectedHomeGoals, expectedAwayGoals: pred.expectedAwayGoals,
              exactScores: pred.exactScores, confidence: pred.confidence,
            },
            valueBets: pred.valueBets,
            modelVersion: "openligadb-dixon-coles",
          }).onConflictDoNothing();
        }
      }
    }
  }

  return { added, updated, live };
}
