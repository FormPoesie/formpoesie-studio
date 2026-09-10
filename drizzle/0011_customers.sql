CREATE TABLE IF NOT EXISTS `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`address` text NOT NULL,
	`note` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_customers_name` ON `customers` (`name`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_customers_email` ON `customers` (`email`);
--> statement-breakpoint
SELECT 1;
