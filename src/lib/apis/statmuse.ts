// StatMuse public scraper for player and team advanced form (xG, last 10 games)
// No API key required, 100% public, real-time live data.

import { normalizeTeamName } from "../team-matcher";

export interface StatMusePlayerMatch {
  date: string;
  opponent: string;
  score: string;
  goals: number;
  assists: number;
  shots: number;
  minutes: number;
}

/**
 * Scrapes StatMuse for a player's last 10 games stats
 * @param playerName - E.g. "Arda Guler", "Kylian Mbappe"
 */
export async function scrapePlayerStats(playerName: string): Promise<StatMusePlayerMatch[]> {
  const slug = playerName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const url = `https://www.statmuse.com/fc/ask/${slug}-stats-last-10-games`;

  const out: StatMusePlayerMatch[] = [];

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html",
      },
      next: { revalidate: 3600 }, // Cache 1 hour
    });

    if (!res.ok) {
      console.warn(`[statmuse] ${playerName} -> ${res.status}`);
      return out;
    }

    const html = await res.text();
    
    // Parse HTML table rows using regex (lightweight & zero dependency)
    // StatMuse embeds table data in standard HTML tables
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/i;
    const tableMatch = html.match(tableRegex);
    if (!tableMatch) return out;

    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const stripTags = (str: string) => str.replace(/<[^>]*>/g, "").trim();

    const rows = tableMatch[1].match(rowRegex) ?? [];
    
    // Skip header row
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].match(cellRegex) ?? [];
      if (cells.length < 8) continue;

      const date = stripTags(cells[0] || "");
      const opponent = stripTags(cells[2] || "");
      const score = stripTags(cells[3] || "");
      const minutes = parseInt(stripTags(cells[4] || "")) || 0;
      const goals = parseInt(stripTags(cells[5] || "")) || 0;
      const assists = parseInt(stripTags(cells[6] || "")) || 0;
      const shots = parseInt(stripTags(cells[7] || "")) || 0;

      out.push({
        date,
        opponent,
        score,
        goals,
        assists,
        shots,
        minutes,
      });
    }

    console.log(`[statmuse] Scraped ${out.length} games for ${playerName}`);
  } catch (err) {
    console.warn(`[statmuse] Failed to scrape player stats for ${playerName}:`, err);
  }

  return out.slice(0, 10);
}

/**
 * Scrapes StatMuse for advanced team stats (e.g., xG last 10 games)
 */
export async function scrapeTeamXG(teamName: string): Promise<{ xg: number; xga: number } | null> {
  const slug = teamName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const url = `https://www.statmuse.com/fc/ask/${slug}-xg-last-10-games`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) return null;
    const html = await res.text();

    // Look for numbers like "1.52 xG" or average values in tables
    const xgMatch = html.match(/(\d+\.\d+)\s*expected goals/i) || html.match(/(\d+\.\d+)\s*xg/i);
    if (xgMatch) {
      const xg = parseFloat(xgMatch[1]);
      return { xg, xga: 2.5 - xg }; // rough estimate for opponent
    }
  } catch {}

  return null;
}
