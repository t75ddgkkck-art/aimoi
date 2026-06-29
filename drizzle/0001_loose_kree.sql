CREATE INDEX "match_home_team_idx" ON "matches" USING btree ("home_team_id");--> statement-breakpoint
CREATE INDEX "match_away_team_idx" ON "matches" USING btree ("away_team_id");--> statement-breakpoint
CREATE INDEX "match_league_idx" ON "matches" USING btree ("league_id");