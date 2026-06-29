import { NextResponse } from "next/server";
import { db } from "@/db";
import { predictions, matches, teams, leagues } from "@/db/schema";
import { sql } from "drizzle-orm";
import { ensureSeeded } from "@/lib/bootstrap";
import * as oddsApi from "@/lib/apis/odds-api";
import * as fdApi from "@/lib/apis/football-data";
import * as afApi from "@/lib/apis/api-football";
import * as asApi from "@/lib/apis/api-sports";
import * as olbApi from "@/lib/apis/openligadb";
import * as sfApi from "@/lib/apis/sofascore";
import { getRefreshState } from "@/lib/refresh-state";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeeded();

    const [[{ matchCount }], [{ teamCount }], [{ leagueCount }], [{ predCount }]] =
      await Promise.all([
        db.select({ matchCount: sql<number>`count(*)::int` }).from(matches),
        db.select({ teamCount: sql<number>`count(*)::int` }).from(teams),
        db.select({ leagueCount: sql<number>`count(*)::int` }).from(leagues),
        db.select({ predCount: sql<number>`count(*)::int` }).from(predictions),
      ]);

    const refreshState = getRefreshState();
    const [pred] = await db.select().from(predictions).limit(1);
    const version = pred?.modelVersion ?? "";
    const hasRealData = matchCount > 0 || teamCount > 0;
    const isLive = refreshState.running || version.includes("live") || version.includes("fd") || version.includes("tsdb") || hasRealData;
    const mode = refreshState.running
      ? "refreshing-real-data"
      : version.includes("tsdb")
      ? "thesportsdb"
      : version.includes("fd")
      ? "legacy-football-data"
      : hasRealData
      ? "thesportsdb"
      : "empty-real-data";

    const [latest] = await db
      .select({ kickoff: matches.kickoffAt })
      .from(matches)
      .orderBy(sql`${matches.kickoffAt} DESC`)
      .limit(1);

    return NextResponse.json({
      source:
        mode === "thesportsdb"
          ? "TheSportsDB + public live sources"
          : mode === "legacy-football-data"
          ? "Legacy football-data.org cache"
          : mode === "refreshing-real-data"
          ? "Actualisation données réelles en cours"
          : "Aucune donnée réelle disponible",
      mode,
      modelVersion: version,
      isLive,
      refresh: refreshState,
      stats: {
        leagues: leagueCount,
        teams: teamCount,
        matches: matchCount,
        predictions: predCount,
      },
      apis: {
        thesportsdb: true,
        theoddsapi: oddsApi.isEnabled(),
        footballdata: false,
        apifootball: afApi.isEnabled(),
        apisports: asApi.isEnabled(),
        openligadb: olbApi.isEnabled(),
        sofascore: sfApi.isEnabled(),
      },
      freshness: latest ? { latestMatchKickoff: latest.kickoff.toISOString() } : null,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: String(err),
      source: "Connexion base de données indisponible",
      mode: "db-error",
      modelVersion: "",
      isLive: false,
      refresh: getRefreshState(),
      stats: { leagues: 0, teams: 0, matches: 0, predictions: 0 },
      apis: {
        thesportsdb: true,
        theoddsapi: oddsApi.isEnabled(),
        footballdata: false,
        apifootball: afApi.isEnabled(),
        apisports: asApi.isEnabled(),
        openligadb: olbApi.isEnabled(),
        sofascore: sfApi.isEnabled(),
      },
      freshness: null,
      checkedAt: new Date().toISOString(),
    });
  }
}
