CREATE TABLE `customers` (
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
CREATE INDEX `idx_customers_name` ON `customers` (`name`);
--> statement-breakpoint
CREATE INDEX `idx_customers_email` ON `customers` (`email`);
--> statement-breakpoint
ALTER TABLE `invoices` ADD `customer_id` text;
