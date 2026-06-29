import { NextResponse } from "next/server";
import { recomputeTeamStrengths } from "@/lib/recompute-strengths";
import { refreshUpcomingPredictions } from "@/lib/refresh-predictions";
import { syncRealXG } from "@/lib/xg-sync";

export const dynamic = "force-dynamic";

// Recompute strengths from history → overlay real xG → refresh predictions.
export async function POST() {
  try {
    const strengths = await recomputeTeamStrengths();
    const xg = await syncRealXG().catch((e) => ({ leagues: 0, teamsUpdated: 0, error: String(e) }));
    const preds = await refreshUpcomingPredictions();
    return NextResponse.json({ ok: true, strengths, xg, predictions: preds });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
