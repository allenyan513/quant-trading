CREATE TABLE "data_holdings_accounts" (
	"account_id" text PRIMARY KEY NOT NULL,
	"flex_token" text NOT NULL,
	"flex_query_id" text NOT NULL,
	"label" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_holdings_nav_history" (
	"account_id" text NOT NULL,
	"date" date NOT NULL,
	"daily_return" double precision NOT NULL,
	"nav_index" double precision NOT NULL,
	"ending_nav" double precision,
	"deposits" double precision DEFAULT 0 NOT NULL,
	"withdrawals" double precision DEFAULT 0 NOT NULL,
	"known_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_holdings_nav_history_account_id_date_pk" PRIMARY KEY("account_id","date")
);
--> statement-breakpoint
CREATE TABLE "data_holdings_positions" (
	"account_id" text NOT NULL,
	"as_of_date" date NOT NULL,
	"symbol" text NOT NULL,
	"option_type" text DEFAULT '' NOT NULL,
	"strike" double precision DEFAULT 0 NOT NULL,
	"expiry" date DEFAULT '1970-01-01' NOT NULL,
	"asset_class" text NOT NULL,
	"quantity" double precision NOT NULL,
	"avg_price" double precision,
	"mark_price" double precision,
	"position_value" double precision,
	"weight_pct" double precision,
	"delta" double precision,
	"gamma" double precision,
	"theta" double precision,
	"vega" double precision,
	"known_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_holdings_positions_account_id_as_of_date_symbol_option_type_strike_expiry_pk" PRIMARY KEY("account_id","as_of_date","symbol","option_type","strike","expiry")
);
--> statement-breakpoint
CREATE TABLE "data_holdings_trades" (
	"account_id" text NOT NULL,
	"external_trade_id" text NOT NULL,
	"trade_date" date,
	"symbol" text NOT NULL,
	"asset_class" text NOT NULL,
	"action" text,
	"quantity" double precision NOT NULL,
	"price" double precision,
	"option_type" text,
	"strike" double precision,
	"expiry" date,
	"known_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_holdings_trades_account_id_external_trade_id_pk" PRIMARY KEY("account_id","external_trade_id")
);
--> statement-breakpoint
CREATE INDEX "idx_holdings_positions_asof" ON "data_holdings_positions" USING btree ("as_of_date");--> statement-breakpoint
CREATE INDEX "idx_holdings_trades_symbol" ON "data_holdings_trades" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "idx_holdings_trades_date" ON "data_holdings_trades" USING btree ("trade_date");