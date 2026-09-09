CREATE TABLE `invoice_counters` (
	`year` integer PRIMARY KEY NOT NULL,
	`last_number` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_number` text NOT NULL,
	`order_key` text,
	`source_sale_ids_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`issue_date` text NOT NULL,
	`customer_name` text NOT NULL,
	`customer_email` text,
	`customer_address` text,
	`channel` text NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`items_json` text NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`shipping_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`business_snapshot_json` text DEFAULT '{}' NOT NULL,
	`note` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invoices_number` ON `invoices` (`invoice_number`);
--> statement-breakpoint
CREATE INDEX `idx_invoices_issue_date` ON `invoices` (`issue_date`);
--> statement-breakpoint
CREATE INDEX `idx_invoices_order_key` ON `invoices` (`order_key`);
