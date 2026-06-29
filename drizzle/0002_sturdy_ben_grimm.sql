CREATE TABLE "league_calibration" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_code" varchar(20) NOT NULL,
	"attack_bias" real DEFAULT 1 NOT NULL,
	"defense_bias" real DEFAULT 1 NOT NULL,
	"rho_bias" real DEFAULT 1 NOT NULL,
	"last_learned_at" timestamp DEFAULT now() NOT NULL,
	"error_rate" real DEFAULT 0.5 NOT NULL,
	CONSTRAINT "league_calibration_league_code_unique" UNIQUE("league_code")
);
--> statement-breakpoint
CREATE TABLE "learning_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"matches_processed" integer NOT NULL,
	"global_error_before" real,
	"global_error_after" real,
	"adjustments_made" jsonb
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "opening_home_odds" real;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "closing_home_odds" real;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_lineup_confirmed" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "away_lineup_confirmed" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_lineup_rating" real DEFAULT 1;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "away_lineup_rating" real DEFAULT 1;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_sentiment" real DEFAULT 1;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "away_sentiment" real DEFAULT 1;--> statement-breakpoint
CREATE UNIQUE INDEX "league_code_idx" ON "leagues" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "team_uniq_idx" ON "teams" USING btree ("league_id","name");