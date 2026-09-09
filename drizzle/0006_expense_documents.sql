CREATE TABLE `inventory_expense_metadata` (
	`expense_id` text PRIMARY KEY NOT NULL,
	`category` text,
	`recurrence` text DEFAULT 'none' NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_expense_recurrence` ON `inventory_expense_metadata` (`recurrence`);
--> statement-breakpoint
CREATE TABLE `business_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`relation_type` text NOT NULL,
	`relation_id` text,
	`document_kind` text NOT NULL,
	`title` text,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_business_documents_relation` ON `business_documents` (`relation_type`,`relation_id`);
