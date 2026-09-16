CREATE TABLE IF NOT EXISTS `inventory_sale_filaments` (
  `online_sale_id` text NOT NULL,
  `part_key` text NOT NULL,
  `part_label` text NOT NULL,
  `material_id` text NOT NULL,
  `grams` integer NOT NULL,
  `cost_cents` integer NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`online_sale_id`, `part_key`)
);

CREATE INDEX IF NOT EXISTS `idx_inventory_sale_filaments_sale`
  ON `inventory_sale_filaments` (`online_sale_id`);
