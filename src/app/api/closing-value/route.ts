import { NextResponse } from "next/server";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { and, eq, gte, isNotNull } from "drizzle-orm";
import { ensureSeeded } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

// GET /api/closing-value — Returns the AI's edge against the market (CLV)
export async function GET() {
  await ensureSeeded();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

  // Find finished matches with both opening and closing odds recorded
  const results = await db
    .select({
      id: matches.id,
      homeTeam: matches.homeTeamId,
      awayTeam: matches.awayTeamId,
      opening: matches.openingHomeOdds,
      closing: matches.closingHomeOdds,
    })
    .from(matches)
    .where(
      and(
        eq(matches.status, "finished"),
        isNotNull(matches.openingHomeOdds),
        isNotNull(matches.closingHomeOdds),
        gte(matches.kickoffAt, thirtyDaysAgo)
      )
    );

  let totalEdge = 0;
  let beatCount = 0;
  let totalMatches = results.length;

  for (const r of results) {
    // Edge = (Cote d'ouverture IA - Cote de fermeture réelle)
    // Si l'IA a misé sur une cote d'ouverture plus haute que la cote de fermeture, elle a "battu" le marché.
    if (r.opening && r.closing && r.opening > r.closing) {
      totalEdge += (r.opening - r.closing);
      beatCount++;
    }
  }

  const averageEdge = totalMatches > 0 ? totalEdge / totalMatches : 0;
  const beatRate = totalMatches > 0 ? beatCount / totalMatches : 0;

  return NextResponse.json({
    period: "30 days",
    matchesAnalyzed: totalMatches,
    aiBeatMarketRate: Math.round(beatRate * 100),
    averageEdgePerMatch: Math.round(averageEdge * 100) / 100,
    verdict: beatRate > 0.5 
      ? "L'IA bat le marché sur le long terme." 
      : "L'IA est en phase de calibration."
  });
}
