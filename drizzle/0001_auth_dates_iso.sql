-- Better Auth now reads and writes its tables through its own D1 support,
-- which stores dates as ISO 8601 text; Drizzle wrote milliseconds. This
-- converts the existing values. drizzle-kit generated a rebuild of each
-- table to change the declared column types, but on D1 dropping `user`
-- cascades to sessions, accounts and modules, so the declared types stay
-- INTEGER: SQLite keeps ISO text in them as text.
UPDATE `user` SET `created_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `created_at` / 1000.0, 'unixepoch') WHERE typeof(`created_at`) = 'integer';--> statement-breakpoint
UPDATE `user` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at` / 1000.0, 'unixepoch') WHERE typeof(`updated_at`) = 'integer';--> statement-breakpoint
UPDATE `user` SET `ban_expires` = strftime('%Y-%m-%dT%H:%M:%fZ', `ban_expires` / 1000.0, 'unixepoch') WHERE typeof(`ban_expires`) = 'integer';--> statement-breakpoint
UPDATE `session` SET `expires_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `expires_at` / 1000.0, 'unixepoch') WHERE typeof(`expires_at`) = 'integer';--> statement-breakpoint
UPDATE `session` SET `created_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `created_at` / 1000.0, 'unixepoch') WHERE typeof(`created_at`) = 'integer';--> statement-breakpoint
UPDATE `session` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at` / 1000.0, 'unixepoch') WHERE typeof(`updated_at`) = 'integer';--> statement-breakpoint
UPDATE `account` SET `access_token_expires_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `access_token_expires_at` / 1000.0, 'unixepoch') WHERE typeof(`access_token_expires_at`) = 'integer';--> statement-breakpoint
UPDATE `account` SET `refresh_token_expires_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `refresh_token_expires_at` / 1000.0, 'unixepoch') WHERE typeof(`refresh_token_expires_at`) = 'integer';--> statement-breakpoint
UPDATE `account` SET `created_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `created_at` / 1000.0, 'unixepoch') WHERE typeof(`created_at`) = 'integer';--> statement-breakpoint
UPDATE `account` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at` / 1000.0, 'unixepoch') WHERE typeof(`updated_at`) = 'integer';--> statement-breakpoint
UPDATE `verification` SET `expires_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `expires_at` / 1000.0, 'unixepoch') WHERE typeof(`expires_at`) = 'integer';--> statement-breakpoint
UPDATE `verification` SET `created_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `created_at` / 1000.0, 'unixepoch') WHERE typeof(`created_at`) = 'integer';--> statement-breakpoint
UPDATE `verification` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at` / 1000.0, 'unixepoch') WHERE typeof(`updated_at`) = 'integer';
