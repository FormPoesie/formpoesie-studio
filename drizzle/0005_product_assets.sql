CREATE TABLE `inventory_product_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`asset_kind` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_product_assets_product` ON `inventory_product_assets` (`product_id`,`asset_kind`);
--> statement-breakpoint
CREATE INDEX `idx_inventory_product_assets_primary` ON `inventory_product_assets` (`product_id`,`is_primary`);
