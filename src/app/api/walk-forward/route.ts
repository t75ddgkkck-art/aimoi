import { NextResponse } from "next/server";
import { walkForwardBacktest } from "@/lib/walk-forward";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const report = await walkForwardBacktest();
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
