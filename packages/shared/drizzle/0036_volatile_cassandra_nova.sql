ALTER TABLE "portfolio_paper_orders" ADD COLUMN "order_type" text DEFAULT 'market' NOT NULL;--> statement-breakpoint
ALTER TABLE "portfolio_paper_orders" ADD COLUMN "limit_price" double precision;--> statement-breakpoint
ALTER TABLE "portfolio_paper_orders" ADD COLUMN "tif" text DEFAULT 'gtc' NOT NULL;--> statement-breakpoint
ALTER TABLE "portfolio_paper_orders" ADD COLUMN "thesis" text;--> statement-breakpoint
ALTER TABLE "portfolio_paper_orders" ADD COLUMN "target_price" double precision;--> statement-breakpoint
ALTER TABLE "portfolio_paper_orders" ADD COLUMN "stop_price" double precision;--> statement-breakpoint
ALTER TABLE "portfolio_paper_orders" ADD COLUMN "time_horizon" text;--> statement-breakpoint
ALTER TABLE "portfolio_paper_orders" ADD COLUMN "filled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "portfolio_paper_orders" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_paper_orders_working" ON "portfolio_paper_orders" USING btree ("user_id","status");