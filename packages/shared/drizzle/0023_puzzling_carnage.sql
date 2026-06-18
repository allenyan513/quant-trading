CREATE TABLE "auth_oauth_access_token" (
	"id" text PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone NOT NULL,
	"refresh_token_expires_at" timestamp with time zone,
	"client_id" text NOT NULL,
	"user_id" text,
	"scopes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_oauth_access_token_access_token_unique" UNIQUE("access_token"),
	CONSTRAINT "auth_oauth_access_token_refresh_token_unique" UNIQUE("refresh_token")
);
--> statement-breakpoint
CREATE TABLE "auth_oauth_application" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"metadata" text,
	"client_id" text NOT NULL,
	"client_secret" text,
	"redirect_urls" text NOT NULL,
	"type" text NOT NULL,
	"disabled" boolean DEFAULT false,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_oauth_application_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "auth_oauth_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text,
	"scopes" text,
	"consent_given" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_oauth_access_token" ADD CONSTRAINT "auth_oauth_access_token_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_oauth_application" ADD CONSTRAINT "auth_oauth_application_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_oauth_consent" ADD CONSTRAINT "auth_oauth_consent_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_oauth_token_client" ON "auth_oauth_access_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_token_user" ON "auth_oauth_access_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_app_user" ON "auth_oauth_application" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_consent_client" ON "auth_oauth_consent" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_consent_user" ON "auth_oauth_consent" USING btree ("user_id");