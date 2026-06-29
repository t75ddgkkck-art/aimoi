import { NextResponse } from "next/server";
import { seedDatabase } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await seedDatabase();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Seed error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const result = await seedDatabase();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Seed error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
