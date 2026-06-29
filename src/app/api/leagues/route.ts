import { NextResponse } from "next/server";
import { db } from "@/db";
import { leagues, matches } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { ensureSeeded } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  await ensureSeeded();

  const rows = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      code: leagues.code,
      country: leagues.country,
      logo: leagues.logo,
      season: leagues.season,
      matchCount: sql<number>`count(${matches.id})::int`,
    })
    .from(leagues)
    .leftJoin(matches, eq(leagues.id, matches.leagueId))
    .groupBy(leagues.id)
    .orderBy(leagues.name);

  return NextResponse.json({ leagues: rows });
}
