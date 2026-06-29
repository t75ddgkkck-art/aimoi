import { NextResponse } from "next/server";
import { seedDatabase } from "@/lib/seed";
import { finishRefresh, getRefreshState, startRefresh } from "@/lib/refresh-state";

export const dynamic = "force-dynamic";

// POST /api/refresh — Trigger asynchronous fetch in background to avoid client timeouts
export async function POST() {
  const start = Date.now();
  const state = getRefreshState();

  if (state.running) {
    return NextResponse.json({
      ok: true,
      alreadyRunning: true,
      message: "Actualisation des données réelles déjà en cours.",
      startedAt: state.startedAt,
      durationMs: Date.now() - start,
    });
  }

  startRefresh();
  try {
    const result = await seedDatabase();
    finishRefresh();
    return NextResponse.json({
      ok: true,
      message: "Actualisation terminée avec données réelles uniquement.",
      ...result,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    finishRefresh(err);
    return NextResponse.json(
      { ok: false, error: String(err), durationMs: Date.now() - start },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
