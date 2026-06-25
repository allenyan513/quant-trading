CREATE TABLE "data_quotes" (
	"symbol" text PRIMARY KEY NOT NULL,
	"price" double precision NOT NULL,
	"change_pct" double precision,
	"prev_close" double precision,
	"fetched_at" timestamp with time zone NOT NULL
);
