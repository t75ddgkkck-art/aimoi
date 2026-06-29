import { db } from "@/db";
import { matches, teams, leagues } from "@/db/schema";
import { eq, and, gte, inArray } from "drizzle-orm";
import * as oddsApi from "@/lib/apis/odds-api";
import { matchTeamNames } from "@/lib/team-matcher";

// Map The Odds API sport keys to our internal league codes
const SPORT_KEY_TO_LEAGUE: Record<string, string> = {
  soccer_epl: "PL",
  soccer_spain_la_liga: "LL",
  soccer_italy_serie_a: "SA",
  soccer_germany_bundesliga: "BL1",
  soccer_france_ligue_one: "FL1",
  soccer_uefa_champs_league: "UCL",
  soccer_fifa_world_cup: "WC",
  soccer_efl_champ: "ELC",
  soccer_england_league1: "EL1",
  soccer_england_league2: "EL2",
  soccer_netherlands_eredivisie: "NL1",
  soccer_portugal_primeira_liga: "PT1",
  soccer_turkey_super_league: "TR1",
  soccer_brazil_campeonato: "BR1",
  soccer_brazil_serie_b: "BRB",
  soccer_norway_eliteserien: "NO1",
  soccer_sweden_allsvenskan: "SE1",
  soccer_conmebol_copa_libertadores: "CLIB",
  soccer_conmebol_copa_sudamericana: "CSUD",
  soccer_china_superleague: "CSL",
  soccer_korea_kleague1: "KL1",
  soccer_league_of_ireland: "IRL1",
  soccer_finland_veikkausliiga: "FIN1",
  soccer_germany_dfb_pokal: "DFBP",
  soccer_england_efl_cup: "EFLC",
};

/**
 * Fetches real bookmaker odds from The Odds API and attaches them to upcoming
 * matches via fuzzy team-name matching. This makes value-bets and the
 * match-fixing detector reliable (real market vs our model).
 */
// Exposes per-match bookmaker dispersion + count for the fixing detector.
export const oddsMeta = new Map<number, { dispersion: number; bookmakerCount: number }>();

export async function syncRealOdds(): Promise<{ updated: number; events: number; markets: string[] }> {
  if (!oddsApi.isEnabled()) return { updated: 0, events: 0, markets: [] };

  const now = new Date();
  let updated = 0;
  let totalEvents = 0;
  const usedKeys: string[] = [];

  // Preload upcoming matches grouped by league for fast fuzzy matching
  const leagueRows = await db.select().from(leagues);
  const leagueByCode = new Map(leagueRows.map((l) => [l.code, l]));

  for (const [sportKey, leagueCode] of Object.entries(SPORT_KEY_TO_LEAGUE)) {
    const league = leagueByCode.get(leagueCode);
    if (!league) continue;

    let events: oddsApi.OddsEvent[] = [];
    try {
      events = await oddsApi.getUpcomingOdds(sportKey, "eu", "h2h");
    } catch {
      continue;
    }
    if (!events.length) continue;
    usedKeys.push(sportKey);
    totalEvents += events.length;

    // Load upcoming DB matches for this league
    const dbMatches = await db
      .select({
        id: matches.id,
        homeTeamId: matches.homeTeamId,
        awayTeamId: matches.awayTeamId,
        kickoffAt: matches.kickoffAt,
      })
      .from(matches)
      .where(and(eq(matches.leagueId, league.id), gte(matches.kickoffAt, new Date(now.getTime() - 6 * 3600_000))));

    if (!dbMatches.length) continue;

    const teamIds = Array.from(new Set(dbMatches.flatMap((m) => [m.homeTeamId, m.awayTeamId])));
    const teamRows = await db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, teamIds));
    const teamName = new Map(teamRows.map((t) => [t.id, t.name]));

    for (const ev of events) {
      const avg = oddsApi.averageOdds(ev);
      if (!avg) continue;

      const evKick = new Date(ev.commence_time).getTime();

      // Find the best DB match: same teams (fuzzy) + kickoff within 36h
      let best: { id: number; score: number } | null = null;
      for (const dm of dbMatches) {
        const hName = teamName.get(dm.homeTeamId) ?? "";
        const aName = teamName.get(dm.awayTeamId) ?? "";
        const hs = matchTeamNames(hName, ev.home_team);
        const as = matchTeamNames(aName, ev.away_team);
        const timeDiff = Math.abs(dm.kickoffAt.getTime() - evKick);
        if (hs > 0.7 && as > 0.7 && timeDiff < 36 * 3600_000) {
          const score = hs + as - timeDiff / (72 * 3600_000);
          if (!best || score > best.score) best = { id: dm.id, score };
        }
      }

      if (best) {
        // Compute bookmaker dispersion (std-dev of home implied prob) — a key
        // signal for the match-fixing detector. High disagreement = suspicious.
        const homePrices: number[] = [];
        for (const bm of ev.bookmakers) {
          const h2h = bm.markets.find((mk) => mk.key === "h2h");
          const ho = h2h?.outcomes.find((o) => o.name === ev.home_team);
          if (ho?.price && ho.price > 1) homePrices.push(1 / ho.price);
        }
        let dispersion = 0;
        if (homePrices.length > 1) {
          const mean = homePrices.reduce((s, v) => s + v, 0) / homePrices.length;
          const variance = homePrices.reduce((s, v) => s + (v - mean) ** 2, 0) / homePrices.length;
          dispersion = Math.sqrt(variance);
        }

        // Store opening odds the first time we see this match (for line-movement detection)
        const cur = await db
          .select({ opening: matches.openingHomeOdds })
          .from(matches)
          .where(eq(matches.id, best.id))
          .limit(1);
        const setObj: Record<string, unknown> = {
          homeOdds: avg.home,
          drawOdds: avg.draw,
          awayOdds: avg.away,
        };
        if (cur[0] && cur[0].opening == null) {
          setObj.openingHomeOdds = avg.home;
        }
        // Persist dispersion + bookmaker count via closing field reuse isn't ideal;
        // we expose them through the returned map for the risk computation instead.
        oddsMeta.set(best.id, { dispersion, bookmakerCount: ev.bookmakers.length });

        await db.update(matches).set(setObj).where(eq(matches.id, best.id));
        updated++;
      }
    }
  }

  return { updated, events: totalEvents, markets: usedKeys };
}
