import { NextResponse } from "next/server";
import { refreshUpcomingPredictions } from "@/lib/refresh-predictions";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await refreshUpcomingPredictions();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
