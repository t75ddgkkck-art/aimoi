import { db } from "@/db";
import { leagues, teams, matches, predictions } from "@/db/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { predictMatch, seededOdds, type MatchInput } from "./ml";
import { getLeagueConfig } from "./league-config";

/**
 * Generates realistic upcoming matches for the next 30 days based on existing teams
 * and league structures. Also cleans up old "scheduled" matches that are in the past.
 */
export async function generateAndFixMatches() {
  console.log("[match-generator] Starting match generation and cleanup...");
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // 1. Cleanup: Mark old scheduled matches as finished (with dummy scores if missing) or delete them
  // Actually, let's just move them to "finished" with null scores to keep history, or better, generate results for them.
  // For now, let's just focus on generating new upcoming matches.
  
  // Delete scheduled matches that are in the past (older than 1 day)
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  await db
    .delete(matches)
    .where(and(eq(matches.status, "scheduled"), lte(matches.kickoffAt, oneDayAgo)));
  console.log("[match-generator] Cleaned up old scheduled matches.");

  // 2. Get all active leagues and their teams
  const activeLeagues = await db.select().from(leagues).where(eq(leagues.isActive, true));
  
  let generatedCount = 0;

  for (const league of activeLeagues) {
    // Skip World Cup for now as it has fixed schedule
    if (league.code === "WC") continue;

    const leagueTeams = await db
      .select()
      .from(teams)
      .where(eq(teams.leagueId, league.id));

    if (leagueTeams.length < 2) continue;

    // Get league config for avg goals
    const config = getLeagueConfig(league.code);

    // Generate matches for the next 30 days
    // We'll create ~2-3 matchdays per week
    let currentDate = new Date(now);
    let matchday = 1;

    // Find the last matchday for this league
    const lastMatch = await db
      .select({ matchday: matches.matchday })
      .from(matches)
      .where(eq(matches.leagueId, league.id))
      .orderBy(desc(matches.kickoffAt))
      .limit(1);
    
    if (lastMatch[0]?.matchday) {
      matchday = lastMatch[0].matchday + 1;
    }

    // Generate 4 matchdays (roughly 2 weeks of football)
    for (let md = 0; md < 4; md++) {
      // Shuffle teams for random pairings
      const shuffled = [...leagueTeams].sort(() => 0.5 - Math.random());
      
      for (let i = 0; i < shuffled.length - 1; i += 2) {
        const homeTeam = shuffled[i];
        const awayTeam = shuffled[i + 1];

        // Random date in the next 30 days
        const daysOffset = Math.floor(Math.random() * 30);
        const hoursOffset = 12 + Math.floor(Math.random() * 8); // 12:00 to 20:00
        const kickoff = new Date(now.getTime() + daysOffset * 24 * 60 * 60 * 1000 + hoursOffset * 60 * 60 * 1000);

        // Check if match already exists
        const existing = await db
          .select()
          .from(matches)
          .where(
            and(
              eq(matches.homeTeamId, homeTeam.id),
              eq(matches.awayTeamId, awayTeam.id),
              eq(matches.kickoffAt, kickoff)
            )
          )
          .limit(1);

        if (existing.length > 0) continue;

        const odds = seededOdds((homeTeam.elo - awayTeam.elo) / 200, 0, homeTeam.id * 31 + awayTeam.id * 17);
        
        const [newMatch] = await db
          .insert(matches)
          .values({
            leagueId: league.id,
            homeTeamId: homeTeam.id,
            awayTeamId: awayTeam.id,
            kickoffAt: kickoff,
            status: "scheduled",
            matchday: matchday + md,
            homeOdds: odds.home,
            drawOdds: odds.draw,
            awayOdds: odds.away,
          })
          .returning();

        // Generate prediction
        const input: MatchInput = {
          home: {
            elo: homeTeam.elo,
            attackStrength: homeTeam.attackStrength,
            defenseStrength: homeTeam.defenseStrength,
            homeAdvantage: 0.25,
            formLast5: homeTeam.formLast5 ?? undefined,
            xgScoredAvg: homeTeam.xgScoredAvg ?? undefined,
            xgConcededAvg: homeTeam.xgConcededAvg ?? undefined,
            injuredCount: homeTeam.injuredCount ?? undefined,
          },
          away: {
            elo: awayTeam.elo,
            attackStrength: awayTeam.attackStrength,
            defenseStrength: awayTeam.defenseStrength,
            homeAdvantage: 0,
            formLast5: awayTeam.formLast5 ?? undefined,
            xgScoredAvg: awayTeam.xgScoredAvg ?? undefined,
            xgConcededAvg: awayTeam.xgConcededAvg ?? undefined,
            injuredCount: awayTeam.injuredCount ?? undefined,
          },
          leagueAvgGoals: config.avgGoals,
          homeAdvantageBase: 0.15,
          odds,
          leagueCode: league.code,
          sampleSize: 50,
        };

        const pred = predictMatch(input);

        await db.insert(predictions).values({
          matchId: newMatch.id,
          markets: {
            homeWin: pred.homeWin,
            draw: pred.draw,
            awayWin: pred.awayWin,
            over15: pred.over15,
            over25: pred.over25,
            over35: pred.over35,
            bttsYes: pred.bttsYes,
            bttsNo: pred.bttsNo,
            expectedHomeGoals: pred.expectedHomeGoals,
            expectedAwayGoals: pred.expectedAwayGoals,
            exactScores: pred.exactScores,
            confidence: pred.confidence,
          },
          valueBets: pred.valueBets,
          modelVersion: "dixon-coles-enhanced-v3",
        });

        generatedCount++;
      }
    }
  }

  console.log(`[match-generator] Generated ${generatedCount} new upcoming matches.`);
  return { generated: generatedCount };
}
