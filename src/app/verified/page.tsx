"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type StatsResponse = {
  overall: { accuracy: number; totalPredictions: number; correct: number };
  byMarket: Array<{
    market: string;
    windows: Array<{ windowDays: number; accuracy: number; total: number }>;
  }>;
};

type ClosingValueResponse = {
  aiBeatMarketRate: number;
  averageEdgePerMatch: number;
  matchesAnalyzed: number;
  verdict: string;
};

export default function VerifiedPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [clv, setClv] = useState<ClosingValueResponse | null>(null);

  useEffect(() => {
    fetch("/api/stats").then(r => r.json()).then(setStats).catch(() => {});
    fetch("/api/closing-value").then(r => r.json()).then(setClv).catch(() => {});
  }, []);

  const accuracy = stats ? Math.round(stats.overall.accuracy * 100) : 0;

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 hero-gradient opacity-50"></div>
      <div className="absolute inset-0 noise"></div>

      <header className="relative z-10 max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--tg-accent)] to-[var(--tg-accent-2)] flex items-center justify-center">
            <span className="text-lg">⚽</span>
          </div>
          <span className="font-bold text-lg">GoalMind AI</span>
        </Link>
        <Link href="/app" className="text-sm font-semibold bg-white text-black px-4 py-2 rounded-full">
          Ouvrir l'app →
        </Link>
      </header>

      <section className="relative z-10 max-w-4xl mx-auto px-6 py-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-xs mb-6 text-green-300">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
          STATISTIQUES VÉRIFIÉES EN TEMPS RÉEL
        </div>
        <h1 className="text-5xl md:text-6xl font-black mb-6">
          La preuve par <br/>
          <span className="bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
            les chiffres réels
          </span>
        </h1>
        <p className="text-[var(--tg-muted)] max-w-2xl mx-auto mb-12">
          Aucune cerise cueillie. Aucun pronostic effacé. Voici les performances brutes 
          de notre IA mises à jour automatiquement par les Cron Jobs Render.
        </p>

        {/* Big Score */}
        <div className="glass-strong rounded-3xl p-10 mb-8">
          <div className="text-xs uppercase tracking-[0.3em] text-[var(--tg-muted)] mb-4">
            Note de Précision IA · 90 derniers jours
          </div>
          <div className="text-8xl font-black mb-2">
            <span className="bg-gradient-to-br from-green-400 to-emerald-500 bg-clip-text text-transparent">
              {accuracy}%
            </span>
          </div>
          <div className="text-sm text-[var(--tg-muted)]">
            Calculé sur {stats?.overall.totalPredictions.toLocaleString() ?? "..."} prédictions vérifiées
          </div>
        </div>

        {/* Markets Grid */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          {stats?.byMarket.slice(0, 3).map(m => {
            const w90 = m.windows.find(w => w.windowDays === 90);
            return (
              <div key={m.market} className="glass rounded-2xl p-6">
                <div className="text-xs text-[var(--tg-muted)] uppercase tracking-wider mb-2">{m.market}</div>
                <div className="text-4xl font-black text-[var(--tg-green)]">
                  {Math.round((w90?.accuracy ?? 0) * 100)}%
                </div>
                <div className="text-[10px] text-[var(--tg-muted)] mt-1">
                  Sur {w90?.total ?? 0} matchs
                </div>
              </div>
            );
          })}
        </div>

        {/* CLV Section */}
        {clv && (
          <div className="glass-strong rounded-3xl p-8 mb-8">
            <h2 className="text-2xl font-black mb-4">🏆 Closing Line Value (CLV)</h2>
            <p className="text-sm text-[var(--tg-muted)] mb-6 max-w-2xl mx-auto">
              Le seul KPI que les syndicats de paris pros respectent : prouver que l'IA détecte 
              les cotes avant le marché.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-5xl font-black text-blue-400">{clv.aiBeatMarketRate}%</div>
                <div className="text-xs text-[var(--tg-muted)] mt-1">
                  des matchs où l'IA bat le marché
                </div>
              </div>
              <div>
                <div className="text-5xl font-black text-purple-400">
                  +{clv.averageEdgePerMatch}
                </div>
                <div className="text-xs text-[var(--tg-muted)] mt-1">
                  Avantage moyen de cote par match
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CTA */}
        <Link
          href="/app"
          className="inline-flex px-8 py-4 rounded-full bg-gradient-to-r from-[var(--tg-accent)] to-[var(--tg-accent-2)] font-bold text-lg hover:scale-105 transition-transform shadow-xl"
        >
          Voir les pronostics du jour →
        </Link>
      </section>

      <footer className="relative z-10 border-t border-white/5 py-8 text-center text-xs text-[var(--tg-muted)]">
        <p>Stats mises à jour toutes les heures via Cron Jobs · Aucune intervention humaine</p>
      </footer>
    </div>
  );
}
