const PARIS_TZ = "Europe/Paris";

// Returns the YYYY-MM-DD date string for a given Date in the Paris timezone
function parisDateKey(d: Date): string {
  // en-CA gives ISO-like YYYY-MM-DD
  return d.toLocaleDateString("en-CA", { timeZone: PARIS_TZ });
}

// Returns the HH:mm time string in the Paris timezone
function parisTime(d: Date): string {
  return d.toLocaleTimeString("fr-FR", {
    timeZone: PARIS_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatKickoff(iso: string): string {
  const d = new Date(iso);
  const now = new Date();

  const matchKey = parisDateKey(d);
  const todayKey = parisDateKey(now);

  const tomorrow = new Date(now.getTime() + 24 * 3600_000);
  const tomorrowKey = parisDateKey(tomorrow);

  const yesterday = new Date(now.getTime() - 24 * 3600_000);
  const yesterdayKey = parisDateKey(yesterday);

  const time = parisTime(d);

  if (matchKey === todayKey) return `Aujourd'hui · ${time}`;
  if (matchKey === tomorrowKey) return `Demain · ${time}`;
  if (matchKey === yesterdayKey) return `Hier · ${time}`;

  const dateStr = d.toLocaleDateString("fr-FR", {
    timeZone: PARIS_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `${dateStr} · ${time}`;
}

// Short Paris time only (HH:mm)
export function formatTimeOnly(iso: string): string {
  return parisTime(new Date(iso));
}

// Returns the UTC Date objects marking the start and end of the current
// Europe/Paris calendar day. Handles CET/CEST automatically.
export function parisDayBounds(now: Date = new Date()): { start: Date; end: Date } {
  // Get the Paris calendar date (YYYY-MM-DD)
  const parisDate = now.toLocaleDateString("en-CA", { timeZone: PARIS_TZ }); // e.g. "2026-06-28"

  // Determine Paris UTC offset (in minutes) for this date by comparing the
  // same instant formatted in Paris vs UTC.
  const offsetMinutes = parisOffsetMinutes(now);

  // Midnight Paris in UTC = midnight local minus the offset
  const startUtcMs = Date.parse(`${parisDate}T00:00:00Z`) - offsetMinutes * 60_000;
  const start = new Date(startUtcMs);
  const end = new Date(startUtcMs + 24 * 3600_000);
  return { start, end };
}

// How many minutes Paris is ahead of UTC at the given instant (+120 in summer, +60 in winter)
function parisOffsetMinutes(d: Date): number {
  const parisStr = d.toLocaleString("en-US", { timeZone: PARIS_TZ });
  const utcStr = d.toLocaleString("en-US", { timeZone: "UTC" });
  const diffMs = new Date(parisStr).getTime() - new Date(utcStr).getTime();
  return Math.round(diffMs / 60_000);
}

export function formatCountdown(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "En cours";
  const h = Math.floor(diff / 3600_000);
  const m = Math.floor((diff % 3600_000) / 60_000);
  if (h >= 24) return `dans ${Math.floor(h / 24)}j ${h % 24}h`;
  if (h > 0) return `dans ${h}h ${m}m`;
  return `dans ${m}min`;
}
