// Sofascore API — unofficial but public (no key required)
// Docs: https://github.com/isekaidev/sofascore-api
// Coverage: Live scores, fixtures, standings for all major leagues
// Note: This is a reverse-engineered API, use responsibly

const BASE = "https://api.sofascore.com/api/v1";

export interface SFEvent {
  id: number;
  tournament: {
    name: string;
    slug: string;
    category: {
      name: string;
      slug: string;
      flag?: string;
    };
    uniqueTournament: {
      name: string;
      slug: string;
      id: number;
    };
  };
  season: {
    name: string;
    year: string;
  };
  homeTeam: {
    name: string;
    slug: string;
    shortName: string;
    id: number;
  };
  awayTeam: {
    name: string;
    slug: string;
    shortName: string;
    id: number;
  };
  homeScore?: {
    current?: number;
    display?: number;
    period1?: number;
    period2?: number;
  };
  awayScore?: {
    current?: number;
    display?: number;
    period1?: number;
    period2?: number;
  };
  status: {
    code: number;
    description: string;
    type: string;
  };
  startTimestamp: number;
  slug: string;
}

export function isEnabled(): boolean {
  return true; // No key required
}

/**
 * Get scheduled events for a specific date
 * @param date - Date in format YYYY-MM-DD
 */
export async function getScheduledEvents(date: string): Promise<SFEvent[]> {
  try {
    const res = await fetch(`${BASE}/sport/football/scheduled-events/${date}`, {
      headers: {
        "User-Agent": "GoalMind/1.0",
        "Accept": "application/json",
      },
      next: { revalidate: 300 }, // Cache 5 minutes
    });
    if (!res.ok) {
      console.warn(`[sofascore] scheduled/${date} -> ${res.status}`);
      return [];
    }
    const data = await res.json();
    return data.events ?? [];
  } catch (err) {
    console.warn(`[sofascore] fetch failed: scheduled/${date}`, err);
    return [];
  }
}

/**
 * Get live events (currently in progress)
 */
export async function getLiveEvents(): Promise<SFEvent[]> {
  try {
    const res = await fetch(`${BASE}/sport/football/events/live`, {
      headers: {
        "User-Agent": "GoalMind/1.0",
        "Accept": "application/json",
      },
      next: { revalidate: 30 }, // Cache 30 seconds for live data
    });
    if (!res.ok) {
      console.warn(`[sofascore] live -> ${res.status}`);
      return [];
    }
    const data = await res.json();
    return data.events ?? [];
  } catch (err) {
    console.warn(`[sofascore] fetch failed: live`, err);
    return [];
  }
}

/**
 * Get tournament standings
 * @param tournamentId - Unique tournament ID (e.g., 17 for Premier League)
 * @param seasonId - Season ID
 */
export async function getStandings(
  tournamentId: number,
  seasonId: number
): Promise<any> {
  try {
    const res = await fetch(
      `${BASE}/unique-tournament/${tournamentId}/season/${seasonId}/standings/total`,
      {
        headers: {
          "User-Agent": "GoalMind/1.0",
          "Accept": "application/json",
        },
        next: { revalidate: 3600 },
      }
    );
    if (!res.ok) {
      console.warn(`[sofascore] standings/${tournamentId}/${seasonId} -> ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`[sofascore] fetch failed: standings/${tournamentId}/${seasonId}`, err);
    return null;
  }
}

// Tournament IDs for major leagues
export const TOURNAMENT_IDS: Record<string, number> = {
  PL: 17, // Premier League
  LL: 8, // La Liga
  SA: 23, // Serie A
  BL1: 35, // Bundesliga
  FL1: 34, // Ligue 1
  UCL: 7, // Champions League
};
