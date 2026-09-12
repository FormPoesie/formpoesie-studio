CREATE TABLE `inventory_channel_prices` (
  `entity_kind` text NOT NULL,
  `row_id` text NOT NULL,
  `etsy_price_cents` integer,
  `vinted_price_cents` integer,
  `market_price_cents` integer,
  `updated_by` text,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_inventory_channel_prices_entity_row`
  ON `inventory_channel_prices` (`entity_kind`, `row_id`);
--> statement-breakpoint
PRAGMA optimize;
