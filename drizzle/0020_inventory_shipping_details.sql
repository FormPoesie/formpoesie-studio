CREATE TABLE `inventory_shipping_details` (
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`shipping_method` text,
	`tracking_number` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`source_type`, `source_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_shipping_tracking` ON `inventory_shipping_details` (`tracking_number`);
