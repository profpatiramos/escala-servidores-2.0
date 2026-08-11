ALTER TABLE `event_participations` ADD CONSTRAINT `event_participations_event_responsible_idx` UNIQUE(`eventId`,`responsibleId`);--> statement-breakpoint
ALTER TABLE `event_shift_assignments` ADD CONSTRAINT `event_shift_assignments_shift_server_idx` UNIQUE(`eventShiftId`,`serverId`);--> statement-breakpoint
ALTER TABLE `family_links` ADD CONSTRAINT `family_links_pair_idx` UNIQUE(`responsibleId`,`serverId`);--> statement-breakpoint
ALTER TABLE `schedule_assignments` ADD CONSTRAINT `schedule_assignments_unique_idx` UNIQUE(`scheduleId`,`serverId`,`parishRoleId`,`assignedAt`);--> statement-breakpoint
ALTER TABLE `volunteer_interests` ADD CONSTRAINT `volunteer_interests_shift_server_idx` UNIQUE(`eventShiftId`,`serverId`);--> statement-breakpoint
ALTER TABLE `achievements` ADD CONSTRAINT `achievements_parish_fk` FOREIGN KEY (`parishId`) REFERENCES `parishes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_proposal_conflicts` ADD CONSTRAINT `ai_proposal_conflicts_run_fk` FOREIGN KEY (`runId`) REFERENCES `ai_schedule_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_schedule_proposals` ADD CONSTRAINT `ai_schedule_proposals_run_fk` FOREIGN KEY (`runId`) REFERENCES `ai_schedule_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_schedule_runs` ADD CONSTRAINT `ai_schedule_runs_parish_fk` FOREIGN KEY (`parishId`) REFERENCES `parishes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `altar_servers` ADD CONSTRAINT `altar_servers_parish_fk` FOREIGN KEY (`parishId`) REFERENCES `parishes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_assignment_fk` FOREIGN KEY (`assignmentId`) REFERENCES `schedule_assignments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `availabilities` ADD CONSTRAINT `availabilities_server_fk` FOREIGN KEY (`serverId`) REFERENCES `altar_servers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `availability_exceptions` ADD CONSTRAINT `availability_exceptions_server_fk` FOREIGN KEY (`serverId`) REFERENCES `altar_servers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `celebration_role_needs` ADD CONSTRAINT `celebration_role_needs_celebration_fk` FOREIGN KEY (`celebrationId`) REFERENCES `celebrations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `celebration_role_needs` ADD CONSTRAINT `celebration_role_needs_role_fk` FOREIGN KEY (`parishRoleId`) REFERENCES `parish_roles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `celebrations` ADD CONSTRAINT `celebrations_parish_fk` FOREIGN KEY (`parishId`) REFERENCES `parishes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `confirmation_conflicts` ADD CONSTRAINT `confirmation_conflicts_assignment_fk` FOREIGN KEY (`assignmentId`) REFERENCES `schedule_assignments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `confirmations` ADD CONSTRAINT `confirmations_assignment_fk` FOREIGN KEY (`assignmentId`) REFERENCES `schedule_assignments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_participations` ADD CONSTRAINT `event_participations_event_fk` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_shift_assignments` ADD CONSTRAINT `event_shift_assignments_shift_fk` FOREIGN KEY (`eventShiftId`) REFERENCES `event_shifts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_shifts` ADD CONSTRAINT `event_shifts_task_fk` FOREIGN KEY (`eventTaskId`) REFERENCES `event_tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_shifts` ADD CONSTRAINT `event_shifts_event_fk` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_tasks` ADD CONSTRAINT `event_tasks_event_fk` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `events` ADD CONSTRAINT `events_parish_fk` FOREIGN KEY (`parishId`) REFERENCES `parishes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `family_links` ADD CONSTRAINT `family_links_responsible_fk` FOREIGN KEY (`responsibleId`) REFERENCES `responsibles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `family_links` ADD CONSTRAINT `family_links_server_fk` FOREIGN KEY (`serverId`) REFERENCES `altar_servers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `formations` ADD CONSTRAINT `formations_server_fk` FOREIGN KEY (`serverId`) REFERENCES `altar_servers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gamification_settings` ADD CONSTRAINT `gamification_settings_parish_fk` FOREIGN KEY (`parishId`) REFERENCES `parishes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_parish_fk` FOREIGN KEY (`parishId`) REFERENCES `parishes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `parish_members` ADD CONSTRAINT `parish_members_parish_fk` FOREIGN KEY (`parishId`) REFERENCES `parishes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `parish_members` ADD CONSTRAINT `parish_members_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `parish_roles` ADD CONSTRAINT `parish_roles_parish_fk` FOREIGN KEY (`parishId`) REFERENCES `parishes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `point_rules` ADD CONSTRAINT `point_rules_parish_fk` FOREIGN KEY (`parishId`) REFERENCES `parishes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `point_transactions` ADD CONSTRAINT `point_transactions_server_fk` FOREIGN KEY (`serverId`) REFERENCES `altar_servers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `responsibles` ADD CONSTRAINT `responsibles_parish_fk` FOREIGN KEY (`parishId`) REFERENCES `parishes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_assignments` ADD CONSTRAINT `schedule_assignments_schedule_fk` FOREIGN KEY (`scheduleId`) REFERENCES `schedules`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_assignments` ADD CONSTRAINT `schedule_assignments_server_fk` FOREIGN KEY (`serverId`) REFERENCES `altar_servers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_assignments` ADD CONSTRAINT `schedule_assignments_role_fk` FOREIGN KEY (`parishRoleId`) REFERENCES `parish_roles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_preferences` ADD CONSTRAINT `schedule_preferences_server_fk` FOREIGN KEY (`serverId`) REFERENCES `altar_servers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedules` ADD CONSTRAINT `schedules_celebration_fk` FOREIGN KEY (`celebrationId`) REFERENCES `celebrations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `server_access` ADD CONSTRAINT `server_access_server_fk` FOREIGN KEY (`serverId`) REFERENCES `altar_servers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `server_achievements` ADD CONSTRAINT `server_achievements_server_fk` FOREIGN KEY (`serverId`) REFERENCES `altar_servers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `server_achievements` ADD CONSTRAINT `server_achievements_achievement_fk` FOREIGN KEY (`achievementId`) REFERENCES `achievements`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `server_roles` ADD CONSTRAINT `server_roles_server_fk` FOREIGN KEY (`serverId`) REFERENCES `altar_servers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `server_roles` ADD CONSTRAINT `server_roles_role_fk` FOREIGN KEY (`parishRoleId`) REFERENCES `parish_roles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `substitution_requests` ADD CONSTRAINT `substitution_requests_assignment_fk` FOREIGN KEY (`assignmentId`) REFERENCES `schedule_assignments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vacations` ADD CONSTRAINT `vacations_server_fk` FOREIGN KEY (`serverId`) REFERENCES `altar_servers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `volunteer_interests` ADD CONSTRAINT `volunteer_interests_event_fk` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE no action ON UPDATE no action;