CREATE TABLE `inventory_fulfillment_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`sale_id` text NOT NULL,
	`article_variant_id` text,
	`article_name` text NOT NULL,
	`variant_name` text,
	`venue_name` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`fulfillment_mode` text DEFAULT 'pickup' NOT NULL,
	`is_printed` integer DEFAULT false NOT NULL,
	`is_shipped` integer DEFAULT false NOT NULL,
	`sale_date` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_inventory_fulfillment_source` ON `inventory_fulfillment_tasks` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_inventory_fulfillment_open` ON `inventory_fulfillment_tasks` (`is_printed`,`is_shipped`);--> statement-breakpoint
CREATE TABLE `monthly_product_highlights` (
	`month` text PRIMARY KEY NOT NULL,
	`product_key` text NOT NULL,
	`product_name` text NOT NULL,
	`product_quantity` integer NOT NULL,
	`total_quantity` integer NOT NULL,
	`calculated_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_monthly_product_month` ON `monthly_product_highlights` (`month`);