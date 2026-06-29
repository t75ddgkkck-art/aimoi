// Backtesting Evaluation Layer — Proper Scoring Rules (Brier Score & Log Loss)
// This module provides mathematical audits of our predictions vs actual results.
// Brier Score range: 0 (perfect) to 2 (worst). Log Loss: lower is better.

export interface AuditMetrics {
  brierScore: number;
  logLoss: number;
  totalEvaluated: number;
  accuracy: number;
}

/**
 * Calculates Brier Score and Log Loss for a set of matches
 * @param matches - Array of completed matches with predictions
 */
export function calculateProperScoringRules(
  matches: Array<{
    homeScore: number | null;
    awayScore: number | null;
    prediction: {
      markets: {
        homeWin: number;
        draw: number;
        awayWin: number;
      };
    } | null;
  }>
): AuditMetrics {
  let totalBrier = 0;
  let totalLogLoss = 0;
  let correctPredictions = 0;
  let count = 0;

  for (const m of matches) {
    if (m.homeScore == null || m.awayScore == null || !m.prediction) continue;

    const pHome = m.prediction.markets.homeWin;
    const pDraw = m.prediction.markets.draw;
    const pAway = m.prediction.markets.awayWin;

    // Reality vectors: 1 for the actual outcome, 0 for others
    let yHome = 0;
    let yDraw = 0;
    let yAway = 0;

    if (m.homeScore > m.awayScore) {
      yHome = 1;
      // We count as "Correct" if the predicted outcome had the highest relative probability 
      // OR was within 5% of the highest (to allow for edge cases in balanced games)
      if (pHome >= pDraw - 0.05 && pHome >= pAway - 0.05) correctPredictions++;
    } else if (m.homeScore === m.awayScore) {
      yDraw = 1;
      if (pDraw >= pHome - 0.05 && pDraw >= pAway - 0.05) correctPredictions++;
    } else {
      yAway = 1;
      if (pAway >= pHome - 0.05 && pAway >= pDraw - 0.05) correctPredictions++;
    }

    // Brier Score = sum((p_i - y_i)^2)
    const brier = Math.pow(pHome - yHome, 2) + Math.pow(pDraw - yDraw, 2) + Math.pow(pAway - yAway, 2);
    totalBrier += brier;

    // Log Loss = -sum(y_i * log(p_i))
    // We clip probabilities to prevent log(0)
    const clip = (p: number) => Math.min(0.9999, Math.max(0.0001, p));
    const logLoss = -(
      yHome * Math.log(clip(pHome)) +
      yDraw * Math.log(clip(pDraw)) +
      yAway * Math.log(clip(pAway))
    );
    totalLogLoss += logLoss;

    count++;
  }

  return {
    brierScore: count > 0 ? totalBrier / count : 0,
    logLoss: count > 0 ? totalLogLoss / count : 0,
    totalEvaluated: count,
    accuracy: count > 0 ? correctPredictions / count : 0,
  };
}
