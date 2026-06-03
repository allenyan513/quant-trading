CREATE TABLE "news_items" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"external_id" text NOT NULL,
	"symbol" text,
	"title" text,
	"text" text,
	"url" text,
	"site" text,
	"image" text,
	"published_at" timestamp with time zone,
	"raw" jsonb,
	"status" text DEFAULT 'new' NOT NULL,
	"pulled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_news_category_external" ON "news_items" USING btree ("category","external_id");--> statement-breakpoint
CREATE INDEX "idx_news_published" ON "news_items" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "idx_news_status" ON "news_items" USING btree ("status");