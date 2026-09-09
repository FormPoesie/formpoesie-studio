CREATE TABLE `inventory_product_metadata` (
	`product_id` text PRIMARY KEY NOT NULL,
	`review_status` text DEFAULT 'draft' NOT NULL,
	`finalized_at` text,
	`etsy_listed` integer DEFAULT false NOT NULL,
	`updated_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_product_metadata_status` ON `inventory_product_metadata` (`review_status`);
