CREATE TABLE "data_insider" (
	"symbol" text NOT NULL,
	"external_id" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "data_insider_symbol_external_id_pk" PRIMARY KEY("symbol","external_id")
);
--> statement-breakpoint
CREATE TABLE "data_marketdata_fetches" (
	"symbol" text NOT NULL,
	"dataset" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "data_marketdata_fetches_symbol_dataset_pk" PRIMARY KEY("symbol","dataset")
);
--> statement-breakpoint
CREATE TABLE "data_price_targets" (
	"symbol" text NOT NULL,
	"external_id" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "data_price_targets_symbol_external_id_pk" PRIMARY KEY("symbol","external_id")
);
--> statement-breakpoint
CREATE TABLE "data_ratings" (
	"symbol" text NOT NULL,
	"external_id" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "data_ratings_symbol_external_id_pk" PRIMARY KEY("symbol","external_id")
);
--> statement-breakpoint
CREATE INDEX "idx_insider_symbol_observed" ON "data_insider" USING btree ("symbol","observed_at");--> statement-breakpoint
CREATE INDEX "idx_price_targets_symbol_observed" ON "data_price_targets" USING btree ("symbol","observed_at");--> statement-breakpoint
CREATE INDEX "idx_ratings_symbol_observed" ON "data_ratings" USING btree ("symbol","observed_at");