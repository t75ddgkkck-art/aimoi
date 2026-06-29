"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { useI18n } from "@/lib/i18n";
import { prettySelection, prettyMarket } from "@/lib/bet-labels";
import { formatKickoff } from "@/lib/format";
import type { ComboTicket } from "@/app/api/combos/route";

function ticketDateRange(earliest: string, latest: string): string {
  const e = formatKickoff(earliest);
  const sameDay = new Date(earliest).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }) ===
    new Date(latest).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  if (sameDay) return e;
  return `${e} → ${formatKickoff(latest)}`;
}

export default function ComboPage() {
  const { t } = useI18n();
  const [combos, setCombos] = useState<ComboTicket[] | null>(null);

  useEffect(() => {
    fetch("/api/combos")
      .then((r) => r.json())
      .then((d) => setCombos(d.combos ?? []))
      .catch(() => setCombos([]));
  }, []);

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-md mx-auto px-4 py-3">
        <h1 className="font-bold text-lg flex items-center gap-2">
          <span>🎟️</span> {t("combo.title")}
        </h1>
        <p className="text-[11px] text-[var(--tg-muted)]">{t("combo.subtitle")}</p>
      </div>

      <main className="max-w-md mx-auto px-4 space-y-4">
        {!combos && (
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <div key={i} className="glass rounded-2xl p-4 animate-pulse h-48" />
            ))}
          </div>
        )}

        {combos && combos.length === 0 && (
          <div className="text-center py-20">
            <div className="text-6xl mb-3">😴</div>
            <div className="text-[var(--tg-muted)] font-semibold">{t("combo.empty.title")}</div>
            <p className="text-xs text-[var(--tg-muted)] mt-2">{t("combo.empty.subtitle")}</p>
          </div>
        )}

        {combos &&
          combos.map((c) => (
            <div
              key={c.id}
              className={`glass rounded-2xl p-4 border-l-4 transition-all relative overflow-hidden ${
                c.id === "safe"
                  ? "border-[var(--tg-green)]"
                  : c.id === "moderate"
                  ? "border-[var(--tg-accent)]"
                  : "border-[var(--tg-purple)]"
              }`}
            >
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-1">
                  <h2 className="font-black text-sm">{t(c.titleKey as any)}</h2>
                  <span className="text-[9px] font-semibold bg-black/40 px-2 py-1 rounded-full text-[var(--tg-accent-2)] shrink-0">
                    📅 {ticketDateRange(c.earliestKickoff, c.latestKickoff)}
                  </span>
                </div>
                <p className="text-[10px] text-[var(--tg-muted)] mb-3">{t(c.descKey as any)}</p>

                {/* Items */}
                <div className="space-y-2 mb-3">
                  {c.items.map((item, idx) => (
                    <div key={idx} className="bg-black/35 rounded-xl p-3 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Logo value={item.homeLogo} alt={item.homeTeam} size={20} fallback="⚪" />
                        <div className="truncate">
                          <div className="font-semibold truncate">
                            {item.homeTeam} <span className="text-[10px] text-[var(--tg-muted)]">vs</span> {item.awayTeam}
                          </div>
                          <div className="text-[9px] text-[var(--tg-muted)] flex items-center gap-1.5 mt-0.5">
                            <Logo value={item.leagueLogo} alt={item.leagueName} size={10} />
                            {item.leagueName} · <span className="text-[var(--tg-accent-2)]">{formatKickoff(item.kickoffAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 pl-3">
                        <div className="text-[9px] text-[var(--tg-muted)] uppercase">{prettyMarket(item.market)}</div>
                        <div className="font-black text-[var(--tg-accent-2)]">{prettySelection(item.selection, item.homeTeam, item.awayTeam)}</div>
                        <div className="text-[10px] text-white/80 tabular-nums font-bold mt-0.5">
                          @ {item.odds.toFixed(2)} · {Math.round(item.prob * 100)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Compound Stats */}
                <div className="bg-black/30 rounded-xl p-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <div className="text-[9px] uppercase text-[var(--tg-muted)] font-bold">{t("combo.totalOdds")}</div>
                    <div className="font-black text-xl text-[var(--tg-yellow)] tabular-nums">@ {c.totalOdds.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase text-[var(--tg-muted)] font-bold">{t("combo.totalProb")}</div>
                    <div className="font-black text-xl text-white tabular-nums">
                      {Math.round(c.totalProb * 100)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase text-[var(--tg-muted)] font-bold">
                      {c.id === "value" ? t("combo.totalEv") : "Indice"}
                    </div>
                    <div className="font-black text-xl text-[var(--tg-green)] tabular-nums">
                      {c.id === "value" ? `+${(c.totalEv * 100).toFixed(1)}%` : `${Math.round(c.totalProb * 120)}/100`}
                    </div>
                  </div>
                </div>

                <div className="mt-2 text-[10px] text-[var(--tg-muted)] text-right">
                  {t("combo.kellyStake")}: <span className="text-white font-semibold">{(c.kellyStake * 100).toFixed(1)}%</span> {t("combo.kellyBankroll")}
                </div>
              </div>
            </div>
          ))}

        {combos && combos.length > 0 && (
          <div className="glass rounded-2xl p-4 text-xs text-[var(--tg-muted)] leading-relaxed">
            <div className="font-semibold text-white mb-1">{t("combo.howTo.title")}</div>
            <p>{t("combo.howTo.text")}</p>
          </div>
        )}
      </main>
    </div>
  );
}
