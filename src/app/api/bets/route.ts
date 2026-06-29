import { NextResponse } from "next/server";
import { db } from "@/db";
import { userBets, matches } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function clientIdFrom(req: Request): string | null {
  const url = new URL(req.url);
  const cid = url.searchParams.get("clientId");
  return cid && cid.length >= 6 && cid.length <= 64 ? cid : null;
}

// GET /api/bets?clientId=xxx — list user's bets + ROI summary
export async function GET(req: Request) {
  const clientId = clientIdFrom(req);
  if (!clientId) return NextResponse.json({ bets: [], summary: null });

  // Auto-settle pending bets whose match has finished
  await settlePending(clientId).catch(() => {});

  const bets = await db
    .select()
    .from(userBets)
    .where(eq(userBets.clientId, clientId))
    .orderBy(desc(userBets.createdAt))
    .limit(200);

  let staked = 0, returned = 0, won = 0, lost = 0, pending = 0;
  for (const b of bets) {
    staked += b.stake;
    if (b.status === "won") { returned += b.payout ?? 0; won++; }
    else if (b.status === "lost") { lost++; }
    else if (b.status === "pending") { pending++; }
    else if (b.status === "void") { returned += b.stake; }
  }
  const settledStake = bets.filter((b) => b.status === "won" || b.status === "lost").reduce((s, b) => s + b.stake, 0);
  const profit = returned - (staked - bets.filter((b) => b.status === "pending").reduce((s, b) => s + b.stake, 0));
  const roi = settledStake > 0 ? profit / settledStake : 0;

  return NextResponse.json({
    bets: bets.map((b) => ({ ...b, createdAt: b.createdAt.toISOString(), settledAt: b.settledAt?.toISOString() ?? null })),
    summary: { totalBets: bets.length, staked, returned, profit, roi, won, lost, pending },
  });
}

// POST /api/bets — add a bet
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { clientId, matchId, market, selection, odds, stake } = body;
    if (!clientId || !market || !selection || !odds || !stake) {
      return NextResponse.json({ ok: false, error: "Champs manquants" }, { status: 400 });
    }
    const [created] = await db
      .insert(userBets)
      .values({
        clientId: String(clientId).slice(0, 64),
        matchId: matchId ?? null,
        market: String(market).slice(0, 60),
        selection: String(selection).slice(0, 120),
        odds: Number(odds),
        stake: Number(stake),
        status: "pending",
      })
      .returning();
    return NextResponse.json({ ok: true, bet: created });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// DELETE /api/bets?id=xxx&clientId=yyy — remove a bet
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = parseInt(url.searchParams.get("id") ?? "");
  const clientId = clientIdFrom(req);
  if (!id || !clientId) return NextResponse.json({ ok: false }, { status: 400 });
  await db.delete(userBets).where(and(eq(userBets.id, id), eq(userBets.clientId, clientId)));
  return NextResponse.json({ ok: true });
}

// Settle pending bets based on finished match results (1X2 markets)
async function settlePending(clientId: string) {
  const pending = await db
    .select()
    .from(userBets)
    .where(and(eq(userBets.clientId, clientId), eq(userBets.status, "pending")));

  for (const bet of pending) {
    if (!bet.matchId) continue;
    const [m] = await db.select().from(matches).where(eq(matches.id, bet.matchId)).limit(1);
    if (!m || m.status !== "finished" || m.homeScore == null || m.awayScore == null) continue;

    const outcome = m.homeScore > m.awayScore ? "home" : m.homeScore === m.awayScore ? "draw" : "away";
    const sel = bet.selection.toLowerCase();
    let win: boolean | null = null;

    if (bet.market.includes("Résultat") || bet.market.includes("1X2") || bet.market.includes("Match")) {
      if (sel.includes("nul") || sel === "draw" || sel === "x") win = outcome === "draw";
      else if (sel.includes("domicile") || sel.includes("home")) win = outcome === "home";
      else if (sel.includes("extérieur") || sel.includes("away")) win = outcome === "away";
      else {
        // selection is a team name
        // crude: home win if selection roughly matches and home won
        win = null;
      }
    } else if (bet.market.toLowerCase().includes("but") || bet.market.toLowerCase().includes("over")) {
      const total = m.homeScore + m.awayScore;
      if (sel.includes("1,5") || sel.includes("1.5")) win = total > 1;
      else if (sel.includes("2,5") || sel.includes("2.5")) win = total > 2;
      else if (sel.includes("3,5") || sel.includes("3.5")) win = total > 3;
    } else if (bet.market.toLowerCase().includes("marquent") || bet.market.toLowerCase().includes("btts")) {
      win = m.homeScore > 0 && m.awayScore > 0;
    }

    if (win === null) continue;
    await db
      .update(userBets)
      .set({
        status: win ? "won" : "lost",
        payout: win ? Math.round(bet.stake * bet.odds * 100) / 100 : 0,
        settledAt: new Date(),
      })
      .where(eq(userBets.id, bet.id));
  }
}
