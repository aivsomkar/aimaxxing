CREATE TABLE "portfolio_import_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"source" text NOT NULL,
	"state_hash" text,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"source" text NOT NULL,
	"external_id" text,
	"title" text NOT NULL,
	"description" text,
	"live_url" text NOT NULL,
	"repository_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "github_login" text;--> statement-breakpoint
ALTER TABLE "portfolio_import_sessions" ADD CONSTRAINT "portfolio_import_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_projects" ADD CONSTRAINT "portfolio_projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_projects_user_live_url_uniq" ON "portfolio_projects" USING btree ("user_id","live_url");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_projects_user_source_external_uniq" ON "portfolio_projects" USING btree ("user_id","source","external_id");