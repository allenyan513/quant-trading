CREATE TABLE "portfolio_paper_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"cash" double precision NOT NULL,
	"starting_cash" double precision NOT NULL,
	"realized_pnl" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_paper_orders" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"asset_class" text DEFAULT 'EQUITY' NOT NULL,
	"quantity" double precision NOT NULL,
	"fill_price" double precision,
	"status" text NOT NULL,
	"reject_reason" text,
	"realized_pnl" double precision,
	"source" text NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_paper_positions" (
	"user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"quantity" double precision NOT NULL,
	"avg_cost" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_paper_positions_user_id_symbol_pk" PRIMARY KEY("user_id","symbol")
);
--> statement-breakpoint
ALTER TABLE "portfolio_paper_accounts" ADD CONSTRAINT "portfolio_paper_accounts_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_paper_orders" ADD CONSTRAINT "portfolio_paper_orders_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_paper_positions" ADD CONSTRAINT "portfolio_paper_positions_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_paper_orders_user" ON "portfolio_paper_orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_paper_orders_idem" ON "portfolio_paper_orders" USING btree ("user_id","idempotency_key") WHERE "portfolio_paper_orders"."idempotency_key" is not null;