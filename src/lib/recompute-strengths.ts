import { db } from "@/db";
import { matches, teams } from "@/db/schema";
import { eq, asc, isNotNull, sql } from "drizzle-orm";
import { updateElo } from "@/lib/elo";

/**
 * Recomputes Elo ratings and attack/defense strengths for ALL teams from
 * their actual finished-match history. This transforms flat 1500/1.0 defaults
 * (which cause coin-flip predictions) into realistic, data-driven strengths.
 */
export async function recomputeTeamStrengths(): Promise<{ teams: number; matches: number }> {
  // CLEANUP: archive stale "scheduled" matches whose kickoff is >2 days past with
  // no result (old openfootball fixtures). Keeps the dataset clean & accurate.
  await db.execute(
    sql.raw(`
      UPDATE matches SET status = 'finished'
      WHERE status = 'scheduled'
        AND kickoff_at < now() - interval '2 days'
        AND home_score IS NULL
    `)
  ).catch(() => {});

  // Load all finished matches chronologically
  const finished = await db
    .select({
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      leagueId: matches.leagueId,
    })
    .from(matches)
    .where(eq(matches.status, "finished"))
    .orderBy(asc(matches.kickoffAt));

  const valid = finished.filter((m) => m.homeScore != null && m.awayScore != null);
  if (valid.length === 0) return { teams: 0, matches: 0 };

  const elo: Record<number, number> = {};
  const recentElo: Record<number, number> = {}; // time-decayed Elo (recent matches matter more)
  const gamesPlayed: Record<number, number> = {};
  const goalsFor: Record<number, number> = {};
  const goalsAgainst: Record<number, number> = {};
  // Venue-specific goals (home vs away performance differs significantly)
  const homeGF: Record<number, number> = {}, homeGA: Record<number, number> = {}, homePlayed: Record<number, number> = {};
  const awayGF: Record<number, number> = {}, awayGA: Record<number, number> = {}, awayPlayed: Record<number, number> = {};
  const form: Record<number, string> = {}; // chronological W/D/L per team
  // League average goals for normalization
  const leagueGoals: Record<number, { total: number; matches: number }> = {};
  // League home/away split for venue normalization
  const leagueVenue: Record<number, { homeGoals: number; awayGoals: number; matches: number }> = {};

  // Decay: matches lose half their Elo influence every ~halfLife matches of recency.
  const DECAY = 0.985;

  for (const m of valid) {
    const h = m.homeTeamId, a = m.awayTeamId;
    elo[h] = elo[h] ?? 1500;
    elo[a] = elo[a] ?? 1500;
    recentElo[h] = recentElo[h] ?? 1500;
    recentElo[a] = recentElo[a] ?? 1500;
    gamesPlayed[h] = (gamesPlayed[h] ?? 0);
    gamesPlayed[a] = (gamesPlayed[a] ?? 0);

    const hs = m.homeScore!, as = m.awayScore!;

    const upd = updateElo(elo[h], elo[a], hs, as, gamesPlayed[h] < 30, gamesPlayed[a] < 30);
    elo[h] = upd.homeAfter;
    elo[a] = upd.awayAfter;

    // Time-decayed Elo: pull old rating toward 1500 slightly each step, then update
    recentElo[h] = 1500 + (recentElo[h] - 1500) * DECAY;
    recentElo[a] = 1500 + (recentElo[a] - 1500) * DECAY;
    const rUpd = updateElo(recentElo[h], recentElo[a], hs, as, false, false);
    recentElo[h] = rUpd.homeAfter;
    recentElo[a] = rUpd.awayAfter;

    gamesPlayed[h]++;
    gamesPlayed[a]++;
    goalsFor[h] = (goalsFor[h] ?? 0) + hs;
    goalsAgainst[h] = (goalsAgainst[h] ?? 0) + as;
    goalsFor[a] = (goalsFor[a] ?? 0) + as;
    goalsAgainst[a] = (goalsAgainst[a] ?? 0) + hs;

    // Venue-specific accumulation
    homeGF[h] = (homeGF[h] ?? 0) + hs; homeGA[h] = (homeGA[h] ?? 0) + as; homePlayed[h] = (homePlayed[h] ?? 0) + 1;
    awayGF[a] = (awayGF[a] ?? 0) + as; awayGA[a] = (awayGA[a] ?? 0) + hs; awayPlayed[a] = (awayPlayed[a] ?? 0) + 1;

    // Track recent form (latest 10 kept)
    const hRes = hs > as ? "W" : hs === as ? "D" : "L";
    const aRes = as > hs ? "W" : as === hs ? "D" : "L";
    form[h] = ((form[h] ?? "") + hRes).slice(-10);
    form[a] = ((form[a] ?? "") + aRes).slice(-10);

    const lg = leagueGoals[m.leagueId] ?? { total: 0, matches: 0 };
    lg.total += hs + as;
    lg.matches += 1;
    leagueGoals[m.leagueId] = lg;

    const lv = leagueVenue[m.leagueId] ?? { homeGoals: 0, awayGoals: 0, matches: 0 };
    lv.homeGoals += hs; lv.awayGoals += as; lv.matches += 1;
    leagueVenue[m.leagueId] = lv;
  }

  // Map each team to its league for avg-goals normalization
  const allTeams = await db.select({ id: teams.id, leagueId: teams.leagueId }).from(teams);
  const teamLeague = new Map(allTeams.map((t) => [t.id, t.leagueId]));

  let updated = 0;
  const teamIds = Object.keys(elo).map(Number);

  // Build rows for a single batched UPDATE (fast: 1 query instead of N).
  const tuples: string[] = [];
  for (const id of teamIds) {
    const played = gamesPlayed[id] ?? 0;
    if (played === 0) continue;

    const leagueId = teamLeague.get(id);
    const lg = leagueId != null ? leagueGoals[leagueId] : undefined;
    const leagueAvgPerTeam = lg && lg.matches > 0 ? lg.total / lg.matches / 2 : 1.35;

    const gfPerGame = (goalsFor[id] ?? 0) / played;
    const gaPerGame = (goalsAgainst[id] ?? 0) / played;
    const avgRef = leagueAvgPerTeam > 0 ? leagueAvgPerTeam : 1.35;

    const weight = played / (played + 8);
    const clampMain = (v: number) => (Number.isFinite(v) ? Math.max(0.5, Math.min(1.8, v)) : 1.0);
    const attack = clampMain(weight * (gfPerGame / avgRef) + (1 - weight) * 1.0);
    const defense = clampMain(weight * (gaPerGame / avgRef) + (1 - weight) * 1.0);

    // Venue-specific strengths normalized to the league's home/away baselines
    const lv = leagueId != null ? leagueVenue[leagueId] : undefined;
    const lgHomeAvg = lv && lv.matches > 0 ? lv.homeGoals / lv.matches : leagueAvgPerTeam;
    const lgAwayAvg = lv && lv.matches > 0 ? lv.awayGoals / lv.matches : leagueAvgPerTeam;

    const hP = homePlayed[id] ?? 0, aP = awayPlayed[id] ?? 0;
    const hW = hP / (hP + 5), aW = aP / (aP + 5);
    const safe = (v: number, fallback = 1.0) => (Number.isFinite(v) ? Math.max(0.4, Math.min(2.0, v)) : fallback);
    const hHomeAvg = lgHomeAvg > 0 ? lgHomeAvg : 1.45;
    const aAwayAvg = lgAwayAvg > 0 ? lgAwayAvg : 1.15;
    const homeAtk = hP > 0 ? safe(hW * ((homeGF[id] ?? 0) / hP / hHomeAvg) + (1 - hW) * 1.0) : 1.0;
    const homeDef = hP > 0 ? safe(hW * ((homeGA[id] ?? 0) / hP / aAwayAvg) + (1 - hW) * 1.0) : 1.0;
    const awayAtk = aP > 0 ? safe(aW * ((awayGF[id] ?? 0) / aP / aAwayAvg) + (1 - aW) * 1.0) : 1.0;
    const awayDef = aP > 0 ? safe(aW * ((awayGA[id] ?? 0) / aP / hHomeAvg) + (1 - aW) * 1.0) : 1.0;

    const num = (v: number, fb: number) => (Number.isFinite(v) ? v : fb);
    const eloV = Math.round(num(elo[id], 1500) * 10) / 10;
    const recentEloV = Math.round(num(recentElo[id] ?? 1500, 1500) * 10) / 10;
    const atkV = Math.round(num(attack, 1) * 100) / 100;
    const defV = Math.round(num(defense, 1) * 100) / 100;
    const gfV = Math.round(num(gfPerGame, 1.35) * 100) / 100;
    const gaV = Math.round(num(gaPerGame, 1.35) * 100) / 100;
    const form5 = (form[id] ?? "").slice(-5).replace(/'/g, "");
    const form10 = (form[id] ?? "").replace(/'/g, "");
    tuples.push(
      `(${id}, ${eloV}, ${recentEloV}, ${atkV}, ${defV}, ${gfV}, ${gaV}, '${form5}', '${form10}', ${Math.round(homeAtk * 100) / 100}, ${Math.round(homeDef * 100) / 100}, ${Math.round(awayAtk * 100) / 100}, ${Math.round(awayDef * 100) / 100})`
    );
    updated++;
  }

  // Apply in chunks via a single UPDATE ... FROM (VALUES ...) per chunk.
  const chunkSize = 500;
  for (let i = 0; i < tuples.length; i += chunkSize) {
    const chunk = tuples.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    const valuesSql = chunk.join(", ");
    await db.execute(
      sql.raw(`
        UPDATE teams AS t SET
          elo = v.elo,
          recent_elo = v.recent_elo,
          attack_strength = v.attack,
          defense_strength = v.defense,
          xg_scored_avg = v.gf,
          xg_conceded_avg = v.ga,
          form_last_5 = v.form5,
          form_last_10 = v.form10,
          home_attack = v.home_atk,
          home_defense = v.home_def,
          away_attack = v.away_atk,
          away_defense = v.away_def,
          last_updated = now()
        FROM (VALUES ${valuesSql}) AS v(id, elo, recent_elo, attack, defense, gf, ga, form5, form10, home_atk, home_def, away_atk, away_def)
        WHERE t.id = v.id
      `)
    );
  }

  return { teams: updated, matches: valid.length };
}
