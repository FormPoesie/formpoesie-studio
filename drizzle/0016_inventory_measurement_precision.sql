CREATE TABLE `inventory_measurement_precision` (
  `entity_kind` text NOT NULL,
  `row_id` text NOT NULL,
  `grams` real,
  `waste_grams` real,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`entity_kind`, `row_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_measurement_precision_row`
  ON `inventory_measurement_precision` (`row_id`);
--> statement-breakpoint
PRAGMA optimize;
