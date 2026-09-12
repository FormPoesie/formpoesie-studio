ALTER TABLE `etsy_workflow_images` ADD `reference_kind` text DEFAULT 'PRODUCT' NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_etsy_background_reference` ON `etsy_workflow_images` (`workflow_id`) WHERE `reference_kind` = 'BACKGROUND';
--> statement-breakpoint
CREATE TABLE `etsy_listing_image_slots` (
  `id` text PRIMARY KEY NOT NULL,
  `workflow_id` text NOT NULL REFERENCES `etsy_workflows`(`id`) ON DELETE cascade,
  `position` integer NOT NULL,
  `title` text NOT NULL,
  `perspective` text NOT NULL,
  `instruction` text NOT NULL,
  `image_format` text DEFAULT '4:5' NOT NULL,
  `status` text DEFAULT 'DRAFT' NOT NULL,
  `active_version_id` text,
  `approved_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_etsy_slots_workflow_position` ON `etsy_listing_image_slots` (`workflow_id`,`position`);
--> statement-breakpoint
CREATE TABLE `etsy_listing_image_slot_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `slot_id` text NOT NULL REFERENCES `etsy_listing_image_slots`(`id`) ON DELETE cascade,
  `version` integer NOT NULL,
  `task_prompt` text NOT NULL,
  `object_key` text,
  `content_type` text,
  `status` text DEFAULT 'GENERATED' NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_etsy_slot_versions` ON `etsy_listing_image_slot_versions` (`slot_id`,`version`);
--> statement-breakpoint
PRAGMA optimize;
