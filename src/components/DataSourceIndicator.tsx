"use client";

import { useState } from "react";

// Compact, trustworthy badge listing the live public data sources.
const SOURCES = [
  { name: "football-data.org", desc: "Scores live & calendriers officiels" },
  { name: "TheSportsDB", desc: "Couverture mondiale (matchs du jour)" },
  { name: "OpenLigaDB", desc: "Allemagne BL1/BL2/3.Liga/DFB (nuit incluse)" },
  { name: "The Odds API", desc: "Cotes réelles multi-bookmakers" },
  { name: "openfootball (GitHub)", desc: "Historique & résultats open-source" },
];

export function DataSourceIndicator() {
  const [open, setOpen] = useState(false);

  return (
    <div className="max-w-md mx-auto px-4 pt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-[10px] text-[var(--tg-muted)] bg-white/[0.03] border border-white/5 rounded-lg px-3 py-1.5"
      >
        <span className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
          </span>
          Données live · {SOURCES.length} sources publiques
        </span>
        <span className="text-[var(--tg-accent-2)]">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-1 space-y-1 bg-white/[0.03] border border-white/5 rounded-lg p-2">
          {SOURCES.map((s) => (
            <div key={s.name} className="flex items-start gap-2 text-[10px]">
              <span className="text-green-400">✓</span>
              <div>
                <span className="text-white font-semibold">{s.name}</span>
                <span className="text-[var(--tg-muted)]"> — {s.desc}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
