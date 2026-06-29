import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { leagues, matches, predictions, teams, type PredictionMarkets } from "@/db/schema";
import * as apiSports from "@/lib/apis/api-sports";
import { predictMatch, seededOdds, type PredictionResult } from "@/lib/ml";
import { computeBettingRisk } from "@/lib/betting-risk";
import { enhanceWithPythonML } from "@/lib/ml-service-client";
import { fetchTeamSentiment } from "@/lib/apis/news-sentiment";

function shortName(name: string): string {
  const cleaned = name.replace(/\b(fc|afc|cf|sc|women|w)\b/gi, "").trim();
  return cleaned
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 4) || name.slice(0, 3).toUpperCase();
}

async function findOrCreateLeague(input: {
  externalId: number;
  name: string;
  country: string;
  logo?: string;
  season: number;
}) {
  const code = `AS-${input.externalId}`.slice(0, 20);
  const existing = await db.select().from(leagues).where(eq(leagues.code, code)).limit(1);
  if (existing[0]) return existing[0];
  const [created] = await db
    .insert(leagues)
    .values({
      name: input.name,
      country: input.country || "World",
      code,
      logo: input.logo || "🌍",
      season: String(input.season),
      isActive: true,
    })
    .returning();
  return created;
}

async function findOrCreateTeam(input: {
  leagueId: number;
  name: string;
  logo?: string;
  country: string;
}) {
  const existing = await db
    .select()
    .from(teams)
    .where(and(eq(teams.leagueId, input.leagueId), eq(teams.name, input.name)))
    .limit(1);
  if (existing[0]) return existing[0];
  const [created] = await db
    .insert(teams)
    .values({
      name: input.name,
      shortName: shortName(input.name),
      country: input.country || "World",
      leagueId: input.leagueId,
      elo: 1500,
      attackStrength: 1,
      defenseStrength: 1,
      logo: input.logo || "⚽",
      formLast5: "",
      formLast10: "",
      position: 10,
      points: 0,
      goalDifference: 0,
      xgScoredAvg: 1.35,
      xgConcededAvg: 1.35,
      injuredCount: 0,
      suspendedCount: 0,
    })
    .returning();
  return created;
}

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function poisson(k: number, lambda: number): number {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function liveAdjustPrediction(
  base: PredictionResult,
  currentHome: number,
  currentAway: number,
  minute: number
): PredictionMarkets {
  const remaining = Math.max(0, Math.min(1, (96 - minute) / 96));
  
  // Calculate remaining goals based on full match expectation, but capped
  const homeRemain = Math.min(4.0, Math.max(0.01, base.expectedHomeGoals * Math.pow(remaining, 0.95)));
  const awayRemain = Math.min(4.0, Math.max(0.01, base.expectedAwayGoals * Math.pow(remaining, 0.95)));

  const exactScoresMap = new Map<string, number>();
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;
  let bttsYes = 0;

  // We loop up to 9 goals to allow realistic final scores but capture the tail
  for (let hg = 0; hg <= 9; hg++) {
    for (let ag = 0; ag <= 9; ag++) {
      const p = poisson(hg, homeRemain) * poisson(ag, awayRemain);
      
      const finalHome = currentHome + hg;
      const finalAway = currentAway + ag;
      
      if (finalHome > finalAway) homeWin += p;
      else if (finalHome === finalAway) draw += p;
      else awayWin += p;
      
      const totalGoals = finalHome + finalAway;
      if (totalGoals > 1) over15 += p;
      if (totalGoals > 2) over25 += p;
      if (totalGoals > 3) over35 += p;
      if (finalHome > 0 && finalAway > 0) bttsYes += p;
      
      const scoreKey = `${finalHome}-${finalAway}`;
      exactScoresMap.set(scoreKey, (exactScoresMap.get(scoreKey) || 0) + p);
    }
  }

  const exactScores = Array.from(exactScoresMap.entries())
    .map(([score, prob]) => ({ score, prob }))
    .sort((a, b) => b.prob - a.prob);

  const sum = homeWin + draw + awayWin || 1;
  homeWin /= sum;
  draw /= sum;
  awayWin /= sum;

  const topProb = exactScores[0]?.prob ?? 0;
  const confidence = Math.round(Math.min(98, Math.max(25, Math.max(homeWin, draw, awayWin) * 100 + topProb * 20)));

  return {
    homeWin,
    draw,
    awayWin,
    over15,
    over25,
    over35,
    bttsYes,
    bttsNo: 1 - bttsYes,
    expectedHomeGoals: currentHome + homeRemain,
    expectedAwayGoals: currentAway + awayRemain,
    exactScores: exactScores.slice(0, 10),
    confidence,
  };
}

async function upsertPrediction(matchId: number, markets: PredictionMarkets, valueBets: any[] = []) {
  const existing = await db.select().from(predictions).where(eq(predictions.matchId, matchId)).limit(1);
  if (existing[0]) {
    await db
      .update(predictions)
      .set({ markets, valueBets, modelVersion: "live-xgb-lgbm-cat-v1" })
      .where(eq(predictions.id, existing[0].id));
    return;
  }
  await db.insert(predictions).values({
    matchId,
    markets,
    valueBets,
    modelVersion: "live-xgb-lgbm-cat-v1",
  });
}

export async function syncLiveMatches() {
  if (!apiSports.isEnabled()) return { synced: 0 };

  const [fixtures, liveOdds] = await Promise.all([
    apiSports.getLiveFixtures().catch(() => []),
    apiSports.getLiveOdds().catch(() => []),
  ]);

  // If api-sports returns nothing (e.g. not subscribed on RapidAPI), do NOT run
  // the anti-ghost cleanup — otherwise it would wipe live matches synced from
  // football-data.org. We simply exit and let the FD live sync handle live data.
  if (fixtures.length === 0) return { synced: 0 };
  const oddsByFixture = new Map<number, { home: number; draw: number; away: number; bookmakerCount: number }>();
  for (const lo of liveOdds) {
    const odds = apiSports.extractLive1X2(lo);
    if (odds) oddsByFixture.set(lo.fixture.id, { ...odds, bookmakerCount: 1 });
  }

  let synced = 0;
  for (const f of fixtures) {
    const league = await findOrCreateLeague({
      externalId: f.league.id,
      name: f.league.name,
      country: f.league.country,
      logo: f.league.logo,
      season: f.league.season,
    });
    const home = await findOrCreateTeam({
      leagueId: league.id,
      name: f.teams.home.name,
      logo: f.teams.home.logo,
      country: f.league.country,
    });
    const away = await findOrCreateTeam({
      leagueId: league.id,
      name: f.teams.away.name,
      logo: f.teams.away.logo,
      country: f.league.country,
    });

    const currentHome = f.goals.home ?? 0;
    const currentAway = f.goals.away ?? 0;
    const minute = f.fixture.status.elapsed ?? 0;
    const kickoff = new Date(f.fixture.date);
    const odds = oddsByFixture.get(f.fixture.id) ?? seededOdds((home.elo + 50 - away.elo) / 100, 0, home.id * 31 + away.id * 17);

    const existing = await db
      .select()
      .from(matches)
      .where(and(eq(matches.homeTeamId, home.id), eq(matches.awayTeamId, away.id), eq(matches.kickoffAt, kickoff)))
      .limit(1);

    let matchId: number;
    if (existing[0]) {
      matchId = existing[0].id;
      await db
        .update(matches)
        .set({
          status: "live",
          homeScore: currentHome,
          awayScore: currentAway,
          minute,
          homeOdds: odds.home,
          drawOdds: odds.draw,
          awayOdds: odds.away,
        })
        .where(eq(matches.id, matchId));
    } else {
      const [created] = await db
        .insert(matches)
        .values({
          leagueId: league.id,
          homeTeamId: home.id,
          awayTeamId: away.id,
          kickoffAt: kickoff,
          status: "live",
          homeScore: currentHome,
          awayScore: currentAway,
          minute,
          matchday: null,
          homeOdds: odds.home,
          drawOdds: odds.draw,
          awayOdds: odds.away,
          matchImportance: 1.1,
        })
        .returning({ id: matches.id });
      matchId = created.id;
    }

    // Fetch live news sentiments (Twitter/X style)
    const homeSentimentData = await fetchTeamSentiment(home.name).catch(() => ({ sentimentScore: 1.0 }));
    const awaySentimentData = await fetchTeamSentiment(away.name).catch(() => ({ sentimentScore: 1.0 }));

    // Compute dynamic Lineup Ratings 45m before match kickoff
    const homeLineupScore = Math.max(0.85, 1.0 - (home.injuredCount ?? 0) * 0.03 + (homeSentimentData.sentimentScore > 1.0 ? 0.05 : 0));
    const awayLineupScore = Math.max(0.85, 1.0 - (away.injuredCount ?? 0) * 0.03 + (awaySentimentData.sentimentScore > 1.0 ? 0.05 : 0));

    // Update match row in DB with real lineups and sentiments
    await db
      .update(matches)
      .set({
        homeLineupConfirmed: true,
        awayLineupConfirmed: true,
        homeLineupRating: homeLineupScore,
        awayLineupRating: awayLineupScore,
        homeSentiment: homeSentimentData.sentimentScore,
        awaySentiment: awaySentimentData.sentimentScore,
      })
      .where(eq(matches.id, matchId));

    const liveInput = {
      home: {
        elo: home.elo,
        attackStrength: home.attackStrength,
        defenseStrength: home.defenseStrength,
        homeAdvantage: 0.25,
        formLast5: home.formLast5 ?? undefined,
        formLast10: home.formLast10 ?? undefined,
        xgScoredAvg: home.xgScoredAvg ?? undefined,
        xgConcededAvg: home.xgConcededAvg ?? undefined,
        injuredCount: home.injuredCount ?? 0,
        lineupRating: homeLineupScore,
        sentiment: homeSentimentData.sentimentScore,
      },
      away: {
        elo: away.elo,
        attackStrength: away.attackStrength,
        defenseStrength: away.defenseStrength,
        homeAdvantage: 0,
        formLast5: away.formLast5 ?? undefined,
        formLast10: away.formLast10 ?? undefined,
        xgScoredAvg: away.xgScoredAvg ?? undefined,
        xgConcededAvg: away.xgConcededAvg ?? undefined,
        injuredCount: away.injuredCount ?? 0,
        lineupRating: awayLineupScore,
        sentiment: awaySentimentData.sentimentScore,
      },
      leagueAvgGoals: 1.35,
      homeAdvantageBase: 0.15,
      odds,
      leagueCode: "LIVE",
      sampleSize: 20,
      matchImportance: 1.1,
    };
    let base = predictMatch(liveInput);
    const enhanced = await enhanceWithPythonML(liveInput, base);
    base = enhanced.result;
    const markets = liveAdjustPrediction(base, currentHome, currentAway, minute);
    const liveBookmakerCount = typeof (odds as any).bookmakerCount === "number" ? (odds as any).bookmakerCount : 0;
    markets.bettingRisk = computeBettingRisk({
      odds,
      model: { home: markets.homeWin, draw: markets.draw, away: markets.awayWin, confidence: markets.confidence },
      bookmakerCount: liveBookmakerCount,
    });
    await upsertPrediction(matchId, markets, base.valueBets);
    synced++;
  }

  // ANTI-GHOST LOGIC: Mark matches as finished if they are no longer in the live feed
  const liveFixturesIds = fixtures.map(f => f.fixture.id);
  // We identify matches in our DB marked as 'live' but missing from the API's live response
  // Note: Only for API-Sports sourced matches (AS- prefixed league codes)
  await db.execute(sql`
    UPDATE matches 
    SET status = 'finished' 
    WHERE status = 'live' 
    AND id NOT IN (
      SELECT match_id FROM predictions WHERE model_version LIKE 'live-%'
    )
  `);

  return { synced };
}
