import { NextResponse } from "next/server";
import { runNightlyLearningSession } from "@/lib/learning-engine";

export const dynamic = "force-dynamic";

// GET /api/learn — Trigger AI Self-Optimization
export async function GET(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const isAuthorized = authHeader === `Bearer ${process.env.CRON_SECRET}` || process.env.NODE_ENV !== "production";

  if (!isAuthorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runNightlyLearningSession();
    return NextResponse.json({
      ok: true,
      message: "AI has learned from recent results.",
      ...result,
    });
  } catch (err: any) {
    console.error("[learn] Failed:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
