UPDATE "reporter_tool_days"
SET "tokens_in" = greatest("tokens_in" - "cache_read" - "cache_write", 0)
WHERE "tool" = 'codex-cli';
--> statement-breakpoint
UPDATE "reporter_tool_days" SET "cost_usd" = 0 WHERE "tool" <> 'opencode';
--> statement-breakpoint
UPDATE "reporter_tool_days" AS "usage"
SET "cost_usd" = round((
  "usage"."tokens_in" * "rates"."input_rate"
  + "usage"."tokens_out" * "rates"."output_rate"
  + "usage"."cache_read" * "rates"."cache_read_rate"
  + "usage"."cache_write" * "rates"."cache_write_rate"
) / 1000000, 4)
FROM (VALUES
  ('gpt-5.6-sol', 5.0, 30.0, 0.5, 6.25),
  ('gpt-5.6-terra', 2.0, 12.0, 0.2, 2.5),
  ('gpt-5.6-luna', 0.2, 1.2, 0.02, 0.25),
  ('gpt-5.5', 5.0, 30.0, 0.5, 6.25),
  ('gpt-5.1', 1.25, 10.0, 0.125, 1.25),
  ('gpt-5', 1.25, 10.0, 0.125, 1.25),
  ('claude-fable-5', 10.0, 50.0, 1.0, 12.5),
  ('claude-opus-5', 5.0, 25.0, 0.5, 6.25),
  ('claude-opus-4-8', 5.0, 25.0, 0.5, 6.25),
  ('claude-sonnet-5', 2.0, 10.0, 0.2, 2.5),
  ('claude-sonnet-4-6', 3.0, 15.0, 0.3, 3.75),
  ('claude-haiku-4-5-20251001', 1.0, 5.0, 0.1, 1.25),
  ('claude-opus-4-1', 15.0, 75.0, 1.5, 18.75),
  ('claude-sonnet-4', 3.0, 15.0, 0.3, 3.75)
) AS "rates"("model", "input_rate", "output_rate", "cache_read_rate", "cache_write_rate")
WHERE "usage"."model" = "rates"."model"
  AND "usage"."tool" <> 'opencode';
