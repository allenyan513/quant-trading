CREATE TABLE "data_earnings_calendar" (
	"symbol" text NOT NULL,
	"report_date" date NOT NULL,
	"name" text,
	"eps_estimated" double precision,
	"eps_actual" double precision,
	"revenue_estimated" double precision,
	"revenue_actual" double precision,
	"market_cap" double precision,
	"sector" text,
	"logo_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_earnings_calendar_symbol_report_date_pk" PRIMARY KEY("symbol","report_date")
);
--> statement-breakpoint
CREATE INDEX "idx_earnings_cal_date" ON "data_earnings_calendar" USING btree ("report_date");--> statement-breakpoint
CREATE INDEX "idx_earnings_cal_date_cap" ON "data_earnings_calendar" USING btree ("report_date","market_cap");