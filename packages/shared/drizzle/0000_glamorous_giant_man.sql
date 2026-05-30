CREATE TABLE "analyst_estimates" (
	"symbol" text NOT NULL,
	"period" text NOT NULL,
	"fiscal_date" date NOT NULL,
	"known_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "analyst_estimates_symbol_period_fiscal_date_pk" PRIMARY KEY("symbol","period","fiscal_date")
);
--> statement-breakpoint
CREATE TABLE "balance_sheet" (
	"symbol" text NOT NULL,
	"period" text NOT NULL,
	"fiscal_date" date NOT NULL,
	"known_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "balance_sheet_symbol_period_fiscal_date_pk" PRIMARY KEY("symbol","period","fiscal_date")
);
--> statement-breakpoint
CREATE TABLE "cash_flow" (
	"symbol" text NOT NULL,
	"period" text NOT NULL,
	"fiscal_date" date NOT NULL,
	"known_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "cash_flow_symbol_period_fiscal_date_pk" PRIMARY KEY("symbol","period","fiscal_date")
);
--> statement-breakpoint
CREATE TABLE "daily_prices" (
	"symbol" text NOT NULL,
	"trade_date" date NOT NULL,
	"open" double precision,
	"high" double precision,
	"low" double precision,
	"close" double precision,
	"adj_close" double precision,
	"volume" bigint,
	CONSTRAINT "daily_prices_symbol_trade_date_pk" PRIMARY KEY("symbol","trade_date")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"symbol" text,
	"event_type" text,
	"direction_hint" text,
	"headline" text,
	"raw" jsonb,
	"observed_at" timestamp with time zone,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"delivery_attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "feedback_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"signal_id" text,
	"symbol" text,
	"event_type" text,
	"lesson" text NOT NULL,
	"scores" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_ratios" (
	"symbol" text NOT NULL,
	"period" text NOT NULL,
	"fiscal_date" date NOT NULL,
	"known_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "financial_ratios_symbol_period_fiscal_date_pk" PRIMARY KEY("symbol","period","fiscal_date")
);
--> statement-breakpoint
CREATE TABLE "income_statement" (
	"symbol" text NOT NULL,
	"period" text NOT NULL,
	"fiscal_date" date NOT NULL,
	"known_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "income_statement_symbol_period_fiscal_date_pk" PRIMARY KEY("symbol","period","fiscal_date")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
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
CREATE TABLE "securities" (
	"symbol" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_deliveries" (
	"signal_id" text PRIMARY KEY NOT NULL,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_outcomes" (
	"signal_id" text NOT NULL,
	"horizon" text NOT NULL,
	"price_at_horizon" double precision,
	"return_pct" double precision,
	"benchmark_return_pct" double precision,
	"alpha_pct" double precision,
	"resolved_status" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signal_outcomes_signal_id_horizon_pk" PRIMARY KEY("signal_id","horizon")
);
--> statement-breakpoint
CREATE TABLE "trading_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text,
	"symbol" text NOT NULL,
	"direction" text NOT NULL,
	"target_price" double precision,
	"stop_loss" double precision,
	"horizon_days" integer,
	"conviction" text,
	"entry_price" double precision,
	"fair_value_base" double precision,
	"deviation_pct" double precision,
	"thesis" text,
	"generated_by" text,
	"snapshot_id" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "universe" (
	"symbol" text PRIMARY KEY NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "valuation_snapshots" (
	"snapshot_id" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"as_of" date NOT NULL,
	"fair_value_per_share" double precision,
	"current_price" double precision,
	"upside_pct" double precision,
	"verdict" text,
	"detail" jsonb NOT NULL,
	"code_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_prices_symbol_date" ON "daily_prices" USING btree ("symbol","trade_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_events_source_external" ON "events" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "idx_events_delivery" ON "events" USING btree ("delivery_status");--> statement-breakpoint
CREATE INDEX "idx_feedback_symbol" ON "feedback_notes" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "idx_feedback_event_type" ON "feedback_notes" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_deliveries_status" ON "signal_deliveries" USING btree ("delivery_status");--> statement-breakpoint
CREATE INDEX "idx_signals_symbol" ON "trading_signals" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "idx_signals_event" ON "trading_signals" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_signals_status" ON "trading_signals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_valsnap_symbol" ON "valuation_snapshots" USING btree ("symbol");