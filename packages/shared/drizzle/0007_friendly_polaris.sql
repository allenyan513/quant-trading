CREATE TABLE "position_deliveries" (
	"signal_id" text PRIMARY KEY NOT NULL,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_position_deliveries_status" ON "position_deliveries" USING btree ("delivery_status");