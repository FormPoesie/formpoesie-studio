CREATE TABLE IF NOT EXISTS `inventory_snapshots` (
	`table_name` text PRIMARY KEY NOT NULL,
	`rows_json` text NOT NULL,
	`updated_at` text NOT NULL
);
