import { NextResponse } from "next/server";
import { db } from "@/db";
import { leagues, matches, predictions, teams } from "@/db/schema";
import { and, asc, desc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { ensureSeeded } from "@/lib/bootstrap";
import { syncLiveMatches } from "@/lib/live-sync";
import { syncLiveMatchesFD } from "@/lib/live-sync-fd";
import { syncTodayFromTSDB } from "@/lib/tsdb-sync";
import { syncOpenLigaDB } from "@/lib/openligadb-sync";
import { syncUpcomingFixtures } from "@/lib/upcoming-sync";
import { parisDayBounds } from "@/lib/format";

// Throttle the upcoming-fixtures sync (heavier) to once every 10 min.
let lastUpcomingSync = 0;

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Window = "today" | "upcoming" | "live" | "all" | "past";

function parseWindow(w: string | null): Window {
  if (w === "today" || w === "upcoming" || w === "live" || w === "all" || w === "past") return w;
  return "today";
}

export async function GET(req: Request) {
  await ensureSeeded();
  const { searchParams } = new URL(req.url);
  const window = parseWindow(searchParams.get("window"));
  const leagueCode = searchParams.get("league");
  const limit = Math.min(200, parseInt(searchParams.get("limit") ?? "50") || 50);

  // Multi-source live/today sync. For "live"/"today" we await the fast sources so
  // scores are fresh; TheSportsDB broadens coverage beyond football-data's leagues.
  if (window === "live" || window === "today") {
    await Promise.all([
      syncLiveMatchesFD().catch((e) => console.warn("[api/matches] FD sync", e)),
      syncTodayFromTSDB().catch((e) => console.warn("[api/matches] TSDB sync", e)),
      syncOpenLigaDB().catch((e) => console.warn("[api/matches] OLB sync", e)),
    ]);
  } else {
    syncLiveMatchesFD().catch(() => {});
    syncTodayFromTSDB().catch(() => {});
    syncOpenLigaDB().catch(() => {});
  }

  // Proactively pull real upcoming fixtures (throttled) so the list stays rich.
  if ((window === "upcoming" || window === "all") && Date.now() - lastUpcomingSync > 10 * 60 * 1000) {
    lastUpcomingSync = Date.now();
    await syncUpcomingFixtures().catch((e) => console.warn("[api/matches] upcoming sync", e));
  }
  // Optional api-sports sync (only runs if subscribed) — never blocks
  syncLiveMatches().catch(() => {});

  const now = new Date();

  // Compute "today" boundaries based on the Europe/Paris calendar day, not UTC.
  // This guarantees a match is shown under the correct day for French users.
  const { start: startOfDay, end: endOfDay } = parisDayBounds(now);

  const endOfWindow = new Date(now);
  endOfWindow.setDate(endOfWindow.getDate() + 90); // 90 days forward (covers full season)
  const startOfPast = new Date(now);
  startOfPast.setDate(startOfPast.getDate() - 90); // 90 days backward for recent results

  let statusFilter;
  let dateFilter;

  if (window === "today") {
    statusFilter = or(eq(matches.status, "scheduled"), eq(matches.status, "live"));
    dateFilter = and(gte(matches.kickoffAt, startOfDay), lte(matches.kickoffAt, endOfDay));
  } else if (window === "upcoming") {
    statusFilter = eq(matches.status, "scheduled");
    dateFilter = and(gte(matches.kickoffAt, now), lte(matches.kickoffAt, endOfWindow));
  } else if (window === "live") {
    statusFilter = eq(matches.status, "live");
  } else if (window === "past") {
    statusFilter = eq(matches.status, "finished");
    dateFilter = and(gte(matches.kickoffAt, startOfPast), lte(matches.kickoffAt, now));
  } else {
    dateFilter = gte(matches.kickoffAt, new Date(now.getTime() - 90 * 24 * 3600 * 1000));
  }

  const conditions = [statusFilter, dateFilter].filter(Boolean);

  const rows = await db
    .select({
      id: matches.id,
      kickoffAt: matches.kickoffAt,
      status: matches.status,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      minute: matches.minute,
      matchday: matches.matchday,
      matchImportance: matches.matchImportance,
      homeOdds: matches.homeOdds,
      drawOdds: matches.drawOdds,
      awayOdds: matches.awayOdds,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      leagueId: matches.leagueId,
      leagueName: leagues.name,
      leagueCode: leagues.code,
      leagueLogo: leagues.logo,
      leagueCountry: leagues.country,
      homeName: teams.name,
    })
    .from(matches)
    .innerJoin(leagues, eq(matches.leagueId, leagues.id))
    .innerJoin(teams, eq(matches.homeTeamId, teams.id))
    .where(and(...conditions))
    .orderBy(asc(matches.kickoffAt))
    .limit(limit);

  if (rows.length === 0) {
    return NextResponse.json({ matches: [] });
  }

  const matchIds = rows.map((r) => r.id);
  const teamIds = Array.from(
    new Set(rows.flatMap((r) => [r.homeTeamId, r.awayTeamId]))
  );

  const [preds, teamRows] = await Promise.all([
    db
      .select()
      .from(predictions)
      .where(inArray(predictions.matchId, matchIds)),
    db.select().from(teams).where(inArray(teams.id, teamIds)),
  ]);

  const predByMatch = new Map(preds.map((p) => [p.matchId, p]));
  const teamById = new Map(teamRows.map((t) => [t.id, t]));

  let leagueFilter: ((code: string) => boolean) | null = null;
  if (leagueCode) {
    const lc = leagueCode.toUpperCase();
    leagueFilter = (c) => c.toUpperCase() === lc;
  }

  const result = rows
    .filter((r) => !leagueFilter || leagueFilter(r.leagueCode))
    .map((r) => {
      const home = teamById.get(r.homeTeamId)!;
      const away = teamById.get(r.awayTeamId)!;
      const pred = predByMatch.get(r.id);
      return {
        id: r.id,
        kickoffAt: r.kickoffAt.toISOString(),
        status: r.status,
        homeScore: r.homeScore,
        awayScore: r.awayScore,
        minute: r.minute,
        matchday: r.matchday,
        matchImportance: r.matchImportance,
        league: {
          id: r.leagueId,
          name: r.leagueName,
          code: r.leagueCode,
          country: r.leagueCountry,
          logo: r.leagueLogo,
        },
        homeTeam: {
          id: home.id,
          name: home.name,
          shortName: home.shortName,
          logo: home.logo,
          elo: home.elo,
          formLast5: home.formLast5,
          position: home.position,
        },
        awayTeam: {
          id: away.id,
          name: away.name,
          shortName: away.shortName,
          logo: away.logo,
          elo: away.elo,
          formLast5: away.formLast5,
          position: away.position,
        },
        odds: { home: r.homeOdds, draw: r.drawOdds, away: r.awayOdds },
        prediction: pred
          ? {
              markets: pred.markets,
              valueBets: pred.valueBets,
              confidence: pred.markets.confidence,
              modelVersion: pred.modelVersion,
            }
          : null,
      };
    });

  return NextResponse.json({ matches: result });
}
