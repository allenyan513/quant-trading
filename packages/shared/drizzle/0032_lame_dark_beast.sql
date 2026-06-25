CREATE TABLE "data_dividends" (
	"symbol" text NOT NULL,
	"external_id" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "data_dividends_symbol_external_id_pk" PRIMARY KEY("symbol","external_id")
);
--> statement-breakpoint
CREATE INDEX "idx_dividends_symbol_observed" ON "data_dividends" USING btree ("symbol","observed_at");