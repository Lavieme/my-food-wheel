CREATE TABLE `fw_events` (
	`id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`type` text NOT NULL,
	`at` integer NOT NULL,
	`extra` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fw_events_time_idx` ON `fw_events` (`at`);--> statement-breakpoint
CREATE TABLE `fw_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fw_limits_expiry_idx` ON `fw_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `fw_presence` (
	`room_code` text NOT NULL,
	`member_id` text NOT NULL,
	`last_seen` integer NOT NULL,
	PRIMARY KEY(`room_code`, `member_id`),
	FOREIGN KEY (`room_code`) REFERENCES `fw_rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `fw_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`revision` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fw_rooms_expiry_idx` ON `fw_rooms` (`expires_at`);