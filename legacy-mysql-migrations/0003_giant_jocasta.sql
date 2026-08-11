CREATE TABLE `access_activation_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`serverId` int NOT NULL,
	`codeHash` varchar(128) NOT NULL,
	`purpose` enum('ACTIVATION','PIN_RESET') NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`issuedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `access_activation_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `access_activation_code_idx` UNIQUE(`codeHash`)
);
--> statement-breakpoint
ALTER TABLE `access_activation_codes` ADD CONSTRAINT `access_activation_server_fk` FOREIGN KEY (`serverId`) REFERENCES `altar_servers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `access_activation_server_idx` ON `access_activation_codes` (`serverId`);--> statement-breakpoint
CREATE INDEX `access_activation_parish_idx` ON `access_activation_codes` (`parishId`);