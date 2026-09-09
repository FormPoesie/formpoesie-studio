CREATE TABLE `etsy_workflows` (
  `id` text PRIMARY KEY NOT NULL,
  `inventory_product_id` text NOT NULL,
  `product_snapshot_json` text NOT NULL,
  `current_state` text DEFAULT 'IMAGE_UPLOAD' NOT NULL,
  `status` text DEFAULT 'IN_PROGRESS' NOT NULL,
  `revision` integer DEFAULT 1 NOT NULL,
  `completed_at` text,
  `created_by` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_etsy_workflows_product` ON `etsy_workflows` (`inventory_product_id`,`completed_at`);
--> statement-breakpoint
CREATE TABLE `etsy_workflow_steps` (
  `id` text PRIMARY KEY NOT NULL,
  `workflow_id` text NOT NULL REFERENCES `etsy_workflows`(`id`) ON DELETE cascade,
  `state` text NOT NULL,
  `status` text DEFAULT 'NOT_STARTED' NOT NULL,
  `active_version` integer,
  `result_json` text DEFAULT '{}' NOT NULL,
  `user_edits_json` text DEFAULT '{}' NOT NULL,
  `approved_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_etsy_steps_workflow_state` ON `etsy_workflow_steps` (`workflow_id`,`state`);
--> statement-breakpoint
CREATE TABLE `etsy_workflow_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `workflow_id` text NOT NULL REFERENCES `etsy_workflows`(`id`) ON DELETE cascade,
  `state` text NOT NULL,
  `version` integer NOT NULL,
  `result_json` text NOT NULL,
  `source_revision` integer NOT NULL,
  `approved` integer DEFAULT false NOT NULL,
  `created_by` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_etsy_versions_state_version` ON `etsy_workflow_versions` (`workflow_id`,`state`,`version`);
--> statement-breakpoint
CREATE TABLE `etsy_workflow_images` (
  `id` text PRIMARY KEY NOT NULL,
  `workflow_id` text NOT NULL REFERENCES `etsy_workflows`(`id`) ON DELETE cascade,
  `original_object_key` text NOT NULL,
  `original_filename` text NOT NULL,
  `original_content_type` text NOT NULL,
  `status` text DEFAULT 'UPLOADED' NOT NULL,
  `position` integer NOT NULL,
  `active_version_id` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_etsy_images_workflow_position` ON `etsy_workflow_images` (`workflow_id`,`position`);
--> statement-breakpoint
CREATE TABLE `etsy_workflow_image_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `image_id` text NOT NULL REFERENCES `etsy_workflow_images`(`id`) ON DELETE cascade,
  `version` integer NOT NULL,
  `object_key` text,
  `generation_prompt` text NOT NULL,
  `user_instruction` text,
  `status` text DEFAULT 'GENERATING' NOT NULL,
  `error_code` text,
  `approved` integer DEFAULT false NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_etsy_image_versions` ON `etsy_workflow_image_versions` (`image_id`,`version`);
--> statement-breakpoint
CREATE TABLE `etsy_workflow_variant_prices` (
  `workflow_id` text NOT NULL REFERENCES `etsy_workflows`(`id`) ON DELETE cascade,
  `inventory_variant_id` text NOT NULL,
  `etsy_price_cents` integer,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_etsy_variant_prices` ON `etsy_workflow_variant_prices` (`workflow_id`,`inventory_variant_id`);
--> statement-breakpoint
CREATE TABLE `etsy_workflow_config` (
  `key` text PRIMARY KEY NOT NULL,
  `value_json` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
PRAGMA optimize;
