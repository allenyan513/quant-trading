CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"batch_key" text NOT NULL,
	"symbol" text NOT NULL,
	"event_type" text NOT NULL,
	"event_ids" jsonb NOT NULL,
	"count" integer NOT NULL,
	"summary" text,
	"observed_at" timestamp with time zone,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"delivery_attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
DROP INDEX "uq_signals_event";--> statement-breakpoint
ALTER TABLE "trading_signals" ADD COLUMN "notification_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notifications_source_batch" ON "notifications" USING btree ("source","batch_key");--> statement-breakpoint
CREATE INDEX "idx_notifications_delivery" ON "notifications" USING btree ("delivery_status");--> statement-breakpoint
CREATE INDEX "idx_notifications_status" ON "notifications" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_signals_notification" ON "trading_signals" USING btree ("notification_id");