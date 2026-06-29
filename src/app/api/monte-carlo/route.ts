import { NextResponse } from "next/server";
import { db } from "@/db";
import { teams, leagues } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runMonteCarloTournament, type SimulatorTeam } from "@/lib/monte-carlo";
import { ensureSeeded } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/monte-carlo — Run 5000 tournament paths for World Cup
export async function GET() {
  await ensureSeeded();

  // Find the FIFA World Cup league
  const [wcLeague] = await db.select().from(leagues).where(eq(leagues.code, "WC")).limit(1);
  if (!wcLeague) {
    return NextResponse.json({ champions: [] });
  }

  // Load all World Cup teams, excluding bracket placeholders (e.g. "W100", "Winner Group A")
  const allWcTeams = await db.select().from(teams).where(eq(teams.leagueId, wcLeague.id));
  const isPlaceholder = (name: string) =>
    /^[wl]\d+$/i.test(name.trim()) || /winner|loser|group|runner|vainqueur|3rd|2nd|1st/i.test(name);
  const wcTeams = allWcTeams.filter((t) => !isPlaceholder(t.name));
  if (wcTeams.length === 0) {
    return NextResponse.json({ champions: [] });
  }

  const simulatorTeams: SimulatorTeam[] = wcTeams.map((t) => ({
    id: t.id,
    name: t.name,
    elo: t.elo,
    attack: t.attackStrength,
    defense: t.defenseStrength,
    logo: t.logo,
  }));

  // Run 5000 path Monte Carlo simulation
  const results = runMonteCarloTournament(simulatorTeams, 5000);

  return NextResponse.json({
    leagueName: wcLeague.name,
    season: wcLeague.season,
    simulatedPaths: 5000,
    champions: results,
  });
}
