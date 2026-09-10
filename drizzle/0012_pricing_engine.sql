CREATE TABLE `pricing_assets` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `category` text,
  `era` text,
  `topic_cluster` text,
  `awareness` text,
  `demand` text,
  `competition` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_pricing_assets_name` ON `pricing_assets` (`name`);
--> statement-breakpoint
CREATE INDEX `idx_pricing_assets_topic` ON `pricing_assets` (`topic_cluster`);
--> statement-breakpoint
CREATE TABLE `pricing_product_profiles` (
  `inventory_product_id` text PRIMARY KEY NOT NULL,
  `asset_id` text,
  `product_kind` text DEFAULT 'physical' NOT NULL,
  `market_category` text,
  `tier` text DEFAULT 'standard' NOT NULL,
  `shape_type` text,
  `season` text,
  `demand` text,
  `competition` text,
  `length_cm` real,
  `width_cm` real,
  `height_cm` real,
  `value_json` text DEFAULT '{}' NOT NULL,
  `license_json` text DEFAULT '{}' NOT NULL,
  `updated_by` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`asset_id`) REFERENCES `pricing_assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_pricing_profiles_asset` ON `pricing_product_profiles` (`asset_id`);
--> statement-breakpoint
CREATE INDEX `idx_pricing_profiles_category` ON `pricing_product_profiles` (`market_category`);
--> statement-breakpoint
CREATE TABLE `pricing_recommendations` (
  `id` text PRIMARY KEY NOT NULL,
  `inventory_product_id` text NOT NULL,
  `inventory_variant_id` text,
  `channel` text NOT NULL,
  `recommendation_kind` text DEFAULT 'physical' NOT NULL,
  `config_version` text NOT NULL,
  `cogs_cents` integer,
  `active_price_snapshot_cents` integer,
  `recommended_price_cents` integer,
  `input_json` text NOT NULL,
  `result_json` text NOT NULL,
  `created_by` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_pricing_recommendations_product` ON `pricing_recommendations` (`inventory_product_id`,`inventory_variant_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_pricing_recommendations_channel` ON `pricing_recommendations` (`channel`,`created_at`);
--> statement-breakpoint
CREATE TABLE `b_ware_evaluations` (
  `id` text PRIMARY KEY NOT NULL,
  `inventory_product_id` text NOT NULL,
  `inventory_variant_id` text,
  `channel` text NOT NULL,
  `affected_area` text,
  `input_json` text NOT NULL,
  `result_json` text NOT NULL,
  `created_by` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_b_ware_product` ON `b_ware_evaluations` (`inventory_product_id`,`inventory_variant_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `market_pricing_outcomes` (
  `id` text PRIMARY KEY NOT NULL,
  `market_id` text NOT NULL,
  `expected_sales` integer NOT NULL,
  `actual_sales` integer,
  `actual_revenue_cents` integer,
  `stand_fee_cents` integer DEFAULT 0 NOT NULL,
  `travel_cost_cents` integer DEFAULT 0 NOT NULL,
  `additional_cost_cents` integer DEFAULT 0 NOT NULL,
  `created_by` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_market_pricing_outcomes_market` ON `market_pricing_outcomes` (`market_id`);
--> statement-breakpoint
CREATE TABLE `pricing_config_values` (
  `key` text PRIMARY KEY NOT NULL,
  `value_json` text NOT NULL,
  `updated_by` text,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
PRAGMA optimize;
