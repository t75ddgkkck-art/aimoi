import { NextResponse } from "next/server";
import { generateAndFixMatches } from "@/lib/match-generator";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    console.log("[api/generate] Triggering match generation...");
    const result = await generateAndFixMatches();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[api/generate] Error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
