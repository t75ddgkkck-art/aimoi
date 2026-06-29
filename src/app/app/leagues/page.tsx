"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { MatchCard, type MatchSummary } from "@/components/MatchCard";
import { useI18n } from "@/lib/i18n";

type League = {
  id: number;
  name: string;
  code: string;
  country: string;
  logo: string | null;
  season: string;
  matchCount: number;
};

export default function LeaguesPage() {
  const { t } = useI18n();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);

  useEffect(() => {
    fetch("/api/leagues")
      .then((r) => r.json())
      .then((d) => setLeagues(d.leagues ?? []))
      .catch(() => setLeagues([]));
  }, []);

  useEffect(() => {
    if (!selected) {
      setMatches(null);
      return;
    }
    setMatches(null);
    fetch(`/api/matches?window=all&league=${selected}`)
      .then((r) => r.json())
      .then((d) => setMatches(d.matches ?? []))
      .catch(() => setMatches([]));
  }, [selected]);

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-md mx-auto px-4 py-3">
        <h1 className="font-bold text-lg flex items-center gap-2">
          <span>🏆</span> {t("leagues.title")}
        </h1>
        <p className="text-[11px] text-[var(--tg-muted)]">
          {leagues.length} {t("leagues.subtitle")}
        </p>
      </div>

      <main className="max-w-md mx-auto px-4 space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
          <button
            onClick={() => setSelected(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              !selected
                ? "bg-[var(--tg-accent)] text-white"
                : "bg-[var(--tg-card)] text-[var(--tg-muted)] hover:text-white"
            }`}
          >
            {t("leagues.all")}
          </button>
          {leagues.map((l) => (
            <button
              key={l.id}
              onClick={() => setSelected(l.code)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                selected === l.code
                  ? "bg-[var(--tg-accent)] text-white"
                  : "bg-[var(--tg-card)] text-[var(--tg-muted)] hover:text-white"
              }`}
            >
              <Logo value={l.logo} alt={l.name} size={18} />
              {l.name}
            </button>
          ))}
        </div>

        {!selected && (
          <div className="grid grid-cols-2 gap-3">
            {leagues.map((l) => (
              <button
                key={l.id}
                onClick={() => setSelected(l.code)}
                className="glass rounded-2xl p-4 text-left hover:border-[var(--tg-accent)]/40 transition-all"
              >
                <div className="mb-2"><Logo value={l.logo} alt={l.name} size={42} /></div>
                <div className="font-bold text-sm mb-0.5">{l.name}</div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--tg-muted)] mb-1">
                  {l.country} · {l.season}
                </div>
                <div className="text-xs text-[var(--tg-accent-2)] font-semibold">
                  {l.matchCount} {t("leagues.matches")}
                </div>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">
                {leagues.find((l) => l.code === selected)?.name}
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-xs text-[var(--tg-accent-2)] hover:underline"
              >
                {t("leagues.back")}
              </button>
            </div>
            {!matches && (
              <div className="space-y-3">
                {[0, 1].map((i) => (
                  <div key={i} className="glass rounded-2xl p-4 animate-pulse h-48" />
                ))}
              </div>
            )}
            {matches && matches.length === 0 && (
              <div className="text-center py-12 text-[var(--tg-muted)] text-sm">
                {t("leagues.empty")}
              </div>
            )}
            {matches && matches.map((m) => <MatchCard key={m.id} match={m} />)}
          </div>
        )}
      </main>
    </div>
  );
}
