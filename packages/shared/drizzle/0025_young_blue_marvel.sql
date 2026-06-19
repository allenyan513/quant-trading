CREATE TABLE "data_ownership_filers" (
	"cik" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"label" text,
	"active" boolean DEFAULT true NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_ownership_filings" (
	"accession_number" text PRIMARY KEY NOT NULL,
	"filer_cik" text NOT NULL,
	"filer_name" text NOT NULL,
	"form_type" text NOT NULL,
	"schedule" text NOT NULL,
	"is_amendment" boolean NOT NULL,
	"subject_cik" text NOT NULL,
	"subject_name" text NOT NULL,
	"subject_ticker" text,
	"cusip" text,
	"pct_of_class" double precision,
	"shares_owned" double precision,
	"filed_date" date NOT NULL,
	"known_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_ownership_subjects" (
	"cik" text PRIMARY KEY NOT NULL,
	"ticker" text,
	"name" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_ownership_subject_ticker" ON "data_ownership_filings" USING btree ("subject_ticker");--> statement-breakpoint
CREATE INDEX "idx_ownership_subject_cik" ON "data_ownership_filings" USING btree ("subject_cik");--> statement-breakpoint
CREATE INDEX "idx_ownership_filer" ON "data_ownership_filings" USING btree ("filer_cik");--> statement-breakpoint
CREATE INDEX "idx_ownership_filed" ON "data_ownership_filings" USING btree ("filed_date");