CREATE TABLE `inventory_venue_classifications` (
	`market_id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'market' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_venue_kind` ON `inventory_venue_classifications` (`kind`);