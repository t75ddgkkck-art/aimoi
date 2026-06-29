import {
  pgTable,
  serial,
  varchar,
  integer,
  text,
  timestamp,
  boolean,
  real,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const leagues = pgTable(
  "leagues",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    country: varchar("country", { length: 60 }).notNull(),
    code: varchar("code", { length: 20 }).notNull(),
    logo: text("logo"),
    season: varchar("season", { length: 20 }).notNull().default("2025-26"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => ({
    codeIdx: uniqueIndex("league_code_idx").on(t.code),
  })
);

export const teams = pgTable(
  "teams",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    shortName: varchar("short_name", { length: 30 }),
    country: varchar("country", { length: 60 }).notNull(),
    leagueId: integer("league_id")
      .notNull()
      .references(() => leagues.id),
    elo: real("elo").notNull().default(1500),
    attackStrength: real("attack_strength").notNull().default(1.0),
    defenseStrength: real("defense_strength").notNull().default(1.0),
    logo: text("logo"),
    formLast5: varchar("form_last_5", { length: 5 }),
    formLast10: varchar("form_last_10", { length: 10 }).default(""), // Extended form to last 10 matches
    position: integer("position").notNull().default(10),
    points: integer("points").notNull().default(0),
    goalDifference: integer("goal_difference").notNull().default(0),
    // Advanced team attributes
    xgScoredAvg: real("xg_scored_avg").default(1.35),
    xgConcededAvg: real("xg_conceded_avg").default(1.35),
    injuredCount: integer("injured_count").default(0),
    suspendedCount: integer("suspended_count").default(0),
    // Venue-specific strengths (teams play very differently home vs away)
    homeAttack: real("home_attack").default(1.0),
    homeDefense: real("home_defense").default(1.0),
    awayAttack: real("away_attack").default(1.0),
    awayDefense: real("away_defense").default(1.0),
    // Time-decayed Elo (recent matches weighted more)
    recentElo: real("recent_elo").default(1500),
    // Last time this team's stats were recomputed
    lastUpdated: timestamp("last_updated").defaultNow(),
  },
  (t) => ({
    leagueIdx: index("team_league_idx").on(t.leagueId),
    nameIdx: index("team_name_idx").on(t.name),
    uniqTeam: uniqueIndex("team_uniq_idx").on(t.leagueId, t.name),
  })
);

export const matches = pgTable(
  "matches",
  {
    id: serial("id").primaryKey(),
    leagueId: integer("league_id")
      .notNull()
      .references(() => leagues.id),
    homeTeamId: integer("home_team_id")
      .notNull()
      .references(() => teams.id),
    awayTeamId: integer("away_team_id")
      .notNull()
      .references(() => teams.id),
    kickoffAt: timestamp("kickoff_at").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("scheduled"), // scheduled / live / finished
    matchday: integer("matchday"),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    minute: integer("minute"),
    homeOdds: real("home_odds"),
    drawOdds: real("draw_odds"),
    awayOdds: real("away_odds"),
    openingHomeOdds: real("opening_home_odds"),
    closingHomeOdds: real("closing_home_odds"),
    // Advanced ML Features
    homeXg: real("home_xg"),
    awayXg: real("away_xg"),
    homeInjuredPlayers: jsonb("home_injured_players").$type<string[]>().default([]),
    awayInjuredPlayers: jsonb("away_injured_players").$type<string[]>().default([]),
    matchImportance: real("match_importance").default(1.0), // 0.0 to 1.5 based on stakes (relegation, title, normal)
    
    // Lineup & Compositions (v4.5 - real starters 45 minutes before kickoff)
    homeLineupConfirmed: boolean("home_lineup_confirmed").default(false),
    awayLineupConfirmed: boolean("away_lineup_confirmed").default(false),
    homeLineupRating: real("home_lineup_rating").default(1.0), // 0.8 (weak rotation) to 1.15 (all star XI)
    awayLineupRating: real("away_lineup_rating").default(1.0),
    
    // Public Sentiments / Twitter / X Scrapers / Injury news index
    homeSentiment: real("home_sentiment").default(1.0), // 0.8 (crisis, bad rumors) to 1.2 (winning transfer, high morale)
    awaySentiment: real("away_sentiment").default(1.0),
  },
  (t) => ({
    kickoffIdx: index("match_kickoff_idx").on(t.kickoffAt),
    statusIdx: index("match_status_idx").on(t.status),
    uniq: uniqueIndex("match_uniq").on(t.homeTeamId, t.awayTeamId, t.kickoffAt),
    homeTeamIdx: index("match_home_team_idx").on(t.homeTeamId),
    awayTeamIdx: index("match_away_team_idx").on(t.awayTeamId),
    leagueIdx: index("match_league_idx").on(t.leagueId),
  })
);

export type PredictionMarkets = {
  homeWin: number;
  draw: number;
  awayWin: number;
  over15: number;
  over25: number;
  over35: number;
  bttsYes: number;
  bttsNo: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  exactScores: { score: string; prob: number }[];
  confidence: number; // 0-100
  bettingRisk?: {
    score: number;
    label: "normal" | "watch" | "suspicious" | "critical";
    reasons: string[];
  };
};

export type ValueBet = {
  market: string;
  selection: string;
  modelProb: number;
  impliedProb: number;
  odds: number;
  ev: number; // Expected Value
  kelly: number; // Kelly fraction
};

export const predictions = pgTable(
  "predictions",
  {
    id: serial("id").primaryKey(),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    markets: jsonb("markets").$type<PredictionMarkets>().notNull(),
    valueBets: jsonb("value_bets").$type<ValueBet[]>().notNull().default([]),
    modelVersion: varchar("model_version", { length: 40 }).notNull().default("dixon-coles-v1"),
  },
  (t) => ({
    matchIdx: uniqueIndex("pred_match_idx").on(t.matchId),
  })
);

export const accuracyStats = pgTable("accuracy_stats", {
  id: serial("id").primaryKey(),
  market: varchar("market", { length: 40 }).notNull(),
  windowDays: integer("window_days").notNull(),
  total: integer("total").notNull().default(0),
  correct: integer("correct").notNull().default(0),
  accuracy: real("accuracy").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// AUTO-LEARNING TABLE: AI stores its dynamic adjustments here
export const leagueCalibration = pgTable("league_calibration", {
  id: serial("id").primaryKey(),
  leagueCode: varchar("league_code", { length: 20 }).unique().notNull(),
  attackBias: real("attack_bias").notNull().default(1.0), // Dynamic multiplier
  defenseBias: real("defense_bias").notNull().default(1.0),
  rhoBias: real("rho_bias").notNull().default(1.0),
  lastLearnedAt: timestamp("last_learned_at").notNull().defaultNow(),
  errorRate: real("error_rate").notNull().default(0.5), // Current Brier score for the league
});

export const learningLogs = pgTable("learning_logs", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  matchesProcessed: integer("matches_processed").notNull(),
  globalErrorBefore: real("global_error_before"),
  globalErrorAfter: real("global_error_after"),
  adjustmentsMade: jsonb("adjustments_made"), // Detailed log of what was changed
});

// User bankroll tracking — lets users log their bets and measure real ROI.
// Keyed by an anonymous client id stored in the browser (no auth required).
export const userBets = pgTable(
  "user_bets",
  {
    id: serial("id").primaryKey(),
    clientId: varchar("client_id", { length: 64 }).notNull(),
    matchId: integer("match_id").references(() => matches.id),
    market: varchar("market", { length: 60 }).notNull(),
    selection: varchar("selection", { length: 120 }).notNull(),
    odds: real("odds").notNull(),
    stake: real("stake").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending / won / lost / void
    payout: real("payout").default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    settledAt: timestamp("settled_at"),
  },
  (t) => ({
    clientIdx: index("user_bets_client_idx").on(t.clientId),
    matchIdx: index("user_bets_match_idx").on(t.matchId),
  })
);

// Team alias resolution — merges duplicate teams across sources.
export const teamAliases = pgTable(
  "team_aliases",
  {
    id: serial("id").primaryKey(),
    alias: varchar("alias", { length: 120 }).notNull(),
    canonicalTeamId: integer("canonical_team_id")
      .notNull()
      .references(() => teams.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    aliasIdx: uniqueIndex("team_alias_idx").on(t.alias),
  })
);
