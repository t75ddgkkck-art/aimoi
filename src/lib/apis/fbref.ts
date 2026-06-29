// FBref public scraper for advanced team stats.
// No API key required. FBref sometimes rate-limits, so all failures are soft.

import { normalizeTeamName } from "@/lib/team-matcher";

export type FBrefTeamAdvancedStats = {
  team: string;
  xg?: number;
  xga?: number;
  xag?: number;
  progressivePasses?: number;
  progressiveCarries?: number;
};

const COMP_IDS: Record<string, number> = {
  PL: 9,
  LL: 12,
  SA: 11,
  BL1: 20,
  FL1: 13,
  UCL: 8,
};

function stripTags(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function parseNumber(value: string): number | undefined {
  const n = parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

export async function fetchLeagueAdvancedStats(leagueCode: string): Promise<Map<string, FBrefTeamAdvancedStats>> {
  const out = new Map<string, FBrefTeamAdvancedStats>();
  const compId = COMP_IDS[leagueCode];
  if (!compId) return out;

  try {
    const url = `https://fbref.com/en/comps/${compId}/stats/squads/${leagueCode === "UCL" ? "Champions-League" : ""}`;
    const fallbackUrl = `https://fbref.com/en/comps/${compId}/stats/`;
    let res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      next: { revalidate: 86400 },
    });
    if (!res.ok) {
      res = await fetch(fallbackUrl, {
        headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" },
        next: { revalidate: 86400 },
      });
    }
    if (!res.ok) {
      console.warn(`[fbref] ${leagueCode} returned ${res.status}`);
      return out;
    }

    let html = await res.text();
    // FBref often wraps tables inside HTML comments.
    html = html.replace(/<!--/g, "").replace(/-->/g, "");

    const tableMatch = html.match(/<table[^>]+id="stats_squads_standard_for"[\s\S]*?<\/table>/i) || html.match(/<table[\s\S]*?<\/table>/i);
    if (!tableMatch) return out;

    const rows = tableMatch[0].match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    const headerRow = rows.find((r) => r.includes("data-stat=\"team\"")) ?? rows[0] ?? "";
    const headers = Array.from(headerRow.matchAll(/data-stat="([^"]+)"/g)).map((m) => m[1]);

    for (const row of rows.slice(1)) {
      if (!row.includes("data-stat=\"team\"")) continue;
      const cells = Array.from(row.matchAll(/<t[dh][^>]*data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/t[dh]>/gi));
      const byStat = new Map<string, string>();
      for (const c of cells) byStat.set(c[1], stripTags(c[2]));
      const team = byStat.get("team");
      if (!team || team === "Squad") continue;

      const xg = parseNumber(byStat.get("xg") ?? "");
      const xag = parseNumber(byStat.get("xg_assist") ?? byStat.get("xag") ?? "");
      const progressivePasses = parseNumber(byStat.get("progressive_passes") ?? "");
      const progressiveCarries = parseNumber(byStat.get("progressive_carries") ?? "");
      const matches = parseNumber(byStat.get("games") ?? "") ?? 1;

      out.set(normalizeTeamName(team), {
        team,
        xg: xg ? xg / Math.max(1, matches) : undefined,
        xag: xag ? xag / Math.max(1, matches) : undefined,
        progressivePasses: progressivePasses ? progressivePasses / Math.max(1, matches) : undefined,
        progressiveCarries: progressiveCarries ? progressiveCarries / Math.max(1, matches) : undefined,
      });
    }
  } catch (err) {
    console.warn(`[fbref] failed for ${leagueCode}`, err);
  }
  return out;
}
