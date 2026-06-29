// API-Sports (API-Football) — official football API
// Docs: https://www.api-football.com/documentation-v3
// Requires: API_SPORTS_KEY env var
// Free tier: 100 requests/day

const BASE = "https://v3.football.api-sports.io";

export interface ASFixture {
  fixture: {
    id: number;
    referee: string;
    timezone: string;
    date: string;
    timestamp: number;
    periods: {
      first: number;
      second: number;
    };
    venue: {
      id: number;
      name: string;
      city: string;
    };
    status: {
      long: string;
      short: string;
      elapsed: number;
    };
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string;
    season: number;
    round: string;
  };
  teams: {
    home: {
      id: number;
      name: string;
      logo: string;
      winner: boolean;
    };
    away: {
      id: number;
      name: string;
      logo: string;
      winner: boolean;
    };
  };
  goals: {
    home: number;
    away: number;
  };
  score: {
    halftime: {
      home: number;
      away: number;
    };
    fulltime: {
      home: number;
      away: number;
    };
    extratime: {
      home: number;
      away: number;
    };
    penalty: {
      home: number;
      away: number;
    };
  };
}

export interface ASTeam {
  team: {
    id: number;
    name: string;
    code: string;
    country: string;
    founded: number;
    national: boolean;
    logo: string;
  };
  venue: {
    id: number;
    name: string;
    address: string;
    city: string;
    capacity: number;
    surface: string;
    image: string;
  };
}

export interface ASLiveOdds {
  fixture: { id: number; status: { long: string; elapsed: number; seconds?: string } };
  league: { id: number; season: number };
  teams: { home: { id: number; goals: number }; away: { id: number; goals: number } };
  status: { stopped: boolean; blocked: boolean; finished: boolean };
  update: string;
  odds: Array<{
    id: number;
    name: string;
    values: Array<{ value: string; odd: string; handicap?: string | null; main?: boolean | null }>;
  }>;
}

export function isEnabled(): boolean {
  return !!process.env.API_SPORTS_KEY || !!process.env.RAPIDAPI_KEY;
}

async function fetchJSON<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const apiSportsKey = process.env.API_SPORTS_KEY;
  const rapidApiKey = process.env.RAPIDAPI_KEY;

  if (!apiSportsKey && !rapidApiKey) return null;

  let urlString = "";
  const headers: Record<string, string> = {
    "User-Agent": "GoalMind/1.0",
  };

  if (apiSportsKey) {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    urlString = url.toString();
    headers["x-apisports-key"] = apiSportsKey;
  } else {
    const host = process.env.RAPIDAPI_HOST ?? "api-football-v1.p.rapidapi.com";
    const url = new URL(`https://${host}/v3${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    urlString = url.toString();
    headers["X-RapidAPI-Key"] = rapidApiKey!;
    headers["X-RapidAPI-Host"] = host;
  }

  try {
    const res = await fetch(urlString, {
      headers,
      next: { revalidate: 30 }, // Fast cache for live scores and live odds
    });
    if (!res.ok) {
      console.warn(`[api-sports/unified] ${path} -> ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data.response as T;
  } catch (err) {
    console.warn(`[api-sports/unified] fetch failed: ${path}`, err);
    return null;
  }
}

/**
 * Get fixtures by league and season
 * @param leagueId - League ID (e.g., 39 for Premier League)
 * @param season - Season year (e.g., 2025)
 */
export async function getFixtures(
  leagueId: number,
  season: number,
  status?: string
): Promise<ASFixture[]> {
  const params: Record<string, string> = {
    league: leagueId.toString(),
    season: season.toString(),
  };
  if (status) params.status = status;

  const data = await fetchJSON<ASFixture[]>("/fixtures", params);
  return data ?? [];
}

/**
 * Get live fixtures
 */
export async function getLiveFixtures(): Promise<ASFixture[]> {
  const data = await fetchJSON<ASFixture[]>("/fixtures", { live: "all" });
  return data ?? [];
}

export async function getLiveOdds(): Promise<ASLiveOdds[]> {
  const data = await fetchJSON<ASLiveOdds[]>("/odds/live", {});
  return data ?? [];
}

export interface ASLineup {
  team: { id: number; name: string; logo: string };
  coach: { id: number; name: string; photo: string };
  formation: string;
  startXI: Array<{ player: { id: number; name: string; number: number; pos: string; grid: string | null } }>;
  substitutes: Array<{ player: { id: number; name: string; number: number; pos: string; grid: string | null } }>;
}

export async function getMatchLineups(fixtureId: number): Promise<ASLineup[]> {
  const data = await fetchJSON<ASLineup[]>("/fixtures/lineups", { fixture: fixtureId.toString() });
  return data ?? [];
}

export function extractLive1X2(liveOdds: ASLiveOdds): { home: number; draw: number; away: number } | null {
  const market = liveOdds.odds.find((o) =>
    ["Match Winner", "Fulltime Result", "1x2", "1X2"].some((name) => o.name.toLowerCase().includes(name.toLowerCase()))
  );
  if (!market) return null;
  const home = market.values.find((v) => /home|1/i.test(v.value));
  const draw = market.values.find((v) => /draw|x/i.test(v.value));
  const away = market.values.find((v) => /away|2/i.test(v.value));
  if (!home || !draw || !away) return null;
  return {
    home: parseFloat(home.odd),
    draw: parseFloat(draw.odd),
    away: parseFloat(away.odd),
  };
}

/**
 * Get teams by league and season
 */
export async function getTeams(leagueId: number, season: number): Promise<ASTeam[]> {
  const data = await fetchJSON<ASTeam[]>("/teams", {
    league: leagueId.toString(),
    season: season.toString(),
  });
  return data ?? [];
}

/**
 * Get standings
 */
export async function getStandings(leagueId: number, season: number): Promise<any> {
  const data = await fetchJSON<any>("/standings", {
    league: leagueId.toString(),
    season: season.toString(),
  });
  return data;
}

// League IDs for major competitions
export const LEAGUE_IDS: Record<string, number> = {
  PL: 39, // Premier League
  LL: 140, // La Liga
  SA: 135, // Serie A
  BL1: 78, // Bundesliga
  FL1: 61, // Ligue 1
  UCL: 2, // Champions League
  EL: 3, // Europa League
};
