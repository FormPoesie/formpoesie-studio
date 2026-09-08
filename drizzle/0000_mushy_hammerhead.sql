CREATE TABLE `brand_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`voice` text NOT NULL,
	`palette_json` text NOT NULL,
	`rules_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `change_history` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_change_history_entity` ON `change_history` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `cost_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`machine_per_hour` real,
	`electricity_per_hour` real,
	`electricity_included` integer DEFAULT false NOT NULL,
	`labor_per_hour` real,
	`overhead_per_order` real,
	`target_margin` real,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `export_records` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`format` text NOT NULL,
	`object_key` text,
	`manifest_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `fee_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`currency` text NOT NULL,
	`fees_json` text NOT NULL,
	`valid_from` text,
	`source_url` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `generated_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`original_asset_id` text,
	`object_key` text,
	`role` text NOT NULL,
	`title` text NOT NULL,
	`filename` text NOT NULL,
	`alt_text` text NOT NULL,
	`locale` text DEFAULT 'de' NOT NULL,
	`export_format` text DEFAULT 'image/jpeg' NOT NULL,
	`approved` integer DEFAULT false NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`original_asset_id`) REFERENCES `original_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`cost_estimate` real,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `image_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`kind` text NOT NULL,
	`roles_json` text NOT NULL,
	`locked_roles_json` text DEFAULT '[]' NOT NULL,
	`stale` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `integration_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`shop_id` text,
	`status` text DEFAULT 'not_connected' NOT NULL,
	`scopes_json` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `keyword_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`research_run_id` text NOT NULL,
	`phrase` text NOT NULL,
	`demand` real,
	`competition` real,
	`relevance` integer NOT NULL,
	`intent` integer NOT NULL,
	`selected` integer DEFAULT false NOT NULL,
	`evidence_url` text,
	FOREIGN KEY (`research_run_id`) REFERENCES `research_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `listing_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`state` text DEFAULT 'local' NOT NULL,
	`mode` text DEFAULT 'autopilot' NOT NULL,
	`category` text,
	`taxonomy_id` integer,
	`locked_json` text DEFAULT '[]' NOT NULL,
	`remote_id` text,
	`transfer_key` text,
	`transfer_status` text DEFAULT 'not_connected' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `locale_contents` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`locale` text NOT NULL,
	`titles_json` text NOT NULL,
	`selected_title` integer DEFAULT 0 NOT NULL,
	`description` text NOT NULL,
	`tags_json` text NOT NULL,
	`locked_json` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `listing_drafts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_locale_contents_draft_locale` ON `locale_contents` (`draft_id`,`locale`);--> statement-breakpoint
CREATE TABLE `material_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`price_per_kg` real,
	`properties_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `original_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`view` text DEFAULT 'unknown' NOT NULL,
	`quality_status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_original_assets_product` ON `original_assets` (`product_id`);--> statement-breakpoint
CREATE TABLE `pricing_scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text,
	`direct_price` real NOT NULL,
	`etsy_price` real NOT NULL,
	`floor_price` real NOT NULL,
	`result_without_ads` real NOT NULL,
	`result_with_ads` real NOT NULL,
	`confidence` text NOT NULL,
	`assumptions_json` text NOT NULL,
	`breakdown_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`model_name` text NOT NULL,
	`product_type` text NOT NULL,
	`sku` text,
	`buyer_world` text NOT NULL,
	`description` text,
	`material` text,
	`material_status` text DEFAULT 'open' NOT NULL,
	`width_mm` real,
	`height_mm` real,
	`depth_mm` real,
	`dimensions_status` text DEFAULT 'open' NOT NULL,
	`design_origin` text,
	`etsy_eligibility` text DEFAULT 'open' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`facts_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_products_status` ON `products` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_sku` ON `products` (`sku`);--> statement-breakpoint
CREATE TABLE `research_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`language` text NOT NULL,
	`market` text NOT NULL,
	`source` text NOT NULL,
	`period` text,
	`fetched_at` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `shipping_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`country` text,
	`postage` real,
	`buyer_shipping` real,
	`processing_days` text,
	`packaging_cost` real,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `variants` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`sku` text,
	`color` text,
	`material` text,
	`set_size` integer DEFAULT 1 NOT NULL,
	`weight_grams` real,
	`print_hours` real,
	`active_minutes` real,
	`failure_rate` real DEFAULT 0.08 NOT NULL,
	`confirmed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_variants_product` ON `variants` (`product_id`);