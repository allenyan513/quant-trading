DROP TABLE "user_watchlist" CASCADE;
--> statement-breakpoint
DROP TABLE "data_watchlist" CASCADE;
--> statement-breakpoint
CREATE TABLE "data_watchlist" (
	"user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"note" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_watchlist_user_id_symbol_pk" PRIMARY KEY("user_id","symbol")
);
--> statement-breakpoint
ALTER TABLE "data_watchlist" ADD CONSTRAINT "data_watchlist_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;