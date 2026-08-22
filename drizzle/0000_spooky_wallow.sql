CREATE TABLE "collective_days" (
	"day" date PRIMARY KEY NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cache_read" integer DEFAULT 0 NOT NULL,
	"cache_write" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(14, 4) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_stats" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"merged_prs" integer DEFAULT 0 NOT NULL,
	"active_repos" integer DEFAULT 0 NOT NULL,
	"contributions" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsors" (
	"id" serial PRIMARY KEY NOT NULL,
	"slot" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"blurb" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"tool" text NOT NULL,
	"model" text NOT NULL,
	"day" date NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cache_read" integer DEFAULT 0 NOT NULL,
	"cache_write" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 4) DEFAULT '0' NOT NULL,
	"source" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"sponsored" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"github_id" text NOT NULL,
	"handle" text NOT NULL,
	"avatar_url" text,
	"public_opt_in" boolean DEFAULT false NOT NULL,
	"x_handle" text,
	"instagram_handle" text,
	"tag_opt_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id"),
	CONSTRAINT "users_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
ALTER TABLE "github_stats" ADD CONSTRAINT "github_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_days" ADD CONSTRAINT "tool_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tool_days_uniq" ON "tool_days" USING btree ("user_id","tool","model","day");