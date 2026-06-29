"use client";

import { useEffect, useState } from "react";

type Bet = {
  id: number;
  matchId: number | null;
  market: string;
  selection: string;
  odds: number;
  stake: number;
  status: string;
  payout: number;
  createdAt: string;
};

type Summary = {
  totalBets: number;
  staked: number;
  returned: number;
  profit: number;
  roi: number;
  won: number;
  lost: number;
  pending: number;
};

function RoiChart({ bets }: { bets: Bet[] }) {
  // Build cumulative profit over settled bets (chronological)
  const settled = [...bets]
    .filter((b) => b.status === "won" || b.status === "lost")
    .reverse(); // oldest first
  if (settled.length < 2) return null;

  let cum = 0;
  const points = settled.map((b) => {
    cum += b.status === "won" ? (b.payout ?? 0) - b.stake : -b.stake;
    return cum;
  });
  const min = Math.min(0, ...points);
  const max = Math.max(0, ...points);
  const range = max - min || 1;
  const w = 320, h = 70;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = points[points.length - 1];

  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-sm font-semibold mb-2">📈 Profit cumulé</div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 70 }}>
        <line x1="0" y1={h - ((0 - min) / range) * h} x2={w} y2={h - ((0 - min) / range) * h} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
        <path d={path} fill="none" stroke={last >= 0 ? "#30d158" : "#ff453a"} strokeWidth="2" />
      </svg>
    </div>
  );
}

function getClientId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("gm_client_id");
  if (!id) {
    id = "u_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("gm_client_id", id);
  }
  return id;
}

export default function BankrollPage() {
  const [clientId, setClientId] = useState("");
  const [bets, setBets] = useState<Bet[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [form, setForm] = useState({ market: "Résultat du match", selection: "", odds: "", stake: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => { setClientId(getClientId()); }, []);
  useEffect(() => { if (clientId) load(); }, [clientId]);

  async function load() {
    const res = await fetch(`/api/bets?clientId=${clientId}`, { cache: "no-store" });
    const d = await res.json();
    setBets(d.bets ?? []);
    setSummary(d.summary);
  }

  async function addBet() {
    if (!form.selection || !form.odds || !form.stake) return;
    setLoading(true);
    await fetch("/api/bets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, ...form, odds: parseFloat(form.odds), stake: parseFloat(form.stake) }),
    });
    setForm({ market: "Résultat du match", selection: "", odds: "", stake: "" });
    setLoading(false);
    load();
  }

  async function delBet(id: number) {
    await fetch(`/api/bets?id=${id}&clientId=${clientId}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-md mx-auto px-4 py-3">
        <h1 className="font-bold text-lg flex items-center gap-2"><span>💼</span> Ma bankroll</h1>
        <p className="text-[11px] text-[var(--tg-muted)]">Suis tes paris et mesure ton ROI réel</p>
      </div>

      <main className="max-w-md mx-auto px-4 space-y-4">
        {summary && (
          <div className="grid grid-cols-2 gap-2">
            <div className="glass rounded-2xl p-3 text-center">
              <div className="text-[10px] uppercase text-[var(--tg-muted)] font-semibold">Profit</div>
              <div className={`text-2xl font-black tabular-nums ${summary.profit >= 0 ? "text-[var(--tg-green)]" : "text-[var(--tg-red)]"}`}>
                {summary.profit >= 0 ? "+" : ""}{summary.profit.toFixed(2)}
              </div>
            </div>
            <div className="glass rounded-2xl p-3 text-center">
              <div className="text-[10px] uppercase text-[var(--tg-muted)] font-semibold">ROI</div>
              <div className={`text-2xl font-black tabular-nums ${summary.roi >= 0 ? "text-[var(--tg-green)]" : "text-[var(--tg-red)]"}`}>
                {(summary.roi * 100).toFixed(1)}%
              </div>
            </div>
            <div className="glass rounded-2xl p-3 text-center col-span-2 flex justify-around text-xs">
              <span className="text-[var(--tg-green)] font-bold">✓ {summary.won} gagnés</span>
              <span className="text-[var(--tg-red)] font-bold">✗ {summary.lost} perdus</span>
              <span className="text-[var(--tg-muted)] font-bold">⏳ {summary.pending} en cours</span>
            </div>
          </div>
        )}

        {/* Cumulative profit chart */}
        <RoiChart bets={bets} />

        {/* Add bet form */}
        <div className="glass rounded-2xl p-4 space-y-2">
          <div className="text-sm font-semibold mb-1">Ajouter un pari</div>
          <select value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm">
            <option>Résultat du match</option>
            <option>Nombre de buts</option>
            <option>Les deux marquent</option>
          </select>
          <input placeholder="Sélection (ex: Victoire PSG, Plus de 2,5 buts)" value={form.selection}
            onChange={(e) => setForm({ ...form, selection: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <input placeholder="Cote" type="number" step="0.01" value={form.odds}
              onChange={(e) => setForm({ ...form, odds: e.target.value })}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm" />
            <input placeholder="Mise" type="number" step="0.01" value={form.stake}
              onChange={(e) => setForm({ ...form, stake: e.target.value })}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm" />
          </div>
          <button onClick={addBet} disabled={loading}
            className="w-full bg-white text-black font-bold py-2 rounded-xl text-sm active:scale-95 transition-transform">
            {loading ? "..." : "Ajouter"}
          </button>
        </div>

        {/* Bets list */}
        <div className="space-y-2">
          {bets.length === 0 && <p className="text-center text-xs text-[var(--tg-muted)] py-6">Aucun pari enregistré. Ajoute ton premier pari ci-dessus !</p>}
          {bets.map((b) => (
            <div key={b.id} className="glass rounded-xl p-3 flex items-center justify-between text-xs">
              <div className="min-w-0">
                <div className="font-semibold truncate">{b.selection}</div>
                <div className="text-[10px] text-[var(--tg-muted)]">{b.market} · cote {b.odds.toFixed(2)} · mise {b.stake}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  b.status === "won" ? "bg-green-500/20 text-green-300" :
                  b.status === "lost" ? "bg-red-500/20 text-red-300" :
                  "bg-yellow-500/15 text-yellow-300"
                }`}>
                  {b.status === "won" ? `+${b.payout}` : b.status === "lost" ? "Perdu" : "En cours"}
                </span>
                <button onClick={() => delBet(b.id)} className="text-[var(--tg-muted)] text-base">×</button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
