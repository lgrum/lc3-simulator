CREATE TABLE `modules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `modules_owner_name_unique` ON `modules` (`owner_user_id`,"name" COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`module_id` integer NOT NULL,
	`number` integer NOT NULL,
	`source` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `versions_module_number_unique` ON `versions` (`module_id`,`number`);