import { db } from "@/db";
import { leagues, teams, matches, predictions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import * as fdApi from "@/lib/apis/football-data";
import { findBestTeamMatch, normalizeTeamName } from "@/lib/team-matcher";
import { predictMatch, seededOdds, type MatchInput } from "@/lib/ml";
import { getLeagueConfig } from "@/lib/league-config";
import { getNationalElo, nationalStrengths } from "@/lib/national-ratings";

const FD_TO_LOCAL: Record<string, string> = {
  PL: "PL", PD: "LL", SA: "SA", BL1: "BL1", FL1: "FL1", CL: "UCL", WC: "WC",
  ELC: "ELC", DED: "NL1", PPL: "PT1", BSA: "BR1", CLI: "CLIB", EC: "EURO",
};

const META: Record<string, { name: string; country: string; logo: string }> = {
  PL: { name: "Premier League", country: "England", logo: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  LL: { name: "La Liga", country: "Spain", logo: "🇪🇸" },
  SA: { name: "Serie A", country: "Italy", logo: "🇮🇹" },
  BL1: { name: "Bundesliga", country: "Germany", logo: "🇩🇪" },
  FL1: { name: "Ligue 1", country: "France", logo: "🇫🇷" },
  UCL: { name: "UEFA Champions League", country: "Europe", logo: "🇪🇺" },
  WC: { name: "FIFA World Cup 2026", country: "World", logo: "🏆" },
  ELC: { name: "Championship", country: "England", logo: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  NL1: { name: "Eredivisie", country: "Netherlands", logo: "🇳🇱" },
  PT1: { name: "Primeira Liga", country: "Portugal", logo: "🇵🇹" },
  BR1: { name: "Brasileirão", country: "Brazil", logo: "🇧🇷" },
  CLIB: { name: "Copa Libertadores", country: "South America", logo: "🌎" },
  EURO: { name: "Championnat d'Europe", country: "Europe", logo: "🇪🇺" },
};

async function ensureLeague(code: string): Promise<number | null> {
  const m = META[code];
  if (!m) return null;
  const ex = await db.select({ id: leagues.id }).from(leagues).where(eq(leagues.code, code)).limit(1);
  if (ex[0]) return ex[0].id;
  const [c] = await db.insert(leagues)
    .values({ name: m.name, country: m.country, code, logo: m.logo, season: "2025-26", isActive: true })
    .onConflictDoUpdate({ target: leagues.code, set: { name: m.name } })
    .returning({ id: leagues.id });
  return c.id;
}

async function resolveTeam(leagueId: number, name: string, country: string, isWC: boolean): Promise<number> {
  const list = await db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.leagueId, leagueId));
  const matched = findBestTeamMatch(name, list);
  if (matched) return Number(matched.id);
  const norm = normalizeTeamName(name);
  const elo = isWC ? getNationalElo(norm) : 1500;
  const str = isWC ? nationalStrengths(elo) : { attack: 1.0, defense: 1.0 };
  const [c] = await db.insert(teams)
    .values({
      name: norm, shortName: norm.slice(0, 4).toUpperCase(), country, leagueId,
      elo, attackStrength: str.attack, defenseStrength: str.defense,
      logo: isWC ? "🏳️" : "⚽", position: 10, points: 0, goalDifference: 0,
    })
    .onConflictDoUpdate({ target: [teams.leagueId, teams.name], set: { name: norm } })
    .returning({ id: teams.id });
  return c.id;
}

/**
 * Proactively pulls REAL upcoming fixtures (next 21 days, all free competitions)
 * from football-data.org so the app always has a rich list of upcoming matches,
 * not just whatever openfootball historically contained.
 */
export async function syncUpcomingFixtures(): Promise<{ added: number; updated: number }> {
  if (!fdApi.isEnabled()) return { added: 0, updated: 0 };

  let added = 0, updated = 0;
  const now = new Date();
  const from = now.toISOString().split("T")[0];
  const to = new Date(now.getTime() + 21 * 24 * 3600_000).toISOString().split("T")[0];

  let fixtures: fdApi.FDMatch[] = [];
  try {
    fixtures = await fdApi.getMatchesByDate(from, to);
  } catch {
    return { added: 0, updated: 0 };
  }

  for (const m of fixtures) {
    const localCode = FD_TO_LOCAL[m.competition.code];
    if (!localCode || !META[localCode]) continue;
    const leagueId = await ensureLeague(localCode);
    if (!leagueId) continue;
    const meta = META[localCode];
    const isWC = localCode === "WC";

    const homeId = await resolveTeam(leagueId, m.homeTeam.name, meta.country, isWC);
    const awayId = await resolveTeam(leagueId, m.awayTeam.name, meta.country, isWC);
    const kickoff = new Date(m.utcDate);

    const status = m.status === "FINISHED" ? "finished" : m.status === "IN_PLAY" || m.status === "PAUSED" ? "live" : "scheduled";
    const homeScore = m.score.fullTime.home ?? null;
    const awayScore = m.score.fullTime.away ?? null;

    const existing = await db.select({ id: matches.id }).from(matches)
      .where(and(eq(matches.homeTeamId, homeId), eq(matches.awayTeamId, awayId), eq(matches.kickoffAt, kickoff)))
      .limit(1);

    if (existing[0]) {
      await db.update(matches).set({ status, homeScore, awayScore, matchday: m.matchday ?? null }).where(eq(matches.id, existing[0].id));
      updated++;
    } else {
      const odds = seededOdds(0, 0, homeId * 31 + awayId * 17);
      const [created] = await db.insert(matches)
        .values({
          leagueId, homeTeamId: homeId, awayTeamId: awayId, kickoffAt: kickoff,
          status, matchday: m.matchday ?? null, homeScore, awayScore,
          homeOdds: odds.home, drawOdds: odds.draw, awayOdds: odds.away,
        })
        .onConflictDoUpdate({
          target: [matches.homeTeamId, matches.awayTeamId, matches.kickoffAt],
          set: { status, homeScore, awayScore },
        })
        .returning({ id: matches.id });
      added++;

      if (status === "scheduled") {
        const config = getLeagueConfig(localCode);
        const input: MatchInput = {
          home: { elo: isWC ? getNationalElo(m.homeTeam.name) : 1500, attackStrength: 1.0, defenseStrength: 1.0, homeAdvantage: isWC ? 0 : 0.25 },
          away: { elo: isWC ? getNationalElo(m.awayTeam.name) : 1500, attackStrength: 1.0, defenseStrength: 1.0, homeAdvantage: 0 },
          leagueAvgGoals: config.avgGoals, homeAdvantageBase: isWC ? 0 : 0.15, odds, leagueCode: localCode, sampleSize: 10,
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
          modelVersion: "fd-upcoming-dixon-coles",
        }).onConflictDoNothing();
      }
    }
  }

  return { added, updated };
}
