"use client";

import { useEffect, useState } from "react";
import { MatchCard, type MatchSummary } from "@/components/MatchCard";
import { useI18n } from "@/lib/i18n";

export default function LivePage() {
  const { t } = useI18n();
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/matches?window=live", { cache: "no-store" });
      const data = await res.json();
      setMatches(data.matches ?? []);
    } catch {}
  }

  useEffect(() => {
    load();
    const i = setInterval(load, 15_000); // Super-fast 15s updates for professional live feel
    return () => clearInterval(i);
  }, []);

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-md mx-auto px-4 py-3">
        <h1 className="font-bold text-lg flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </span>
          {t("live.title")}
        </h1>
        <p className="text-[11px] text-[var(--tg-muted)]">{t("live.updatedEvery")}</p>
      </div>
      <main className="max-w-md mx-auto px-4 space-y-3">
        {!matches && (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="glass rounded-2xl p-4 animate-pulse h-48" />
            ))}
          </div>
        )}
        {matches && matches.length === 0 && (
          <div className="text-center py-20">
            <div className="text-6xl mb-3">😴</div>
            <div className="text-[var(--tg-muted)]">{t("live.empty.title")}</div>
            <p className="text-xs text-[var(--tg-muted)] mt-2">{t("live.empty.subtitle")}</p>
          </div>
        )}
        {matches && matches.map((m) => <MatchCard key={m.id} match={m} />)}
      </main>
    </div>
  );
}
