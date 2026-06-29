// TheSportsDB client — 100% free, no signup required
// Public test API key is "3"
// Docs: https://www.thesportsdb.com/api.php

const BASE = "https://www.thesportsdb.com/api/v1/json/3";

export const LEAGUE_IDS: Record<string, { id: string; name: string; country: string; code: string }> = {
  WC: { id: "4429", name: "FIFA World Cup", country: "World", code: "WC" },
  PL: { id: "4328", name: "English Premier League", country: "England", code: "PL" },
  LL: { id: "4335", name: "Spanish La Liga", country: "Spain", code: "LL" },
  SA: { id: "4332", name: "Italian Serie A", country: "Italy", code: "SA" },
  BL1: { id: "4331", name: "German Bundesliga", country: "Germany", code: "BL1" },
  FL1: { id: "4334", name: "French Ligue 1", country: "France", code: "FL1" },
  UCL: { id: "4480", name: "UEFA Champions League", country: "Europe", code: "UCL" },
};

export interface TSDTeam {
  idTeam: string;
  strTeam: string;
  strTeamShort?: string;
  strCountry?: string;
  strBadge?: string | null;
  strLogo?: string | null;
  intFormedYear?: string;
}

export interface TSDTableEntry {
  idStanding: string;
  intRank: string;
  idTeam: string;
  strTeam: string;
  intPlayed: string;
  intWin: string;
  intDraw: string;
  intLoss: string;
  intGoalsFor: string;
  intGoalsAgainst: string;
  intGoalDifference: string;
  intPoints: string;
  strForm?: string | null;
}

export interface TSDEvent {
  idEvent: string;
  idLeague: string;
  strEvent: string;
  strLeague: string;
  idHomeTeam: string;
  idAwayTeam: string;
  strHomeTeam: string;
  strAwayTeam: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  intRound?: string | null;
  dateEvent: string; // YYYY-MM-DD
  strTime?: string | null; // HH:MM:SS
  strTimestamp?: string | null; // ISO
  strStatus?: string | null; // "Match Finished", "NS" (not started), "1H", "HT", "2H", "FT"
  strProgress?: string | null; // live minute, e.g. "67"
  strCountry?: string | null;
  intSpectators?: string | null;
  // Odds sometimes available
  strHomeGoalDetails?: string | null;
  strAwayGoalDetails?: string | null;
}

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 0 },
      headers: { "User-Agent": "GoalMind/1.0" },
    });
    if (!res.ok) {
      console.warn(`[thesportsdb] ${url} -> ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[thesportsdb] fetch failed: ${url}`, err);
    return null;
  }
}

export async function getAllTeams(leagueId: string): Promise<TSDTeam[]> {
  const data = await fetchJSON<{ teams: TSDTeam[] | null }>(
    `${BASE}/lookup_all_teams.php?id=${leagueId}`
  );
  return data?.teams ?? [];
}

export async function getNextEvents(leagueId: string): Promise<TSDEvent[]> {
  const data = await fetchJSON<{ events: TSDEvent[] | null }>(
    `${BASE}/eventsnextleague.php?id=${leagueId}`
  );
  return data?.events ?? [];
}

export async function getPastEvents(leagueId: string): Promise<TSDEvent[]> {
  const data = await fetchJSON<{ events: TSDEvent[] | null }>(
    `${BASE}/eventspastleague.php?id=${leagueId}`
  );
  return data?.events ?? [];
}

export async function getLeagueTable(leagueId: string, season = "2024-2025"): Promise<TSDTableEntry[]> {
  const data = await fetchJSON<{ table: TSDTableEntry[] | null }>(
    `${BASE}/lookuptable.php?l=${leagueId}&s=${season}`
  );
  return data?.table ?? [];
}

// All soccer events on a given day (YYYY-MM-DD) — free, broad coverage.
export async function getEventsByDay(date: string): Promise<TSDEvent[]> {
  const data = await fetchJSON<{ events: TSDEvent[] | null }>(
    `${BASE}/eventsday.php?d=${date}&s=Soccer`
  );
  return data?.events ?? [];
}

// Rate-limit helper: TheSportsDB doesn't document strict limits but we should be polite
export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
