CREATE TABLE `account_secrets` (
	`account_id` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`salt` text NOT NULL,
	`iterations` integer DEFAULT 310000 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`detail` text,
	`source_url` text,
	`occurred_at` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activity_events_occurred_at` ON `activity_events` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `monitor_snapshots` (
	`account_id` text PRIMARY KEY NOT NULL,
	`profile_url` text NOT NULL,
	`fingerprint` text NOT NULL,
	`headline` text,
	`checked_at` text NOT NULL,
	`changed_at` text
);
--> statement-breakpoint
CREATE TABLE `news_calendar_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`category` text NOT NULL,
	`organization` text,
	`location` text,
	`event_date` text NOT NULL,
	`published_date` text,
	`captured_at` text,
	`source_name` text,
	`source_url` text,
	`summary` text,
	`whats_new` text,
	`relevance` text,
	`confidence` text,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_news_calendar_event_date` ON `news_calendar_entries` (`event_date`);--> statement-breakpoint
CREATE TABLE `news_calendar_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
