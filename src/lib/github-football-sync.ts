import "server-only";
import { db } from "@/db";
import { leagues, teams, matches, predictions } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { findBestTeamMatch, normalizeTeamName } from "./team-matcher";
import { predictMatch, seededOdds, type MatchInput } from "./ml";
import { getLeagueConfig } from "./league-config";

// Map openfootball filename tokens to our canonical league codes
const FILE_TO_LEAGUE: Record<string, { code: string; name: string; country: string }> = {
  "en.1": { code: "PL", name: "Premier League", country: "England" },
  "es.1": { code: "LL", name: "La Liga", country: "Spain" },
  "it.1": { code: "SA", name: "Serie A", country: "Italy" },
  "de.1": { code: "BL1", name: "Bundesliga", country: "Germany" },
  "fr.1": { code: "FL1", name: "Ligue 1", country: "France" },
  "en.2": { code: "ELC", name: "Championship", country: "England" },
  "nl.1": { code: "NL1", name: "Eredivisie", country: "Netherlands" },
  "pt.1": { code: "PT1", name: "Primeira Liga", country: "Portugal" },
  "tr.1": { code: "TR1", name: "Süper Lig", country: "Turkey" },
  "be.1": { code: "BE1", name: "Pro League", country: "Belgium" },
  "at.1": { code: "AT1", name: "Bundesliga (AT)", country: "Austria" },
  "sco.1": { code: "SCO1", name: "Premiership", country: "Scotland" },
  "gr.1": { code: "GR1", name: "Super League", country: "Greece" },
  "mx.1": { code: "MX1", name: "Liga MX", country: "Mexico" },
  "en.3": { code: "EL1", name: "League One", country: "England" },
  "en.4": { code: "EL2", name: "League Two", country: "England" },
  "de.2": { code: "BL2", name: "2. Bundesliga", country: "Germany" },
  "it.2": { code: "SB", name: "Serie B", country: "Italy" },
  "es.2": { code: "LL2", name: "La Liga 2", country: "Spain" },
  "fr.2": { code: "FL2", name: "Ligue 2", country: "France" },
};

const SEASONS = ["2024-25", "2025-26"];

interface OpenFootballMatch {
  round?: string;
  date: string;
  time?: string;
  team1: string | { name: string; code?: string };
  team2: string | { name: string; code?: string };
  score?: {
    ft?: [number, number];
    ht?: [number, number];
  };
  score1?: number;
  score2?: number;
}

interface OpenFootballRound {
  name: string;
  matches: OpenFootballMatch[];
}

interface OpenFootballPayload {
  name?: string;
  matches?: OpenFootballMatch[];
  rounds?: OpenFootballRound[];
}

export async function syncGithubFootballData(): Promise<{ syncedLeagues: number; insertedMatches: number; updatedMatches: number; createdTeams: number }> {
  console.log("[github-sync] Starting BATCH-OPTIMIZED aggressive openfootball sync from GitHub...");

  const startTime = Date.now();
  let insertedMatches = 0;
  let updatedMatches = 0;
  let createdTeams = 0;
  let syncedLeagues = 0;

  const teamMatchCache = new Map<string, number>();

  // 1. Ensure the leagues exist in the database
  const leagueRows = await db.select().from(leagues);
  const leagueMap = new Map(leagueRows.map((l) => [l.code, l]));

  for (const [fileToken, meta] of Object.entries(FILE_TO_LEAGUE)) {
    if (!leagueMap.has(meta.code)) {
      const [newLeague] = await db
        .insert(leagues)
        .values({
          name: meta.name,
          country: meta.country,
          code: meta.code,
          logo: "⚽",
          season: "2025-26",
          isActive: true,
        })
        .onConflictDoUpdate({
          target: leagues.code,
          set: { name: meta.name, country: meta.country, logo: "⚽" }
        })
        .returning();
      leagueMap.set(meta.code, newLeague);
    }
  }

  // 1.2 Ensure World Cup 2026 exists
  if (!leagueMap.has("WC")) {
    const [wcLeague] = await db
      .insert(leagues)
      .values({
        name: "FIFA World Cup 2026",
        country: "World",
        code: "WC",
        logo: "🏆",
        season: "2026",
        isActive: true,
      })
      .onConflictDoUpdate({
        target: leagues.code,
        set: { name: "FIFA World Cup 2026", country: "World", logo: "🏆" }
      })
      .returning();
    leagueMap.set("WC", wcLeague);
  }

  // 2. Load ALL teams once to build global cache
  const allDbTeams = await db.select().from(teams);
  const teamCacheByLeagueAndName = new Map<string, number>();
  const teamsListByLeague = new Map<number, Array<{ id: number; name: string }>>();

  for (const t of allDbTeams) {
    teamCacheByLeagueAndName.set(`${t.leagueId}::${t.name.toLowerCase()}`, t.id);
    if (!teamsListByLeague.has(t.leagueId)) {
      teamsListByLeague.set(t.leagueId, []);
    }
    teamsListByLeague.get(t.leagueId)!.push({ id: t.id, name: t.name });
  }

  async function resolveTeamId(leagueId: number, nameRaw: string, country: string): Promise<number> {
    const cacheKey = `${leagueId}::${nameRaw.toLowerCase()}`;
    if (teamCacheByLeagueAndName.has(cacheKey)) {
      return teamCacheByLeagueAndName.get(cacheKey)!;
    }

    const normName = normalizeTeamName(nameRaw);
    const cacheKeyNorm = `${leagueId}::${normName.toLowerCase()}`;
    if (teamCacheByLeagueAndName.has(cacheKeyNorm)) {
      return teamCacheByLeagueAndName.get(cacheKeyNorm)!;
    }

    const lookupList = teamsListByLeague.get(leagueId) || [];
    const matched = findBestTeamMatch(nameRaw, lookupList);
    if (matched) {
      teamCacheByLeagueAndName.set(cacheKey, Number(matched.id));
      return Number(matched.id);
    }

    const [newTeam] = await db
      .insert(teams)
      .values({
        name: normName,
        shortName: normName.slice(0, 4).toUpperCase(),
        country,
        leagueId,
        elo: 1500,
        attackStrength: 1.0,
        defenseStrength: 1.0,
        logo: "⚽",
        position: 10,
        points: 0,
        goalDifference: 0,
      })
      .onConflictDoUpdate({
        target: [teams.leagueId, teams.name],
        set: { name: normName }
      })
      .returning();

    teamCacheByLeagueAndName.set(cacheKey, newTeam.id);
    teamCacheByLeagueAndName.set(cacheKeyNorm, newTeam.id);
    if (!teamsListByLeague.has(leagueId)) {
      teamsListByLeague.set(leagueId, []);
    }
    teamsListByLeague.get(leagueId)!.push({ id: newTeam.id, name: normName });
    createdTeams++;
    return newTeam.id;
  }

  const allDbMatches = await db.select().from(matches);
  const existingMatchesSet = new Set<string>();
  for (const m of allDbMatches) {
    existingMatchesSet.add(`${m.homeTeamId}_${m.awayTeamId}_${m.kickoffAt.getTime()}`);
  }

  function checkMatchExists(homeId: number, awayId: number, kickoff: Date): boolean {
    return existingMatchesSet.has(`${homeId}_${awayId}_${kickoff.getTime()}`);
  }

  const matchesToInsert: any[] = [];

  // 3. Fetch standard seasons
  for (const season of SEASONS) {
    for (const [fileToken, meta] of Object.entries(FILE_TO_LEAGUE)) {
      const leagueRow = leagueMap.get(meta.code)!;
      const url = `https://raw.githubusercontent.com/openfootball/football.json/master/${season}/${fileToken}.json`;

      try {
        const res = await fetch(url, { next: { revalidate: 0 } });
        if (!res.ok) continue;

        const data = (await res.json()) as OpenFootballPayload;
        let rawMatches: OpenFootballMatch[] = [];

        if (data.matches) {
          rawMatches = data.matches;
        } else if (data.rounds) {
          for (const round of data.rounds) {
            if (round.matches) {
              for (const m of round.matches) {
                rawMatches.push({ ...m, round: round.name });
              }
            }
          }
        }

        if (rawMatches.length === 0) continue;
        syncedLeagues++;

        for (const rawMatch of rawMatches) {
          const t1Raw = typeof rawMatch.team1 === "string" ? rawMatch.team1 : rawMatch.team1.name;
          const t2Raw = typeof rawMatch.team2 === "string" ? rawMatch.team2 : rawMatch.team2.name;

          if (!t1Raw || !t2Raw) continue;

          const homeTeamId = await resolveTeamId(leagueRow.id, t1Raw, meta.country);
          const awayTeamId = await resolveTeamId(leagueRow.id, t2Raw, meta.country);

          let kickoffDateStr = rawMatch.date;
          let kickoffTimeStr = "15:00"; // Default kickoff time
          if (rawMatch.time) {
            // Handle "13:00 UTC-6" -> convert to UTC
            const timeMatch = rawMatch.time.match(/(\d{1,2}:\d{2})\s*UTC([+-]\d+)?/);
            if (timeMatch) {
              kickoffTimeStr = timeMatch[1];
              if (timeMatch[2]) {
                const offsetHours = parseInt(timeMatch[2]);
                // If UTC-6, we add 6 hours to get UTC time
                const date = new Date(`${kickoffDateStr}T${kickoffTimeStr}:00`);
                date.setUTCHours(date.getUTCHours() - offsetHours);
                kickoffDateStr = date.toISOString().split('T')[0];
                kickoffTimeStr = date.toISOString().split('T')[1].slice(0, 5);
              }
            }
          }
          
          let kickoff = new Date(`${kickoffDateStr}T${kickoffTimeStr}:00Z`);
          if (isNaN(kickoff.getTime())) {
            kickoff = new Date(kickoffDateStr);
          }

          if (checkMatchExists(homeTeamId, awayTeamId, kickoff)) {
            continue;
          }

          let homeScore: number | null = null;
          let awayScore: number | null = null;
          let status = "scheduled";

          if (rawMatch.score && rawMatch.score.ft) {
            homeScore = rawMatch.score.ft[0];
            awayScore = rawMatch.score.ft[1];
            status = "finished";
          } else if (rawMatch.score1 !== undefined && rawMatch.score2 !== undefined) {
            homeScore = rawMatch.score1;
            awayScore = rawMatch.score2;
            status = "finished";
          }

          let matchday = 1;
          if (rawMatch.round) {
            const mdayMatch = rawMatch.round.match(/\d+/);
            if (mdayMatch) matchday = parseInt(mdayMatch[0]);
          }

          const leagueConfig = getLeagueConfig(meta.code);
          const odds = seededOdds(0, 0, homeTeamId * 31 + awayTeamId * 17);

          matchesToInsert.push({
            leagueId: leagueRow.id,
            homeTeamId,
            awayTeamId,
            kickoffAt: kickoff,
            status,
            matchday,
            homeScore,
            awayScore,
            homeOdds: odds.home,
            drawOdds: odds.draw,
            awayOdds: odds.away,
          });
        }
      } catch (err) {
        console.error(`[github-sync] Soft error on ${season} ${fileToken}:`, err);
      }
    }
  }

  // 4. Harvest World Cup 2026 matches
  const wcUrl = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";
  try {
    const res = await fetch(wcUrl, { next: { revalidate: 0 } });
    if (res.ok) {
      const data = (await res.json()) as OpenFootballPayload;
      let rawMatches: OpenFootballMatch[] = [];

      if (data.matches) {
        rawMatches = data.matches;
      } else if (data.rounds) {
        for (const round of data.rounds) {
          if (round.matches) {
            for (const m of round.matches) {
              rawMatches.push({ ...m, round: round.name });
            }
          }
        }
      }

      if (rawMatches.length > 0) {
        const wcLeagueRow = leagueMap.get("WC")!;
        syncedLeagues++;

        for (const rawMatch of rawMatches) {
          const t1Raw = typeof rawMatch.team1 === "string" ? rawMatch.team1 : rawMatch.team1.name;
          const t2Raw = typeof rawMatch.team2 === "string" ? rawMatch.team2 : rawMatch.team2.name;

          if (!t1Raw || !t2Raw) continue;

          const homeTeamId = await resolveTeamId(wcLeagueRow.id, t1Raw, "World Cup");
          const awayTeamId = await resolveTeamId(wcLeagueRow.id, t2Raw, "World Cup");

          let kickoffDateStr = rawMatch.date;
          let kickoffTimeStr = "18:00";
          if (rawMatch.time) {
            const timeMatch = rawMatch.time.match(/(\d{1,2}:\d{2})\s*UTC([+-]\d+)?/);
            if (timeMatch) {
              kickoffTimeStr = timeMatch[1];
              if (timeMatch[2]) {
                const offsetHours = parseInt(timeMatch[2]);
                const date = new Date(`${kickoffDateStr}T${kickoffTimeStr}:00`);
                date.setUTCHours(date.getUTCHours() - offsetHours);
                kickoffDateStr = date.toISOString().split('T')[0];
                kickoffTimeStr = date.toISOString().split('T')[1].slice(0, 5);
              }
            }
          }
          let kickoff = new Date(`${kickoffDateStr}T${kickoffTimeStr}:00Z`);
          if (isNaN(kickoff.getTime())) {
            kickoff = new Date(kickoffDateStr);
          }

          if (checkMatchExists(homeTeamId, awayTeamId, kickoff)) {
            continue;
          }

          let homeScore: number | null = null;
          let awayScore: number | null = null;
          let status = "scheduled";

          if (rawMatch.score && rawMatch.score.ft) {
            homeScore = rawMatch.score.ft[0];
            awayScore = rawMatch.score.ft[1];
            status = "finished";
          } else if (rawMatch.score1 !== undefined && rawMatch.score2 !== undefined) {
            homeScore = rawMatch.score1;
            awayScore = rawMatch.score2;
            status = "finished";
          }

          const odds = seededOdds(0, 0, homeTeamId * 31 + awayTeamId * 17);

          matchesToInsert.push({
            leagueId: wcLeagueRow.id,
            homeTeamId,
            awayTeamId,
            kickoffAt: kickoff,
            status,
            matchday: 1,
            homeScore,
            awayScore,
            homeOdds: odds.home,
            drawOdds: odds.draw,
            awayOdds: odds.away,
          });
        }
      }
    }
  } catch (err) {
    console.error("[github-sync] Soft error on World Cup 2026 sync:", err);
  }

  // 5. Execute Batch Insert
  const chunkSize = 100;
  console.log(`[github-sync] Batch-inserting ${matchesToInsert.length} new matches...`);

  for (let i = 0; i < matchesToInsert.length; i += chunkSize) {
    const chunk = matchesToInsert.slice(i, i + chunkSize);
    try {
      const insertedRows = await db
        .insert(matches)
        .values(chunk)
        .onConflictDoNothing()
        .returning();
      insertedMatches += insertedRows.length;

      const predictionsToInsert: any[] = [];
      for (const matchRow of insertedRows) {
        if (matchRow.status === "scheduled") {
          const leagueConfig = getLeagueConfig("PL"); // Default fallback
          const input: MatchInput = {
            home: { elo: 1500, attackStrength: 1.0, defenseStrength: 1.0, homeAdvantage: 0.25 },
            away: { elo: 1500, attackStrength: 1.0, defenseStrength: 1.0, homeAdvantage: 0.0 },
            leagueAvgGoals: leagueConfig.avgGoals,
            homeAdvantageBase: 0.15,
            odds: { home: matchRow.homeOdds ?? 2.0, draw: matchRow.drawOdds ?? 3.0, away: matchRow.awayOdds ?? 3.5 },
            leagueCode: "BATCH",
            sampleSize: 10,
          };
          const pred = predictMatch(input);
          predictionsToInsert.push({
            matchId: matchRow.id,
            markets: {
              homeWin: pred.homeWin,
              draw: pred.draw,
              awayWin: pred.awayWin,
              over15: pred.over15,
              over25: pred.over25,
              over35: pred.over35,
              bttsYes: pred.bttsYes,
              bttsNo: pred.bttsNo,
              expectedHomeGoals: pred.expectedHomeGoals,
              expectedAwayGoals: pred.expectedAwayGoals,
              exactScores: pred.exactScores,
              confidence: pred.confidence,
            },
            valueBets: pred.valueBets,
            modelVersion: "dixon-coles-batch-openfootball-v2",
          });
        }
      }

      if (predictionsToInsert.length > 0) {
        await db
          .insert(predictions)
          .values(predictionsToInsert)
          .onConflictDoNothing();
      }
    } catch (insertErr) {
      console.error(`[github-sync] Error batch-inserting chunk at ${i}:`, insertErr);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[github-sync] Completed in ${durationSec}s! Synced: ${syncedLeagues} leagues, created: ${createdTeams} teams, inserted: ${insertedMatches} matches.`);
  return { syncedLeagues, insertedMatches, updatedMatches, createdTeams };
}
