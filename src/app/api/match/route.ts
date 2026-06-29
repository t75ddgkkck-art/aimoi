import { NextResponse } from "next/server";
import { db } from "@/db";
import { leagues, matches, predictions, teams } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ensureSeeded } from "@/lib/bootstrap";
import { predictMatch } from "@/lib/ml";
import { enhanceWithPythonML } from "@/lib/ml-service-client";
import { getLeagueConfig } from "@/lib/league-config";
import { computeBettingRisk } from "@/lib/betting-risk";
import { getWeatherImpact } from "@/lib/apis/weather";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/match?id=123 — single match with full prediction + exact score matrix
export async function GET(req: Request) {
  await ensureSeeded();
  const { searchParams } = new URL(req.url);
  const idParam = searchParams.get("id");
  if (!idParam) return NextResponse.json({ error: "id required" }, { status: 400 });
  const id = parseInt(idParam);
  if (isNaN(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const [row] = await db
    .select()
    .from(matches)
    .innerJoin(leagues, eq(matches.leagueId, leagues.id))
    .where(eq(matches.id, id))
    .limit(1);

  if (!row) return NextResponse.json({ error: "match not found" }, { status: 404 });

  const [home, away] = await Promise.all([
    db.select().from(teams).where(eq(teams.id, row.matches.homeTeamId)).then((r) => r[0]),
    db.select().from(teams).where(eq(teams.id, row.matches.awayTeamId)).then((r) => r[0]),
  ]);

  const pred = await db
    .select()
    .from(predictions)
    .where(eq(predictions.matchId, id))
    .then((r) => r[0]);

  // Recompute matrix and probabilities with advanced ML Ensemble
  let matrix: number[][] = [];
  let updatedMarkets = pred?.markets;
  let modelVersion = pred?.modelVersion;

  const matchInput = {
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
    },
    leagueAvgGoals: getLeagueConfig(row.leagues.code).avgGoals,
    homeAdvantageBase: 0.15,
    odds: {
      home: row.matches.homeOdds ?? 2.0,
      draw: row.matches.drawOdds ?? 3.4,
      away: row.matches.awayOdds ?? 3.2,
    },
    leagueCode: row.leagues.code,
    matchImportance: row.matches.matchImportance ?? 1.0,
  };

  // Weather impact for upcoming matches (rain/wind reduce goals)
  let weather: any = null;
  const hoursUntil = (row.matches.kickoffAt.getTime() - Date.now()) / 3600_000;
  if (row.matches.status === "scheduled" && hoursUntil > -3 && hoursUntil < 14 * 24) {
    weather = await getWeatherImpact(row.leagues.country ?? "World", row.matches.kickoffAt.toISOString()).catch(() => null);
    if (weather) (matchInput as any).weatherMultiplier = weather.goalMultiplier;
  }

  // 1. Calculate local Dixon-Coles Matrix
  const localPred = predictMatch(matchInput);
  matrix = localPred.scoreMatrix;

  // 2. Enhance with Python Ensemble if available
  const enhanced = await enhanceWithPythonML(matchInput, localPred);
  updatedMarkets = enhanced.result;
  if (enhanced.modelVersion) modelVersion = enhanced.modelVersion;

  // 3. Always attach a fresh match-integrity (fixing) verdict
  if (updatedMarkets) {
    updatedMarkets = {
      ...updatedMarkets,
      bettingRisk: computeBettingRisk({
        odds: matchInput.odds,
        model: {
          home: updatedMarkets.homeWin,
          draw: updatedMarkets.draw,
          away: updatedMarkets.awayWin,
          confidence: updatedMarkets.confidence,
        },
        openingHomeOdds: row.matches.openingHomeOdds,
      }),
    };
  }

  return NextResponse.json({
    match: {
      id: row.matches.id,
      kickoffAt: row.matches.kickoffAt.toISOString(),
      status: row.matches.status,
      homeScore: row.matches.homeScore,
      awayScore: row.matches.awayScore,
      minute: row.matches.minute,
      matchday: row.matches.matchday,
      league: {
        name: row.leagues.name,
        code: row.leagues.code,
        country: row.leagues.country,
        logo: row.leagues.logo,
      },
      homeTeam: {
        id: home.id,
        name: home.name,
        shortName: home.shortName,
        logo: home.logo,
        elo: home.elo,
        attack: home.attackStrength,
        defense: home.defenseStrength,
        formLast5: home.formLast5,
        position: home.position,
        points: home.points,
        gd: home.goalDifference,
      },
      awayTeam: {
        id: away.id,
        name: away.name,
        shortName: away.shortName,
        logo: away.logo,
        elo: away.elo,
        attack: away.attackStrength,
        defense: away.defenseStrength,
        formLast5: away.formLast5,
        position: away.position,
        points: away.points,
        gd: away.goalDifference,
      },
      odds: {
        home: row.matches.homeOdds,
        draw: row.matches.drawOdds,
        away: row.matches.awayOdds,
      },
    },
    weather,
    prediction: updatedMarkets
      ? {
          markets: updatedMarkets,
          valueBets: pred?.valueBets ?? [],
          modelVersion: modelVersion,
        }
      : null,
    scoreMatrix: matrix,
  });
}
