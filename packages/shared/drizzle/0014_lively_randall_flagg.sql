ALTER TABLE "data_news_items" ADD COLUMN "screen_passed" boolean;--> statement-breakpoint
ALTER TABLE "data_news_items" ADD COLUMN "screen_failed_rule" text;--> statement-breakpoint
ALTER TABLE "data_news_items" ADD COLUMN "screen_detail" jsonb;--> statement-breakpoint
ALTER TABLE "data_news_items" ADD COLUMN "screening_version" text;--> statement-breakpoint
ALTER TABLE "data_news_items" ADD COLUMN "triage_symbol" text;--> statement-breakpoint
ALTER TABLE "data_news_items" ADD COLUMN "triage_material" boolean;--> statement-breakpoint
ALTER TABLE "data_news_items" ADD COLUMN "triage_priority" text;--> statement-breakpoint
ALTER TABLE "data_news_items" ADD COLUMN "triage_rationale" text;--> statement-breakpoint
ALTER TABLE "data_news_items" ADD COLUMN "triage_model" text;--> statement-breakpoint
ALTER TABLE "data_news_items" ADD COLUMN "triage_prompt_version" text;--> statement-breakpoint
ALTER TABLE "data_news_items" ADD COLUMN "triaged_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_news_triage_priority" ON "data_news_items" USING btree ("triage_priority");--> statement-breakpoint
CREATE INDEX "idx_news_screen_passed" ON "data_news_items" USING btree ("screen_passed");