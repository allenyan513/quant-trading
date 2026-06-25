CREATE TABLE "data_company_profile" (
	"symbol" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"known_at" timestamp with time zone DEFAULT now() NOT NULL
);
