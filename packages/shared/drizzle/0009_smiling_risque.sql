CREATE TABLE "candidates" (
	"symbol" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"discovery_reason" text,
	"score" double precision,
	"detail" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watchlist" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "watchlist" ADD COLUMN "discovery_reason" text;--> statement-breakpoint
ALTER TABLE "watchlist" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_candidates_status" ON "candidates" USING btree ("status");