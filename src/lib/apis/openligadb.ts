// OpenLigaDB — free German football API (no key required)
// Docs: https://github.com/OpenLigaDB/OpenLigaDB-Sample
// Coverage: Bundesliga (BL1), 2. Bundesliga, DFB-Pokal

const BASE = "https://api.openligadb.de";

export interface OLBMatch {
  MatchID: number;
  MatchDateTime: string;
  TimeZoneID: string;
  LeagueId: number;
  LeagueName: string;
  LeagueSeason: number;
  LeagueShortcut: string;
  Team1: {
    TeamId: number;
    TeamName: string;
    ShortName: string;
    TeamIconUrl: string;
  };
  Team2: {
    TeamId: number;
    TeamName: string;
    ShortName: string;
    TeamIconUrl: string;
  };
  MatchResults: Array<{
    ResultID: number;
    ResultName: string;
    PointsTeam1: number;
    PointsTeam2: number;
    ResultOrderID: number;
    ResultTypeID: number;
    ResultDescription: string;
  }>;
  MatchIsFinished: boolean;
  Group: {
    GroupName: string;
    GroupOrderID: number;
    GroupID: number;
  };
}

export function isEnabled(): boolean {
  return true; // No key required
}

/**
 * Get all matches for a league and season
 * @param leagueShortcut - League code (e.g., "bl1" for Bundesliga)
 * @param season - Season year (e.g., 2025)
 */
export async function getMatchesByLeague(
  leagueShortcut: string,
  season: number
): Promise<OLBMatch[]> {
  try {
    const res = await fetch(
      `${BASE}/getmatchdata/${leagueShortcut}/${season}`,
      {
        headers: { "User-Agent": "GoalMind/1.0" },
        next: { revalidate: 3600 }, // Cache 1 hour
      }
    );
    if (!res.ok) {
      console.warn(`[openligadb] ${leagueShortcut}/${season} -> ${res.status}`);
      return [];
    }
    return (await res.json()) as OLBMatch[];
  } catch (err) {
    console.warn(`[openligadb] fetch failed: ${leagueShortcut}/${season}`, err);
    return [];
  }
}

/**
 * Get current/next match for a league
 */
export async function getCurrentMatch(leagueShortcut: string): Promise<OLBMatch | null> {
  try {
    const res = await fetch(`${BASE}/getcurrentmatch/${leagueShortcut}`, {
      headers: { "User-Agent": "GoalMind/1.0" },
      next: { revalidate: 60 }, // Cache 1 minute
    });
    if (!res.ok) {
      console.warn(`[openligadb] current/${leagueShortcut} -> ${res.status}`);
      return null;
    }
    return (await res.json()) as OLBMatch;
  } catch (err) {
    console.warn(`[openligadb] fetch failed: current/${leagueShortcut}`, err);
    return null;
  }
}

/**
 * Get league table/standings
 */
export async function getTable(
  leagueShortcut: string,
  season: number
): Promise<Array<{ TeamInfoId: number; TeamName: string; Points: number; OpponentGoals: number; Goals: number; Matches: number }>> {
  try {
    const res = await fetch(
      `${BASE}/getbltable/${leagueShortcut}/${season}`,
      {
        headers: { "User-Agent": "GoalMind/1.0" },
        next: { revalidate: 3600 },
      }
    );
    if (!res.ok) {
      console.warn(`[openligadb] table/${leagueShortcut}/${season} -> ${res.status}`);
      return [];
    }
    return await res.json();
  } catch (err) {
    console.warn(`[openligadb] fetch failed: table/${leagueShortcut}/${season}`, err);
    return [];
  }
}

/**
 * Get all matches for a league in a given matchday (used to detect live games).
 */
export async function getMatchData(leagueShortcut: string): Promise<OLBMatch[]> {
  try {
    const res = await fetch(`${BASE}/getmatchdata/${leagueShortcut}`, {
      headers: { "User-Agent": "GoalMind/1.0" },
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    return (await res.json()) as OLBMatch[];
  } catch {
    return [];
  }
}

// League shortcuts — broad coverage incl. smaller German tiers & cups
export const LEAGUE_SHORTCUTS: Record<string, string> = {
  BL1: "bl1", // Bundesliga
  BL2: "bl2", // 2. Bundesliga
  BL3: "bl3", // 3. Liga
  DFB: "dfb", // DFB-Pokal
};

// Leagues to scan for live matches (the current matchday endpoint)
export const LIVE_SCAN_SHORTCUTS = ["bl1", "bl2", "bl3", "dfb"];
