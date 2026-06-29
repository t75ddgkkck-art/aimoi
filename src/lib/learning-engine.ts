import "server-only";
import { db } from "@/db";
import { matches, predictions, leagueCalibration, learningLogs } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * ELITE REINFORCEMENT LEARNING BRAIN v2.0
 * Analyzes past errors and updates league-specific biases (Attack, Defense, Rho).
 */
export async function runNightlyLearningSession() {
  console.log("[learning] Starting elite self-optimization session...");

  // 1. Get all matches finished in the last 14 days for better statistical significance
  const recentResults = await db
    .select({
      id: matches.id,
      leagueCode: sql<string>`leagues.code`,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      predHomeGoals: sql<number>`(predictions.markets->>'expectedHomeGoals')::numeric`,
      predAwayGoals: sql<number>`(predictions.markets->>'expectedAwayGoals')::numeric`,
      predHomeWin: sql<number>`(predictions.markets->>'homeWin')::numeric`,
      actualHomeWin: sql<number>`CASE WHEN matches.home_score > matches.away_score THEN 1 ELSE 0 END`,
      predDraw: sql<number>`(predictions.markets->>'draw')::numeric`,
      actualDraw: sql<number>`CASE WHEN matches.home_score = matches.away_score THEN 1 ELSE 0 END`,
    })
    .from(matches)
    .innerJoin(predictions, eq(matches.id, predictions.matchId))
    .innerJoin(sql`leagues`, sql`matches.league_id = leagues.id`)
    .where(sql`matches.status = 'finished' AND matches.kickoff_at > NOW() - INTERVAL '14 days'`);

  if (recentResults.length === 0) return { status: "no_data" };

  const leagueStats = new Map<string, { errorH: number; errorA: number; errorDraw: number; count: number }>();

  for (const r of recentResults) {
    if (r.homeScore === null || r.awayScore === null) continue;

    const deltaH = r.homeScore - r.predHomeGoals;
    const deltaA = r.awayScore - r.predAwayGoals;
    const deltaDraw = r.actualDraw - r.predDraw;

    const current = leagueStats.get(r.leagueCode) || { errorH: 0, errorA: 0, errorDraw: 0, count: 0 };
    leagueStats.set(r.leagueCode, {
      errorH: current.errorH + deltaH,
      errorA: current.errorA + deltaA,
      errorDraw: current.errorDraw + deltaDraw,
      count: current.count + 1,
    });
  }

  const adjustments: any[] = [];

  for (const [code, stats] of leagueStats) {
    const avgErrorH = stats.errorH / stats.count;
    const avgErrorA = stats.errorA / stats.count;
    const avgErrorDraw = stats.errorDraw / stats.count;

    // Reinforcement Factor: move bias by 2% of the average error (slower, more stable learning)
    const adjAttack = (avgErrorH + avgErrorA) * 0.02;
    const adjDefense = (avgErrorH - avgErrorA) * 0.02; // If home scores too much and away too little, defense bias needs adjustment
    const adjRho = avgErrorDraw * 0.05; // Adjust correlation for low scores if draw prediction is off

    const [existing] = await db.select().from(leagueCalibration).where(eq(leagueCalibration.leagueCode, code)).limit(1);

    if (existing) {
      const newAttack = Math.max(0.8, Math.min(1.2, existing.attackBias + adjAttack));
      const newDefense = Math.max(0.8, Math.min(1.2, existing.defenseBias + adjDefense));
      const newRho = Math.max(-0.2, Math.min(0.1, existing.rhoBias + adjRho));

      await db
        .update(leagueCalibration)
        .set({
          attackBias: newAttack,
          defenseBias: newDefense,
          rhoBias: newRho,
          lastLearnedAt: new Date(),
        })
        .where(eq(leagueCalibration.leagueCode, code));
      
      adjustments.push({ code, attack: { old: existing.attackBias, new: newAttack }, defense: { old: existing.defenseBias, new: newDefense }, rho: { old: existing.rhoBias, new: newRho } });
    } else {
      await db.insert(leagueCalibration).values({
        leagueCode: code,
        attackBias: 1.0 + adjAttack,
        defenseBias: 1.0 + adjDefense,
        rhoBias: -0.13 + adjRho, // Default PL rho
      });
    }
  }

  await db.insert(learningLogs).values({
    matchesProcessed: recentResults.length,
    adjustmentsMade: adjustments,
  });

  console.log(`[learning] Session complete. Adjusted ${adjustments.length} leagues.`);
  return { status: "success", adjustments };
}

/**
 * Retrieves the dynamic bias for a specific league
 */
export async function getLeagueBias(code: string) {
  const [row] = await db.select().from(leagueCalibration).where(eq(leagueCalibration.leagueCode, code)).limit(1);
  return row || { attackBias: 1.0, defenseBias: 1.0, rhoBias: 1.0 };
}
