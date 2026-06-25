CREATE TABLE "data_watchlist_lists" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_watchlist" ADD COLUMN "list_id" text;--> statement-breakpoint
ALTER TABLE "data_watchlist_lists" ADD CONSTRAINT "data_watchlist_lists_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_watchlist" ADD CONSTRAINT "data_watchlist_list_id_data_watchlist_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."data_watchlist_lists"("id") ON DELETE set null ON UPDATE no action;