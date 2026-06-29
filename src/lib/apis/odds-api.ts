// The Odds API — real bookmaker odds from 50+ bookmakers
// Docs: https://the-odds-api.com/liveapi/guides/v4/
// Requires: ODDS_API_KEY env var
// Free tier: 500 requests/month

const BASE = "https://api.the-odds-api.com/v4/sports/soccer";

export interface OddsEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    key: string;
    title: string;
    last_update: string;
    markets: Array<{
      key: string;
      last_update: string;
      outcomes: Array<{ name: string; price: number; point?: number }>;
    }>;
  }>;
}

// Sport keys for major leagues
export const SPORT_KEYS: Record<string, string> = {
  WC: "soccer_fifa_world_cup",
  PL: "soccer_epl",
  LL: "soccer_spain_la_liga",
  SA: "soccer_italy_serie_a",
  BL1: "soccer_germany_bundesliga",
  FL1: "soccer_france_ligue_one",
  UCL: "soccer_uefa_champs_league",
  ELC: "soccer_efl_champ",
  EL1: "soccer_england_league1",
  EL2: "soccer_england_league2",
  NO1: "soccer_norway_eliteserien",
  SE1: "soccer_sweden_allsvenskan",
  BR1: "soccer_brazil_campeonato",
};

export function isEnabled(): boolean {
  return !!process.env.ODDS_API_KEY;
}

export async function getUpcomingOdds(
  sportKey: string,
  regions: "eu" | "uk" | "us" | "au" = "eu",
  markets: string = "h2h"
): Promise<OddsEvent[]> {
  const key = process.env.ODDS_API_KEY;
  if (!key) return [];

  try {
    const url = new URL(`${BASE.replace("/soccer", "")}/${sportKey}/odds`);
    url.searchParams.set("apiKey", key);
    url.searchParams.set("regions", regions);
    url.searchParams.set("markets", markets);
    url.searchParams.set("oddsFormat", "decimal");

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "GoalMind/1.0" },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      console.warn(`[odds-api] ${sportKey} -> ${res.status}`);
      return [];
    }
    return (await res.json()) as OddsEvent[];
  } catch (err) {
    console.warn(`[odds-api] fetch failed: ${sportKey}`, err);
    return [];
  }
}

// Average odds across all bookmakers for 1X2 (h2h market)
export function averageOdds(
  event: OddsEvent
): { home: number; draw: number; away: number } | null {
  const h2hMarkets = event.bookmakers
    .flatMap((bm) => bm.markets)
    .filter((m) => m.key === "h2h");

  if (h2hMarkets.length === 0) return null;

  const sum = { home: 0, draw: 0, away: 0, count: 0 };
  for (const m of h2hMarkets) {
    const home = m.outcomes.find((o) => o.name === event.home_team);
    const draw = m.outcomes.find((o) => o.name === "Draw");
    const away = m.outcomes.find((o) => o.name === event.away_team);
    if (home && draw && away) {
      sum.home += home.price;
      sum.draw += draw.price;
      sum.away += away.price;
      sum.count += 1;
    }
  }

  if (sum.count === 0) return null;
  return {
    home: sum.home / sum.count,
    draw: sum.draw / sum.count,
    away: sum.away / sum.count,
  };
}

// Best odds (highest) across all bookmakers — for finding true value bets
export function bestOdds(
  event: OddsEvent
): { home: number; draw: number; away: number } | null {
  const h2hMarkets = event.bookmakers
    .flatMap((bm) => bm.markets)
    .filter((m) => m.key === "h2h");

  if (h2hMarkets.length === 0) return null;

  const best = { home: 0, draw: 0, away: 0 };
  for (const m of h2hMarkets) {
    const home = m.outcomes.find((o) => o.name === event.home_team);
    const draw = m.outcomes.find((o) => o.name === "Draw");
    const away = m.outcomes.find((o) => o.name === event.away_team);
    if (home) best.home = Math.max(best.home, home.price);
    if (draw) best.draw = Math.max(best.draw, draw.price);
    if (away) best.away = Math.max(best.away, away.price);
  }

  if (best.home === 0 || best.draw === 0 || best.away === 0) return null;
  return best;
}
