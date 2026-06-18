CREATE TABLE "data_morning_briefs" (
	"user_id" text NOT NULL,
	"brief_date" date NOT NULL,
	"markdown" text NOT NULL,
	"summary" jsonb,
	"code_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_morning_briefs_user_id_brief_date_pk" PRIMARY KEY("user_id","brief_date")
);
--> statement-breakpoint
ALTER TABLE "data_morning_briefs" ADD CONSTRAINT "data_morning_briefs_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;