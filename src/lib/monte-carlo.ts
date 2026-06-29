// Monte Carlo Tournament Simulator — 5000 path simulation runs
// Uses team Elos and attack/defense strengths to project the ultimate champions
// of tournament frameworks like the FIFA World Cup or UEFA Champions League.

export interface SimulatorTeam {
  id: number;
  name: string;
  elo: number;
  attack: number;
  defense: number;
  logo: string | null;
}

export interface SimulationResult {
  teamName: string;
  logo: string | null;
  championshipProbability: number; // 0 to 1
  expectedPoints?: number;
}

// ELITE UPGRADE: Match-level Monte Carlo (10,000 iterations)
export interface MatchSimulationResult {
  homeWin: number;
  draw: number;
  awayWin: number;
  over25: number;
  btts: number;
  exactScores: { score: string; prob: number }[];
  avgHomeGoals: number;
  avgAwayGoals: number;
}

export function runMatchMonteCarlo(
  homeXg: number,
  awayXg: number,
  runs: number = 10000
): MatchSimulationResult {
  let homeWins = 0, draws = 0, awayWins = 0, over25 = 0, btts = 0;
  let totalHomeGoals = 0, totalAwayGoals = 0;
  const scoreCounts: Record<string, number> = {};

  const samplePoisson = (lam: number) => {
    const L = Math.exp(-lam);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= Math.random();
    } while (p > L);
    return k - 1;
  };

  for (let i = 0; i < runs; i++) {
    const h = samplePoisson(homeXg);
    const a = samplePoisson(awayXg);
    const scoreKey = `${h}-${a}`;
    scoreCounts[scoreKey] = (scoreCounts[scoreKey] || 0) + 1;

    totalHomeGoals += h;
    totalAwayGoals += a;

    if (h > a) homeWins++;
    else if (h === a) draws++;
    else awayWins++;

    if (h + a > 2) over25++;
    if (h > 0 && a > 0) btts++;
  }

  const exactScores = Object.entries(scoreCounts)
    .map(([score, count]) => ({ score, prob: count / runs }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 10);

  return {
    homeWin: homeWins / runs,
    draw: draws / runs,
    awayWin: awayWins / runs,
    over25: over25 / runs,
    btts: btts / runs,
    exactScores,
    avgHomeGoals: totalHomeGoals / runs,
    avgAwayGoals: totalAwayGoals / runs,
  };
}

/**
 * Simulates a single head-to-head match outcome using Poisson distributions
 */
function simulateMatchWinner(
  home: SimulatorTeam,
  away: SimulatorTeam,
  avgGoals = 1.35
): "home" | "away" | "draw" {
  // Simple Poisson lambda estimation
  const eloDiff = (home.elo - away.elo) / 100 * 0.12;
  const lambda = avgGoals * home.attack * away.defense * 1.12 * (1 + eloDiff); // 12% home advantage
  const mu = avgGoals * away.attack * home.defense * (1 - eloDiff);

  // Pseudo-random sampling from Poisson CDF
  const samplePoisson = (lam: number) => {
    const L = Math.exp(-lam);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= Math.random();
    } while (p > L);
    return k - 1;
  };

  const homeGoals = samplePoisson(lambda);
  const awayGoals = samplePoisson(mu);

  if (homeGoals > awayGoals) return "home";
  if (homeGoals === awayGoals) return "draw";
  return "away";
}

/**
 * Run Monte Carlo simulations to estimate cup/champion outcomes
 * @param teamsList - List of participating teams
 * @param runs - Number of paths to simulate (default: 5000)
 */
export function runMonteCarloTournament(
  teamsList: SimulatorTeam[],
  runs: number = 5000
): SimulationResult[] {
  if (teamsList.length === 0) return [];

  const championWins: Record<string, number> = {};
  for (const t of teamsList) championWins[t.name] = 0;

  // Run 5000 independent simulation paths
  for (let path = 0; path < runs; path++) {
    let currentRound = [...teamsList];

    // Simulate knockout rounds until 1 winner remains
    while (currentRound.length > 1) {
      const nextRound: SimulatorTeam[] = [];
      for (let i = 0; i < currentRound.length; i += 2) {
        const teamA = currentRound[i];
        const teamB = currentRound[i + 1];

        if (!teamB) {
          nextRound.push(teamA); // bye
          continue;
        }

        let winner: "home" | "away" | "draw" = simulateMatchWinner(teamA, teamB);
        // Knockouts cannot end in a draw, simulate overtime/penalties via re-roll or random
        while (winner === "draw") {
          winner = Math.random() > 0.5 ? "home" : "away";
        }

        nextRound.push(winner === "home" ? teamA : teamB);
      }
      currentRound = nextRound;
    }

    if (currentRound[0]) {
      const champ = currentRound[0].name;
      championWins[champ] = (championWins[champ] || 0) + 1;
    }
  }

  const results: SimulationResult[] = teamsList.map((t) => {
    const wins = championWins[t.name] ?? 0;
    return {
      teamName: t.name,
      logo: t.logo,
      championshipProbability: wins / runs,
    };
  });

  // Sort by highest probability of winning
  return results.sort((a, b) => b.championshipProbability - a.championshipProbability);
}
