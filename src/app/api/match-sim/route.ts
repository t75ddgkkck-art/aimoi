import { NextResponse } from "next/server";
import { db } from "@/db";
import { matches, predictions, teams, leagues } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runMatchMonteCarlo } from "@/lib/monte-carlo";

export const dynamic = "force-dynamic";

// GET /api/match-sim?id=123 — Run 10,000 path Monte Carlo for a specific match
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get("id");

  if (!matchId) {
    return NextResponse.json({ error: "Match ID required" }, { status: 400 });
  }

  const [match] = await db
    .select({
      id: matches.id,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      predHomeGoals: predictions.markets,
    })
    .from(matches)
    .innerJoin(predictions, eq(matches.id, predictions.matchId))
    .where(eq(matches.id, parseInt(matchId)))
    .limit(1);

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const [homeTeam, awayTeam] = await Promise.all([
    db.select().from(teams).where(eq(teams.id, match.homeTeamId)).limit(1),
    db.select().from(teams).where(eq(teams.id, match.awayTeamId)).limit(1),
  ]);

  const homeXg = match.predHomeGoals.expectedHomeGoals;
  const awayXg = match.predHomeGoals.expectedAwayGoals;

  // Run 10,000 simulations
  const result = runMatchMonteCarlo(homeXg, awayXg, 10000);

  return NextResponse.json({
    matchId: match.id,
    homeTeam: homeTeam[0]?.name,
    awayTeam: awayTeam[0]?.name,
    expectedGoals: { home: homeXg, away: awayXg },
    simulations: 10000,
    probabilities: {
      homeWin: result.homeWin,
      draw: result.draw,
      awayWin: result.awayWin,
      over25: result.over25,
      btts: result.btts,
    },
    topScores: result.exactScores,
  });
}
