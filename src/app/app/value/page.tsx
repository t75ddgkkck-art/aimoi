"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { formatKickoff } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { prettySelection, prettyMarket } from "@/lib/bet-labels";

type ValueBet = {
  matchId: number;
  kickoffAt: string;
  league: { name: string; code: string; logo: string | null };
  homeTeam: { name: string; shortName: string | null; logo: string | null };
  awayTeam: { name: string; shortName: string | null; logo: string | null };
  confidence: number;
  market: string;
  selection: string;
  modelProb: number;
  impliedProb: number;
  odds: number;
  ev: number;
  kelly: number;
};

export default function ValuePage() {
  const { t } = useI18n();
  const [bets, setBets] = useState<ValueBet[] | null>(null);

  useEffect(() => {
    fetch("/api/value-bets")
      .then((r) => r.json())
      .then((d) => setBets(d.valueBets ?? []))
      .catch(() => setBets([]));
  }, []);

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg flex items-center gap-2">
            <span>💰</span> {t("value.title")}
          </h1>
          <p className="text-[11px] text-[var(--tg-muted)]">{t("value.subtitle")}</p>
        </div>
        <Link href="/app/bankroll" className="text-[10px] font-bold bg-white/10 border border-white/10 px-3 py-2 rounded-xl whitespace-nowrap">
          💼 Ma bankroll
        </Link>
      </div>

      <main className="max-w-md mx-auto px-4 space-y-3">
        {bets && bets.length > 0 && (
          <div className="glass rounded-2xl p-3 text-[11px] text-[var(--tg-muted)] leading-relaxed border-l-4 border-[var(--tg-yellow)]">
            <b className="text-white">Qu'est-ce qu'un value bet ?</b> C'est un pari où la probabilité estimée par notre IA est <b className="text-[var(--tg-green)]">supérieure</b> à celle des bookmakers. Sur le long terme, ces paris sont rentables. « EV » = gain attendu, « Mise » = % de bankroll conseillé (Kelly).
          </div>
        )}
        {!bets && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass rounded-2xl p-4 animate-pulse h-40" />
            ))}
          </div>
        )}
        {bets && bets.length === 0 && (
          <div className="text-center py-20">
            <div className="text-6xl mb-3">🔎</div>
            <div className="text-[var(--tg-muted)]">{t("value.empty.title")}</div>
            <p className="text-xs text-[var(--tg-muted)] mt-2">{t("value.empty.subtitle")}</p>
          </div>
        )}
        {bets &&
          bets.map((b, i) => (
            <Link
              key={`${b.matchId}-${i}`}
              href={`/app/match/${b.matchId}`}
              className="block glass rounded-2xl p-4 border-l-4 border-[var(--tg-yellow)] hover:border-l-amber-400 transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-xs">
                  <Logo value={b.league.logo} alt={b.league.name} size={18} />
                  <span className="text-[var(--tg-muted)] truncate max-w-[150px]">{b.league.name}</span>
                </div>
                <span className="text-[11px] text-[var(--tg-accent-2)] font-semibold tabular-nums">
                  {formatKickoff(b.kickoffAt)}
                </span>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <Logo value={b.homeTeam.logo} alt={b.homeTeam.name} size={22} fallback="⚪" />
                <span className="font-semibold text-sm">{b.homeTeam.name}</span>
                <span className="text-[var(--tg-muted)] text-xs">vs</span>
                <span className="font-semibold text-sm">{b.awayTeam.name}</span>
                <Logo value={b.awayTeam.logo} alt={b.awayTeam.name} size={22} fallback="⚪" />
              </div>

              <div className="bg-black/30 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--tg-muted)]">{t("value.market")}</div>
                    <div className="font-bold">
                      {prettyMarket(b.market)} · <span className="text-[var(--tg-yellow)]">{prettySelection(b.selection, b.homeTeam.name, b.awayTeam.name)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--tg-muted)]">{t("value.odds")}</div>
                    <div className="font-bold tabular-nums text-lg">{b.odds.toFixed(2)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-black/30 rounded-lg py-1.5">
                    <div className="text-[9px] uppercase text-[var(--tg-muted)]">{t("value.model")}</div>
                    <div className="font-bold text-[var(--tg-green)] tabular-nums">
                      {Math.round(b.modelProb * 100)}%
                    </div>
                  </div>
                  <div className="bg-black/30 rounded-lg py-1.5">
                    <div className="text-[9px] uppercase text-[var(--tg-muted)]">{t("value.implied")}</div>
                    <div className="font-bold tabular-nums">{Math.round(b.impliedProb * 100)}%</div>
                  </div>
                  <div className="bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border border-amber-500/30 rounded-lg py-1.5">
                    <div className="text-[9px] uppercase text-amber-300">{t("value.ev")}</div>
                    <div className="font-bold text-amber-300 tabular-nums">
                      +{(b.ev * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className="mt-2 text-[11px] text-[var(--tg-muted)] flex items-center justify-between">
                  <span>
                    {t("value.kelly")}: <span className="text-white font-semibold">{(b.kelly * 100).toFixed(2)}%</span> {t("value.kellyBankroll")}
                  </span>
                  <span>
                    {t("value.confidence")}: <span className="text-white font-semibold">{b.confidence}</span>
                  </span>
                </div>
              </div>
            </Link>
          ))}

        {bets && bets.length > 0 && (
          <div className="glass rounded-2xl p-4 text-xs text-[var(--tg-muted)] leading-relaxed">
            <div className="font-semibold text-white mb-1">{t("value.howTo.title")}</div>
            <p>{t("value.howTo.text")}</p>
          </div>
        )}
      </main>
    </div>
  );
}
