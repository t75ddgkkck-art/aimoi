import { NextResponse } from "next/server";
import { syncLiveMatchesFD } from "@/lib/live-sync-fd";
import { runNightlyLearningSession } from "@/lib/learning-engine";
import { refreshUpcomingPredictions } from "@/lib/refresh-predictions";
import { recomputeTeamStrengths } from "@/lib/recompute-strengths";
import { syncRealXG } from "@/lib/xg-sync";
import { syncRealOdds } from "@/lib/odds-sync";

// Throttle the (paid-quota) real-odds sync to once every 30 min.
let lastOddsSyncAt = 0;
const ODDS_SYNC_INTERVAL_MS = 30 * 60 * 1000;

// Auto-recalibration (recompute strengths + learn + refresh) every 6 hours.
let lastRecalibrateAt = 0;
const RECALIBRATE_INTERVAL_MS = 6 * 60 * 60 * 1000;

export const dynamic = "force-dynamic";

// GET /api/cron — periodic pipeline: live scores + learning + prediction refresh.
// Designed to be called every 1-2 minutes by a scheduler.
export async function GET(req: Request) {
  const start = Date.now();
  const result: Record<string, unknown> = {};

  // Light live-score sync is public (used by the in-app heartbeat) — safe & read-mostly.
  result.live = await syncLiveMatchesFD().catch((e) => ({ error: String(e) }));

  // Real bookmaker odds sync, throttled to protect the monthly quota (500 req/mo).
  if (Date.now() - lastOddsSyncAt > ODDS_SYNC_INTERVAL_MS) {
    lastOddsSyncAt = Date.now();
    result.odds = await syncRealOdds().catch((e) => ({ error: String(e) }));
  }

  const deep = new URL(req.url).searchParams.get("deep") === "1";

  // AUTOMATIC recalibration: runs at most every 6h, triggered by normal traffic
  // (the in-app heartbeat) OR forced via ?deep=1. No external scheduler needed.
  const dueForRecalibration = Date.now() - lastRecalibrateAt > RECALIBRATE_INTERVAL_MS;

  if (deep || dueForRecalibration) {
    // ?deep=1 still requires the cron secret in production (manual forced run).
    if (deep) {
      const authHeader = req.headers.get("Authorization");
      const isAuthorized =
        authHeader === `Bearer ${process.env.CRON_SECRET}` || process.env.NODE_ENV !== "production";
      if (!isAuthorized) {
        return NextResponse.json({ ok: false, error: "Unauthorized for deep run" }, { status: 401 });
      }
    }
    lastRecalibrateAt = Date.now();
    const runRecalibration = async () => {
      await recomputeTeamStrengths().catch((e) => console.warn("[cron] recompute", e));
      await syncRealXG().catch((e) => console.warn("[cron] xg", e));
      await runNightlyLearningSession().catch((e) => console.warn("[cron] learning", e));
      await refreshUpcomingPredictions().catch((e) => console.warn("[cron] refresh", e));
    };

    if (deep) {
      // Forced manual run — await so the caller sees the result.
      result.recalibrated = true;
      result.strengths = await recomputeTeamStrengths().catch((e) => ({ error: String(e) }));
      result.xg = await syncRealXG().catch((e) => ({ error: String(e) }));
      result.learning = await runNightlyLearningSession().catch((e) => ({ error: String(e) }));
      result.predictions = await refreshUpcomingPredictions().catch((e) => ({ error: String(e) }));
    } else {
      // Automatic background run — don't block the heartbeat response.
      result.recalibrationStarted = true;
      void runRecalibration();
    }
  }

  return NextResponse.json({ ok: true, durationMs: Date.now() - start, ...result });
}
