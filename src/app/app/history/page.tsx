"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { formatKickoff } from "@/lib/format";

type HistoryItem = {
  id: number;
  kickoffAt: string;
  league: { name: string; logo: string | null };
  homeTeam: string;
  awayTeam: string;
  homeLogo: string | null;
  awayLogo: string | null;
  score: string;
  predicted: "home" | "draw" | "away";
  actual: "home" | "draw" | "away";
  correct: boolean;
  confidence: number;
};

type HistoryResponse = {
  items: HistoryItem[];
  summary: { total: number; correct: number; accuracy: number };
};

const labelOf = (s: string, h: string, a: string) =>
  s === "home" ? h : s === "away" ? a : "Nul";

export default function HistoryPage() {
  const [data, setData] = useState<HistoryResponse | null>(null);

  useEffect(() => {
    fetch("/api/history?limit=50")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-md mx-auto px-4 py-3">
        <h1 className="font-bold text-lg flex items-center gap-2">
          <span>📜</span> Historique des prédictions
        </h1>
        <p className="text-[11px] text-[var(--tg-muted)]">Transparence totale : prédit vs réel</p>
      </div>

      <main className="max-w-md mx-auto px-4 space-y-3">
        {data && (
          <div className="glass rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--tg-muted)]">Précision réelle</div>
              <div className="text-3xl font-black text-[var(--tg-green)]">
                {Math.round(data.summary.accuracy * 100)}%
              </div>
            </div>
            <div className="text-right text-xs text-[var(--tg-muted)]">
              {data.summary.correct} / {data.summary.total}
              <br />prédictions correctes
            </div>
          </div>
        )}

        {!data && [0, 1, 2].map((i) => <div key={i} className="glass rounded-2xl p-4 animate-pulse h-20" />)}

        {data?.items.map((it) => (
          <Link key={it.id} href={`/app/match/${it.id}`} className="block glass rounded-2xl p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--tg-muted)]">
                <Logo value={it.league.logo} alt={it.league.name} size={14} />
                {it.league.name}
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${it.correct ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>
                {it.correct ? "✓ Réussi" : "✗ Manqué"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold truncate flex-1">{it.homeTeam}</span>
              <span className="text-base font-black tabular-nums px-3">{it.score}</span>
              <span className="text-sm font-semibold truncate flex-1 text-right">{it.awayTeam}</span>
            </div>
            <div className="flex items-center justify-between mt-1 text-[10px] text-[var(--tg-muted)]">
              <span>Prédit : <b className="text-white">{labelOf(it.predicted, it.homeTeam, it.awayTeam)}</b> ({it.confidence}%)</span>
              <span>{formatKickoff(it.kickoffAt)}</span>
            </div>
          </Link>
        ))}
      </main>
    </div>
  );
}
