DROP INDEX "idx_signals_event";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_signals_event" ON "trading_signals" USING btree ("event_id");