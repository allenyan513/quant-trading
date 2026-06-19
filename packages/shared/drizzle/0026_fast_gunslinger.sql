CREATE TABLE "data_8k_filings" (
	"accession_number" text PRIMARY KEY NOT NULL,
	"cik" text NOT NULL,
	"symbol" text NOT NULL,
	"items" text NOT NULL,
	"filed_date" date NOT NULL,
	"report_date" date,
	"primary_document" text,
	"known_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_8k_symbol" ON "data_8k_filings" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "idx_8k_filed" ON "data_8k_filings" USING btree ("filed_date");