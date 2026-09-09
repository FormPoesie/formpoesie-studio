CREATE TABLE `mind_map_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`color` text DEFAULT '#4a5c58' NOT NULL,
	`position_x` real NOT NULL,
	`position_y` real NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_mind_map_nodes_updated_at` ON `mind_map_nodes` (`updated_at`);
--> statement-breakpoint
CREATE TABLE `mind_map_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`source_node_id` text NOT NULL,
	`target_node_id` text NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_node_id`) REFERENCES `mind_map_nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_node_id`) REFERENCES `mind_map_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_mind_map_edges_nodes` ON `mind_map_edges` (`source_node_id`,`target_node_id`);
--> statement-breakpoint
CREATE INDEX `idx_mind_map_edges_target` ON `mind_map_edges` (`target_node_id`);
--> statement-breakpoint
CREATE TABLE `mind_map_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`body` text NOT NULL,
	`author_id` text,
	`author_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `mind_map_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_mind_map_comments_node` ON `mind_map_comments` (`node_id`,`created_at`);
