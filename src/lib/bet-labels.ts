// Converts technical betting market/selection labels into plain, easy-to-understand French.

const SELECTION_MAP: Record<string, string> = {
  "Home Win": "Victoire équipe à domicile",
  "Away Win": "Victoire équipe à l'extérieur",
  "Draw": "Match nul",
  "Over 1.5": "Plus de 1,5 but",
  "Over 2.5": "Plus de 2,5 buts",
  "Over 3.5": "Plus de 3,5 buts",
  "Under 1.5": "Moins de 1,5 but",
  "Under 2.5": "Moins de 2,5 buts",
  "Under 3.5": "Moins de 3,5 buts",
  "Yes": "Les deux équipes marquent",
  "No": "Une équipe ne marque pas",
};

const MARKET_MAP: Record<string, string> = {
  "1X2": "Résultat du match",
  "Over/Under 1.5": "Nombre de buts",
  "Over/Under 2.5": "Nombre de buts",
  "Over/Under 3.5": "Nombre de buts",
  "BTTS": "Les deux marquent",
};

export function prettySelection(selection: string, homeTeam?: string, awayTeam?: string): string {
  if (selection === "Home Win" && homeTeam) return `Victoire ${homeTeam}`;
  if (selection === "Away Win" && awayTeam) return `Victoire ${awayTeam}`;
  return SELECTION_MAP[selection] ?? selection;
}

export function prettyMarket(market: string): string {
  return MARKET_MAP[market] ?? market;
}
