import "server-only";
import { db } from "@/db";
import { leagues, teams, matches, predictions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import * as fdApi from "@/lib/apis/football-data";
import { findBestTeamMatch, normalizeTeamName } from "@/lib/team-matcher";
import { predictMatch, seededOdds, type MatchInput } from "@/lib/ml";
import { getLeagueConfig } from "@/lib/league-config";
import { getNationalElo, nationalStrengths } from "@/lib/national-ratings";

// Map football-data competition codes to our internal league codes
const FD_TO_LOCAL: Record<string, string> = {
  PL: "PL",
  PD: "LL",
  SA: "SA",
  BL1: "BL1",
  FL1: "FL1",
  CL: "UCL",
  WC: "WC",
  ELC: "ELC",
  DED: "NL1",
  PPL: "PT1",
  BSA: "BR1",   // Brazil Série A
  CLI: "CLIB",  // Copa Libertadores
  EC: "EURO",   // European Championship
};

const FD_NAMES: Record<string, { name: string; country: string; logo: string }> = {
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

function fdStatusToLocal(status: string): string {
  switch (status) {
    case "IN_PLAY":
    case "PAUSED":
      return "live";
    case "FINISHED":
    case "AWARDED":
      return "finished";
    default:
      return "scheduled";
  }
}

async function ensureLeague(localCode: string): Promise<number | null> {
  const meta = FD_NAMES[localCode];
  if (!meta) return null;
  const existing = await db.select().from(leagues).where(eq(leagues.code, localCode)).limit(1);
  if (existing[0]) return existing[0].id;
  const [created] = await db
    .insert(leagues)
    .values({
      name: meta.name,
      country: meta.country,
      code: localCode,
      logo: meta.logo,
      season: "2025-26",
      isActive: true,
    })
    .onConflictDoUpdate({ target: leagues.code, set: { name: meta.name } })
    .returning({ id: leagues.id });
  return created.id;
}

async function resolveTeam(leagueId: number, name: string, country: string): Promise<number> {
  const lookupList = (await db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.leagueId, leagueId)));
  const matched = findBestTeamMatch(name, lookupList);
  if (matched) return Number(matched.id);

  const normName = normalizeTeamName(name);
  const [created] = await db
    .insert(teams)
    .values({
      name: normName,
      shortName: normName.slice(0, 4).toUpperCase(),
      country,
      leagueId,
      elo: 1500,
      attackStrength: 1.0,
      defenseStrength: 1.0,
      logo: "⚽",
      position: 10,
      points: 0,
      goalDifference: 0,
    })
    .onConflictDoUpdate({ target: [teams.leagueId, teams.name], set: { name: normName } })
    .returning({ id: teams.id });
  return created.id;
}

/**
 * AGGRESSIVE LIVE SYNC via football-data.org (free tier, no RapidAPI subscription needed)
 * Pulls IN_PLAY/PAUSED matches and updates live scores + minutes in real-time.
 */
let lastReconcileAt = 0;
const RECONCILE_INTERVAL_MS = 5 * 60 * 1000; // reconcile finished scores at most every 5 min

export async function syncLiveMatchesFD(): Promise<{ synced: number; live: number }> {
  if (!fdApi.isEnabled()) return { synced: 0, live: 0 };

  let synced = 0;
  let live = 0;

  try {
    const liveMatches = await fdApi.getLiveMatches();

    for (const m of liveMatches) {
      const fdCode = m.competition.code;
      const localCode = FD_TO_LOCAL[fdCode] ?? fdCode;
      const leagueId = await ensureLeague(localCode);
      if (!leagueId) continue;

      const meta = FD_NAMES[localCode] ?? { country: "World" };
      const homeId = await resolveTeam(leagueId, m.homeTeam.name, meta.country);
      const awayId = await resolveTeam(leagueId, m.awayTeam.name, meta.country);

      // For the World Cup, apply realistic national-team Elo + strengths
      if (localCode === "WC") {
        const hElo = getNationalElo(m.homeTeam.name);
        const aElo = getNationalElo(m.awayTeam.name);
        const hStr = nationalStrengths(hElo);
        const aStr = nationalStrengths(aElo);
        await db.update(teams).set({ elo: hElo, attackStrength: hStr.attack, defenseStrength: hStr.defense }).where(eq(teams.id, homeId));
        await db.update(teams).set({ elo: aElo, attackStrength: aStr.attack, defenseStrength: aStr.defense }).where(eq(teams.id, awayId));
      }

      const kickoff = new Date(m.utcDate);
      const homeScore = m.score.fullTime.home ?? 0;
      const awayScore = m.score.fullTime.away ?? 0;
      let status = fdStatusToLocal(m.status);

      // Estimate minute, accounting for the 15-min half-time break.
      const elapsedMin = Math.floor((Date.now() - kickoff.getTime()) / 60000);
      let minute: number;
      if (m.status === "PAUSED") {
        minute = 45; // Half-time
      } else if (elapsedMin <= 45) {
        minute = Math.max(1, elapsedMin);
      } else if (elapsedMin <= 60) {
        minute = 45; // Still likely in the break window
      } else {
        minute = Math.min(90, elapsedMin - 15); // Subtract the 15-min break
      }

      // SAFETY: a real match never lasts beyond ~140 min (incl. break + stoppage + ET).
      // If football-data still reports it live but it's clearly over, mark it finished.
      if (elapsedMin > 140) {
        status = "finished";
        minute = 90;
      }

      if (status === "live") live++;

      // Upsert the match
      const existing = await db
        .select()
        .from(matches)
        .where(and(eq(matches.homeTeamId, homeId), eq(matches.awayTeamId, awayId), eq(matches.kickoffAt, kickoff)))
        .limit(1);

      let matchId: number;
      if (existing[0]) {
        matchId = existing[0].id;
        await db
          .update(matches)
          .set({ status, homeScore, awayScore, minute })
          .where(eq(matches.id, matchId));
      } else {
        const odds = seededOdds(0, 0, homeId * 31 + awayId * 17);
        const [created] = await db
          .insert(matches)
          .values({
            leagueId,
            homeTeamId: homeId,
            awayTeamId: awayId,
            kickoffAt: kickoff,
            status,
            matchday: m.matchday ?? 1,
            homeScore,
            awayScore,
            minute,
            homeOdds: odds.home,
            drawOdds: odds.draw,
            awayOdds: odds.away,
          })
          .onConflictDoUpdate({
            target: [matches.homeTeamId, matches.awayTeamId, matches.kickoffAt],
            set: { status, homeScore, awayScore, minute },
          })
          .returning({ id: matches.id });
        matchId = created.id;
      }

      // Ensure a prediction exists
      const predExists = await db.select({ id: predictions.id }).from(predictions).where(eq(predictions.matchId, matchId)).limit(1);
      if (!predExists[0]) {
        const config = getLeagueConfig(localCode);
        const input: MatchInput = {
          home: { elo: 1550, attackStrength: 1.1, defenseStrength: 1.0, homeAdvantage: 0.25 },
          away: { elo: 1500, attackStrength: 1.0, defenseStrength: 1.0, homeAdvantage: 0 },
          leagueAvgGoals: config.avgGoals,
          homeAdvantageBase: 0.15,
          odds: { home: 2.2, draw: 3.2, away: 3.2 },
          leagueCode: localCode,
          sampleSize: 10,
        };
        const pred = predictMatch(input);
        await db
          .insert(predictions)
          .values({
            matchId,
            markets: {
              homeWin: pred.homeWin, draw: pred.draw, awayWin: pred.awayWin,
              over15: pred.over15, over25: pred.over25, over35: pred.over35,
              bttsYes: pred.bttsYes, bttsNo: pred.bttsNo,
              expectedHomeGoals: pred.expectedHomeGoals,
              expectedAwayGoals: pred.expectedAwayGoals,
              exactScores: pred.exactScores,
              confidence: pred.confidence,
            },
            valueBets: pred.valueBets,
            modelVersion: "live-fd-dixon-coles",
          })
          .onConflictDoNothing();
      }

      synced++;
    }

    // RECONCILIATION: finish any DB match still marked "live" but no longer in the
    // live feed (football-data sometimes leaves matches PAUSED for hours).
    const liveKeySet = new Set(
      liveMatches.map((m) => `${m.homeTeam.name}|${m.awayTeam.name}|${new Date(m.utcDate).getTime()}`)
    );

    const dbLive = await db
      .select({
        id: matches.id,
        kickoffAt: matches.kickoffAt,
        homeName: teams.name,
        homeTeamId: matches.homeTeamId,
        awayTeamId: matches.awayTeamId,
      })
      .from(matches)
      .innerJoin(teams, eq(matches.homeTeamId, teams.id))
      .where(eq(matches.status, "live"));

    for (const row of dbLive) {
      const elapsedMin = Math.floor((Date.now() - row.kickoffAt.getTime()) / 60000);
      // Older than ~2h20 and not in live feed → it's over.
      if (elapsedMin > 140) {
        await db.update(matches).set({ status: "finished", minute: 90 }).where(eq(matches.id, row.id));
      }
    }

    // Fetch real final scores for matches that finished in the last 2 days, to
    // correct any 0-0 placeholders left from the live phase. Throttled to once
    // every 5 minutes to respect football-data's free-tier rate limit.
    try {
      if (Date.now() - lastReconcileAt < RECONCILE_INTERVAL_MS) {
        return { synced, live };
      }
      lastReconcileAt = Date.now();
      const today = new Date();
      const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 3600_000);
      const dateFrom = twoDaysAgo.toISOString().split("T")[0];
      const dateTo = new Date(today.getTime() + 24 * 3600_000).toISOString().split("T")[0];
      const recent = await fdApi.getMatchesByDate(dateFrom, dateTo).catch(() => []);
      for (const m of recent) {
        if (m.status !== "FINISHED" || m.score.fullTime.home == null) continue;
        const localCode = FD_TO_LOCAL[m.competition.code];
        if (!localCode || !FD_NAMES[localCode]) continue; // only tracked leagues
        const leagueId = await ensureLeague(localCode).catch(() => null);
        if (!leagueId) continue;
        const meta = FD_NAMES[localCode];
        const homeId = await resolveTeam(leagueId, m.homeTeam.name, meta.country);
        const awayId = await resolveTeam(leagueId, m.awayTeam.name, meta.country);
        const kickoff = new Date(m.utcDate);
        await db
          .update(matches)
          .set({
            status: "finished",
            homeScore: m.score.fullTime.home,
            awayScore: m.score.fullTime.away,
            minute: 90,
          })
          .where(and(eq(matches.homeTeamId, homeId), eq(matches.awayTeamId, awayId), eq(matches.kickoffAt, kickoff)));
      }
    } catch (recErr) {
      console.warn("[live-sync-fd] reconciliation skipped:", recErr);
    }
  } catch (err) {
    console.warn("[live-sync-fd] failed:", err);
  }

  return { synced, live };
}
