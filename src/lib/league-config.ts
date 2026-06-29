// League-specific configuration — calibrated from historical data
// Each league has its own characteristics (goals/game, home advantage, etc.)

export interface LeagueConfig {
  code: string;
  name: string;
  avgGoals: number; // average goals per team per match
  homeAdvantage: number; // multiplier for home attack
  homeAdvantageElo: number; // Elo points home advantage
  rho: number; // Dixon-Coles correction
  bttsRate: number; // historical BTTS rate
  over25Rate: number; // historical Over 2.5 rate
  drawRate: number; // historical draw rate
}

// Calibrated values from 2023-24 and 2024-25 seasons
export const LEAGUE_CONFIGS: Record<string, LeagueConfig> = {
  PL: {
    code: "PL",
    name: "Premier League",
    avgGoals: 1.42,
    homeAdvantage: 1.18,
    homeAdvantageElo: 70,
    rho: -0.13,
    bttsRate: 0.56,
    over25Rate: 0.54,
    drawRate: 0.24,
  },
  LL: {
    code: "LL",
    name: "La Liga",
    avgGoals: 1.28,
    homeAdvantage: 1.22,
    homeAdvantageElo: 75,
    rho: -0.14,
    bttsRate: 0.52,
    over25Rate: 0.48,
    drawRate: 0.25,
  },
  SA: {
    code: "SA",
    name: "Serie A",
    avgGoals: 1.32,
    homeAdvantage: 1.20,
    homeAdvantageElo: 72,
    rho: -0.12,
    bttsRate: 0.54,
    over25Rate: 0.51,
    drawRate: 0.26,
  },
  BL1: {
    code: "BL1",
    name: "Bundesliga",
    avgGoals: 1.55,
    homeAdvantage: 1.15,
    homeAdvantageElo: 65,
    rho: -0.11,
    bttsRate: 0.60,
    over25Rate: 0.58,
    drawRate: 0.22,
  },
  FL1: {
    code: "FL1",
    name: "Ligue 1",
    avgGoals: 1.25,
    homeAdvantage: 1.24,
    homeAdvantageElo: 78,
    rho: -0.15,
    bttsRate: 0.50,
    over25Rate: 0.47,
    drawRate: 0.26,
  },
  UCL: {
    code: "UCL",
    name: "UEFA Champions League",
    avgGoals: 1.48,
    homeAdvantage: 1.12,
    homeAdvantageElo: 55,
    rho: -0.12,
    bttsRate: 0.55,
    over25Rate: 0.56,
    drawRate: 0.23,
  },
  ELC: {
    code: "ELC",
    name: "Championship",
    avgGoals: 1.38,
    homeAdvantage: 1.20,
    homeAdvantageElo: 68,
    rho: -0.13,
    bttsRate: 0.53,
    over25Rate: 0.52,
    drawRate: 0.25,
  },
  NL1: {
    code: "NL1",
    name: "Eredivisie",
    avgGoals: 1.62,
    homeAdvantage: 1.14,
    homeAdvantageElo: 62,
    rho: -0.10,
    bttsRate: 0.62,
    over25Rate: 0.60,
    drawRate: 0.21,
  },
  PT1: {
    code: "PT1",
    name: "Primeira Liga",
    avgGoals: 1.30,
    homeAdvantage: 1.25,
    homeAdvantageElo: 76,
    rho: -0.14,
    bttsRate: 0.51,
    over25Rate: 0.49,
    drawRate: 0.26,
  },
  TR1: {
    code: "TR1",
    name: "Süper Lig",
    avgGoals: 1.40,
    homeAdvantage: 1.28,
    homeAdvantageElo: 80,
    rho: -0.15,
    bttsRate: 0.54,
    over25Rate: 0.53,
    drawRate: 0.24,
  },
  WC: {
    code: "WC",
    name: "FIFA World Cup",
    avgGoals: 1.45,
    homeAdvantage: 1.05, // Neutral venues mostly
    homeAdvantageElo: 40,
    rho: -0.12,
    bttsRate: 0.54,
    over25Rate: 0.54,
    drawRate: 0.24,
  },
  BL2: { code: "BL2", name: "2. Bundesliga", avgGoals: 1.48, homeAdvantage: 1.16, homeAdvantageElo: 66, rho: -0.12, bttsRate: 0.57, over25Rate: 0.55, drawRate: 0.24 },
  BL3: { code: "BL3", name: "3. Liga", avgGoals: 1.45, homeAdvantage: 1.18, homeAdvantageElo: 68, rho: -0.12, bttsRate: 0.55, over25Rate: 0.53, drawRate: 0.25 },
  DFBP: { code: "DFBP", name: "DFB-Pokal", avgGoals: 1.5, homeAdvantage: 1.1, homeAdvantageElo: 55, rho: -0.12, bttsRate: 0.56, over25Rate: 0.55, drawRate: 0.22 },
  SB: { code: "SB", name: "Serie B", avgGoals: 1.22, homeAdvantage: 1.22, homeAdvantageElo: 74, rho: -0.14, bttsRate: 0.48, over25Rate: 0.44, drawRate: 0.30 },
  LL2: { code: "LL2", name: "La Liga 2", avgGoals: 1.15, homeAdvantage: 1.24, homeAdvantageElo: 76, rho: -0.15, bttsRate: 0.45, over25Rate: 0.40, drawRate: 0.31 },
  FL2: { code: "FL2", name: "Ligue 2", avgGoals: 1.12, homeAdvantage: 1.25, homeAdvantageElo: 78, rho: -0.15, bttsRate: 0.44, over25Rate: 0.39, drawRate: 0.31 },
  EL1: { code: "EL1", name: "League One", avgGoals: 1.35, homeAdvantage: 1.18, homeAdvantageElo: 67, rho: -0.13, bttsRate: 0.52, over25Rate: 0.51, drawRate: 0.25 },
  EL2: { code: "EL2", name: "League Two", avgGoals: 1.32, homeAdvantage: 1.19, homeAdvantageElo: 68, rho: -0.13, bttsRate: 0.51, over25Rate: 0.50, drawRate: 0.26 },
  MX1: { code: "MX1", name: "Liga MX", avgGoals: 1.4, homeAdvantage: 1.26, homeAdvantageElo: 80, rho: -0.13, bttsRate: 0.54, over25Rate: 0.53, drawRate: 0.26 },
  BE1: { code: "BE1", name: "Pro League", avgGoals: 1.45, homeAdvantage: 1.18, homeAdvantageElo: 67, rho: -0.12, bttsRate: 0.56, over25Rate: 0.55, drawRate: 0.24 },
  AT1: { code: "AT1", name: "Bundesliga (AT)", avgGoals: 1.5, homeAdvantage: 1.16, homeAdvantageElo: 65, rho: -0.11, bttsRate: 0.58, over25Rate: 0.56, drawRate: 0.23 },
  SCO1: { code: "SCO1", name: "Premiership", avgGoals: 1.38, homeAdvantage: 1.2, homeAdvantageElo: 70, rho: -0.13, bttsRate: 0.53, over25Rate: 0.52, drawRate: 0.25 },
  GR1: { code: "GR1", name: "Super League", avgGoals: 1.25, homeAdvantage: 1.24, homeAdvantageElo: 76, rho: -0.14, bttsRate: 0.48, over25Rate: 0.45, drawRate: 0.27 },
  NO1: { code: "NO1", name: "Eliteserien", avgGoals: 1.5, homeAdvantage: 1.15, homeAdvantageElo: 64, rho: -0.11, bttsRate: 0.58, over25Rate: 0.56, drawRate: 0.23 },
  SE1: { code: "SE1", name: "Allsvenskan", avgGoals: 1.45, homeAdvantage: 1.16, homeAdvantageElo: 66, rho: -0.12, bttsRate: 0.56, over25Rate: 0.54, drawRate: 0.24 },
  BR1: { code: "BR1", name: "Brasileirão", avgGoals: 1.22, homeAdvantage: 1.28, homeAdvantageElo: 82, rho: -0.14, bttsRate: 0.47, over25Rate: 0.43, drawRate: 0.29 },
  CLIB: { code: "CLIB", name: "Copa Libertadores", avgGoals: 1.25, homeAdvantage: 1.3, homeAdvantageElo: 85, rho: -0.13, bttsRate: 0.48, over25Rate: 0.45, drawRate: 0.27 },
  EURO: { code: "EURO", name: "Championnat d'Europe", avgGoals: 1.3, homeAdvantage: 1.1, homeAdvantageElo: 50, rho: -0.12, bttsRate: 0.5, over25Rate: 0.5, drawRate: 0.26 },
};

export function getLeagueConfig(code: string): LeagueConfig {
  return LEAGUE_CONFIGS[code] ?? LEAGUE_CONFIGS.PL;
}

export const DEFAULT_LEAGUE_CONFIG: LeagueConfig = LEAGUE_CONFIGS.PL;
