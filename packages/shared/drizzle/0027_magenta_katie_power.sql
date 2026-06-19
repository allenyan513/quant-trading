CREATE TABLE "data_form4" (
	"accession_number" text NOT NULL,
	"txn_index" integer NOT NULL,
	"symbol" text NOT NULL,
	"issuer_cik" text NOT NULL,
	"reporting_name" text NOT NULL,
	"reporting_cik" text,
	"relationship" text,
	"officer_title" text,
	"transaction_code" text NOT NULL,
	"acquired_disposed" text,
	"shares" double precision,
	"price_per_share" double precision,
	"security_title" text,
	"is_derivative" boolean DEFAULT false NOT NULL,
	"shares_owned_after" double precision,
	"is_10b5_1" boolean DEFAULT false NOT NULL,
	"transaction_date" date,
	"filed_date" date NOT NULL,
	"known_at" timestamp with time zone NOT NULL,
	CONSTRAINT "data_form4_accession_number_txn_index_pk" PRIMARY KEY("accession_number","txn_index")
);
--> statement-breakpoint
CREATE INDEX "idx_form4_symbol" ON "data_form4" USING btree ("symbol","filed_date");--> statement-breakpoint
CREATE INDEX "idx_form4_filed" ON "data_form4" USING btree ("filed_date");