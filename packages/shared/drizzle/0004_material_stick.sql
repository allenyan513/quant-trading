CREATE TABLE "logs" (
	"id" text PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"level" text NOT NULL,
	"service" text NOT NULL,
	"event" text NOT NULL,
	"symbol" text,
	"external_id" text,
	"notification_id" text,
	"signal_id" text,
	"fields" jsonb
);
--> statement-breakpoint
CREATE INDEX "idx_logs_ts" ON "logs" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "idx_logs_service_ts" ON "logs" USING btree ("service","ts");--> statement-breakpoint
CREATE INDEX "idx_logs_level" ON "logs" USING btree ("level");--> statement-breakpoint
CREATE INDEX "idx_logs_symbol" ON "logs" USING btree ("symbol");