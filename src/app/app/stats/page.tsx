"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

type StatsResponse = {
  overall: { totalPredictions: number; correct: number; accuracy: number };
  byMarket: Array<{
    market: string;
    windows: Array<{ windowDays: number; total: number; correct: number; accuracy: number }>;
  }>;
  audit?: {
    brierScore: number;
    logLoss: number;
    matchesEvaluated: number;
    formula: string;
  };
  modelInfo: {
    name: string;
    algorithms: string[];
    features: number;
    retrainSchedule: string;
    lastRetrain: string;
  };
};

type MonteCarloResponse = {
  leagueName: string;
  season: string;
  simulatedPaths: number;
  champions: Array<{ teamName: string; logo: string | null; championshipProbability: number }>;
};

type BenchmarkResponse = {
  ourModel: { name: string; accuracy: number; brierScore: number; logLoss: number; evaluated: number };
  bookmaker: { name: string; accuracy: number; brierScore: number; logLoss: number; evaluated: number };
  naive: { name: string; accuracy: number; brierScore: number; logLoss: number; evaluated: number };
  verdict: string;
};

export default function StatsPage() {
  const { t } = useI18n();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [mc, setMc] = useState<MonteCarloResponse | null>(null);
  const [bench, setBench] = useState<BenchmarkResponse | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => setStats(null));

    fetch("/api/monte-carlo")
      .then((r) => r.json())
      .then((d) => setMc(d))
      .catch(() => setMc(null));

    fetch("/api/benchmark")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setBench(d); })
      .catch(() => setBench(null));
  }, []);

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-md mx-auto px-4 py-3">
        <h1 className="font-bold text-lg flex items-center gap-2">
          <span>📊</span> {t("stats.title")}
        </h1>
        <p className="text-[11px] text-[var(--tg-muted)]">{t("stats.subtitle")}</p>
      </div>

      <main className="max-w-md mx-auto px-4 space-y-4">
        {!stats && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass rounded-2xl p-4 animate-pulse h-40" />
            ))}
          </div>
        )}
        {stats && (
          <>
            <div className="glass rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute inset-0 shimmer opacity-40"></div>
              <div className="relative">
                <div className="text-xs uppercase tracking-wider text-[var(--tg-muted)] mb-2">
                  {t("stats.overall.title")}
                </div>
                <div className="flex items-baseline gap-2">
                  <div className="text-5xl font-black tabular-nums text-[var(--tg-green)]">
                    {Math.round(stats.overall.accuracy * 100)}
                  </div>
                  <div className="text-2xl font-bold text-[var(--tg-green)]">%</div>
                </div>
                <div className="text-xs text-[var(--tg-muted)] mt-2">
                  {stats.overall.correct.toLocaleString()} {t("stats.overall.correct")}{" "}
                  {stats.overall.totalPredictions.toLocaleString()} {t("stats.overall.predictions")}
                </div>
                <div className="mt-3 h-2 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-emerald-400 bar-fill rounded-full"
                    style={{ width: `${Math.round(stats.overall.accuracy * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {bench && bench.ourModel.evaluated > 0 && (
              <div className="glass rounded-2xl p-4">
                <div className="text-sm font-semibold mb-1">⚔️ Comparatif vs les meilleurs outils</div>
                <p className="text-[11px] text-[var(--tg-muted)] mb-3">
                  Évalué sur {bench.ourModel.evaluated.toLocaleString()} matchs terminés
                </p>
                <div className="space-y-2">
                  {[bench.ourModel, bench.bookmaker, bench.naive].map((mdl, i) => (
                    <div key={i} className={`rounded-xl p-3 ${i === 0 ? "bg-[var(--tg-accent)]/15 border border-[var(--tg-accent)]/30" : "bg-black/30"}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">{i === 0 ? "🤖 " : i === 1 ? "🏦 " : "🎲 "}{mdl.name}</span>
                        <span className="text-sm font-black tabular-nums text-[var(--tg-green)]">{Math.round(mdl.accuracy * 100)}%</span>
                      </div>
                      <div className="flex gap-4 mt-1 text-[10px] text-[var(--tg-muted)]">
                        <span>Brier: <b className="text-white tabular-nums">{mdl.brierScore.toFixed(3)}</b></span>
                        <span>Log Loss: <b className="text-white tabular-nums">{mdl.logLoss.toFixed(3)}</b></span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] mt-3 font-medium">{bench.verdict}</p>
                <p className="text-[9px] text-[var(--tg-muted)] mt-1">Brier &amp; Log Loss : plus bas = meilleur</p>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-sm font-semibold">{t("stats.byMarket")}</div>
              {stats.byMarket.map((m) => {
                const w90 = m.windows.find((w) => w.windowDays === 90);
                const w30 = m.windows.find((w) => w.windowDays === 30);
                return (
                  <div key={m.market} className="glass rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-bold text-sm">{m.market}</div>
                      <div className="text-[11px] text-[var(--tg-muted)]">
                        {w90?.total ?? 0}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div className="bg-black/30 rounded-lg p-2">
                        <div className="text-[9px] uppercase text-[var(--tg-muted)]">{t("stats.window30")}</div>
                        <div className="text-xl font-bold tabular-nums text-[var(--tg-accent-2)]">
                          {Math.round((w30?.accuracy ?? 0) * 100)}%
                        </div>
                      </div>
                      <div className="bg-black/30 rounded-lg p-2">
                        <div className="text-[9px] uppercase text-[var(--tg-muted)]">{t("stats.window90")}</div>
                        <div className="text-xl font-bold tabular-nums text-[var(--tg-green)]">
                          {Math.round((w90?.accuracy ?? 0) * 100)}%
                        </div>
                      </div>
                    </div>
                    <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--tg-green)] bar-fill"
                        style={{ width: `${Math.round((w90?.accuracy ?? 0) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Real-time Math Audits (Brier Score / Log Loss) */}
            {stats.audit && (
              <div className="glass rounded-2xl p-4 border border-blue-500/20">
                <div className="font-bold text-sm mb-3 flex items-center gap-2 text-blue-300">
                  <span>🛡️</span> Métriques d'Évaluation Rigoureuses
                </div>
                <div className="grid grid-cols-2 gap-2 text-center text-xs mb-3">
                  <div className="bg-black/35 rounded-xl p-3">
                    <div className="text-[9px] uppercase text-[var(--tg-muted)]">Brier Score</div>
                    <div className="text-xl font-black text-white mt-1 tabular-nums">
                      {stats.audit.brierScore.toFixed(3)}
                    </div>
                    <div className="text-[8px] text-[var(--tg-muted)] mt-1">Cible &lt; 0.50 (Plus bas = mieux)</div>
                  </div>
                  <div className="bg-black/35 rounded-xl p-3">
                    <div className="text-[9px] uppercase text-[var(--tg-muted)]">Multi-Class Log Loss</div>
                    <div className="text-xl font-black text-white mt-1 tabular-nums">
                      {stats.audit.logLoss.toFixed(3)}
                    </div>
                    <div className="text-[8px] text-[var(--tg-muted)] mt-1">Entropy pénalisée par parité</div>
                  </div>
                </div>
                <div className="text-[10px] text-[var(--tg-muted)] text-right">
                  Échantillon d'audit : <span className="text-white font-bold">{stats.audit.matchesEvaluated}</span> matchs · {stats.audit.formula}
                </div>
              </div>
            )}

            {/* Monte Carlo World Cup Projections */}
            {mc && mc.champions && mc.champions.length > 0 && (
              <div className="glass rounded-2xl p-4 border border-purple-500/20 relative overflow-hidden">
                <div className="font-bold text-sm mb-3 flex items-center gap-2 text-purple-300">
                  <span>🏆</span> Simulations de Monte Carlo
                </div>
                <p className="text-[10px] text-[var(--tg-muted)] mb-3">
                  Projection de titre pour {mc.leagueName} {mc.season} basée sur {mc.simulatedPaths} chemins de tournoi indépendants.
                </p>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {mc.champions.slice(0, 8).map((champ, idx) => (
                    <div key={idx} className="bg-black/25 rounded-xl p-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--tg-muted)] w-4 text-center">#{idx + 1}</span>
                        <div className="font-semibold text-white">{champ.teamName}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-1.5 bg-black/40 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-purple-500 to-indigo-400"
                            style={{ width: `${Math.round(champ.championshipProbability * 100)}%` }}
                          />
                        </div>
                        <span className="font-black tabular-nums text-purple-300">
                          {(champ.championshipProbability * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="glass rounded-2xl p-4">
              <div className="font-bold text-sm mb-3 flex items-center gap-2">
                <span>🧠</span> {stats.modelInfo.name}
              </div>
              <div className="text-xs text-[var(--tg-muted)] mb-3">{t("stats.model.desc")}</div>
              <div className="space-y-2">
                <InfoRow label={t("stats.model.algorithms")} value={stats.modelInfo.algorithms.join(", ")} />
                <InfoRow label={t("stats.model.features")} value={`${stats.modelInfo.features} ${t("stats.model.features.eng")}`} />
                <InfoRow label={t("stats.model.retrain")} value={t("stats.model.retrain.weekly")} />
                <InfoRow
                  label={t("stats.model.lastRetrain")}
                  value={new Date(stats.modelInfo.lastRetrain).toLocaleDateString()}
                />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs border-t border-[var(--tg-border)] pt-2 first:border-t-0 first:pt-0">
      <span className="text-[var(--tg-muted)]">{label}</span>
      <span className="font-semibold text-right">{value}</span>
    </div>
  );
}
