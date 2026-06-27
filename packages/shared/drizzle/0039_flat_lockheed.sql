ALTER TABLE "data_watchlist" DROP CONSTRAINT "data_watchlist_list_id_data_watchlist_lists_id_fk";
--> statement-breakpoint
-- #199 backfill: every previously-ungrouped (list_id IS NULL) symbol now needs a list.
-- Create one "Favorite" list per affected user and move their ungrouped symbols into it,
-- atomically (RETURNING the new ids — no fragile name matching), BEFORE the NOT NULL.
WITH new_fav AS (
  INSERT INTO "data_watchlist_lists" ("id", "user_id", "name", "sort_order", "created_at")
  SELECT gen_random_uuid(), u.user_id, 'Favorite', 0, now()
  FROM (SELECT DISTINCT "user_id" FROM "data_watchlist" WHERE "list_id" IS NULL) u
  RETURNING "id", "user_id"
)
UPDATE "data_watchlist" d
SET "list_id" = nf."id"
FROM new_fav nf
WHERE d."user_id" = nf."user_id" AND d."list_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "data_watchlist" ALTER COLUMN "list_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "data_watchlist" ADD CONSTRAINT "data_watchlist_list_id_data_watchlist_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."data_watchlist_lists"("id") ON DELETE cascade ON UPDATE no action;