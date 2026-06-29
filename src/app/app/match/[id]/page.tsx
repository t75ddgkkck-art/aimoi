"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { formatKickoff } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { prettySelection, prettyMarket } from "@/lib/bet-labels";

type MatchDetail = {
  match: {
    id: number;
    kickoffAt: string;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    minute: number | null;
    matchday: number | null;
    league: { name: string; code: string; country: string; logo: string | null };
    homeTeam: any;
    awayTeam: any;
    odds: { home: number | null; draw: number | null; away: number | null };
  };
  prediction: {
    markets: any;
    valueBets: any[];
    modelVersion: string;
  } | null;
  weather?: { goalMultiplier: number; precipitation: number; windSpeed: number; temperature: number; label: string } | null;
  scoreMatrix: number[][];
};

export default function MatchDetailPage() {
  const { t } = useI18n();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [data, setData] = useState<MatchDetail | null>(null);
  const [hovered, setHovered] = useState<{ i: number; j: number } | null>(null);

  useEffect(() => {
    fetch(`/api/match?id=${id}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null));
  }, [id]);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass rounded-2xl p-6 animate-pulse h-96 w-full max-w-md mx-4" />
      </div>
    );
  }

  const { match, prediction, scoreMatrix } = data;
  const weather = data.weather;
  const m = prediction?.markets;

  // Compute a guaranteed integrity verdict (truqué/fiable) for every match.
  const integrity = (() => {
    if (m?.bettingRisk) return m.bettingRisk;
    if (m && match.odds?.home && match.odds?.draw && match.odds?.away) {
      const impH = 1 / match.odds.home;
      const impD = 1 / match.odds.draw;
      const impA = 1 / match.odds.away;
      const sum = impH + impD + impA || 1;
      const maxDiff = Math.max(
        Math.abs(m.homeWin - impH / sum),
        Math.abs(m.draw - impD / sum),
        Math.abs(m.awayWin - impA / sum)
      );
      let score = Math.max(0, Math.min(100, Math.round(maxDiff * 220)));
      const label = score >= 70 ? "critical" : score >= 45 ? "suspicious" : score >= 25 ? "watch" : "normal";
      const reasons: string[] = [];
      if (score >= 45) reasons.push(`Écart important entre notre modèle et les cotes (${score}/100)`);
      if (score >= 25 && score < 45) reasons.push("Léger écart modèle/cotes, à surveiller");
      if (score < 25) reasons.push("Cotes cohérentes avec notre modèle de prédiction");
      return { label: label as "normal" | "watch" | "suspicious" | "critical", score, reasons };
    }
    return null;
  })();

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-40 glass-strong border-b border-[var(--tg-border)]">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-full bg-[var(--tg-card)] flex items-center justify-center hover:bg-[var(--tg-card-2)]"
          >
            ←
          </button>
          <div className="flex-1">
            <div className="text-[11px] text-[var(--tg-muted)] flex items-center gap-1.5">
              <Logo value={match.league.logo} alt={match.league.name} size={16} />
              {match.league.name}
            </div>
            <div className="text-xs font-semibold">{t("match.prediction")}</div>
          </div>
          {prediction && (
            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
              prediction.modelVersion.includes("xgboost") || prediction.modelVersion.includes("ensemble")
                ? "bg-gradient-to-r from-purple-500/20 to-blue-500/20 text-purple-300 border border-purple-500/30 shimmer"
                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
            }`}>
              {prediction.modelVersion.includes("xgboost") || prediction.modelVersion.includes("ensemble")
                ? "🚀 Stacked Ensemble (XGBoost + LGBM + CatBoost)"
                : "🧠 Dixon-Coles Poisson Calibré"}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4 space-y-4">
        {/* Match header */}
        <div className="glass rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--tg-accent)]/10 rounded-full blur-3xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between text-xs mb-4">
              <span className="text-[var(--tg-muted)]">{formatKickoff(match.kickoffAt)}</span>
              <span className="text-[var(--tg-muted)]">
                {t("match.matchday")} {match.matchday ?? "—"}
              </span>
            </div>

            <div className="grid grid-cols-3 items-center gap-2">
              <TeamColumn team={match.homeTeam} side="home" />
              <div className="text-center">
                {(match.status === "live" || match.status === "finished") && match.homeScore !== null ? (
                  <>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-3xl font-black tabular-nums">{match.homeScore}</span>
                      <span className="text-[var(--tg-muted)]">—</span>
                      <span className="text-3xl font-black tabular-nums">{match.awayScore}</span>
                    </div>
                    {match.status === "live" && (
                      <div className="mt-1 text-[10px] font-bold text-red-400 uppercase tracking-wider">
                        ● {match.minute}'
                      </div>
                    )}
                  </>
                ) : m ? (
                  <>
                    <div className="flex items-center justify-center gap-1 text-[var(--tg-muted)] text-xs mb-1">
                      xG
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-2xl font-bold tabular-nums">
                        {m.expectedHomeGoals?.toFixed(1)}
                      </span>
                      <span className="text-[var(--tg-muted)]">—</span>
                      <span className="text-2xl font-bold tabular-nums">
                        {m.expectedAwayGoals?.toFixed(1)}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-xl font-bold text-[var(--tg-muted)]">VS</div>
                )}
              </div>
              <TeamColumn team={match.awayTeam} side="away" />
            </div>
          </div>
        </div>

        {/* 1X2 probabilities */}
        {m && (
          <div className="glass rounded-2xl p-4">
            <SectionHeader icon="📊" title={t("match.outcome.title")} subtitle={t("match.outcome.subtitle")} />
            <div className="grid grid-cols-3 gap-2 mt-3">
              <OutcomeBox label={t("common.home")} prob={m.homeWin} color="bg-[var(--tg-accent)]" />
              <OutcomeBox label={t("common.draw")} prob={m.draw} color="bg-[var(--tg-muted)]" />
              <OutcomeBox label={t("common.away")} prob={m.awayWin} color="bg-[var(--tg-purple)]" />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-[var(--tg-muted)]">{t("match.modelConfidence")}</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-1.5 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className={`h-full bar-fill ${
                      m.confidence >= 80
                        ? "bg-[var(--tg-green)]"
                        : m.confidence >= 65
                        ? "bg-[var(--tg-yellow)]"
                        : "bg-[var(--tg-muted)]"
                    }`}
                    style={{ width: `${m.confidence}%` }}
                  />
                </div>
                <span className="font-bold tabular-nums w-8 text-right">{m.confidence}</span>
              </div>
            </div>
          </div>
        )}

        {/* Goals markets */}
        {m && (
          <div className="glass rounded-2xl p-4">
            <SectionHeader icon="🥅" title={t("match.goals.title")} subtitle={t("match.goals.subtitle")} />
            <div className="space-y-2 mt-3">
              <MarketRow label={t("match.over15")} prob={m.over15} />
              <MarketRow label={t("match.over25")} prob={m.over25} />
              <MarketRow label={t("match.over35")} prob={m.over35} />
              <MarketRow label={t("match.bttsYes")} prob={m.bttsYes} />
            </div>
          </div>
        )}

        {/* Exact score matrix */}
        {scoreMatrix && scoreMatrix.length > 0 && (
          <div className="glass rounded-2xl p-4">
            <SectionHeader icon="🎯" title={t("match.matrix.title")} subtitle={t("match.matrix.subtitle")} />
            <div className="mt-3">
              <ScoreGrid matrix={scoreMatrix} home={match.homeTeam.shortName} away={match.awayTeam.shortName} />
            </div>
            {hovered && (
              <div className="mt-3 bg-black/40 rounded-xl p-3 text-center fade-in-up">
                <div className="text-xs text-[var(--tg-muted)]">{t("match.matrix.probability")}</div>
                <div className="text-2xl font-black">
                  {match.homeTeam.shortName} {hovered.i} — {hovered.j} {match.awayTeam.shortName}
                </div>
                <div className="text-[var(--tg-accent-2)] font-bold text-lg">
                  {(scoreMatrix[hovered.i][hovered.j] * 100).toFixed(2)}%
                </div>
              </div>
            )}
            <div className="mt-3 text-[11px] text-[var(--tg-muted)]">
              {t("match.matrix.rows", { home: match.homeTeam.shortName, away: match.awayTeam.shortName })}
            </div>
          </div>
        )}

        {/* Top exact scores */}
        {m?.exactScores && (
          <div className="glass rounded-2xl p-4">
            <SectionHeader icon="🏅" title={t("match.top10.title")} />
            <div className="grid grid-cols-2 gap-2 mt-3">
              {m.exactScores.slice(0, 10).map((s: any, idx: number) => (
                <div
                  key={s.score}
                  className={`rounded-xl p-3 flex items-center justify-between ${
                    idx === 0
                      ? "bg-gradient-to-br from-amber-500/20 to-yellow-500/10 border border-amber-500/30"
                      : "bg-black/30"
                  }`}
                >
                  <div>
                    <div className="text-[9px] uppercase text-[var(--tg-muted)]">
                      {idx === 0 ? t("match.top10.most") : `#${idx + 1}`}
                    </div>
                    <div className="font-black text-lg tabular-nums">{s.score}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] uppercase text-[var(--tg-muted)]">{t("match.top10.prob")}</div>
                    <div
                      className={`font-bold tabular-nums ${
                        idx === 0 ? "text-amber-300" : "text-white"
                      }`}
                    >
                      {(s.prob * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weather impact (rain/wind reduce goals) */}
        {weather && weather.label !== "n/a" && (
          <div className="glass rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {weather.precipitation > 2 ? "🌧️" : weather.precipitation > 0.3 ? "🌦️" : weather.windSpeed > 30 ? "💨" : "☀️"}
              </span>
              <div>
                <div className="text-sm font-semibold">Météo · {weather.label}</div>
                <div className="text-[11px] text-[var(--tg-muted)]">
                  {Math.round(weather.temperature)}°C · {Math.round(weather.windSpeed)} km/h · {weather.precipitation.toFixed(1)} mm
                </div>
              </div>
            </div>
            {weather.goalMultiplier < 1 && (
              <span className="text-[10px] font-bold text-orange-300 bg-orange-500/15 px-2 py-1 rounded-full">
                -{Math.round((1 - weather.goalMultiplier) * 100)}% buts
              </span>
            )}
          </div>
        )}

        {/* Match integrity / fixing detection — shown for every match */}
        {integrity && (
          <div className={`glass rounded-2xl p-4 border-l-4 ${
            integrity.label === "critical"
              ? "border-red-500"
              : integrity.label === "suspicious"
              ? "border-orange-500"
              : integrity.label === "watch"
              ? "border-yellow-500"
              : "border-green-500"
          }`}>
            <SectionHeader
              icon="🛡️"
              title="Détecteur de match truqué"
              subtitle="Analyse statistique du marché (indicateur, pas une accusation)"
            />
            <div className="mt-3 flex items-center justify-between bg-black/30 rounded-xl p-3">
              <div>
                <div className="text-[10px] uppercase text-[var(--tg-muted)]">Verdict de l'IA</div>
                <div className={`font-bold text-lg ${
                  integrity.label === "critical" ? "text-red-400"
                  : integrity.label === "suspicious" ? "text-orange-400"
                  : integrity.label === "watch" ? "text-yellow-400"
                  : "text-green-400"
                }`}>
                  {integrity.label === "normal"
                    ? "✅ Match fiable"
                    : integrity.label === "watch"
                    ? "👀 À surveiller"
                    : integrity.label === "suspicious"
                    ? "⚠️ Match suspect"
                    : "🚨 Forte suspicion de trucage"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase text-[var(--tg-muted)]">Risque</div>
                <div className="text-3xl font-black tabular-nums">{integrity.score}<span className="text-sm text-[var(--tg-muted)]">/100</span></div>
              </div>
            </div>
            <ul className="mt-3 space-y-1 text-xs text-[var(--tg-muted)] list-disc pl-4">
              {integrity.reasons.map((r: string, i: number) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Value bets */}
        {prediction?.valueBets && prediction.valueBets.length > 0 && (
          <div className="glass rounded-2xl p-4 border-l-4 border-[var(--tg-yellow)]">
            <SectionHeader icon="💰" title={t("match.value.title")} subtitle={t("match.value.subtitle")} />
            <div className="space-y-2 mt-3">
              {prediction.valueBets.map((v: any, i: number) => (
                <div key={i} className="bg-black/30 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">
                      {prettyMarket(v.market)} · <span className="text-[var(--tg-yellow)]">{prettySelection(v.selection, match.homeTeam?.name, match.awayTeam?.name)}</span>
                    </span>
                    <span className="font-bold tabular-nums">@ {v.odds.toFixed(2)}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
                    <div>
                    <div className="text-[var(--tg-muted)] uppercase">{t("value.model")}</div>
                    <div className="font-bold text-[var(--tg-green)]">
                      {Math.round(v.modelProb * 100)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--tg-muted)] uppercase">{t("value.implied")}</div>
                    <div className="font-bold">{Math.round(v.impliedProb * 100)}%</div>
                  </div>
                  <div>
                    <div className="text-amber-300 uppercase">{t("value.ev")}</div>
                    <div className="font-bold text-amber-300">+{(v.ev * 100).toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-[var(--tg-muted)] uppercase">{t("value.kelly")}</div>
                    <div className="font-bold">{(v.kelly * 100).toFixed(2)}%</div>
                  </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Odds vs model */}
        {match.odds.home && m && (
          <div className="glass rounded-2xl p-4">
            <SectionHeader icon="📈" title={t("match.odds.title")} subtitle={t("match.odds.subtitle")} />
            <div className="mt-3 space-y-2">
              <CompareRow
                label="Home"
                modelProb={m.homeWin}
                odds={match.odds.home}
              />
              <CompareRow
                label="Draw"
                modelProb={m.draw}
                odds={match.odds.draw}
              />
              <CompareRow
                label="Away"
                modelProb={m.awayWin}
                odds={match.odds.away}
              />
            </div>
          </div>
        )}

        <div className="text-[10px] text-[var(--tg-muted)] text-center px-4">
          {t("match.footer", { version: prediction?.modelVersion ?? "dixon-coles-v1" })}
        </div>
      </main>
    </div>
  );
}

function TeamColumn({ team, side }: { team: any; side: "home" | "away" }) {
  return (
    <div className={`flex flex-col items-center ${side === "away" ? "text-right" : "text-left"}`}>
      <div className="mb-1"><Logo value={team.logo} alt={team.name} size={48} fallback="⚪" /></div>
      <div className="font-bold text-sm leading-tight">{team.shortName ?? team.name}</div>
      <div className="text-[10px] text-[var(--tg-muted)] mt-0.5">#{team.position}</div>
      {team.formLast5 && (
        <div className="flex gap-0.5 mt-1">
          {team.formLast5.split("").map((f: string, i: number) => (
            <span
              key={i}
              className={`w-3.5 h-3.5 rounded-[3px] text-[8px] font-black flex items-center justify-center ${
                f === "W"
                  ? "bg-green-500 text-white"
                  : f === "D"
                  ? "bg-gray-500 text-white"
                  : "bg-red-500 text-white"
              }`}
            >
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-lg">{icon}</span>
      <div>
        <div className="font-bold text-sm">{title}</div>
        {subtitle && <div className="text-[10px] text-[var(--tg-muted)]">{subtitle}</div>}
      </div>
    </div>
  );
}

function OutcomeBox({ label, prob, color }: { label: string; prob: number; color: string }) {
  const pct = Math.round(prob * 100);
  const max = Math.max(...[prob]);
  return (
    <div className="bg-black/30 rounded-xl p-3 text-center">
      <div className="text-[10px] uppercase text-[var(--tg-muted)]">{label}</div>
      <div className="text-2xl font-black tabular-nums mt-1">{pct}%</div>
      <div className="h-1 bg-black/40 rounded-full overflow-hidden mt-2">
        <div className={`h-full bar-fill ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MarketRow({ label, prob }: { label: string; prob: number }) {
  const pct = Math.round(prob * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs font-medium">{label}</span>
      <div className="flex-1 h-2 bg-black/40 rounded-full overflow-hidden">
        <div
          className="h-full bar-fill bg-gradient-to-r from-[var(--tg-accent)] to-[var(--tg-accent-2)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-right font-bold tabular-nums text-sm">{pct}%</span>
    </div>
  );
}

function CompareRow({ label, modelProb, odds }: { label: string; modelProb: number; odds: number | null }) {
  const { t } = useI18n();
  if (odds == null) return null;
  const implied = 1 / odds;
  const edge = modelProb - implied;
  const isValue = edge > 0.05;
  return (
    <div className="bg-black/30 rounded-xl p-3 flex items-center justify-between">
      <span className="font-semibold text-sm">{label}</span>
      <div className="flex items-center gap-3 text-xs">
        <div className="text-center">
          <div className="text-[9px] uppercase text-[var(--tg-muted)]">{t("value.model")}</div>
          <div className="font-bold tabular-nums">{Math.round(modelProb * 100)}%</div>
        </div>
        <div className="text-center">
          <div className="text-[9px] uppercase text-[var(--tg-muted)]">{t("value.implied")}</div>
          <div className="font-bold tabular-nums">{Math.round(implied * 100)}%</div>
        </div>
        <div
          className={`px-2 py-1 rounded-lg font-bold tabular-nums ${
            isValue
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              : edge > 0
              ? "bg-[var(--tg-accent)]/20 text-[var(--tg-accent-2)]"
              : "bg-black/30 text-[var(--tg-muted)]"
          }`}
        >
          {edge > 0 ? "+" : ""}
          {(edge * 100).toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

function ScoreGrid({
  matrix,
  home,
  away,
}: {
  matrix: number[][];
  home: string;
  away: string;
}) {
  // Compute max for color scaling
  let max = 0;
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      if (matrix[i][j] > max) max = matrix[i][j];
    }
  }
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[340px]">
        {/* Column headers */}
        <div className="grid grid-cols-8 gap-0.5 mb-0.5">
          <div className="text-[9px] text-[var(--tg-muted)] text-center py-1">{home}\{away}</div>
          {matrix[0].map((_, j) => (
            <div key={j} className="text-[10px] font-bold text-center py-1">
              {j}
            </div>
          ))}
        </div>
        {/* Rows */}
        {matrix.map((row, i) => (
          <div key={i} className="grid grid-cols-8 gap-0.5 mb-0.5">
            <div className="text-[10px] font-bold text-center py-1">{i}</div>
            {row.map((p, j) => {
              const intensity = Math.min(1, p / max);
              const isHigh = p === max;
              const bg = intensityToColor(intensity);
              return (
                <button
                  key={j}
                  className={`score-cell aspect-square rounded-md flex flex-col items-center justify-center text-[9px] font-semibold ${
                    isHigh ? "ring-1 ring-amber-400" : ""
                  }`}
                  style={{ background: bg }}
                >
                  <span className="font-black tabular-nums">
                    {(p * 100).toFixed(p * 100 < 1 ? 1 : 0)}
                  </span>
                  <span className="text-[7px] text-white/60">%</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function intensityToColor(intensity: number): string {
  // From dark gray (0) to green (0.5) to amber (1.0)
  if (intensity < 0.1) return "rgba(60,60,70,0.5)";
  if (intensity < 0.3) return "rgba(14,116,144,0.5)";
  if (intensity < 0.5) return "rgba(16,185,129,0.6)";
  if (intensity < 0.7) return "rgba(52,211,153,0.7)";
  if (intensity < 0.9) return "rgba(251,191,36,0.75)";
  return "rgba(245,158,11,0.85)";
}
