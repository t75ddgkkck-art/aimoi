import { NextResponse } from "next/server";
import { db } from "@/db";
import { leagues, matches, predictions, teams } from "@/db/schema";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { ensureSeeded } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  await ensureSeeded();

  const now = new Date();
  const end = new Date(now.getTime() + 72 * 3600 * 1000);

  const rows = await db
    .select({
      matchId: matches.id,
      kickoffAt: matches.kickoffAt,
      status: matches.status,
      leagueName: leagues.name,
      leagueCode: leagues.code,
      leagueLogo: leagues.logo,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      valueBets: predictions.valueBets,
      markets: predictions.markets,
    })
    .from(predictions)
    .innerJoin(matches, eq(predictions.matchId, matches.id))
    .innerJoin(leagues, eq(matches.leagueId, leagues.id))
    .where(and(eq(matches.status, "scheduled"), gt(matches.kickoffAt, now)))
    .orderBy(asc(matches.kickoffAt));

  const inWindow = rows.filter((r) => r.kickoffAt <= end);

  if (inWindow.length === 0) {
    return NextResponse.json({ valueBets: [] });
  }

  const teamIds = Array.from(new Set(inWindow.flatMap((r) => [r.homeTeamId, r.awayTeamId])));
  const teamRows = await db.select().from(teams).where(inArray(teams.id, teamIds));
  const teamById = new Map(teamRows.map((t) => [t.id, t]));

  type FlatVB = {
    matchId: number;
    kickoffAt: string;
    league: { name: string; code: string; logo: string | null };
    homeTeam: { name: string; shortName: string | null; logo: string | null };
    awayTeam: { name: string; shortName: string | null; logo: string | null };
    confidence: number;
    market: string;
    selection: string;
    modelProb: number;
    impliedProb: number;
    odds: number;
    ev: number;
    kelly: number;
  };

  const flattened: FlatVB[] = [];
  for (const r of inWindow) {
    const home = teamById.get(r.homeTeamId)!;
    const away = teamById.get(r.awayTeamId)!;
    const vbs = r.valueBets ?? [];
    for (const v of vbs) {
      flattened.push({
        matchId: r.matchId,
        kickoffAt: r.kickoffAt.toISOString(),
        league: { name: r.leagueName, code: r.leagueCode, logo: r.leagueLogo },
        homeTeam: { name: home.name, shortName: home.shortName, logo: home.logo },
        awayTeam: { name: away.name, shortName: away.shortName, logo: away.logo },
        confidence: r.markets.confidence,
        ...v,
      });
    }
  }
  flattened.sort((a, b) => b.ev - a.ev);

  return NextResponse.json({ valueBets: flattened.slice(0, 50) });
}
