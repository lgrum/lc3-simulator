-- Better Auth is back on its Drizzle adapter, which stores dates as
-- milliseconds; 0001 had converted them to ISO 8601 text for Better Auth's
-- own D1 support, which cost more CPU on the Worker. This converts them
-- back. As in 0001, values are updated in place instead of rebuilding the
-- tables: on D1 dropping `user` cascades to sessions, accounts and modules.
UPDATE `user` SET `created_at` = CAST(ROUND((julianday(`created_at`) - 2440587.5) * 86400000) AS INTEGER) WHERE typeof(`created_at`) = 'text';--> statement-breakpoint
UPDATE `user` SET `updated_at` = CAST(ROUND((julianday(`updated_at`) - 2440587.5) * 86400000) AS INTEGER) WHERE typeof(`updated_at`) = 'text';--> statement-breakpoint
UPDATE `user` SET `ban_expires` = CAST(ROUND((julianday(`ban_expires`) - 2440587.5) * 86400000) AS INTEGER) WHERE typeof(`ban_expires`) = 'text';--> statement-breakpoint
UPDATE `session` SET `expires_at` = CAST(ROUND((julianday(`expires_at`) - 2440587.5) * 86400000) AS INTEGER) WHERE typeof(`expires_at`) = 'text';--> statement-breakpoint
UPDATE `session` SET `created_at` = CAST(ROUND((julianday(`created_at`) - 2440587.5) * 86400000) AS INTEGER) WHERE typeof(`created_at`) = 'text';--> statement-breakpoint
UPDATE `session` SET `updated_at` = CAST(ROUND((julianday(`updated_at`) - 2440587.5) * 86400000) AS INTEGER) WHERE typeof(`updated_at`) = 'text';--> statement-breakpoint
UPDATE `account` SET `access_token_expires_at` = CAST(ROUND((julianday(`access_token_expires_at`) - 2440587.5) * 86400000) AS INTEGER) WHERE typeof(`access_token_expires_at`) = 'text';--> statement-breakpoint
UPDATE `account` SET `refresh_token_expires_at` = CAST(ROUND((julianday(`refresh_token_expires_at`) - 2440587.5) * 86400000) AS INTEGER) WHERE typeof(`refresh_token_expires_at`) = 'text';--> statement-breakpoint
UPDATE `account` SET `created_at` = CAST(ROUND((julianday(`created_at`) - 2440587.5) * 86400000) AS INTEGER) WHERE typeof(`created_at`) = 'text';--> statement-breakpoint
UPDATE `account` SET `updated_at` = CAST(ROUND((julianday(`updated_at`) - 2440587.5) * 86400000) AS INTEGER) WHERE typeof(`updated_at`) = 'text';--> statement-breakpoint
UPDATE `verification` SET `expires_at` = CAST(ROUND((julianday(`expires_at`) - 2440587.5) * 86400000) AS INTEGER) WHERE typeof(`expires_at`) = 'text';--> statement-breakpoint
UPDATE `verification` SET `created_at` = CAST(ROUND((julianday(`created_at`) - 2440587.5) * 86400000) AS INTEGER) WHERE typeof(`created_at`) = 'text';--> statement-breakpoint
UPDATE `verification` SET `updated_at` = CAST(ROUND((julianday(`updated_at`) - 2440587.5) * 86400000) AS INTEGER) WHERE typeof(`updated_at`) = 'text';
