CREATE TABLE `market_clusters` (
  `id` text PRIMARY KEY NOT NULL,
  `parent_id` text,
  `level` integer NOT NULL,
  `dimension` text NOT NULL,
  `label` text NOT NULL,
  `normalized_key` text NOT NULL,
  `search_terms_json` text DEFAULT '[]' NOT NULL,
  `status` text DEFAULT 'NEW' NOT NULL,
  `research_priority` real DEFAULT 0.5 NOT NULL,
  `research_frequency` text DEFAULT 'NEW' NOT NULL,
  `last_researched_at` text,
  `last_valid_snapshot_id` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_market_clusters_key` ON `market_clusters` (`normalized_key`);
--> statement-breakpoint
CREATE INDEX `idx_market_clusters_priority` ON `market_clusters` (`research_frequency`,`research_priority`);
--> statement-breakpoint
CREATE TABLE `market_cluster_products` (
  `cluster_id` text NOT NULL,
  `product_id` text NOT NULL,
  `variant_id` text,
  `relevance` real DEFAULT 1 NOT NULL,
  `reasons_json` text DEFAULT '[]' NOT NULL,
  `catalog_updated_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`cluster_id`) REFERENCES `market_clusters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_market_cluster_products_unique` ON `market_cluster_products` (`cluster_id`,`product_id`,`variant_id`);
--> statement-breakpoint
CREATE INDEX `idx_market_cluster_products_product` ON `market_cluster_products` (`product_id`);
--> statement-breakpoint
CREATE TABLE `market_research_queries` (
  `id` text PRIMARY KEY NOT NULL,
  `cluster_id` text NOT NULL,
  `query` text NOT NULL,
  `language` text NOT NULL,
  `intent` text DEFAULT 'buy' NOT NULL,
  `status` text DEFAULT 'ACTIVE' NOT NULL,
  `yield_score` real,
  `last_used_at` text,
  `discovered_from` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`cluster_id`) REFERENCES `market_clusters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_market_queries_cluster_query` ON `market_research_queries` (`cluster_id`,`query`);
--> statement-breakpoint
CREATE INDEX `idx_market_queries_status` ON `market_research_queries` (`cluster_id`,`status`);
--> statement-breakpoint
CREATE TABLE `market_research_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `run_kind` text NOT NULL,
  `status` text NOT NULL,
  `started_at` text NOT NULL,
  `finished_at` text,
  `catalog_fingerprint` text,
  `cluster_count` integer DEFAULT 0 NOT NULL,
  `query_count` integer DEFAULT 0 NOT NULL,
  `found_count` integer DEFAULT 0 NOT NULL,
  `rejected_count` integer DEFAULT 0 NOT NULL,
  `comparable_count` integer DEFAULT 0 NOT NULL,
  `snapshot_count` integer DEFAULT 0 NOT NULL,
  `change_count` integer DEFAULT 0 NOT NULL,
  `pricing_impact_count` integer DEFAULT 0 NOT NULL,
  `error_json` text DEFAULT '[]' NOT NULL,
  `audit_json` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_market_runs_started` ON `market_research_runs` (`started_at`);
--> statement-breakpoint
CREATE TABLE `market_observations` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL,
  `cluster_id` text NOT NULL,
  `source` text NOT NULL,
  `source_url` text NOT NULL,
  `platform` text,
  `listing_key` text NOT NULL,
  `researched_at` text NOT NULL,
  `title` text NOT NULL,
  `seller` text,
  `physical_or_digital` text NOT NULL,
  `currency` text,
  `regular_price_cents` integer,
  `sale_price_cents` integer,
  `shipping_price_cents` integer,
  `visible_customer_price_cents` integer,
  `product_type` text,
  `function_label` text,
  `style` text,
  `motif` text,
  `person` text,
  `dimensions_json` text DEFAULT '{}' NOT NULL,
  `variants_json` text DEFAULT '[]' NOT NULL,
  `material` text,
  `finish` text,
  `personalization` integer,
  `bundle_size` integer,
  `review_count` integer,
  `rating` real,
  `popularity_json` text DEFAULT '{}' NOT NULL,
  `comparability_score` real NOT NULL,
  `source_quality_score` real NOT NULL,
  `raw_metadata_json` text DEFAULT '{}' NOT NULL,
  FOREIGN KEY (`run_id`) REFERENCES `market_research_runs`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`cluster_id`) REFERENCES `market_clusters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_market_observations_run_listing` ON `market_observations` (`run_id`,`cluster_id`,`listing_key`);
--> statement-breakpoint
CREATE INDEX `idx_market_observations_cluster` ON `market_observations` (`cluster_id`,`researched_at`);
--> statement-breakpoint
CREATE INDEX `idx_market_observations_seller` ON `market_observations` (`cluster_id`,`seller`);
--> statement-breakpoint
CREATE TABLE `market_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL,
  `cluster_id` text NOT NULL,
  `timestamp` text NOT NULL,
  `status` text DEFAULT 'VALID' NOT NULL,
  `demand_score` real,
  `external_demand_score` real,
  `internal_sales_score` real,
  `internal_sales_trend` real,
  `competition_score` real,
  `observed_trend` real,
  `seasonality_signal` real,
  `adjusted_trend` real,
  `trend_state` text DEFAULT 'BASELINE' NOT NULL,
  `p25_cents` integer,
  `median_cents` integer,
  `p75_cents` integer,
  `p90_cents` integer,
  `sample_size` integer DEFAULT 0 NOT NULL,
  `effective_sample_size` real DEFAULT 0 NOT NULL,
  `average_comparability` real,
  `source_diversity` integer DEFAULT 0 NOT NULL,
  `seller_diversity` integer DEFAULT 0 NOT NULL,
  `confidence` text NOT NULL,
  `source_distribution_json` text DEFAULT '{}' NOT NULL,
  `diagnostics_json` text DEFAULT '{}' NOT NULL,
  FOREIGN KEY (`run_id`) REFERENCES `market_research_runs`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`cluster_id`) REFERENCES `market_clusters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_market_snapshots_cluster` ON `market_snapshots` (`cluster_id`,`timestamp`);
--> statement-breakpoint
CREATE TABLE `market_changes` (
  `id` text PRIMARY KEY NOT NULL,
  `cluster_id` text NOT NULL,
  `previous_snapshot_id` text,
  `current_snapshot_id` text NOT NULL,
  `change_type` text NOT NULL,
  `confidence` text NOT NULL,
  `before_json` text,
  `after_json` text NOT NULL,
  `affected_product_ids_json` text DEFAULT '[]' NOT NULL,
  `affected_variant_ids_json` text DEFAULT '[]' NOT NULL,
  `sources_json` text DEFAULT '[]' NOT NULL,
  `explanation_json` text DEFAULT '[]' NOT NULL,
  `detected_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_market_changes_cluster` ON `market_changes` (`cluster_id`,`detected_at`);
--> statement-breakpoint
CREATE INDEX `idx_market_changes_type` ON `market_changes` (`change_type`,`detected_at`);
--> statement-breakpoint
CREATE TABLE `pricing_impacts` (
  `id` text PRIMARY KEY NOT NULL,
  `market_change_id` text NOT NULL,
  `product_id` text NOT NULL,
  `variant_id` text,
  `channel` text NOT NULL,
  `previous_recommendation_cents` integer,
  `new_recommendation_cents` integer,
  `absolute_difference_cents` integer,
  `percentage_difference` real,
  `status` text DEFAULT 'STALE_MARKET_DATA' NOT NULL,
  `recommendation_id` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`market_change_id`) REFERENCES `market_changes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pricing_impacts_change_variant_channel` ON `pricing_impacts` (`market_change_id`,`product_id`,`variant_id`,`channel`);
--> statement-breakpoint
CREATE INDEX `idx_pricing_impacts_product` ON `pricing_impacts` (`product_id`,`created_at`);
--> statement-breakpoint
ALTER TABLE `pricing_recommendations` ADD `status` text DEFAULT 'CURRENT' NOT NULL;
--> statement-breakpoint
ALTER TABLE `pricing_recommendations` ADD `market_change_id` text;
--> statement-breakpoint
CREATE INDEX `idx_pricing_recommendations_status` ON `pricing_recommendations` (`status`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
