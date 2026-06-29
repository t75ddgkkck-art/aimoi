import { NextResponse } from "next/server";
import { syncRealOdds } from "@/lib/odds-sync";
import { refreshUpcomingPredictions } from "@/lib/refresh-predictions";

export const dynamic = "force-dynamic";

// Sync real bookmaker odds, then refresh predictions/value-bets with them.
export async function POST() {
  try {
    const odds = await syncRealOdds();
    const preds = await refreshUpcomingPredictions();
    return NextResponse.json({ ok: true, odds, predictions: preds });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
