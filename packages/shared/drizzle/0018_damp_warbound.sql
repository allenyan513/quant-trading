CREATE TABLE "data_13f_cusip_map" (
	"cusip" text PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL,
	"name" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_13f_filers" (
	"cik" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"label" text,
	"active" boolean DEFAULT true NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_13f_holdings" (
	"cik" text NOT NULL,
	"quarter" date NOT NULL,
	"cusip" text NOT NULL,
	"put_call" text DEFAULT '' NOT NULL,
	"issuer_name" text NOT NULL,
	"title_of_class" text,
	"value" double precision NOT NULL,
	"shares" double precision NOT NULL,
	"accession_number" text,
	"known_at" timestamp with time zone NOT NULL,
	CONSTRAINT "data_13f_holdings_cik_quarter_cusip_put_call_pk" PRIMARY KEY("cik","quarter","cusip","put_call")
);
--> statement-breakpoint
CREATE INDEX "idx_13f_holdings_cik_quarter" ON "data_13f_holdings" USING btree ("cik","quarter");--> statement-breakpoint
CREATE INDEX "idx_13f_holdings_cusip" ON "data_13f_holdings" USING btree ("cusip");