CREATE TABLE "signal_audits" (
	"signal_id" text PRIMARY KEY NOT NULL,
	"model" text,
	"prompt_version" text,
	"system_prompt" text,
	"user_prompt" text,
	"messages" jsonb,
	"turns" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trading_signals" ADD COLUMN "model_version" text;--> statement-breakpoint
ALTER TABLE "trading_signals" ADD COLUMN "prompt_version" text;--> statement-breakpoint
ALTER TABLE "trading_signals" ADD COLUMN "out_of_sample" boolean;