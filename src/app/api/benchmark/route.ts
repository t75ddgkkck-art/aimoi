import { NextResponse } from "next/server";
import { runBenchmark } from "@/lib/benchmark";
import { ensureSeeded } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  await ensureSeeded();
  try {
    const report = await runBenchmark();
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
