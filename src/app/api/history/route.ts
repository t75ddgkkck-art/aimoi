import { NextResponse } from "next/server";
import { db } from "@/db";
import { matches, predictions, teams, leagues } from "@/db/schema";
import { eq, and, desc, isNotNull } from "drizzle-orm";
import { ensureSeeded } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/history — recent finished matches with predicted vs actual outcome
export async function GET(req: Request) {
  await ensureSeeded();
  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "40") || 40);

  const homeT = teams;
  const rows = await db
    .select({
      id: matches.id,
      kickoffAt: matches.kickoffAt,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      leagueName: leagues.name,
      leagueLogo: leagues.logo,
      markets: predictions.markets,
    })
    .from(matches)
    .innerJoin(predictions, eq(matches.id, predictions.matchId))
    .innerJoin(leagues, eq(matches.leagueId, leagues.id))
    .where(and(eq(matches.status, "finished"), isNotNull(matches.homeScore)))
    .orderBy(desc(matches.kickoffAt))
    .limit(limit);

  const teamIds = Array.from(new Set(rows.flatMap((r) => [r.homeTeamId, r.awayTeamId])));
  const teamRows = teamIds.length
    ? await db.select({ id: teams.id, name: teams.name, logo: teams.logo }).from(teams).where(
        // inArray
        (await import("drizzle-orm")).inArray(teams.id, teamIds)
      )
    : [];
  const teamById = new Map(teamRows.map((t) => [t.id, t]));

  let correct = 0;
  let total = 0;

  const items = rows.map((r) => {
    const home = teamById.get(r.homeTeamId);
    const away = teamById.get(r.awayTeamId);
    const m = r.markets;

    const actual = r.homeScore! > r.awayScore! ? "home" : r.homeScore! === r.awayScore! ? "draw" : "away";
    const predicted =
      m.homeWin >= m.draw && m.homeWin >= m.awayWin ? "home" : m.draw >= m.awayWin ? "draw" : "away";
    const isCorrect = predicted === actual;
    total++;
    if (isCorrect) correct++;

    const predProb =
      predicted === "home" ? m.homeWin : predicted === "draw" ? m.draw : m.awayWin;

    return {
      id: r.id,
      kickoffAt: r.kickoffAt.toISOString(),
      league: { name: r.leagueName, logo: r.leagueLogo },
      homeTeam: home?.name ?? "?",
      awayTeam: away?.name ?? "?",
      homeLogo: home?.logo ?? null,
      awayLogo: away?.logo ?? null,
      score: `${r.homeScore}-${r.awayScore}`,
      predicted,
      actual,
      correct: isCorrect,
      confidence: Math.round(predProb * 100),
    };
  });

  return NextResponse.json({
    items,
    summary: { total, correct, accuracy: total ? correct / total : 0 },
  });
}
