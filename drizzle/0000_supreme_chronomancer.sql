CREATE TABLE "accuracy_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"market" varchar(40) NOT NULL,
	"window_days" integer NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"correct" integer DEFAULT 0 NOT NULL,
	"accuracy" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"country" varchar(60) NOT NULL,
	"code" varchar(20) NOT NULL,
	"logo" text,
	"season" varchar(20) DEFAULT '2025-26' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"home_team_id" integer NOT NULL,
	"away_team_id" integer NOT NULL,
	"kickoff_at" timestamp NOT NULL,
	"status" varchar(20) DEFAULT 'scheduled' NOT NULL,
	"matchday" integer,
	"home_score" integer,
	"away_score" integer,
	"minute" integer,
	"home_odds" real,
	"draw_odds" real,
	"away_odds" real,
	"home_xg" real,
	"away_xg" real,
	"home_injured_players" jsonb DEFAULT '[]'::jsonb,
	"away_injured_players" jsonb DEFAULT '[]'::jsonb,
	"match_importance" real DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"markets" jsonb NOT NULL,
	"value_bets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model_version" varchar(40) DEFAULT 'dixon-coles-v1' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"short_name" varchar(30),
	"country" varchar(60) NOT NULL,
	"league_id" integer NOT NULL,
	"elo" real DEFAULT 1500 NOT NULL,
	"attack_strength" real DEFAULT 1 NOT NULL,
	"defense_strength" real DEFAULT 1 NOT NULL,
	"logo" text,
	"form_last_5" varchar(5),
	"form_last_10" varchar(10) DEFAULT '',
	"position" integer DEFAULT 10 NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"goal_difference" integer DEFAULT 0 NOT NULL,
	"xg_scored_avg" real DEFAULT 1.35,
	"xg_conceded_avg" real DEFAULT 1.35,
	"injured_count" integer DEFAULT 0,
	"suspended_count" integer DEFAULT 0
);
--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_kickoff_idx" ON "matches" USING btree ("kickoff_at");--> statement-breakpoint
CREATE INDEX "match_status_idx" ON "matches" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "match_uniq" ON "matches" USING btree ("home_team_id","away_team_id","kickoff_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pred_match_idx" ON "predictions" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "team_league_idx" ON "teams" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "team_name_idx" ON "teams" USING btree ("name");