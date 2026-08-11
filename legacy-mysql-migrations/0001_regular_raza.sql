CREATE TABLE `achievements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`name` varchar(140) NOT NULL,
	`description` text,
	`criteriaKind` enum('FIRST_PARTICIPATION','PARTICIPATION_COUNT','CONSECUTIVE_CONFIRMATIONS','VOLUNTEER_COUNT','FORMATION_COUNT','MANUAL_ONLY') NOT NULL DEFAULT 'MANUAL_ONLY',
	`threshold` int NOT NULL DEFAULT 1,
	`status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `achievements_id` PRIMARY KEY(`id`),
	CONSTRAINT `achievements_unique_idx` UNIQUE(`parishId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `ai_proposal_conflicts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`runId` int NOT NULL,
	`celebrationId` int,
	`parishRoleId` int,
	`severity` enum('WARNING','BLOCKING') NOT NULL DEFAULT 'WARNING',
	`code` varchar(60),
	`message` text NOT NULL,
	`suggestion` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_proposal_conflicts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_schedule_proposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`runId` int NOT NULL,
	`celebrationId` int NOT NULL,
	`parishRoleId` int NOT NULL,
	`serverId` int,
	`slotIndex` int NOT NULL DEFAULT 0,
	`justification` text,
	`confidence` int,
	`isUnfilled` boolean NOT NULL DEFAULT false,
	`conflictReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_schedule_proposals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_schedule_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`requestedByUserId` int NOT NULL,
	`periodStart` date NOT NULL,
	`periodEnd` date NOT NULL,
	`status` enum('RUNNING','COMPLETED','FAILED','INFEASIBLE') NOT NULL DEFAULT 'RUNNING',
	`priorityMode` enum('BALANCED','PREFERENCES','AVAILABILITY','FAMILY_NEEDS') NOT NULL DEFAULT 'BALANCED',
	`modelIdentifier` varchar(120),
	`engineVersion` varchar(40),
	`inputSnapshot` json,
	`constraints` json,
	`metrics` json,
	`summary` text,
	`errorMessage` text,
	`appliedAt` timestamp,
	`appliedByUserId` int,
	`discardedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `ai_schedule_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `altar_servers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`birthDate` date NOT NULL,
	`heightCm` int,
	`fatherName` varchar(180),
	`motherName` varchar(180),
	`status` enum('ACTIVE','IN_FORMATION','INACTIVE') NOT NULL DEFAULT 'IN_FORMATION',
	`notes` text,
	`joinedAt` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `altar_servers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attendance_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`assignmentId` int NOT NULL,
	`status` enum('PRESENT','COMMUNICATED_ABSENCE','JUSTIFIED_ABSENCE','UNJUSTIFIED_ABSENCE','PENDING_REVIEW') NOT NULL DEFAULT 'PENDING_REVIEW',
	`justification` text,
	`registeredByUserId` int,
	`registeredAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendance_records_assignment_idx` UNIQUE(`assignmentId`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int,
	`actorUserId` int,
	`actorServerId` int,
	`actorRole` enum('SUPER_ADMIN','PARISH_ADMIN','COORDINATOR','RESPONSIBLE','SERVER'),
	`actorLabel` varchar(180),
	`action` varchar(80) NOT NULL,
	`entityType` varchar(60),
	`entityId` int,
	`metadata` json,
	`result` varchar(20) NOT NULL DEFAULT 'SUCCESS',
	`ip` varchar(64),
	`userAgent` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `availabilities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`serverId` int NOT NULL,
	`scope` enum('SERVER','FAMILY') NOT NULL DEFAULT 'SERVER',
	`weekday` int NOT NULL,
	`startTime` time NOT NULL,
	`endTime` time NOT NULL,
	`availabilityType` enum('AVAILABLE','PREFERRED','UNAVAILABLE') NOT NULL DEFAULT 'AVAILABLE',
	`effectiveFrom` date,
	`effectiveUntil` date,
	`notes` text,
	`status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `availabilities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `availability_exceptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`serverId` int NOT NULL,
	`scope` enum('SERVER','FAMILY') NOT NULL DEFAULT 'SERVER',
	`date` date NOT NULL,
	`startTime` time,
	`endTime` time,
	`exceptionType` enum('UNAVAILABLE','EXCEPTIONALLY_AVAILABLE') NOT NULL DEFAULT 'UNAVAILABLE',
	`reason` text,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `availability_exceptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `celebration_role_needs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`celebrationId` int NOT NULL,
	`parishRoleId` int NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`requirements` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `celebration_role_needs_id` PRIMARY KEY(`id`),
	CONSTRAINT `celebration_role_needs_unique_idx` UNIQUE(`celebrationId`,`parishRoleId`)
);
--> statement-breakpoint
CREATE TABLE `celebrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`celebrationType` enum('SUNDAY_MASS','WEEKDAY_MASS','SOLEMNITY','PROCESSION','WEDDING','FUNERAL','ADORATION','OTHER') NOT NULL DEFAULT 'SUNDAY_MASS',
	`date` date NOT NULL,
	`startTime` time NOT NULL,
	`endTime` time NOT NULL,
	`location` varchar(180),
	`notes` text,
	`status` enum('SCHEDULED','CANCELLED','DONE') NOT NULL DEFAULT 'SCHEDULED',
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `celebrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `confirmation_conflicts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`assignmentId` int NOT NULL,
	`status` enum('OPEN','RESOLVED') NOT NULL DEFAULT 'OPEN',
	`detail` text,
	`resolution` text,
	`resolvedByUserId` int,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `confirmation_conflicts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `confirmations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`assignmentId` int NOT NULL,
	`respondedByUserId` int,
	`respondedByServerId` int,
	`actorRole` enum('SUPER_ADMIN','PARISH_ADMIN','COORDINATOR','RESPONSIBLE','SERVER') NOT NULL,
	`status` enum('CONFIRMED','DECLINED') NOT NULL,
	`reason` text,
	`respondedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `confirmations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `event_participations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`eventId` int NOT NULL,
	`serverId` int,
	`responsibleId` int,
	`response` enum('INTERESTED','REGISTERED','CONFIRMED','DECLINED','CANCELLED','NO_SHOW') NOT NULL DEFAULT 'REGISTERED',
	`companionsCount` int NOT NULL DEFAULT 0,
	`note` text,
	`respondedByUserId` int,
	`respondedByServerId` int,
	`respondedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `event_participations_id` PRIMARY KEY(`id`),
	CONSTRAINT `event_participations_event_server_idx` UNIQUE(`eventId`,`serverId`)
);
--> statement-breakpoint
CREATE TABLE `event_shift_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`eventId` int NOT NULL,
	`eventShiftId` int NOT NULL,
	`serverId` int,
	`responsibleId` int,
	`source` enum('MANUAL','AI') NOT NULL DEFAULT 'MANUAL',
	`status` enum('ASSIGNED','CONFIRMED','DECLINED','CANCELLED') NOT NULL DEFAULT 'ASSIGNED',
	`approvedByUserId` int,
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	`confirmedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `event_shift_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `event_shifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`eventId` int NOT NULL,
	`eventTaskId` int NOT NULL,
	`date` date NOT NULL,
	`startTime` time NOT NULL,
	`endTime` time NOT NULL,
	`slots` int NOT NULL DEFAULT 1,
	`notes` text,
	`status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `event_shifts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `event_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`eventId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`description` text,
	`requirements` text,
	`status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `event_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`description` text,
	`eventType` enum('VOLUNTEERING','FELLOWSHIP','RETREAT_FORMATION','MEETING','OTHER') NOT NULL DEFAULT 'FELLOWSHIP',
	`startAt` timestamp NOT NULL,
	`endAt` timestamp,
	`location` varchar(180),
	`organizerNote` text,
	`registrationOpensAt` timestamp,
	`registrationClosesAt` timestamp,
	`participantLimit` int,
	`allowCompanions` boolean NOT NULL DEFAULT false,
	`maxCompanions` int NOT NULL DEFAULT 0,
	`hasVolunteering` boolean NOT NULL DEFAULT false,
	`status` enum('DRAFT','PUBLISHED','CLOSED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `family_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`responsibleId` int NOT NULL,
	`serverId` int NOT NULL,
	`relationshipType` enum('MOTHER','FATHER','GUARDIAN','GRANDPARENT','OTHER') NOT NULL DEFAULT 'GUARDIAN',
	`isPrimary` boolean NOT NULL DEFAULT true,
	`status` enum('ACTIVE','ENDED') NOT NULL DEFAULT 'ACTIVE',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`createdByUserId` int,
	`endedAt` timestamp,
	`endedByUserId` int,
	CONSTRAINT `family_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `formations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`serverId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`description` text,
	`parishRoleId` int,
	`status` enum('IN_PROGRESS','COMPLETED','CANCELLED') NOT NULL DEFAULT 'IN_PROGRESS',
	`startedAt` date,
	`completedAt` date,
	`registeredByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `formations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gamification_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`penaltiesEnabled` boolean NOT NULL DEFAULT false,
	`rankingEnabled` boolean NOT NULL DEFAULT false,
	`minorsRankingEnabled` boolean NOT NULL DEFAULT false,
	`historyEnabled` boolean NOT NULL DEFAULT true,
	`earlyConfirmationHours` int NOT NULL DEFAULT 48,
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gamification_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `gamification_settings_parish_idx` UNIQUE(`parishId`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`userId` int,
	`serverId` int,
	`type` enum('SCHEDULE_PUBLISHED','SCHEDULE_CHANGED','CONFIRMATION_PENDING','SUBSTITUTION_REQUESTED','SUBSTITUTION_RESOLVED','EVENT_PUBLISHED','SHIFT_ASSIGNED','ACCESS_ACTIVATED','PIN_RESET','ACHIEVEMENT_GRANTED') NOT NULL,
	`title` varchar(180) NOT NULL,
	`body` text,
	`status` enum('PENDING','SENT','READ','FAILED') NOT NULL DEFAULT 'PENDING',
	`referenceType` varchar(60),
	`referenceId` int,
	`actionPath` varchar(200),
	`sentAt` timestamp,
	`readAt` timestamp,
	`failureReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parish_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('PARISH_ADMIN','COORDINATOR','RESPONSIBLE') NOT NULL,
	`status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `parish_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `parish_members_unique_idx` UNIQUE(`parishId`,`userId`,`role`)
);
--> statement-breakpoint
CREATE TABLE `parish_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`minAge` int,
	`requiresQualification` boolean NOT NULL DEFAULT true,
	`displayOrder` int NOT NULL DEFAULT 0,
	`status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `parish_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `parish_roles_name_idx` UNIQUE(`parishId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `parishes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`legalName` varchar(220),
	`slug` varchar(80) NOT NULL,
	`city` varchar(120),
	`state` varchar(60),
	`address` text,
	`phone` varchar(32),
	`email` varchar(320),
	`timezone` varchar(64) NOT NULL DEFAULT 'America/Sao_Paulo',
	`status` enum('ACTIVE','INACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
	`settings` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `parishes_id` PRIMARY KEY(`id`),
	CONSTRAINT `parishes_slug_idx` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `password_reset_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `password_reset_token_idx` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `point_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`eventType` enum('PARTICIPATION_DONE','EARLY_CONFIRMATION','SUBSTITUTION_ACCEPTED','EARLY_UNAVAILABILITY_NOTICE','EVENT_PARTICIPATION','VOLUNTEER_SHIFT_DONE','FORMATION_COMPLETED','JUSTIFIED_ABSENCE','UNJUSTIFIED_ABSENCE','MANUAL_ADJUSTMENT') NOT NULL,
	`points` int NOT NULL DEFAULT 0,
	`enabled` boolean NOT NULL DEFAULT true,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `point_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `point_rules_unique_idx` UNIQUE(`parishId`,`eventType`)
);
--> statement-breakpoint
CREATE TABLE `point_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`serverId` int NOT NULL,
	`eventType` enum('PARTICIPATION_DONE','EARLY_CONFIRMATION','SUBSTITUTION_ACCEPTED','EARLY_UNAVAILABILITY_NOTICE','EVENT_PARTICIPATION','VOLUNTEER_SHIFT_DONE','FORMATION_COMPLETED','JUSTIFIED_ABSENCE','UNJUSTIFIED_ABSENCE','MANUAL_ADJUSTMENT') NOT NULL,
	`pointsDelta` int NOT NULL,
	`referenceType` varchar(60) NOT NULL,
	`referenceId` int,
	`idempotencyKey` varchar(180) NOT NULL,
	`reason` text,
	`createdByUserId` int,
	`isReversal` boolean NOT NULL DEFAULT false,
	`reversesTransactionId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `point_transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `point_transactions_idempotency_idx` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `responsibles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`userId` int,
	`name` varchar(180) NOT NULL,
	`phone` varchar(32),
	`email` varchar(320),
	`notes` text,
	`status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `responsibles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schedule_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`scheduleId` int NOT NULL,
	`celebrationId` int NOT NULL,
	`serverId` int NOT NULL,
	`parishRoleId` int NOT NULL,
	`status` enum('PENDING','CONFIRMED','DECLINED','REPLACED','CANCELLED') NOT NULL DEFAULT 'PENDING',
	`assignmentSource` enum('MANUAL','AI_PROPOSED','AI_ADJUSTED') NOT NULL DEFAULT 'MANUAL',
	`replacedByAssignmentId` int,
	`replacesAssignmentId` int,
	`notes` text,
	`assignedByUserId` int,
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedule_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schedule_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`serverId` int NOT NULL,
	`weekday` int,
	`period` enum('MORNING','AFTERNOON','EVENING'),
	`parishRoleId` int,
	`priority` int NOT NULL DEFAULT 1,
	`status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedule_preferences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`celebrationId` int NOT NULL,
	`periodStart` date,
	`periodEnd` date,
	`status` enum('DRAFT','PROPOSED','UNDER_REVIEW','PUBLISHED','CANCELLED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
	`source` enum('MANUAL','AI') NOT NULL DEFAULT 'MANUAL',
	`aiRunId` int,
	`generatedByUserId` int,
	`approvedByUserId` int,
	`approvedAt` timestamp,
	`publishedAt` timestamp,
	`version` int NOT NULL DEFAULT 1,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `schedules_celebration_idx` UNIQUE(`celebrationId`)
);
--> statement-breakpoint
CREATE TABLE `server_access` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`serverId` int NOT NULL,
	`accessId` varchar(32) NOT NULL,
	`pinHash` varchar(255),
	`status` enum('NOT_CREATED','PENDING_ACTIVATION','ACTIVE','BLOCKED','REVOKED') NOT NULL DEFAULT 'PENDING_ACTIVATION',
	`failedAttempts` int NOT NULL DEFAULT 0,
	`lockedUntil` timestamp,
	`pinResetRequested` boolean NOT NULL DEFAULT false,
	`activatedAt` timestamp,
	`activatedByUserId` int,
	`lastLoginAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `server_access_id` PRIMARY KEY(`id`),
	CONSTRAINT `server_access_accessid_idx` UNIQUE(`accessId`),
	CONSTRAINT `server_access_server_idx` UNIQUE(`serverId`)
);
--> statement-breakpoint
CREATE TABLE `server_achievements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`serverId` int NOT NULL,
	`achievementId` int NOT NULL,
	`source` enum('AUTOMATIC','MANUAL') NOT NULL DEFAULT 'AUTOMATIC',
	`reason` text,
	`grantedByUserId` int,
	`grantedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `server_achievements_id` PRIMARY KEY(`id`),
	CONSTRAINT `server_achievements_unique_idx` UNIQUE(`serverId`,`achievementId`)
);
--> statement-breakpoint
CREATE TABLE `server_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`serverId` int NOT NULL,
	`parishRoleId` int NOT NULL,
	`qualificationStatus` enum('NOT_QUALIFIED','IN_TRAINING','QUALIFIED') NOT NULL DEFAULT 'IN_TRAINING',
	`qualifiedAt` date,
	`validUntil` date,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `server_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `server_roles_unique_idx` UNIQUE(`serverId`,`parishRoleId`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorType` enum('USER','SERVER') NOT NULL,
	`userId` int,
	`serverId` int,
	`tokenHash` varchar(128) NOT NULL,
	`parishId` int,
	`activeRole` enum('SUPER_ADMIN','PARISH_ADMIN','COORDINATOR','RESPONSIBLE','SERVER') NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`revokedAt` timestamp,
	`ip` varchar(64),
	`userAgent` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_token_idx` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `substitution_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`assignmentId` int NOT NULL,
	`requestedByUserId` int,
	`requestedByServerId` int,
	`reason` text,
	`status` enum('PENDING','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
	`replacementServerId` int,
	`reviewedByUserId` int,
	`reviewNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	CONSTRAINT `substitution_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vacations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`serverId` int NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`reason` text,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vacations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `volunteer_interests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parishId` int NOT NULL,
	`eventId` int NOT NULL,
	`eventShiftId` int,
	`eventTaskId` int,
	`serverId` int,
	`responsibleId` int,
	`availabilityNote` text,
	`status` enum('INTERESTED','WITHDRAWN') NOT NULL DEFAULT 'INTERESTED',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `volunteer_interests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `isPlatformAdmin` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `status` enum('ACTIVE','INACTIVE','BLOCKED') DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `failedLoginAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `lockedUntil` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `mustChangePassword` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_idx` UNIQUE(`email`);--> statement-breakpoint
CREATE INDEX `ai_proposal_conflicts_run_idx` ON `ai_proposal_conflicts` (`runId`);--> statement-breakpoint
CREATE INDEX `ai_proposal_conflicts_parish_idx` ON `ai_proposal_conflicts` (`parishId`);--> statement-breakpoint
CREATE INDEX `ai_schedule_proposals_parish_idx` ON `ai_schedule_proposals` (`parishId`);--> statement-breakpoint
CREATE INDEX `ai_schedule_proposals_run_idx` ON `ai_schedule_proposals` (`runId`);--> statement-breakpoint
CREATE INDEX `ai_schedule_proposals_celebration_idx` ON `ai_schedule_proposals` (`celebrationId`);--> statement-breakpoint
CREATE INDEX `ai_schedule_runs_parish_idx` ON `ai_schedule_runs` (`parishId`);--> statement-breakpoint
CREATE INDEX `ai_schedule_runs_status_idx` ON `ai_schedule_runs` (`status`);--> statement-breakpoint
CREATE INDEX `ai_schedule_runs_period_idx` ON `ai_schedule_runs` (`periodStart`,`periodEnd`);--> statement-breakpoint
CREATE INDEX `altar_servers_parish_idx` ON `altar_servers` (`parishId`);--> statement-breakpoint
CREATE INDEX `altar_servers_status_idx` ON `altar_servers` (`status`);--> statement-breakpoint
CREATE INDEX `altar_servers_name_idx` ON `altar_servers` (`name`);--> statement-breakpoint
CREATE INDEX `attendance_records_parish_idx` ON `attendance_records` (`parishId`);--> statement-breakpoint
CREATE INDEX `attendance_records_status_idx` ON `attendance_records` (`status`);--> statement-breakpoint
CREATE INDEX `audit_logs_parish_idx` ON `audit_logs` (`parishId`);--> statement-breakpoint
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actorUserId`);--> statement-breakpoint
CREATE INDEX `audit_logs_action_idx` ON `audit_logs` (`action`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `availabilities_parish_idx` ON `availabilities` (`parishId`);--> statement-breakpoint
CREATE INDEX `availabilities_server_idx` ON `availabilities` (`serverId`,`scope`);--> statement-breakpoint
CREATE INDEX `availabilities_weekday_idx` ON `availabilities` (`weekday`);--> statement-breakpoint
CREATE INDEX `availability_exceptions_parish_idx` ON `availability_exceptions` (`parishId`);--> statement-breakpoint
CREATE INDEX `availability_exceptions_server_date_idx` ON `availability_exceptions` (`serverId`,`date`);--> statement-breakpoint
CREATE INDEX `celebration_role_needs_parish_idx` ON `celebration_role_needs` (`parishId`);--> statement-breakpoint
CREATE INDEX `celebrations_parish_date_idx` ON `celebrations` (`parishId`,`date`);--> statement-breakpoint
CREATE INDEX `celebrations_status_idx` ON `celebrations` (`status`);--> statement-breakpoint
CREATE INDEX `confirmation_conflicts_parish_idx` ON `confirmation_conflicts` (`parishId`);--> statement-breakpoint
CREATE INDEX `confirmation_conflicts_assignment_idx` ON `confirmation_conflicts` (`assignmentId`);--> statement-breakpoint
CREATE INDEX `confirmation_conflicts_status_idx` ON `confirmation_conflicts` (`status`);--> statement-breakpoint
CREATE INDEX `confirmations_parish_idx` ON `confirmations` (`parishId`);--> statement-breakpoint
CREATE INDEX `confirmations_assignment_idx` ON `confirmations` (`assignmentId`);--> statement-breakpoint
CREATE INDEX `event_participations_parish_idx` ON `event_participations` (`parishId`);--> statement-breakpoint
CREATE INDEX `event_participations_event_idx` ON `event_participations` (`eventId`);--> statement-breakpoint
CREATE INDEX `event_shift_assignments_parish_idx` ON `event_shift_assignments` (`parishId`);--> statement-breakpoint
CREATE INDEX `event_shift_assignments_shift_idx` ON `event_shift_assignments` (`eventShiftId`);--> statement-breakpoint
CREATE INDEX `event_shift_assignments_server_idx` ON `event_shift_assignments` (`serverId`);--> statement-breakpoint
CREATE INDEX `event_shifts_parish_idx` ON `event_shifts` (`parishId`);--> statement-breakpoint
CREATE INDEX `event_shifts_task_idx` ON `event_shifts` (`eventTaskId`);--> statement-breakpoint
CREATE INDEX `event_shifts_event_idx` ON `event_shifts` (`eventId`);--> statement-breakpoint
CREATE INDEX `event_tasks_parish_idx` ON `event_tasks` (`parishId`);--> statement-breakpoint
CREATE INDEX `event_tasks_event_idx` ON `event_tasks` (`eventId`);--> statement-breakpoint
CREATE INDEX `events_parish_idx` ON `events` (`parishId`);--> statement-breakpoint
CREATE INDEX `events_start_idx` ON `events` (`startAt`);--> statement-breakpoint
CREATE INDEX `events_status_idx` ON `events` (`status`);--> statement-breakpoint
CREATE INDEX `family_links_parish_idx` ON `family_links` (`parishId`);--> statement-breakpoint
CREATE INDEX `family_links_responsible_idx` ON `family_links` (`responsibleId`);--> statement-breakpoint
CREATE INDEX `family_links_server_idx` ON `family_links` (`serverId`);--> statement-breakpoint
CREATE INDEX `family_links_status_idx` ON `family_links` (`status`);--> statement-breakpoint
CREATE INDEX `formations_parish_idx` ON `formations` (`parishId`);--> statement-breakpoint
CREATE INDEX `formations_server_idx` ON `formations` (`serverId`);--> statement-breakpoint
CREATE INDEX `notifications_parish_idx` ON `notifications` (`parishId`);--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`userId`);--> statement-breakpoint
CREATE INDEX `notifications_server_idx` ON `notifications` (`serverId`);--> statement-breakpoint
CREATE INDEX `notifications_status_idx` ON `notifications` (`status`);--> statement-breakpoint
CREATE INDEX `parish_members_parish_idx` ON `parish_members` (`parishId`);--> statement-breakpoint
CREATE INDEX `parish_members_user_idx` ON `parish_members` (`userId`);--> statement-breakpoint
CREATE INDEX `parish_roles_parish_idx` ON `parish_roles` (`parishId`);--> statement-breakpoint
CREATE INDEX `parishes_status_idx` ON `parishes` (`status`);--> statement-breakpoint
CREATE INDEX `password_reset_user_idx` ON `password_reset_tokens` (`userId`);--> statement-breakpoint
CREATE INDEX `point_transactions_parish_idx` ON `point_transactions` (`parishId`);--> statement-breakpoint
CREATE INDEX `point_transactions_server_idx` ON `point_transactions` (`serverId`);--> statement-breakpoint
CREATE INDEX `point_transactions_created_idx` ON `point_transactions` (`createdAt`);--> statement-breakpoint
CREATE INDEX `responsibles_parish_idx` ON `responsibles` (`parishId`);--> statement-breakpoint
CREATE INDEX `responsibles_user_idx` ON `responsibles` (`userId`);--> statement-breakpoint
CREATE INDEX `responsibles_status_idx` ON `responsibles` (`status`);--> statement-breakpoint
CREATE INDEX `schedule_assignments_parish_idx` ON `schedule_assignments` (`parishId`);--> statement-breakpoint
CREATE INDEX `schedule_assignments_schedule_idx` ON `schedule_assignments` (`scheduleId`);--> statement-breakpoint
CREATE INDEX `schedule_assignments_server_idx` ON `schedule_assignments` (`serverId`);--> statement-breakpoint
CREATE INDEX `schedule_assignments_celebration_idx` ON `schedule_assignments` (`celebrationId`);--> statement-breakpoint
CREATE INDEX `schedule_assignments_status_idx` ON `schedule_assignments` (`status`);--> statement-breakpoint
CREATE INDEX `schedule_preferences_parish_idx` ON `schedule_preferences` (`parishId`);--> statement-breakpoint
CREATE INDEX `schedule_preferences_server_idx` ON `schedule_preferences` (`serverId`);--> statement-breakpoint
CREATE INDEX `schedules_parish_idx` ON `schedules` (`parishId`);--> statement-breakpoint
CREATE INDEX `schedules_status_idx` ON `schedules` (`status`);--> statement-breakpoint
CREATE INDEX `server_access_parish_idx` ON `server_access` (`parishId`);--> statement-breakpoint
CREATE INDEX `server_achievements_parish_idx` ON `server_achievements` (`parishId`);--> statement-breakpoint
CREATE INDEX `server_roles_parish_idx` ON `server_roles` (`parishId`);--> statement-breakpoint
CREATE INDEX `server_roles_role_idx` ON `server_roles` (`parishRoleId`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`userId`);--> statement-breakpoint
CREATE INDEX `sessions_server_idx` ON `sessions` (`serverId`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `substitution_requests_parish_idx` ON `substitution_requests` (`parishId`);--> statement-breakpoint
CREATE INDEX `substitution_requests_assignment_idx` ON `substitution_requests` (`assignmentId`);--> statement-breakpoint
CREATE INDEX `substitution_requests_status_idx` ON `substitution_requests` (`status`);--> statement-breakpoint
CREATE INDEX `vacations_parish_idx` ON `vacations` (`parishId`);--> statement-breakpoint
CREATE INDEX `vacations_server_idx` ON `vacations` (`serverId`);--> statement-breakpoint
CREATE INDEX `vacations_range_idx` ON `vacations` (`startDate`,`endDate`);--> statement-breakpoint
CREATE INDEX `volunteer_interests_parish_idx` ON `volunteer_interests` (`parishId`);--> statement-breakpoint
CREATE INDEX `volunteer_interests_shift_idx` ON `volunteer_interests` (`eventShiftId`);--> statement-breakpoint
CREATE INDEX `volunteer_interests_server_idx` ON `volunteer_interests` (`serverId`);--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);