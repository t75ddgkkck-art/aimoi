// Betting anomaly / integrity risk indicator
// This is NOT an accusation of match-fixing. It flags unusual market patterns
// using bookmaker odds dispersion, model-vs-market deviation and confidence.

export type BettingRisk = {
  score: number; // 0-100
  label: "normal" | "watch" | "suspicious" | "critical";
  reasons: string[];
};

export function computeBettingRisk(input: {
  odds: { home: number; draw: number; away: number };
  model: { home: number; draw: number; away: number; confidence: number };
  bookmakerCount?: number;
  oddsDispersion?: number; // std-dev of implied home prob across bookmakers
  openingHomeOdds?: number | null; // for line-movement detection
}): BettingRisk {
  const reasons: string[] = [];
  let score = 0;

  // Line movement: a large drift between opening and current home odds (esp. with
  // few bookmakers) is the classic fingerprint of suspicious money.
  if (input.openingHomeOdds && input.openingHomeOdds > 1 && input.odds.home > 1) {
    const drift = Math.abs(input.odds.home - input.openingHomeOdds) / input.openingHomeOdds;
    if (drift > 0.25) {
      score += 25;
      reasons.push(`Mouvement de cote anormal (${Math.round(drift * 100)}% depuis l'ouverture)`);
    } else if (drift > 0.15) {
      score += 12;
      reasons.push(`Mouvement de cote notable (${Math.round(drift * 100)}%)`);
    }
  }

  const implied = {
    home: 1 / input.odds.home,
    draw: 1 / input.odds.draw,
    away: 1 / input.odds.away,
  };
  const margin = implied.home + implied.draw + implied.away - 1;
  if (margin > 0.12) {
    score += 10;
    reasons.push("Marge bookmaker élevée");
  }

  const diffs = [
    Math.abs(input.model.home - implied.home),
    Math.abs(input.model.draw - implied.draw),
    Math.abs(input.model.away - implied.away),
  ];
  const maxDiff = Math.max(...diffs);
  if (maxDiff > 0.18 && input.model.confidence > 60) {
    score += 35;
    reasons.push("Écart modèle/marché anormalement élevé");
  } else if (maxDiff > 0.12) {
    score += 20;
    reasons.push("Écart modèle/marché notable");
  }

  if (input.oddsDispersion && input.oddsDispersion > 0.18) {
    score += 25;
    reasons.push("Forte dispersion entre bookmakers");
  }

  if ((input.bookmakerCount ?? 20) < 5) {
    score += 15;
    reasons.push("Faible couverture bookmaker / liquidité incertaine");
  }

  const extremeOdds = Math.max(input.odds.home, input.odds.draw, input.odds.away);
  if (extremeOdds > 15 && maxDiff > 0.08) {
    score += 10;
    reasons.push("Cote extrême avec divergence statistique");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const label: BettingRisk["label"] =
    score >= 70 ? "critical" : score >= 45 ? "suspicious" : score >= 25 ? "watch" : "normal";

  if (reasons.length === 0) reasons.push("Aucune anomalie majeure détectée");

  return { score, label, reasons };
}
