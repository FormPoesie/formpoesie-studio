ALTER TABLE `inventory_product_metadata` ADD `research_version` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `inventory_product_metadata` ADD `research_fingerprint` text;
--> statement-breakpoint
CREATE TABLE `market_analysis_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `product_id` text NOT NULL,
  `product_version` integer NOT NULL,
  `prompt_version` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `trigger_reason` text NOT NULL,
  `status` text DEFAULT 'QUEUED' NOT NULL,
  `run_id` text,
  `result_json` text,
  `error_json` text DEFAULT '[]' NOT NULL,
  `started_at` text,
  `finished_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_market_analysis_jobs_idempotency` ON `market_analysis_jobs` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `idx_market_analysis_jobs_product` ON `market_analysis_jobs` (`product_id`,`product_version`);
--> statement-breakpoint
CREATE INDEX `idx_market_analysis_jobs_status` ON `market_analysis_jobs` (`status`,`created_at`);
