import type { MatchSummary } from "@/components/MatchCard";

export async function fetchMatches(window: "today" | "upcoming" | "live" | "all", league?: string): Promise<MatchSummary[]> {
  const params = new URLSearchParams({ window });
  if (league) params.set("league", league);
  const res = await fetch(`/api/matches?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`failed: ${res.status}`);
  const data = await res.json();
  return data.matches ?? [];
}

export async function fetchValueBets() {
  const res = await fetch("/api/value-bets", { cache: "no-store" });
  if (!res.ok) throw new Error(`failed: ${res.status}`);
  return res.json();
}

export async function fetchLeagues() {
  const res = await fetch("/api/leagues", { cache: "no-store" });
  if (!res.ok) throw new Error(`failed: ${res.status}`);
  return res.json();
}

export async function fetchStats() {
  const res = await fetch("/api/stats", { cache: "no-store" });
  if (!res.ok) throw new Error(`failed: ${res.status}`);
  return res.json();
}

export async function fetchMatch(id: number) {
  const res = await fetch(`/api/match?id=${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`failed: ${res.status}`);
  return res.json();
}
