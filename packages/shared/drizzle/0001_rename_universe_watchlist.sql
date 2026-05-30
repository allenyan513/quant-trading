-- Rename/collapse the universe concept (all tables empty & unused at M0, so
-- drop + recreate is data-loss-safe):
--   securities (bare symbol)      -> dropped
--   profiles  (catalog metadata)  -> becomes `universe` (all known stocks)
--   universe  (symbol + added_at) -> becomes `watchlist` (active subset)
-- Hand-written because drizzle-kit's rename resolver needs an interactive TTY.
DROP TABLE IF EXISTS "securities";--> statement-breakpoint
DROP TABLE IF EXISTS "profiles";--> statement-breakpoint
DROP TABLE IF EXISTS "universe";--> statement-breakpoint
CREATE TABLE "universe" (
	"symbol" text PRIMARY KEY NOT NULL,
	"name" text,
	"sector" text,
	"industry" text,
	"beta" double precision,
	"archetype" text,
	"reporting_currency" text DEFAULT 'USD',
	"known_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlist" (
	"symbol" text PRIMARY KEY NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
