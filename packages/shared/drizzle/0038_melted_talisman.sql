CREATE TABLE "data_memo_symbols" (
	"memo_id" text NOT NULL,
	"symbol" text NOT NULL,
	"price_at_write" double precision,
	"price_ts" timestamp with time zone,
	"valuation_snapshot_id" text,
	"context" jsonb,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_memo_symbols_memo_id_symbol_pk" PRIMARY KEY("memo_id","symbol")
);
--> statement-breakpoint
CREATE TABLE "data_memos" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"markdown" text NOT NULL,
	"direction" text,
	"status" text DEFAULT 'active' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"idempotency_key" text,
	"code_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_memo_symbols" ADD CONSTRAINT "data_memo_symbols_memo_id_data_memos_id_fk" FOREIGN KEY ("memo_id") REFERENCES "public"."data_memos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_memos" ADD CONSTRAINT "data_memos_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_memo_symbols_symbol" ON "data_memo_symbols" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "idx_memos_user_created" ON "data_memos" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_memos_user_status" ON "data_memos" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_memos_idem" ON "data_memos" USING btree ("user_id","idempotency_key") WHERE "data_memos"."idempotency_key" is not null;