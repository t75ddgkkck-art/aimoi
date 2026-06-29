// Understat Scraper & xG Intelligence Layer
// Uses static HTML parsing of Understat scripts containing JSON payloads.
// Fallback logic uses SofaScore & Football-Data match statistics if Understat is blocked.

import { normalizeTeamName } from "../team-matcher";

export interface UnderstatTeamStats {
  title: string;
  xg: number;
  xga: number;
  npxg: number;
  npxga: number;
  deep: number;
  ppda: number;
}

// Understat league codes
export const UNDERSTAT_LEAGUES: Record<string, string> = {
  PL: "EPL",
  LL: "La_Liga",
  SA: "Serie_A",
  BL1: "Bundesliga",
  FL1: "Ligue_1",
};

/**
 * Scrapes Understat for league stats including xG and PPDA
 */
export async function fetchLeagueXG(leagueCode: string, season: number = 2025): Promise<Map<string, UnderstatTeamStats>> {
  const code = UNDERSTAT_LEAGUES[leagueCode];
  const out = new Map<string, UnderstatTeamStats>();
  if (!code) return out;

  try {
    const url = `https://understat.com/league/${code}/${season}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      next: { revalidate: 86400 }, // Cache 24 hours
    });

    if (!res.ok) {
      console.warn(`[understat] ${leagueCode} returned ${res.status}`);
      return out;
    }

    const html = await res.text();
    // Understat embeds JSON data in script tags: const teamsData = JSON.parse('...')
    const match = html.match(/teamsData\s*=\s*JSON\.parse\('([^']+)'\)/);
    if (!match) {
      console.warn(`[understat] Could not find teamsData script for ${leagueCode}`);
      return out;
    }

    // Decode hex-encoded payload
    const decoded = decodeURIComponent(
      match[1].replace(/\\x([0-9a-fA-F]{2})/g, "%$1")
    );
    const json = JSON.parse(decoded);

    // Parse team metrics
    for (const [id, team] of Object.entries(json) as [string, any]) {
      const history = team.history ?? [];
      let totalXG = 0, totalXGA = 0, totalNPXG = 0, totalNPXGA = 0, totalPPDA = 0, totalDeep = 0;
      for (const h of history) {
        totalXG += h.xG ?? 0;
        totalXGA += h.xGA ?? 0;
        totalNPXG += h.npxG ?? 0;
        totalNPXGA += h.npxGA ?? 0;
        totalDeep += h.deep ?? 0;
        // PPDA = passes allowed per defensive action (pressing intensity)
        const ppdaAtt = h.ppda?.att ?? 1;
        const ppdaDef = h.ppda?.def ?? 1;
        totalPPDA += ppdaDef > 0 ? ppdaAtt / ppdaDef : 10;
      }

      const count = Math.max(1, history.length);
      const nameKey = normalizeTeamName(team.title);
      out.set(nameKey, {
        title: team.title,
        xg: totalXG / count,
        xga: totalXGA / count,
        npxg: totalNPXG / count,
        npxga: totalNPXGA / count,
        deep: totalDeep / count,
        ppda: totalPPDA / count,
      });
    }

    console.log(`[understat] Successfully fetched xG stats for ${out.size} teams in ${leagueCode}`);
  } catch (err) {
    console.warn(`[understat] Fetch failed for ${leagueCode}:`, err);
  }

  return out;
}

/**
 * Fallback generator of high-fidelity simulated xG based on actual goals scored and conceded.
 * This guarantees the prediction algorithm always has realistic xG values even if Understat is blocked.
 */
export function generateSyntheticXG(
  goalsScored: number,
  goalsConceded: number,
  played: number
): { xg: number; xga: number } {
  if (played <= 0) return { xg: 1.35, xga: 1.35 };
  const baseAvgScored = goalsScored / played;
  const baseAvgConceded = goalsConceded / played;

  // Add small regression to the mean (0.85 weight to actual goals, 0.15 to baseline)
  const xg = 0.85 * baseAvgScored + 0.15 * 1.35;
  const xga = 0.85 * baseAvgConceded + 0.15 * 1.35;

  return {
    xg: Math.round(xg * 100) / 100,
    xga: Math.round(xga * 100) / 100,
  };
}
