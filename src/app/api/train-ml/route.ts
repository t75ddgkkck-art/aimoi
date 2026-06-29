import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { ensureSeeded } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

export async function POST() {
  await ensureSeeded();
  const url = process.env.ML_SERVICE_URL;
  if (!url) return NextResponse.json({ error: "ML_SERVICE_URL missing" }, { status: 400 });

  // Use raw SQL to join both home and away teams with full features
  const rows: any[] = await db.execute(sql.raw(`
    SELECT
      m.home_score AS "homeScore",
      m.away_score AS "awayScore",
      m.home_odds AS "homeOdds",
      m.draw_odds AS "drawOdds",
      m.away_odds AS "awayOdds",
      m.match_importance AS "matchImportance",
      ht.elo AS "homeElo",
      at.elo AS "awayElo",
      ht.attack_strength AS "homeAttack",
      at.attack_strength AS "awayAttack",
      ht.defense_strength AS "homeDefense",
      at.defense_strength AS "awayDefense",
      ht.xg_scored_avg AS "homeXg",
      at.xg_scored_avg AS "awayXg",
      ht.xg_conceded_avg AS "homeXga",
      at.xg_conceded_avg AS "awayXga",
      ht.injured_count AS "homeInjured",
      at.injured_count AS "awayInjured",
      ht.position AS "homePosition",
      at.position AS "awayPosition",
      ht.points AS "homePoints",
      at.points AS "awayPoints"
    FROM matches m
    JOIN teams ht ON m.home_team_id = ht.id
    JOIN teams at ON m.away_team_id = at.id
    WHERE m.status = 'finished' AND m.home_score IS NOT NULL AND m.away_score IS NOT NULL
    ORDER BY m.kickoff_at DESC
    LIMIT 3000
  `)).then((r: any) => r.rows ?? r);

  const trainingRows = rows.map((r: any) => {
    let outcome = 1; // Draw
    if (r.homeScore > r.awayScore) outcome = 0; // Home Win
    if (r.homeScore < r.awayScore) outcome = 2; // Away Win

    const impliedHome = r.homeOdds ? 1 / r.homeOdds : 0.4;
    const impliedDraw = r.drawOdds ? 1 / r.drawOdds : 0.27;
    const impliedAway = r.awayOdds ? 1 / r.awayOdds : 0.33;

    return {
      homeElo: r.homeElo ?? 1500,
      awayElo: r.awayElo ?? 1500,
      eloDiff: (r.homeElo ?? 1500) - (r.awayElo ?? 1500),
      homeAttack: r.homeAttack ?? 1.0,
      awayAttack: r.awayAttack ?? 1.0,
      homeDefense: r.homeDefense ?? 1.0,
      awayDefense: r.awayDefense ?? 1.0,
      homeXg: r.homeXg ?? 1.35,
      awayXg: r.awayXg ?? 1.35,
      homeXga: r.homeXga ?? 1.35,
      awayXga: r.awayXga ?? 1.35,
      homeInjured: r.homeInjured ?? 0,
      awayInjured: r.awayInjured ?? 0,
      homeForm: 1.0,
      awayForm: 1.0,
      homePosition: r.homePosition ?? 10,
      awayPosition: r.awayPosition ?? 10,
      pointsDiff: (r.homePoints ?? 0) - (r.awayPoints ?? 0),
      impliedHome,
      impliedDraw,
      impliedAway,
      matchImportance: r.matchImportance ?? 1.0,
      outcome,
    };
  });

  if (trainingRows.length < 30) {
    return NextResponse.json({ error: `Not enough historical data (have ${trainingRows.length}, need 30)` });
  }

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/train`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: trainingRows }),
      signal: AbortSignal.timeout(120000),
    });

    const text = await res.text();
    if (!res.ok) {
      // The hosted HF Space currently has an outdated /train handler.
      // We don't fail the app — the local Dixon-Coles ensemble keeps running.
      return NextResponse.json({
        success: false,
        trained: false,
        rowsSent: trainingRows.length,
        httpStatus: res.status,
        note:
          "Le service Hugging Face a renvoyé une erreur sur /train. Le code corrigé est dans ml_service/app.py — il faut redéployer le Space pour activer l'ensemble XGBoost/LightGBM/CatBoost. En attendant, le modèle Dixon-Coles calibré local reste actif.",
        detail: text.slice(0, 200),
      });
    }

    let data: any = {};
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
    return NextResponse.json({ success: true, trained: true, rowsSent: trainingRows.length, ...data });
  } catch (err) {
    return NextResponse.json({
      success: false,
      trained: false,
      note: "Service ML injoignable (timeout/cold start). Le modèle local reste actif.",
      error: String(err),
    });
  }
}
