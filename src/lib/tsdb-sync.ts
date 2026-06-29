import { db } from "@/db";
import { leagues, teams, matches, predictions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import * as tsdb from "@/lib/apis/thesportsdb";
import { findBestTeamMatch, normalizeTeamName } from "@/lib/team-matcher";
import { predictMatch, seededOdds, type MatchInput } from "@/lib/ml";
import { getLeagueConfig } from "@/lib/league-config";
import { getNationalElo, nationalStrengths } from "@/lib/national-ratings";

// Map common TheSportsDB league names to our internal codes
const TSDB_LEAGUE_TO_CODE: Record<string, string> = {
  "English Premier League": "PL",
  "Spanish La Liga": "LL",
  "Italian Serie A": "SA",
  "German Bundesliga": "BL1",
  "French Ligue 1": "FL1",
  "UEFA Champions League": "UCL",
  "FIFA World Cup": "WC",
  "English League Championship": "ELC",
  "Dutch Eredivisie": "NL1",
  "Portuguese Primeira Liga": "PT1",
  "Turkish Super Lig": "TR1",
};

const CODE_META: Record<string, { name: string; country: string; logo: string }> = {
  PL: { name: "Premier League", country: "England", logo: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  LL: { name: "La Liga", country: "Spain", logo: "🇪🇸" },
  SA: { name: "Serie A", country: "Italy", logo: "🇮🇹" },
  BL1: { name: "Bundesliga", country: "Germany", logo: "🇩🇪" },
  FL1: { name: "Ligue 1", country: "France", logo: "🇫🇷" },
  UCL: { name: "UEFA Champions League", country: "Europe", logo: "🇪🇺" },
  WC: { name: "FIFA World Cup 2026", country: "World", logo: "🏆" },
  ELC: { name: "Championship", country: "England", logo: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  NL1: { name: "Eredivisie", country: "Netherlands", logo: "🇳🇱" },
  PT1: { name: "Primeira Liga", country: "Portugal", logo: "🇵🇹" },
  TR1: { name: "Süper Lig", country: "Turkey", logo: "🇹🇷" },
};

const LIVE_STATUSES = new Set(["1H", "2H", "HT", "ET", "P", "BT", "LIVE"]);
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN", "Match Finished"]);

function mapStatus(s?: string | null): string {
  if (!s) return "scheduled";
  if (FINISHED_STATUSES.has(s)) return "finished";
  if (LIVE_STATUSES.has(s)) return "live";
  return "scheduled";
}

async function ensureLeague(code: string): Promise<number | null> {
  const meta = CODE_META[code];
  if (!meta) return null;
  const existing = await db.select({ id: leagues.id }).from(leagues).where(eq(leagues.code, code)).limit(1);
  if (existing[0]) return existing[0].id;
  const [created] = await db
    .insert(leagues)
    .values({ name: meta.name, country: meta.country, code, logo: meta.logo, season: "2025-26", isActive: true })
    .onConflictDoUpdate({ target: leagues.code, set: { name: meta.name } })
    .returning({ id: leagues.id });
  return created.id;
}

// Generate a stable short code for ANY league name (for broad coverage).
function leagueCodeFromName(name: string): string {
  return ("TSDB-" + name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14)).slice(0, 20);
}

async function ensureDynamicLeague(name: string, country: string): Promise<number | null> {
  const code = leagueCodeFromName(name);
  const existing = await db.select({ id: leagues.id }).from(leagues).where(eq(leagues.code, code)).limit(1);
  if (existing[0]) return existing[0].id;
  const [created] = await db
    .insert(leagues)
    .values({ name: name.slice(0, 120), country: (country || "World").slice(0, 60), code, logo: "⚽", season: "2025-26", isActive: true })
    .onConflictDoUpdate({ target: leagues.code, set: { name: name.slice(0, 120) } })
    .returning({ id: leagues.id });
  return created.id;
}

async function resolveTeam(leagueId: number, name: string, country: string, isWC: boolean): Promise<number> {
  const list = await db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.leagueId, leagueId));
  const matched = findBestTeamMatch(name, list);
  if (matched) return Number(matched.id);
  const norm = normalizeTeamName(name);
  const elo = isWC ? getNationalElo(norm) : 1500;
  const str = isWC ? nationalStrengths(elo) : { attack: 1.0, defense: 1.0 };
  const [created] = await db
    .insert(teams)
    .values({
      name: norm, shortName: norm.slice(0, 4).toUpperCase(), country, leagueId,
      elo, attackStrength: str.attack, defenseStrength: str.defense,
      logo: isWC ? "🏳️" : "⚽", position: 10, points: 0, goalDifference: 0,
    })
    .onConflictDoUpdate({ target: [teams.leagueId, teams.name], set: { name: norm } })
    .returning({ id: teams.id });
  return created.id;
}

/**
 * Fills today's & tomorrow's matches (and live scores) from TheSportsDB — a free
 * public source with broad coverage — to complement football-data.org.
 */
export async function syncTodayFromTSDB(): Promise<{ added: number; updated: number; live: number }> {
  let added = 0, updated = 0, live = 0;

  const days: string[] = [];
  const now = new Date();
  for (let i = -1; i <= 2; i++) {
    const d = new Date(now.getTime() + i * 24 * 3600_000);
    days.push(d.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }));
  }

  for (const day of days) {
    let events: tsdb.TSDEvent[] = [];
    try {
      events = await tsdb.getEventsByDay(day);
    } catch {
      continue;
    }

    for (const ev of events) {
      if (!ev.strHomeTeam || !ev.strAwayTeam || !ev.strLeague) continue;

      // Map to a tracked league when possible; otherwise create a dynamic league
      // so we cover ALL soccer (small leagues, night games, etc.).
      const code = TSDB_LEAGUE_TO_CODE[ev.strLeague];
      const isWC = code === "WC";
      const meta = code ? CODE_META[code] : { country: ev.strCountry || "World" } as any;
      const leagueId = code
        ? await ensureLeague(code)
        : await ensureDynamicLeague(ev.strLeague, (ev as any).strCountry || "World");
      if (!leagueId) continue;

      const homeId = await resolveTeam(leagueId, ev.strHomeTeam, meta.country ?? "World", isWC);
      const awayId = await resolveTeam(leagueId, ev.strAwayTeam, meta.country ?? "World", isWC);

      const kickoff = ev.strTimestamp
        ? new Date(ev.strTimestamp.endsWith("Z") ? ev.strTimestamp : ev.strTimestamp + "Z")
        : new Date(`${ev.dateEvent}T${ev.strTime ?? "18:00:00"}Z`);
      if (isNaN(kickoff.getTime())) continue;

      const status = mapStatus(ev.strStatus);
      const homeScore = ev.intHomeScore != null ? parseInt(ev.intHomeScore) : null;
      const awayScore = ev.intAwayScore != null ? parseInt(ev.intAwayScore) : null;
      if (status === "live") live++;

      // Real live minute from TheSportsDB progress field (more accurate than estimate).
      let minute: number | null = null;
      if (status === "live") {
        const prog = ev.strProgress ? parseInt(ev.strProgress.replace(/[^0-9]/g, "")) : NaN;
        if (Number.isFinite(prog) && prog > 0 && prog <= 130) minute = prog;
        else {
          const elapsed = Math.floor((Date.now() - kickoff.getTime()) / 60000);
          minute = Math.max(1, Math.min(90, elapsed > 60 ? elapsed - 15 : elapsed));
        }
      }

      const existing = await db
        .select({ id: matches.id, status: matches.status })
        .from(matches)
        .where(and(eq(matches.homeTeamId, homeId), eq(matches.awayTeamId, awayId), eq(matches.kickoffAt, kickoff)))
        .limit(1);

      if (existing[0]) {
        await db.update(matches).set({ status, homeScore, awayScore, ...(minute != null ? { minute } : {}) }).where(eq(matches.id, existing[0].id));
        updated++;
      } else {
        const odds = seededOdds(0, 0, homeId * 31 + awayId * 17);
        const [created] = await db
          .insert(matches)
          .values({
            leagueId, homeTeamId: homeId, awayTeamId: awayId, kickoffAt: kickoff,
            status, matchday: ev.intRound ? parseInt(ev.intRound) : 1,
            homeScore, awayScore, minute, homeOdds: odds.home, drawOdds: odds.draw, awayOdds: odds.away,
          })
          .onConflictDoUpdate({
            target: [matches.homeTeamId, matches.awayTeamId, matches.kickoffAt],
            set: { status, homeScore, awayScore, ...(minute != null ? { minute } : {}) },
          })
          .returning({ id: matches.id });
        added++;

        // Generate a prediction for new scheduled matches
        if (status === "scheduled") {
          const config = getLeagueConfig(code);
          const input: MatchInput = {
            home: { elo: isWC ? getNationalElo(ev.strHomeTeam) : 1500, attackStrength: 1.0, defenseStrength: 1.0, homeAdvantage: isWC ? 0 : 0.25 },
            away: { elo: isWC ? getNationalElo(ev.strAwayTeam) : 1500, attackStrength: 1.0, defenseStrength: 1.0, homeAdvantage: 0 },
            leagueAvgGoals: config.avgGoals,
            homeAdvantageBase: isWC ? 0 : 0.15,
            odds, leagueCode: code, sampleSize: 10,
          };
          const pred = predictMatch(input);
          await db.insert(predictions).values({
            matchId: created.id,
            markets: {
              homeWin: pred.homeWin, draw: pred.draw, awayWin: pred.awayWin,
              over15: pred.over15, over25: pred.over25, over35: pred.over35,
              bttsYes: pred.bttsYes, bttsNo: pred.bttsNo,
              expectedHomeGoals: pred.expectedHomeGoals, expectedAwayGoals: pred.expectedAwayGoals,
              exactScores: pred.exactScores, confidence: pred.confidence,
            },
            valueBets: pred.valueBets,
            modelVersion: "tsdb-dixon-coles",
          }).onConflictDoNothing();
        }
      }
    }
  }

  return { added, updated, live };
}
