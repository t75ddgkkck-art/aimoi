// API-Football via RapidAPI — free tier (100 req/day)
// Docs: https://www.api-football.com/documentation-v3
// Requires: RAPIDAPI_KEY env var

const HOST = process.env.RAPIDAPI_HOST ?? "api-football-v1.p.rapidapi.com";
const BASE = `https://${HOST}/v3`;

export interface AFFixture {
  fixture: {
    id: number;
    date: string;
    status: { long: string; short: string; elapsed: number | null };
    referee?: string;
    venue?: { name: string; city: string };
  };
  league: { id: number; name: string; country: string; logo: string; season: number };
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null };
    away: { id: number; name: string; logo: string; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
  };
}

export interface AFOdds {
  fixture: { id: number };
  update: string;
  bookmakers: Array<{
    id: number;
    name: string;
    bets: Array<{
      id: number;
      name: string; // "Match Winner", "Goals Over/Under", etc.
      values: Array<{ value: string; odd: number }>;
    }>;
  }>;
}

export interface AFStatistics {
  team: { id: number; name: string; logo: string };
  statistics: Array<{
    type: string;
    value: any;
  }>;
}

export const AF_LEAGUE_IDS: Record<string, number> = {
  PL: 39,
  LL: 140,
  SA: 135,
  BL1: 78,
  FL1: 61,
  UCL: 2,
};

export function isEnabled(): boolean {
  return !!process.env.RAPIDAPI_KEY;
}

async function fetchJSON<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return null;

  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "X-RapidAPI-Key": key,
        "X-RapidAPI-Host": HOST,
        "User-Agent": "GoalMind/1.0",
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      console.warn(`[api-football] ${path} -> ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[api-football] fetch failed: ${path}`, err);
    return null;
  }
}

export async function getFixtures(
  leagueId: number,
  season: number,
  options: { from?: string; to?: string; status?: string; next?: number; last?: number } = {}
): Promise<AFFixture[]> {
  const params: Record<string, string> = {
    league: leagueId.toString(),
    season: season.toString(),
  };
  if (options.from) params.from = options.from;
  if (options.to) params.to = options.to;
  if (options.status) params.status = options.status;
  if (options.next) params.next = options.next.toString();
  if (options.last) params.last = options.last.toString();

  const data = await fetchJSON<{ response: AFFixture[] }>("/fixtures", params);
  return data?.response ?? [];
}

export async function getLiveFixtures(leagueId?: number): Promise<AFFixture[]> {
  const params: Record<string, string> = {};
  if (leagueId) params.league = leagueId.toString();
  const data = await fetchJSON<{ response: AFFixture[] }>("/fixtures?live=all", params);
  return data?.response ?? [];
}

export async function getOdds(fixtureId: number): Promise<AFOdds | null> {
  const data = await fetchJSON<{ response: AFOdds[] }>("/odds", {
    fixture: fixtureId.toString(),
  });
  return data?.response?.[0] ?? null;
}

export async function getTeamStatistics(teamId: number, leagueId: number, season: number) {
  const data = await fetchJSON<{ response: any }>("/teams/statistics", {
    team: teamId.toString(),
    league: leagueId.toString(),
    season: season.toString(),
  });
  return data?.response ?? null;
}

// Extract 1X2 odds from bookmakers response
export function extract1X2(odds: AFOdds): { home: number; draw: number; away: number } | null {
  for (const bm of odds.bookmakers) {
    for (const bet of bm.bets) {
      if (bet.name === "Match Winner") {
        const home = bet.values.find((v) => v.value === "Home");
        const draw = bet.values.find((v) => v.value === "Draw");
        const away = bet.values.find((v) => v.value === "Away");
        if (home && draw && away) {
          return { home: home.odd, draw: draw.odd, away: away.odd };
        }
      }
    }
  }
  return null;
}
