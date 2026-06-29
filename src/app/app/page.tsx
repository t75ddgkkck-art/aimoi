"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MatchCard, type MatchSummary } from "@/components/MatchCard";
import { useI18n } from "@/lib/i18n";

type Filter = "all" | "live" | "upcoming" | "past";

export default function MatchesPage() {
  const { t } = useI18n();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  async function load() {
    if (!hasLoaded) setLoading(true);
    try {
      const windowParam = filter === 'all' ? 'all' : filter;
      const res = await fetch(`/api/matches?window=${windowParam}`, { 
        cache: "no-store",
        signal: AbortSignal.timeout(15000) // 15s timeout
      });
      
      if (res.ok) {
        const data = await res.json();
        setMatches(data.matches || []);
      }
    } catch (e) {
      // Silent fail: keep last known data on screen
      console.warn("Background load failed:", e);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }

  useEffect(() => {
    // Delay first call slightly to ensure the WebView is fully ready
    const t = setTimeout(() => load(), 100);
    const i = setInterval(load, 30000);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [filter]);

  const filteredMatches = matches.filter(m => {
    if (!search) return true;
    const s = search.toLowerCase();
    return m.homeTeam.name.toLowerCase().includes(s) || m.awayTeam.name.toLowerCase().includes(s);
  });

  const liveMatches = filteredMatches.filter(m => m.status === 'live');
  const upcomingMatches = filteredMatches.filter(m => m.status === 'scheduled');
  const pastMatches = filteredMatches.filter(m => m.status === 'finished');

  // Quick dashboard metrics
  const valueCount = matches.filter(m => (m.prediction?.valueBets?.length ?? 0) > 0).length;
  const highConfidence = matches.filter(m => (m.prediction?.markets?.confidence ?? 0) >= 70).length;

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 glass-strong border-b border-[var(--tg-border)] pb-2">
        <div className="max-w-md mx-auto px-4 pt-3 flex items-center justify-between mb-3">
          <h1 className="font-black text-xl flex items-center gap-2">
             <span>⚽</span> {t("common.today")}
          </h1>
          <div className="text-[9px] bg-white/5 border border-white/10 px-2 py-1 rounded-lg text-[var(--tg-muted)] uppercase tracking-tighter">
            IA v4.0
          </div>
        </div>

        <div className="max-w-md mx-auto px-4 flex gap-1.5 mb-3">
          <FilterBtn active={filter === "all"} label="Tous" onClick={() => setFilter("all")} />
          <FilterBtn active={filter === "live"} label="Direct" onClick={() => setFilter("live")} dot={liveMatches.length > 0} />
          <FilterBtn active={filter === "upcoming"} label="À venir" onClick={() => setFilter("upcoming")} />
          <FilterBtn active={filter === "past"} label="Finis" onClick={() => setFilter("past")} />
        </div>

        <div className="max-w-md mx-auto px-4">
          <input
            type="text"
            placeholder="Rechercher une équipe..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[var(--tg-accent)] transition-all"
          />
        </div>
      </div>

      <main className="max-w-md mx-auto px-4 pt-4 space-y-6">
        {filter === "all" && (
          <Link href="/app/worldcup" className="block hero-gradient rounded-2xl p-4 flex items-center justify-between active:scale-[0.99] transition-transform">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🏆</span>
              <div>
                <div className="font-black text-sm">Coupe du Monde 2026</div>
                <div className="text-[11px] text-white/70">Favoris au titre & prédictions IA</div>
              </div>
            </div>
            <span className="text-[var(--tg-accent-2)] text-lg">→</span>
          </Link>
        )}

        {hasLoaded && matches.length > 0 && filter === "all" && (
          <div className="grid grid-cols-3 gap-2">
            <DashCard value={liveMatches.length} label="En direct" icon="🔴" tone="red" />
            <DashCard value={valueCount} label="Value bets" icon="💰" tone="green" />
            <DashCard value={highConfidence} label="Haute confiance" icon="🎯" tone="blue" />
          </div>
        )}

        {loading && matches.length === 0 && (
          <div className="space-y-4">
            {[0, 1, 2].map(i => <div key={i} className="glass rounded-2xl h-40 animate-pulse" />)}
          </div>
        )}

        {!loading && filteredMatches.length === 0 && hasLoaded && (
          <div className="text-center py-16 glass rounded-3xl px-6">
            <div className="text-5xl mb-3">{filter === "live" ? "😴" : "📡"}</div>
            <div className="font-bold">
              {filter === "live" ? "Aucun match en direct" : search ? "Aucune équipe trouvée" : "Aucun match dans cette catégorie"}
            </div>
            <p className="text-xs text-[var(--tg-muted)] mt-1 mb-4">
              {filter === "live" ? "Les matchs en direct apparaîtront ici automatiquement." : "Essaie une autre catégorie ci-dessous."}
            </p>
            <div className="flex gap-2 justify-center">
              {filter !== "all" && (
                <button onClick={() => { setFilter("all"); setSearch(""); }} className="text-xs font-bold px-4 py-2 rounded-xl bg-white text-black">
                  Voir tous les matchs
                </button>
              )}
              {filter !== "upcoming" && (
                <button onClick={() => setFilter("upcoming")} className="text-xs font-bold px-4 py-2 rounded-xl bg-white/10 border border-white/10">
                  Matchs à venir
                </button>
              )}
            </div>
          </div>
        )}

        {filter === "all" ? (
          <>
            {liveMatches.length > 0 && <MatchSection title="En Direct" icon="🔴" list={liveMatches} color="text-red-400" />}
            {upcomingMatches.length > 0 && <MatchSection title="Prochains Matchs" icon="📅" list={upcomingMatches} />}
            {pastMatches.length > 0 && <MatchSection title="Résultats récents" icon="🏆" list={pastMatches} />}
          </>
        ) : (
          <div className="space-y-3">
            {filteredMatches.map(m => <MatchCard key={m.id} match={m} />)}
          </div>
        )}
      </main>
    </div>
  );
}

function DashCard({ value, label, icon, tone }: { value: number; label: string; icon: string; tone: "red" | "green" | "blue" }) {
  const color = tone === "red" ? "text-red-400" : tone === "green" ? "text-[var(--tg-green)]" : "text-[var(--tg-accent-2)]";
  return (
    <div className="glass rounded-2xl p-3 text-center">
      <div className="text-base mb-0.5">{icon}</div>
      <div className={`text-2xl font-black tabular-nums ${color}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-[var(--tg-muted)] font-semibold leading-tight">{label}</div>
    </div>
  );
}

function FilterBtn({ active, label, onClick, dot }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase transition-all border ${
        active ? "bg-white text-black border-white" : "bg-black/20 text-[var(--tg-muted)] border-white/5"
      }`}
    >
      <div className="flex items-center justify-center gap-1.5">
        {dot && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
        {label}
      </div>
    </button>
  );
}

function MatchSection({ title, icon, list, color }: any) {
  return (
    <section className="space-y-3">
      <h2 className={`text-[10px] font-black uppercase tracking-[0.2em] px-1 flex items-center gap-2 ${color || "text-[var(--tg-muted)]"}`}>
        <span>{icon}</span> {title}
      </h2>
      <div className="space-y-3">
        {list.slice(0, 20).map((m: any) => <MatchCard key={m.id} match={m} />)}
      </div>
    </section>
  );
}
