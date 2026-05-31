CREATE TABLE "positions" (
	"signal_id" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"direction" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"target_weight" double precision,
	"target_notional" double precision,
	"entry_price" double precision,
	"shares" double precision,
	"sector_at_entry" text,
	"sizing_reasons" jsonb,
	"sizing_params" jsonb,
	"closed_at" timestamp with time zone,
	"exit_price" double precision,
	"realized_return" double precision,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_positions_status" ON "positions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_positions_symbol" ON "positions" USING btree ("symbol");