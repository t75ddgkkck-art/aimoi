"use client";

import Link from "next/link";
import { formatKickoff } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { Logo } from "@/components/Logo";

export type MatchSummary = {
  id: number;
  kickoffAt: string;
  status: "scheduled" | "live" | "finished";
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  matchImportance?: number | null;
  league: { name: string; code: string; logo: string | null; country?: string };
  homeTeam: { name: string; shortName: string | null; logo: string | null; elo?: number };
  awayTeam: { name: string; shortName: string | null; logo: string | null; elo?: number };
  odds?: { home: number | null; draw: number | null; away: number | null };
  prediction?: {
    markets: {
      homeWin: number;
      draw: number;
      awayWin: number;
      confidence: number;
      over25?: number;
      bttsYes?: number;
      expectedHomeGoals?: number;
      expectedAwayGoals?: number;
      exactScores?: { score: string; prob: number }[];
      bettingRisk?: { score: number; label: "normal" | "watch" | "suspicious" | "critical"; reasons: string[] };
    };
    valueBets?: { market: string; selection: string; ev: number; odds: number }[];
    confidence: number;
  } | null;
};

function ProbBar({
  label,
  prob,
  color,
}: {
  label: string;
  prob: number;
  color: string;
}) {
  const pct = Math.round(prob * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-12 font-medium text-[var(--tg-muted)]">{label}</span>
      <div className="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden">
        <div className={`h-full bar-fill rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right tabular-nums font-bold text-white">{pct}%</span>
    </div>
  );
}

function computeIntegrity(match: MatchSummary): { label: string; score: number; tone: "ok" | "watch" | "suspicious" | "critical" } {
  const markets = match.prediction?.markets;
  // Use stored bettingRisk if present
  if (markets?.bettingRisk) {
    const r = markets.bettingRisk;
    const tone = r.label === "critical" ? "critical" : r.label === "suspicious" ? "suspicious" : r.label === "watch" ? "watch" : "ok";
    return { label: r.label, score: r.score, tone };
  }
  // Fallback: compare model probabilities to bookmaker implied probabilities
  if (markets && match.odds?.home && match.odds?.draw && match.odds?.away) {
    const impH = 1 / match.odds.home;
    const impD = 1 / match.odds.draw;
    const impA = 1 / match.odds.away;
    const sum = impH + impD + impA || 1;
    const maxDiff = Math.max(
      Math.abs(markets.homeWin - impH / sum),
      Math.abs(markets.draw - impD / sum),
      Math.abs(markets.awayWin - impA / sum)
    );
    let score = Math.round(maxDiff * 220);
    score = Math.max(0, Math.min(100, score));
    const tone = score >= 70 ? "critical" : score >= 45 ? "suspicious" : score >= 25 ? "watch" : "ok";
    return { label: tone, score, tone };
  }
  return { label: "ok", score: 0, tone: "ok" };
}

export function MatchCard({ match }: { match: MatchSummary }) {
  const { t } = useI18n();
  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  const markets = match.prediction?.markets;
  const topBet = match.prediction?.valueBets?.[0];
  const topScore = markets?.exactScores?.[0];
  const integrity = computeIntegrity(match);

  // Human-readable AI verdict (e.g. "PSG favori · 68%")
  let verdict: { text: string; pct: number } | null = null;
  if (markets) {
    const m = markets;
    if (m.homeWin >= m.draw && m.homeWin >= m.awayWin) {
      verdict = { text: `${match.homeTeam.name} favori`, pct: Math.round(m.homeWin * 100) };
    } else if (m.awayWin >= m.homeWin && m.awayWin >= m.draw) {
      verdict = { text: `${match.awayTeam.name} favori`, pct: Math.round(m.awayWin * 100) };
    } else {
      verdict = { text: "Match nul probable", pct: Math.round(m.draw * 100) };
    }
  }

  return (
    <Link
      href={`/app/match/${match.id}`}
      className="block glass rounded-2xl p-4 hover:border-[var(--tg-accent)]/40 transition-all active:scale-[0.99]"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs min-w-0">
          <Logo value={match.league.logo} alt={match.league.name} size={20} />
          <span className="text-[var(--tg-muted)] font-medium truncate max-w-[130px]">
            {match.league.name}
          </span>
          {(match.matchImportance ?? 1) >= 1.25 && (
            <span className="text-[9px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.5 rounded-full whitespace-nowrap">
              🔥 Match clé
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="flex items-center gap-1.5 bg-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full live-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
              {t("common.live")} · {match.minute}'
            </span>
          )}
          {!isLive && (
            <span
              className={`text-xs font-semibold tabular-nums ${
                isFinished ? "text-[var(--tg-muted)]" : "text-[var(--tg-accent-2)]"
              }`}
            >
              {isFinished ? "FT" : formatKickoff(match.kickoffAt)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Logo value={match.homeTeam.logo} alt={match.homeTeam.name} size={28} fallback="⚪" />
            <span className="font-semibold truncate">{match.homeTeam.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Logo value={match.awayTeam.logo} alt={match.awayTeam.name} size={28} fallback="⚪" />
            <span className="font-semibold truncate">{match.awayTeam.name}</span>
          </div>
        </div>
        {(isLive || isFinished) && (
          <div className="text-right pl-3 border-l border-[var(--tg-border)]">
            <div className="text-xl font-bold tabular-nums">{match.homeScore}</div>
            <div className="text-xl font-bold tabular-nums">{match.awayScore}</div>
          </div>
        )}
      </div>

      {verdict && !isFinished && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-[var(--tg-accent)]/10 border border-[var(--tg-accent)]/20">
          <span className="text-sm">🤖</span>
          <span className="text-xs font-semibold flex-1 truncate">{verdict.text}</span>
          <span className="text-xs font-black tabular-nums text-[var(--tg-accent-2)]">{verdict.pct}%</span>
        </div>
      )}

      {markets && (
        <div className="space-y-1.5 pt-3 border-t border-[var(--tg-border)]">
          <ProbBar label={t("common.home")} prob={markets.homeWin} color="bg-[var(--tg-accent)]" />
          <ProbBar label={t("common.draw")} prob={markets.draw} color="bg-[var(--tg-muted)]" />
          <ProbBar label={t("common.away")} prob={markets.awayWin} color="bg-[var(--tg-purple)]" />
        </div>
      )}

      {(markets || topBet || topScore) && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--tg-border)] text-xs flex-wrap gap-2">
          {markets && (
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--tg-muted)]">{t("today.confidence")}</span>
              <span
                className={`font-bold tabular-nums ${
                  markets.confidence >= 80
                    ? "text-[var(--tg-green)]"
                    : markets.confidence >= 65
                    ? "text-[var(--tg-yellow)]"
                    : "text-[var(--tg-muted)]"
                }`}
              >
                {markets.confidence}
              </span>
            </div>
          )}
          {topScore && (
            <span className="text-[var(--tg-muted)]">
              {t("today.topScore")}{" "}
              <span className="text-white font-semibold">{topScore.score}</span>{" "}
              ({Math.round(topScore.prob * 100)}%)
            </span>
          )}
          {markets && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1 ${
              integrity.tone === "critical"
                ? "bg-red-500/20 text-red-300 border-red-500/30 animate-pulse"
                : integrity.tone === "suspicious"
                ? "bg-orange-500/20 text-orange-300 border-orange-500/30"
                : integrity.tone === "watch"
                ? "bg-yellow-500/15 text-yellow-300 border-yellow-500/30"
                : "bg-green-500/15 text-green-300 border-green-500/30"
            }`}>
              {integrity.tone === "critical"
                ? `🚨 Match suspect (${integrity.score}/100)`
                : integrity.tone === "suspicious"
                ? `⚠️ À surveiller (${integrity.score}/100)`
                : integrity.tone === "watch"
                ? `👀 Léger écart (${integrity.score}/100)`
                : `✅ Match fiable`}
            </span>
          )}
          {topBet && (
            <span className="bg-gradient-to-r from-yellow-500/20 to-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-amber-500/30">
              💰 +{Math.round(topBet.ev * 100)}% EV
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
