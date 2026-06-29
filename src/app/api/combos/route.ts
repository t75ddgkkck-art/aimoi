import { NextResponse } from "next/server";
import { db } from "@/db";
import { matches, predictions, teams, leagues } from "@/db/schema";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { ensureSeeded } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export interface ComboItem {
  matchId: number;
  kickoffAt: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string | null;
  awayLogo: string | null;
  leagueName: string;
  leagueLogo: string | null;
  market: string;
  selection: string;
  odds: number;
  prob: number;
}

export interface ComboTicket {
  id: string;
  titleKey: string;
  descKey: string;
  items: ComboItem[];
  totalOdds: number;
  totalProb: number;
  totalEv: number;
  kellyStake: number;
  earliestKickoff: string;
  latestKickoff: string;
}

export async function GET() {
  await ensureSeeded();

  const now = new Date();

  const rows = await db
    .select({
      id: matches.id,
      kickoffAt: matches.kickoffAt,
      leagueName: leagues.name,
      leagueLogo: leagues.logo,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeOdds: matches.homeOdds,
      drawOdds: matches.drawOdds,
      awayOdds: matches.awayOdds,
      status: matches.status,
    })
    .from(matches)
    .innerJoin(leagues, eq(matches.leagueId, leagues.id))
    .where(and(eq(matches.status, "scheduled"), gte(matches.kickoffAt, now)))
    .orderBy(asc(matches.kickoffAt));

  if (rows.length < 2) {
    return NextResponse.json({ combos: [] });
  }

  const matchIds = rows.map((r) => r.id);
  const teamIds = Array.from(new Set(rows.flatMap((r) => [r.homeTeamId, r.awayTeamId])));

  const [preds, teamRows] = await Promise.all([
    db.select().from(predictions).where(inArray(predictions.matchId, matchIds)),
    db.select().from(teams).where(inArray(teams.id, teamIds)),
  ]);

  const predByMatch = new Map(preds.map((p) => [p.matchId, p]));
  const teamById = new Map(teamRows.map((t) => [t.id, t]));

  // Build, for each match, its single BEST pick per category to avoid duplicates.
  type MatchPicks = {
    base: Omit<ComboItem, "market" | "selection" | "odds" | "prob">;
    best1x2?: ComboItem;
    overGoals?: ComboItem;
    btts?: ComboItem;
    valueBet?: ComboItem;
  };
  const matchPicks: MatchPicks[] = [];

  for (const r of rows) {
    const p = predByMatch.get(r.id);
    const home = teamById.get(r.homeTeamId);
    const away = teamById.get(r.awayTeamId);
    if (!p || !home || !away) continue;
    const m = p.markets;

    const base = {
      matchId: r.id,
      kickoffAt: r.kickoffAt.toISOString(),
      homeTeam: home.name,
      awayTeam: away.name,
      homeLogo: home.logo,
      awayLogo: away.logo,
      leagueName: r.leagueName,
      leagueLogo: r.leagueLogo,
    };

    const picks: MatchPicks = { base };

    // Best 1X2 pick (highest prob with real odds)
    const opts: ComboItem[] = [];
    if (r.homeOdds) opts.push({ ...base, market: "Résultat du match", selection: `Victoire ${home.name}`, odds: r.homeOdds, prob: m.homeWin });
    if (r.drawOdds) opts.push({ ...base, market: "Résultat du match", selection: "Match nul", odds: r.drawOdds, prob: m.draw });
    if (r.awayOdds) opts.push({ ...base, market: "Résultat du match", selection: `Victoire ${away.name}`, odds: r.awayOdds, prob: m.awayWin });
    if (opts.length) picks.best1x2 = opts.sort((a, b) => b.prob - a.prob)[0];

    // ONE goals pick per match (prefer Over 1.5 as the safe leg)
    picks.overGoals = { ...base, market: "Nombre de buts", selection: "Plus de 1,5 but", odds: 1.25, prob: m.over15 };

    // BTTS pick
    if (m.bttsYes != null) {
      picks.btts = { ...base, market: "Les deux marquent", selection: "Oui", odds: 1.7, prob: m.bttsYes };
    }

    // Best real value bet — normalize legacy English labels to readable French
    const vbs = p.valueBets ?? [];
    if (vbs.length) {
      const v = vbs[0];
      const sel =
        v.selection === "Home Win" ? `Victoire ${home.name}` :
        v.selection === "Away Win" ? `Victoire ${away.name}` :
        v.selection === "Draw" ? "Match nul" : v.selection;
      picks.valueBet = { ...base, market: "Résultat du match", selection: sel, odds: v.odds, prob: v.modelProb };
    }

    matchPicks.push(picks);
  }

  const combos: ComboTicket[] = [];
  const usedMatchesGlobal = new Set<number>();

  // Build a ticket by picking the best legs across DIFFERENT matches, each match
  // contributing AT MOST ONE selection. This guarantees no duplicate markets.
  function buildTicket(
    id: string,
    titleKey: string,
    descKey: string,
    pickFn: (mp: MatchPicks) => ComboItem | undefined,
    opts: { minProb: number; legs: number; kelly: number; avoidGlobal: boolean }
  ) {
    const legPool = matchPicks
      .map(pickFn)
      .filter((c): c is ComboItem => !!c && c.prob >= opts.minProb)
      .sort((a, b) => b.prob - a.prob);

    const selected: ComboItem[] = [];
    const seen = new Set<number>();
    const seenTeams = new Set<string>();
    for (const leg of legPool) {
      if (seen.has(leg.matchId)) continue;
      if (opts.avoidGlobal && usedMatchesGlobal.has(leg.matchId)) continue;
      // Avoid the same team appearing twice in one ticket
      if (seenTeams.has(leg.homeTeam) || seenTeams.has(leg.awayTeam)) continue;
      selected.push(leg);
      seen.add(leg.matchId);
      seenTeams.add(leg.homeTeam);
      seenTeams.add(leg.awayTeam);
      if (selected.length >= opts.legs) break;
    }

    if (selected.length < 2) return;

    selected.forEach((s) => usedMatchesGlobal.add(s.matchId));

    const totalOdds = selected.reduce((s, c) => s * c.odds, 1);
    const totalProb = selected.reduce((s, c) => s * c.prob, 1);
    const totalEv = selected.reduce((s, c) => s + (c.prob * c.odds - 1), 0) / selected.length;
    const kellyStake = Math.max(0, (totalProb * totalOdds - 1) / (totalOdds - 1)) * opts.kelly;

    const kicks = selected.map((s) => new Date(s.kickoffAt).getTime());

    combos.push({
      id,
      titleKey,
      descKey,
      items: selected,
      totalOdds: Math.round(totalOdds * 100) / 100,
      totalProb: Math.round(totalProb * 1000) / 1000,
      totalEv: Math.round(totalEv * 1000) / 1000,
      kellyStake: Math.round(kellyStake * 1000) / 1000,
      earliestKickoff: new Date(Math.min(...kicks)).toISOString(),
      latestKickoff: new Date(Math.max(...kicks)).toISOString(),
    });
  }

  // Build a varied ticket: ONE 1X2 leg + ONE goals leg + ONE BTTS leg, each from
  // a different match. Guarantees market diversity (the user's request).
  function buildMixedTicket() {
    const usedMatches = new Set<number>();
    const usedTeams = new Set<string>();
    const legs: ComboItem[] = [];

    const pickFrom = (getter: (mp: MatchPicks) => ComboItem | undefined, minProb: number) => {
      const pool = matchPicks
        .map(getter)
        .filter((c): c is ComboItem => !!c && c.prob >= minProb)
        .sort((a, b) => b.prob - a.prob);
      for (const leg of pool) {
        if (usedMatches.has(leg.matchId)) continue;
        if (usedTeams.has(leg.homeTeam) || usedTeams.has(leg.awayTeam)) continue;
        usedMatches.add(leg.matchId);
        usedTeams.add(leg.homeTeam);
        usedTeams.add(leg.awayTeam);
        legs.push(leg);
        return;
      }
    };

    pickFrom((mp) => mp.best1x2, 0.5);
    pickFrom((mp) => mp.overGoals, 0.75);
    pickFrom((mp) => mp.btts, 0.5);

    if (legs.length < 2) return;
    const totalOdds = legs.reduce((s, c) => s * c.odds, 1);
    const totalProb = legs.reduce((s, c) => s * c.prob, 1);
    const totalEv = legs.reduce((s, c) => s + (c.prob * c.odds - 1), 0) / legs.length;
    const kicks = legs.map((s) => new Date(s.kickoffAt).getTime());
    legs.forEach((s) => usedMatchesGlobal.add(s.matchId));
    combos.push({
      id: "mixed-1",
      titleKey: "combo.moderate",
      descKey: "combo.moderate.desc",
      items: legs,
      totalOdds: Math.round(totalOdds * 100) / 100,
      totalProb: Math.round(totalProb * 1000) / 1000,
      totalEv: Math.round(totalEv * 1000) / 1000,
      kellyStake: Math.round(Math.max(0, (totalProb * totalOdds - 1) / (totalOdds - 1)) * 0.08 * 1000) / 1000,
      earliestKickoff: new Date(Math.min(...kicks)).toISOString(),
      latestKickoff: new Date(Math.max(...kicks)).toISOString(),
    });
  }

  // 1. SAFE — best 1X2 favourites (high prob), 3 legs
  buildTicket("safe-1", "combo.safe", "combo.safe.desc", (mp) => mp.best1x2, { minProb: 0.6, legs: 3, kelly: 0.15, avoidGlobal: false });
  // 2. GOALS — Over 1.5 accumulator (kept, it's a real popular bet type), 3 legs
  buildTicket("goals-1", "combo.safe", "combo.safe.desc", (mp) => mp.overGoals, { minProb: 0.8, legs: 3, kelly: 0.12, avoidGlobal: true });
  // 3. MODERATE — mid-prob 1X2, 3 legs
  buildTicket("moderate-1", "combo.moderate", "combo.moderate.desc", (mp) => mp.best1x2, { minProb: 0.5, legs: 3, kelly: 0.1, avoidGlobal: true });
  // 4. MIXED — varied markets across matches (1X2 + buts + BTTS)
  buildMixedTicket();
  // 5. VALUE — real value bets, 3 legs
  buildTicket("value-1", "combo.speculative", "combo.speculative.desc", (mp) => mp.valueBet, { minProb: 0.0, legs: 3, kelly: 0.06, avoidGlobal: false });

  return NextResponse.json({ combos });
}
