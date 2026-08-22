CREATE TABLE "reporter_action_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporter_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"action" text NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reporter_link_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_code_hash" text NOT NULL,
	"user_code_hash" text NOT NULL,
	"public_key" text NOT NULL,
	"public_key_fingerprint" text NOT NULL,
	"machine_id_hash" text NOT NULL,
	"machine_label" text NOT NULL,
	"user_id" integer,
	"reporter_id" uuid,
	"expires_at" timestamp NOT NULL,
	"approved_at" timestamp,
	"denied_at" timestamp,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reporter_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"pricing_version" text NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reporter_tool_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporter_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"tool" text NOT NULL,
	"model" text NOT NULL,
	"day" date NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"tokens_in" bigint DEFAULT 0 NOT NULL,
	"tokens_out" bigint DEFAULT 0 NOT NULL,
	"cache_read" bigint DEFAULT 0 NOT NULL,
	"cache_write" bigint DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reporters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"machine_id_hash" text NOT NULL,
	"machine_label" text NOT NULL,
	"public_key" text NOT NULL,
	"public_key_fingerprint" text NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp,
	"revoked_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "reporter_action_requests" ADD CONSTRAINT "reporter_action_requests_reporter_id_reporters_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."reporters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporter_link_sessions" ADD CONSTRAINT "reporter_link_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporter_link_sessions" ADD CONSTRAINT "reporter_link_sessions_reporter_id_reporters_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."reporters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporter_submissions" ADD CONSTRAINT "reporter_submissions_reporter_id_reporters_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."reporters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporter_tool_days" ADD CONSTRAINT "reporter_tool_days_reporter_id_reporters_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."reporters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporter_tool_days" ADD CONSTRAINT "reporter_tool_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporters" ADD CONSTRAINT "reporters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reporter_action_requests_reporter_request_uniq" ON "reporter_action_requests" USING btree ("reporter_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reporter_link_sessions_device_code_uniq" ON "reporter_link_sessions" USING btree ("device_code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "reporter_link_sessions_user_code_uniq" ON "reporter_link_sessions" USING btree ("user_code_hash");--> statement-breakpoint
CREATE INDEX "reporter_link_sessions_expiry_idx" ON "reporter_link_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "reporter_submissions_reporter_idx" ON "reporter_submissions" USING btree ("reporter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reporter_tool_days_reporter_tool_model_day_uniq" ON "reporter_tool_days" USING btree ("reporter_id","tool","model","day");--> statement-breakpoint
CREATE INDEX "reporter_tool_days_user_idx" ON "reporter_tool_days" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reporters_user_machine_uniq" ON "reporters" USING btree ("user_id","machine_id_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "reporters_fingerprint_uniq" ON "reporters" USING btree ("public_key_fingerprint");--> statement-breakpoint
CREATE INDEX "reporters_user_idx" ON "reporters" USING btree ("user_id");