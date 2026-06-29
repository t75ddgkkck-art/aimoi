// Dynamic match-importance detection.
// Late-season matches between teams fighting for the title, European spots,
// or relegation carry extra stakes — which affects scoring patterns (tighter
// games, more caution) and prediction confidence.

export interface ImportanceResult {
  importance: number; // 0.8 (dead rubber) .. 1.5 (decisive)
  reasons: string[];
}

const KNOWN_DERBIES: Array<[string, string]> = [
  ["arsenal", "tottenham"],
  ["liverpool", "everton"],
  ["manchester united", "manchester city"],
  ["real madrid", "barcelona"],
  ["atletico", "real madrid"],
  ["inter", "ac milan"],
  ["roma", "lazio"],
  ["napoli", "roma"],
  ["dortmund", "schalke"],
  ["bayern", "dortmund"],
  ["psg", "marseille"],
  ["boca", "river"],
  ["celtic", "rangers"],
  ["galatasaray", "fenerbahce"],
  ["sporting", "benfica"],
  ["porto", "benfica"],
];

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isDerby(home: string, away: string): boolean {
  const h = norm(home), a = norm(away);
  return KNOWN_DERBIES.some(
    ([x, y]) => (h.includes(x) && a.includes(y)) || (h.includes(y) && a.includes(x))
  );
}

/**
 * Computes dynamic importance for a match.
 * @param kickoff - match date
 * @param seasonEnd - approx end date of the season (for "late season" detection)
 * @param home/away - team standings info
 */
export function computeMatchImportance(opts: {
  homeName: string;
  awayName: string;
  kickoff: Date;
  homePosition?: number | null;
  awayPosition?: number | null;
  homePoints?: number | null;
  awayPoints?: number | null;
  totalTeams?: number;
  isCup?: boolean;
}): ImportanceResult {
  let importance = 1.0;
  const reasons: string[] = [];

  // Derby boost
  if (isDerby(opts.homeName, opts.awayName)) {
    importance += 0.25;
    reasons.push("Derby");
  }

  // Cup matches are inherently high-stakes
  if (opts.isCup) {
    importance += 0.15;
    reasons.push("Match de coupe");
  }

  // Late-season detection (April–May for European leagues)
  const month = opts.kickoff.getUTCMonth(); // 0=Jan
  const isLateSeason = month === 3 || month === 4; // Apr/May
  const hp = opts.homePosition ?? 10;
  const ap = opts.awayPosition ?? 10;
  const total = opts.totalTeams ?? 20;

  if (isLateSeason) {
    // Title race: both in top 3
    if (hp <= 3 && ap <= 3) {
      importance += 0.25;
      reasons.push("Course au titre");
    }
    // European spots: both in 4-7
    else if (hp <= 7 && ap <= 7) {
      importance += 0.15;
      reasons.push("Course à l'Europe");
    }
    // Relegation battle: both in bottom 4
    const relZone = total - 3;
    if (hp >= relZone && ap >= relZone) {
      importance += 0.25;
      reasons.push("Lutte pour le maintien");
    }
    // Six-pointer: close in points & both mid-low
    if (Math.abs((opts.homePoints ?? 0) - (opts.awayPoints ?? 0)) <= 3 && (hp >= relZone - 2 || ap >= relZone - 2)) {
      importance += 0.1;
      reasons.push("Match à 6 points");
    }
  }

  // Clamp
  importance = Math.max(0.8, Math.min(1.5, importance));
  if (reasons.length === 0) reasons.push("Match standard");
  return { importance, reasons };
}
