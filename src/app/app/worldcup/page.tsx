"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { MatchCard, type MatchSummary } from "@/components/MatchCard";

type MC = {
  leagueName: string;
  simulatedPaths: number;
  champions: Array<{ teamName: string; logo: string | null; championshipProbability: number }>;
};

export default function WorldCupPage() {
  const [mc, setMc] = useState<MC | null>(null);
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);

  useEffect(() => {
    fetch("/api/monte-carlo").then((r) => r.json()).then(setMc).catch(() => setMc(null));
    fetch("/api/matches?window=upcoming&league=WC&limit=20")
      .then((r) => r.json())
      .then((d) => setMatches((d.matches ?? []).filter((m: MatchSummary) => m.league.code === "WC")))
      .catch(() => setMatches([]));
  }, []);

  return (
    <div className="min-h-screen pb-24">
      <div className="hero-gradient">
        <div className="max-w-md mx-auto px-4 py-5 text-center">
          <div className="text-4xl mb-1">🏆</div>
          <h1 className="font-black text-xl">Coupe du Monde 2026</h1>
          <p className="text-[11px] text-white/70">USA · Canada · Mexique</p>
        </div>
      </div>

      <main className="max-w-md mx-auto px-4 space-y-5 pt-4">
        {/* Monte Carlo champions */}
        <section>
          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--tg-muted)] mb-2 flex items-center gap-2">
            <span>🎲</span> Favoris au titre (simulation IA)
          </h2>
          {!mc && <div className="glass rounded-2xl h-40 animate-pulse" />}
          {mc && mc.champions.length > 0 && (
            <div className="glass rounded-2xl p-4 space-y-2">
              <p className="text-[10px] text-[var(--tg-muted)] mb-2">
                {mc.simulatedPaths.toLocaleString()} tournois simulés (Monte Carlo)
              </p>
              {mc.champions.slice(0, 8).map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs font-black w-5 text-[var(--tg-muted)]">{i + 1}</span>
                  <Logo value={c.logo} alt={c.teamName} size={22} fallback="🏳️" />
                  <span className="text-sm font-semibold flex-1 truncate">{c.teamName}</span>
                  <div className="w-24 h-2 bg-black/40 rounded-full overflow-hidden">
                    <div className="h-full bar-fill rounded-full bg-gradient-to-r from-yellow-500 to-amber-400" style={{ width: `${Math.min(100, c.championshipProbability * 100 * 3)}%` }} />
                  </div>
                  <span className="text-xs font-black tabular-nums text-[var(--tg-yellow)] w-10 text-right">
                    {(c.championshipProbability * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}
          {mc && mc.champions.length === 0 && (
            <div className="glass rounded-2xl p-6 text-center text-xs text-[var(--tg-muted)]">
              La simulation sera disponible dès que les équipes seront chargées.
            </div>
          )}
        </section>

        {/* Upcoming WC matches */}
        <section>
          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--tg-muted)] mb-2 flex items-center gap-2">
            <span>📅</span> Prochains matchs
          </h2>
          {!matches && <div className="glass rounded-2xl h-32 animate-pulse" />}
          {matches && matches.length === 0 && (
            <div className="glass rounded-2xl p-6 text-center text-xs text-[var(--tg-muted)]">
              Aucun match à venir pour le moment.
            </div>
          )}
          <div className="space-y-3">
            {matches?.slice(0, 10).map((m) => <MatchCard key={m.id} match={m} />)}
          </div>
        </section>

        <Link href="/app" className="block text-center text-xs text-[var(--tg-accent-2)] py-2">
          ← Retour à tous les matchs
        </Link>
      </main>
    </div>
  );
}
