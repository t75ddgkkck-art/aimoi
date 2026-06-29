// Football-data.org client — free tier (10 req/min)
// Docs: https://www.football-data.org/documentation/quickstart
// Requires: FOOTBALL_DATA_API_KEY env var

const BASE = "https://api.football-data.org/v4";

export const FD_COMPETITIONS: Record<string, string> = {
  PL: "PL", // Premier League
  LL: "PD", // La Liga (code football-data = PD)
  SA: "SA", // Serie A
  BL1: "BL1", // Bundesliga
  FL1: "FL1", // Ligue 1
  UCL: "CL", // Champions League (code = CL)
};

export interface FDTeam {
  id: number;
  name: string;
  shortName: string;
  tla: string; // Three Letter Abbreviation
  crest: string;
  country?: string;
}

export interface FDMatch {
  id: number;
  utcDate: string;
  status: string; // SCHEDULED, LIVE, FINISHED, etc.
  matchday: number;
  homeTeam: { id: number; name: string; shortName: string; crest: string };
  awayTeam: { id: number; name: string; shortName: string; crest: string };
  score: {
    winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
  };
  competition: { code: string; name: string };
}

export interface FDStandingEntry {
  position: number;
  team: { id: number; name: string; shortName: string };
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  form?: string;
}

export function isEnabled(): boolean {
  return !!process.env.FOOTBALL_DATA_API_KEY;
}

import { fetchWithRetry, RateLimiter } from "@/lib/api-utils";

// football-data.org free tier: 10 req/min
const rateLimiter = new RateLimiter(10);

async function fetchJSON<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) return null;

  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  await rateLimiter.waitForSlot();

  try {
    const res = await fetchWithRetry(
      url.toString(),
      {
        headers: {
          "X-Auth-Token": key,
          "User-Agent": "GoalMind/1.0",
        },
        next: { revalidate: 0 },
      },
      3,
      2000
    );
    if (!res.ok) {
      console.warn(`[football-data] ${path} -> ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[football-data] fetch failed: ${path}`, err);
    return null;
  }
}

export async function getTeams(competitionCode: string): Promise<FDTeam[]> {
  const data = await fetchJSON<{ teams: FDTeam[] }>(`/competitions/${competitionCode}/teams`);
  return data?.teams ?? [];
}

// Simple in-memory TTL cache to respect football-data's 10 req/min free-tier limit.
let liveCache: { at: number; data: FDMatch[] } | null = null;
const LIVE_TTL_MS = 25_000;

// Fetch ALL live (in-play / paused) matches across competitions — free tier supported
export async function getLiveMatches(): Promise<FDMatch[]> {
  if (liveCache && Date.now() - liveCache.at < LIVE_TTL_MS) {
    return liveCache.data;
  }
  const data = await fetchJSON<{ matches: FDMatch[] }>(`/matches`, { status: "IN_PLAY,PAUSED" });
  const matches = data?.matches ?? [];
  liveCache = { at: Date.now(), data: matches };
  return matches;
}

// Fetch all matches in a date range across competitions (for today's fixtures)
export async function getMatchesByDate(dateFrom: string, dateTo: string): Promise<FDMatch[]> {
  const data = await fetchJSON<{ matches: FDMatch[] }>(`/matches`, { dateFrom, dateTo });
  return data?.matches ?? [];
}

export async function getMatches(
  competitionCode: string,
  options: { dateFrom?: string; dateTo?: string; status?: string } = {}
): Promise<FDMatch[]> {
  const params: Record<string, string> = {};
  if (options.dateFrom) params.dateFrom = options.dateFrom;
  if (options.dateTo) params.dateTo = options.dateTo;
  if (options.status) params.status = options.status;

  const data = await fetchJSON<{ matches: FDMatch[] }>(`/competitions/${competitionCode}/matches`, params);
  return data?.matches ?? [];
}

export async function getStandings(competitionCode: string, season?: number): Promise<FDStandingEntry[]> {
  const params: Record<string, string> = {};
  if (season) params.season = season.toString();

  const data = await fetchJSON<{
    standings: Array<{ type: string; table: FDStandingEntry[] }>;
  }>(`/competitions/${competitionCode}/standings`, params);

  const total = data?.standings?.find((s) => s.type === "TOTAL");
  return total?.table ?? [];
}
