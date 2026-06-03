CREATE TABLE "data_pull_watermarks" (
	"source_key" text PRIMARY KEY NOT NULL,
	"last_event_at" timestamp with time zone,
	"last_pulled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_count" integer DEFAULT 0 NOT NULL
);
