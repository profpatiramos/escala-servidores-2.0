CREATE TYPE "public"."access_code_purpose" AS ENUM('ACTIVATION', 'PIN_RESET');--> statement-breakpoint
CREATE TYPE "public"."achievement_criteria_kind_enum" AS ENUM('FIRST_PARTICIPATION', 'PARTICIPATION_COUNT', 'CONSECUTIVE_CONFIRMATIONS', 'VOLUNTEER_COUNT', 'FORMATION_COUNT', 'MANUAL_ONLY');--> statement-breakpoint
CREATE TYPE "public"."achievement_source_enum" AS ENUM('AUTOMATIC', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."actor_type_enum" AS ENUM('USER', 'SERVER');--> statement-breakpoint
CREATE TYPE "public"."ai_priority_mode_enum" AS ENUM('BALANCED', 'PREFERENCES', 'AVAILABILITY', 'FAMILY_NEEDS');--> statement-breakpoint
CREATE TYPE "public"."ai_run_statu_enum" AS ENUM('RUNNING', 'COMPLETED', 'FAILED', 'INFEASIBLE');--> statement-breakpoint
CREATE TYPE "public"."all_role_enum" AS ENUM('SUPER_ADMIN', 'PARISH_ADMIN', 'COORDINATOR', 'PRIEST', 'RESPONSIBLE', 'SERVER');--> statement-breakpoint
CREATE TYPE "public"."assignment_source_enum" AS ENUM('MANUAL', 'AI_PROPOSED', 'AI_ADJUSTED');--> statement-breakpoint
CREATE TYPE "public"."assignment_statu_enum" AS ENUM('PENDING', 'CONFIRMED', 'DECLINED', 'REPLACED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."attendance_statu_enum" AS ENUM('PRESENT', 'COMMUNICATED_ABSENCE', 'JUSTIFIED_ABSENCE', 'UNJUSTIFIED_ABSENCE', 'PENDING_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."availability_scope_enum" AS ENUM('SERVER', 'FAMILY');--> statement-breakpoint
CREATE TYPE "public"."availability_type_enum" AS ENUM('AVAILABLE', 'PREFERRED', 'UNAVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."celebration_statu_enum" AS ENUM('SCHEDULED', 'CANCELLED', 'DONE');--> statement-breakpoint
CREATE TYPE "public"."celebration_type_enum" AS ENUM('SUNDAY_MASS', 'WEEKDAY_MASS', 'SOLEMNITY', 'PROCESSION', 'WEDDING', 'FUNERAL', 'ADORATION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."confirmation_statu_enum" AS ENUM('CONFIRMED', 'DECLINED');--> statement-breakpoint
CREATE TYPE "public"."conflict_severity_enum" AS ENUM('WARNING', 'BLOCKING');--> statement-breakpoint
CREATE TYPE "public"."conflict_statu_enum" AS ENUM('OPEN', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."day_period_enum" AS ENUM('MORNING', 'AFTERNOON', 'EVENING');--> statement-breakpoint
CREATE TYPE "public"."delivery_channel" AS ENUM('EMAIL', 'SELF_SERVICE');--> statement-breakpoint
CREATE TYPE "public"."event_statu_enum" AS ENUM('DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."event_type_enum" AS ENUM('VOLUNTEERING', 'FELLOWSHIP', 'RETREAT_FORMATION', 'MEETING', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."exception_type_enum" AS ENUM('UNAVAILABLE', 'EXCEPTIONALLY_AVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."family_link_statu_enum" AS ENUM('ACTIVE', 'ENDED');--> statement-breakpoint
CREATE TYPE "public"."formation_statu_enum" AS ENUM('IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."generic_statu_enum" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."interest_statu_enum" AS ENUM('INTERESTED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."mass_type" AS ENUM('domingo', 'sabado', 'semana', 'especial');--> statement-breakpoint
CREATE TYPE "public"."membership_statu_enum" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."notification_statu_enum" AS ENUM('PENDING', 'SENT', 'READ', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."notification_type_enum" AS ENUM('SCHEDULE_PUBLISHED', 'SCHEDULE_CHANGED', 'CONFIRMATION_PENDING', 'SUBSTITUTION_REQUESTED', 'SUBSTITUTION_RESOLVED', 'EVENT_PUBLISHED', 'SHIFT_ASSIGNED', 'ACCESS_ACTIVATED', 'PIN_RESET', 'ACHIEVEMENT_GRANTED');--> statement-breakpoint
CREATE TYPE "public"."parish_role_enum" AS ENUM('PARISH_ADMIN', 'COORDINATOR', 'PRIEST', 'RESPONSIBLE');--> statement-breakpoint
CREATE TYPE "public"."parish_statu_enum" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."participation_response_enum" AS ENUM('INTERESTED', 'REGISTERED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'NO_SHOW');--> statement-breakpoint
CREATE TYPE "public"."point_event_type_enum" AS ENUM('PARTICIPATION_DONE', 'EARLY_CONFIRMATION', 'SUBSTITUTION_ACCEPTED', 'EARLY_UNAVAILABILITY_NOTICE', 'EVENT_PARTICIPATION', 'VOLUNTEER_SHIFT_DONE', 'FORMATION_COMPLETED', 'JUSTIFIED_ABSENCE', 'UNJUSTIFIED_ABSENCE', 'MANUAL_ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."qualification_statu_enum" AS ENUM('NOT_QUALIFIED', 'IN_TRAINING', 'QUALIFIED');--> statement-breakpoint
CREATE TYPE "public"."relationship_type_enum" AS ENUM('MOTHER', 'FATHER', 'GUARDIAN', 'GRANDPARENT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."schedule_source_enum" AS ENUM('MANUAL', 'AI');--> statement-breakpoint
CREATE TYPE "public"."schedule_statu_enum" AS ENUM('DRAFT', 'PROPOSED', 'UNDER_REVIEW', 'PUBLISHED', 'CANCELLED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."server_access_statu_enum" AS ENUM('NOT_CREATED', 'PENDING_ACTIVATION', 'ACTIVE', 'BLOCKED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."server_statu_enum" AS ENUM('ACTIVE', 'IN_FORMATION', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."shift_assignment_statu_enum" AS ENUM('ASSIGNED', 'CONFIRMED', 'DECLINED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."substitution_statu_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_statu_enum" AS ENUM('ACTIVE', 'INACTIVE', 'BLOCKED');--> statement-breakpoint
CREATE TABLE "access_activation_codes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "access_activation_codes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"serverId" integer NOT NULL,
	"codeHash" varchar(128) NOT NULL,
	"purpose" "access_code_purpose" NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"usedAt" timestamp,
	"issuedByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "achievements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"name" varchar(140) NOT NULL,
	"description" text,
	"criteriaKind" "achievement_criteria_kind_enum" DEFAULT 'MANUAL_ONLY' NOT NULL,
	"threshold" integer DEFAULT 1 NOT NULL,
	"status" "generic_statu_enum" DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_proposal_conflicts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_proposal_conflicts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"runId" integer NOT NULL,
	"celebrationId" integer,
	"parishRoleId" integer,
	"severity" "conflict_severity_enum" DEFAULT 'WARNING' NOT NULL,
	"code" varchar(60),
	"message" text NOT NULL,
	"suggestion" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_schedule_proposals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_schedule_proposals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"runId" integer NOT NULL,
	"celebrationId" integer NOT NULL,
	"parishRoleId" integer NOT NULL,
	"serverId" integer,
	"slotIndex" integer DEFAULT 0 NOT NULL,
	"justification" text,
	"confidence" integer,
	"isUnfilled" boolean DEFAULT false NOT NULL,
	"conflictReason" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_schedule_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_schedule_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"requestedByUserId" integer NOT NULL,
	"periodStart" date NOT NULL,
	"periodEnd" date NOT NULL,
	"status" "ai_run_statu_enum" DEFAULT 'RUNNING' NOT NULL,
	"priorityMode" "ai_priority_mode_enum" DEFAULT 'BALANCED' NOT NULL,
	"modelIdentifier" varchar(120),
	"engineVersion" varchar(40),
	"inputSnapshot" json,
	"constraints" json,
	"metrics" json,
	"summary" text,
	"errorMessage" text,
	"appliedAt" timestamp,
	"appliedByUserId" integer,
	"discardedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "altar_servers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "altar_servers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"name" varchar(180) NOT NULL,
	"birthDate" date NOT NULL,
	"heightCm" integer,
	"fatherName" varchar(180),
	"motherName" varchar(180),
	"status" "server_statu_enum" DEFAULT 'IN_FORMATION' NOT NULL,
	"notes" text,
	"joinedAt" date,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attendance_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"assignmentId" integer NOT NULL,
	"status" "attendance_statu_enum" DEFAULT 'PENDING_REVIEW' NOT NULL,
	"justification" text,
	"registeredByUserId" integer,
	"registeredAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer,
	"actorUserId" integer,
	"actorServerId" integer,
	"actorRole" "all_role_enum",
	"actorLabel" varchar(180),
	"action" varchar(80) NOT NULL,
	"entityType" varchar(60),
	"entityId" integer,
	"metadata" json,
	"result" varchar(20) DEFAULT 'SUCCESS' NOT NULL,
	"ip" varchar(64),
	"userAgent" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availabilities" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "availabilities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"serverId" integer NOT NULL,
	"scope" "availability_scope_enum" DEFAULT 'SERVER' NOT NULL,
	"weekday" integer NOT NULL,
	"startTime" time NOT NULL,
	"endTime" time NOT NULL,
	"availabilityType" "availability_type_enum" DEFAULT 'AVAILABLE' NOT NULL,
	"effectiveFrom" date,
	"effectiveUntil" date,
	"notes" text,
	"status" "generic_statu_enum" DEFAULT 'ACTIVE' NOT NULL,
	"createdByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_exceptions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "availability_exceptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"serverId" integer NOT NULL,
	"scope" "availability_scope_enum" DEFAULT 'SERVER' NOT NULL,
	"date" date NOT NULL,
	"startTime" time,
	"endTime" time,
	"exceptionType" "exception_type_enum" DEFAULT 'UNAVAILABLE' NOT NULL,
	"reason" text,
	"createdByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "celebration_role_needs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "celebration_role_needs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"celebrationId" integer NOT NULL,
	"parishRoleId" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"requirements" text,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "celebrations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "celebrations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"title" varchar(180) NOT NULL,
	"celebrationType" "celebration_type_enum" DEFAULT 'SUNDAY_MASS' NOT NULL,
	"date" date NOT NULL,
	"startTime" time NOT NULL,
	"endTime" time NOT NULL,
	"location" varchar(180),
	"notes" text,
	"status" "celebration_statu_enum" DEFAULT 'SCHEDULED' NOT NULL,
	"createdByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "confirmation_conflicts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "confirmation_conflicts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"assignmentId" integer NOT NULL,
	"status" "conflict_statu_enum" DEFAULT 'OPEN' NOT NULL,
	"detail" text,
	"resolution" text,
	"resolvedByUserId" integer,
	"resolvedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "confirmations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "confirmations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"assignmentId" integer NOT NULL,
	"respondedByUserId" integer,
	"respondedByServerId" integer,
	"actorRole" "all_role_enum" NOT NULL,
	"status" "confirmation_statu_enum" NOT NULL,
	"reason" text,
	"respondedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_participations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "event_participations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"eventId" integer NOT NULL,
	"serverId" integer,
	"responsibleId" integer,
	"response" "participation_response_enum" DEFAULT 'REGISTERED' NOT NULL,
	"companionsCount" integer DEFAULT 0 NOT NULL,
	"note" text,
	"respondedByUserId" integer,
	"respondedByServerId" integer,
	"respondedAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_shift_assignments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "event_shift_assignments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"eventId" integer NOT NULL,
	"eventShiftId" integer NOT NULL,
	"serverId" integer,
	"responsibleId" integer,
	"source" "schedule_source_enum" DEFAULT 'MANUAL' NOT NULL,
	"status" "shift_assignment_statu_enum" DEFAULT 'ASSIGNED' NOT NULL,
	"approvedByUserId" integer,
	"assignedAt" timestamp DEFAULT now() NOT NULL,
	"confirmedAt" timestamp,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_shifts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "event_shifts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"eventId" integer NOT NULL,
	"eventTaskId" integer NOT NULL,
	"date" date NOT NULL,
	"startTime" time NOT NULL,
	"endTime" time NOT NULL,
	"slots" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"status" "generic_statu_enum" DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_tasks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "event_tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"eventId" integer NOT NULL,
	"name" varchar(180) NOT NULL,
	"description" text,
	"requirements" text,
	"status" "generic_statu_enum" DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"name" varchar(180) NOT NULL,
	"description" text,
	"eventType" "event_type_enum" DEFAULT 'FELLOWSHIP' NOT NULL,
	"startAt" timestamp NOT NULL,
	"endAt" timestamp,
	"location" varchar(180),
	"organizerNote" text,
	"registrationOpensAt" timestamp,
	"registrationClosesAt" timestamp,
	"participantLimit" integer,
	"allowCompanions" boolean DEFAULT false NOT NULL,
	"maxCompanions" integer DEFAULT 0 NOT NULL,
	"hasVolunteering" boolean DEFAULT false NOT NULL,
	"status" "event_statu_enum" DEFAULT 'DRAFT' NOT NULL,
	"createdByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_links" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "family_links_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"responsibleId" integer NOT NULL,
	"serverId" integer NOT NULL,
	"relationshipType" "relationship_type_enum" DEFAULT 'GUARDIAN' NOT NULL,
	"isPrimary" boolean DEFAULT true NOT NULL,
	"status" "family_link_statu_enum" DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"createdByUserId" integer,
	"endedAt" timestamp,
	"endedByUserId" integer
);
--> statement-breakpoint
CREATE TABLE "formations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "formations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"serverId" integer NOT NULL,
	"name" varchar(180) NOT NULL,
	"description" text,
	"parishRoleId" integer,
	"status" "formation_statu_enum" DEFAULT 'IN_PROGRESS' NOT NULL,
	"startedAt" date,
	"completedAt" date,
	"registeredByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gamification_settings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "gamification_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"penaltiesEnabled" boolean DEFAULT false NOT NULL,
	"rankingEnabled" boolean DEFAULT false NOT NULL,
	"minorsRankingEnabled" boolean DEFAULT false NOT NULL,
	"historyEnabled" boolean DEFAULT true NOT NULL,
	"earlyConfirmationHours" integer DEFAULT 48 NOT NULL,
	"updatedByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"userId" integer,
	"serverId" integer,
	"type" "notification_type_enum" NOT NULL,
	"title" varchar(180) NOT NULL,
	"body" text,
	"status" "notification_statu_enum" DEFAULT 'PENDING' NOT NULL,
	"referenceType" varchar(60),
	"referenceId" integer,
	"actionPath" varchar(200),
	"sentAt" timestamp,
	"readAt" timestamp,
	"failureReason" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parish_members" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "parish_members_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"userId" integer NOT NULL,
	"role" "parish_role_enum" NOT NULL,
	"status" "membership_statu_enum" DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parish_roles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "parish_roles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"minAge" integer,
	"requiresQualification" boolean DEFAULT true NOT NULL,
	"displayOrder" integer DEFAULT 0 NOT NULL,
	"status" "generic_statu_enum" DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parishes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "parishes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(180) NOT NULL,
	"legalName" varchar(220),
	"slug" varchar(80) NOT NULL,
	"city" varchar(120),
	"state" varchar(60),
	"address" text,
	"phone" varchar(32),
	"email" varchar(320),
	"timezone" varchar(64) DEFAULT 'America/Sao_Paulo' NOT NULL,
	"status" "parish_statu_enum" DEFAULT 'ACTIVE' NOT NULL,
	"settings" json,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "password_reset_tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"tokenHash" varchar(128) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"usedAt" timestamp,
	"deliveryChannel" "delivery_channel" DEFAULT 'SELF_SERVICE' NOT NULL,
	"deliveredAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "point_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"eventType" "point_event_type_enum" NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"description" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point_transactions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "point_transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"serverId" integer NOT NULL,
	"eventType" "point_event_type_enum" NOT NULL,
	"pointsDelta" integer NOT NULL,
	"referenceType" varchar(60) NOT NULL,
	"referenceId" integer,
	"idempotencyKey" varchar(180) NOT NULL,
	"reason" text,
	"createdByUserId" integer,
	"isReversal" boolean DEFAULT false NOT NULL,
	"reversesTransactionId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "responsibles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "responsibles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"userId" integer,
	"name" varchar(180) NOT NULL,
	"phone" varchar(32),
	"email" varchar(320),
	"notes" text,
	"status" "generic_statu_enum" DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_assignments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "schedule_assignments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"scheduleId" integer NOT NULL,
	"celebrationId" integer NOT NULL,
	"serverId" integer NOT NULL,
	"parishRoleId" integer NOT NULL,
	"status" "assignment_statu_enum" DEFAULT 'PENDING' NOT NULL,
	"assignmentSource" "assignment_source_enum" DEFAULT 'MANUAL' NOT NULL,
	"replacedByAssignmentId" integer,
	"replacesAssignmentId" integer,
	"notes" text,
	"assignedByUserId" integer,
	"assignedAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_preferences" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "schedule_preferences_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"serverId" integer NOT NULL,
	"weekday" integer,
	"period" "day_period_enum",
	"parishRoleId" integer,
	"priority" integer DEFAULT 1 NOT NULL,
	"status" "generic_statu_enum" DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "schedules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"celebrationId" integer NOT NULL,
	"periodStart" date,
	"periodEnd" date,
	"status" "schedule_statu_enum" DEFAULT 'DRAFT' NOT NULL,
	"source" "schedule_source_enum" DEFAULT 'MANUAL' NOT NULL,
	"aiRunId" integer,
	"generatedByUserId" integer,
	"approvedByUserId" integer,
	"approvedAt" timestamp,
	"publishedAt" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_access" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "server_access_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"serverId" integer NOT NULL,
	"accessId" varchar(32) NOT NULL,
	"pinHash" varchar(255),
	"status" "server_access_statu_enum" DEFAULT 'PENDING_ACTIVATION' NOT NULL,
	"failedAttempts" integer DEFAULT 0 NOT NULL,
	"lockedUntil" timestamp,
	"pinResetRequested" boolean DEFAULT false NOT NULL,
	"activatedAt" timestamp,
	"activatedByUserId" integer,
	"lastLoginAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_achievements" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "server_achievements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"serverId" integer NOT NULL,
	"achievementId" integer NOT NULL,
	"source" "achievement_source_enum" DEFAULT 'AUTOMATIC' NOT NULL,
	"reason" text,
	"grantedByUserId" integer,
	"grantedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_roles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "server_roles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"serverId" integer NOT NULL,
	"parishRoleId" integer NOT NULL,
	"qualificationStatus" "qualification_statu_enum" DEFAULT 'IN_TRAINING' NOT NULL,
	"qualifiedAt" date,
	"validUntil" date,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"actorType" "actor_type_enum" NOT NULL,
	"userId" integer,
	"serverId" integer,
	"tokenHash" varchar(128) NOT NULL,
	"parishId" integer,
	"activeRole" "all_role_enum" NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"revokedAt" timestamp,
	"ip" varchar(64),
	"userAgent" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "substitution_requests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "substitution_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"assignmentId" integer NOT NULL,
	"requestedByUserId" integer,
	"requestedByServerId" integer,
	"reason" text,
	"status" "substitution_statu_enum" DEFAULT 'PENDING' NOT NULL,
	"replacementServerId" integer,
	"reviewedByUserId" integer,
	"reviewNotes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"resolvedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"openId" varchar(64),
	"name" text,
	"email" varchar(320),
	"passwordHash" varchar(255),
	"phone" varchar(32),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"isPlatformAdmin" boolean DEFAULT false NOT NULL,
	"status" "user_statu_enum" DEFAULT 'ACTIVE' NOT NULL,
	"failedLoginAttempts" integer DEFAULT 0 NOT NULL,
	"lockedUntil" timestamp,
	"mustChangePassword" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "vacations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "vacations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"serverId" integer NOT NULL,
	"startDate" date NOT NULL,
	"endDate" date NOT NULL,
	"reason" text,
	"createdByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "volunteer_interests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "volunteer_interests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parishId" integer NOT NULL,
	"eventId" integer NOT NULL,
	"eventShiftId" integer,
	"eventTaskId" integer,
	"serverId" integer,
	"responsibleId" integer,
	"availabilityNote" text,
	"status" "interest_statu_enum" DEFAULT 'INTERESTED' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_activation_codes" ADD CONSTRAINT "access_activation_server_fk" FOREIGN KEY ("serverId") REFERENCES "public"."altar_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_parish_fk" FOREIGN KEY ("parishId") REFERENCES "public"."parishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_proposal_conflicts" ADD CONSTRAINT "ai_proposal_conflicts_run_fk" FOREIGN KEY ("runId") REFERENCES "public"."ai_schedule_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_schedule_proposals" ADD CONSTRAINT "ai_schedule_proposals_run_fk" FOREIGN KEY ("runId") REFERENCES "public"."ai_schedule_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_schedule_runs" ADD CONSTRAINT "ai_schedule_runs_parish_fk" FOREIGN KEY ("parishId") REFERENCES "public"."parishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "altar_servers" ADD CONSTRAINT "altar_servers_parish_fk" FOREIGN KEY ("parishId") REFERENCES "public"."parishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_assignment_fk" FOREIGN KEY ("assignmentId") REFERENCES "public"."schedule_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_server_fk" FOREIGN KEY ("serverId") REFERENCES "public"."altar_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_server_fk" FOREIGN KEY ("serverId") REFERENCES "public"."altar_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "celebration_role_needs" ADD CONSTRAINT "celebration_role_needs_celebration_fk" FOREIGN KEY ("celebrationId") REFERENCES "public"."celebrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "celebration_role_needs" ADD CONSTRAINT "celebration_role_needs_role_fk" FOREIGN KEY ("parishRoleId") REFERENCES "public"."parish_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "celebrations" ADD CONSTRAINT "celebrations_parish_fk" FOREIGN KEY ("parishId") REFERENCES "public"."parishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "confirmation_conflicts" ADD CONSTRAINT "confirmation_conflicts_assignment_fk" FOREIGN KEY ("assignmentId") REFERENCES "public"."schedule_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "confirmations" ADD CONSTRAINT "confirmations_assignment_fk" FOREIGN KEY ("assignmentId") REFERENCES "public"."schedule_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participations" ADD CONSTRAINT "event_participations_event_fk" FOREIGN KEY ("eventId") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_shift_assignments" ADD CONSTRAINT "event_shift_assignments_shift_fk" FOREIGN KEY ("eventShiftId") REFERENCES "public"."event_shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_shifts" ADD CONSTRAINT "event_shifts_task_fk" FOREIGN KEY ("eventTaskId") REFERENCES "public"."event_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_shifts" ADD CONSTRAINT "event_shifts_event_fk" FOREIGN KEY ("eventId") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_tasks" ADD CONSTRAINT "event_tasks_event_fk" FOREIGN KEY ("eventId") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_parish_fk" FOREIGN KEY ("parishId") REFERENCES "public"."parishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_links" ADD CONSTRAINT "family_links_responsible_fk" FOREIGN KEY ("responsibleId") REFERENCES "public"."responsibles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_links" ADD CONSTRAINT "family_links_server_fk" FOREIGN KEY ("serverId") REFERENCES "public"."altar_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formations" ADD CONSTRAINT "formations_server_fk" FOREIGN KEY ("serverId") REFERENCES "public"."altar_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_settings" ADD CONSTRAINT "gamification_settings_parish_fk" FOREIGN KEY ("parishId") REFERENCES "public"."parishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_parish_fk" FOREIGN KEY ("parishId") REFERENCES "public"."parishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parish_members" ADD CONSTRAINT "parish_members_parish_fk" FOREIGN KEY ("parishId") REFERENCES "public"."parishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parish_members" ADD CONSTRAINT "parish_members_user_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parish_roles" ADD CONSTRAINT "parish_roles_parish_fk" FOREIGN KEY ("parishId") REFERENCES "public"."parishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_rules" ADD CONSTRAINT "point_rules_parish_fk" FOREIGN KEY ("parishId") REFERENCES "public"."parishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_server_fk" FOREIGN KEY ("serverId") REFERENCES "public"."altar_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responsibles" ADD CONSTRAINT "responsibles_parish_fk" FOREIGN KEY ("parishId") REFERENCES "public"."parishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_schedule_fk" FOREIGN KEY ("scheduleId") REFERENCES "public"."schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_server_fk" FOREIGN KEY ("serverId") REFERENCES "public"."altar_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_role_fk" FOREIGN KEY ("parishRoleId") REFERENCES "public"."parish_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_preferences" ADD CONSTRAINT "schedule_preferences_server_fk" FOREIGN KEY ("serverId") REFERENCES "public"."altar_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_celebration_fk" FOREIGN KEY ("celebrationId") REFERENCES "public"."celebrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_access" ADD CONSTRAINT "server_access_server_fk" FOREIGN KEY ("serverId") REFERENCES "public"."altar_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_achievements" ADD CONSTRAINT "server_achievements_server_fk" FOREIGN KEY ("serverId") REFERENCES "public"."altar_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_achievements" ADD CONSTRAINT "server_achievements_achievement_fk" FOREIGN KEY ("achievementId") REFERENCES "public"."achievements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_roles" ADD CONSTRAINT "server_roles_server_fk" FOREIGN KEY ("serverId") REFERENCES "public"."altar_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_roles" ADD CONSTRAINT "server_roles_role_fk" FOREIGN KEY ("parishRoleId") REFERENCES "public"."parish_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitution_requests" ADD CONSTRAINT "substitution_requests_assignment_fk" FOREIGN KEY ("assignmentId") REFERENCES "public"."schedule_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacations" ADD CONSTRAINT "vacations_server_fk" FOREIGN KEY ("serverId") REFERENCES "public"."altar_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_interests" ADD CONSTRAINT "volunteer_interests_event_fk" FOREIGN KEY ("eventId") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_activation_code_idx" ON "access_activation_codes" USING btree ("codeHash");--> statement-breakpoint
CREATE INDEX "access_activation_server_idx" ON "access_activation_codes" USING btree ("serverId");--> statement-breakpoint
CREATE INDEX "access_activation_parish_idx" ON "access_activation_codes" USING btree ("parishId");--> statement-breakpoint
CREATE UNIQUE INDEX "achievements_unique_idx" ON "achievements" USING btree ("parishId","name");--> statement-breakpoint
CREATE INDEX "ai_proposal_conflicts_run_idx" ON "ai_proposal_conflicts" USING btree ("runId");--> statement-breakpoint
CREATE INDEX "ai_proposal_conflicts_parish_idx" ON "ai_proposal_conflicts" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "ai_schedule_proposals_parish_idx" ON "ai_schedule_proposals" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "ai_schedule_proposals_run_idx" ON "ai_schedule_proposals" USING btree ("runId");--> statement-breakpoint
CREATE INDEX "ai_schedule_proposals_celebration_idx" ON "ai_schedule_proposals" USING btree ("celebrationId");--> statement-breakpoint
CREATE INDEX "ai_schedule_runs_parish_idx" ON "ai_schedule_runs" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "ai_schedule_runs_status_idx" ON "ai_schedule_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_schedule_runs_period_idx" ON "ai_schedule_runs" USING btree ("periodStart","periodEnd");--> statement-breakpoint
CREATE INDEX "altar_servers_parish_idx" ON "altar_servers" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "altar_servers_status_idx" ON "altar_servers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "altar_servers_name_idx" ON "altar_servers" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_assignment_idx" ON "attendance_records" USING btree ("assignmentId");--> statement-breakpoint
CREATE INDEX "attendance_records_parish_idx" ON "attendance_records" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "attendance_records_status_idx" ON "attendance_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_logs_parish_idx" ON "audit_logs" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actorUserId");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "availabilities_parish_idx" ON "availabilities" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "availabilities_server_idx" ON "availabilities" USING btree ("serverId","scope");--> statement-breakpoint
CREATE INDEX "availabilities_weekday_idx" ON "availabilities" USING btree ("weekday");--> statement-breakpoint
CREATE INDEX "availability_exceptions_parish_idx" ON "availability_exceptions" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "availability_exceptions_server_date_idx" ON "availability_exceptions" USING btree ("serverId","date");--> statement-breakpoint
CREATE UNIQUE INDEX "celebration_role_needs_unique_idx" ON "celebration_role_needs" USING btree ("celebrationId","parishRoleId");--> statement-breakpoint
CREATE INDEX "celebration_role_needs_parish_idx" ON "celebration_role_needs" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "celebrations_parish_date_idx" ON "celebrations" USING btree ("parishId","date");--> statement-breakpoint
CREATE INDEX "celebrations_status_idx" ON "celebrations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "confirmation_conflicts_parish_idx" ON "confirmation_conflicts" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "confirmation_conflicts_assignment_idx" ON "confirmation_conflicts" USING btree ("assignmentId");--> statement-breakpoint
CREATE INDEX "confirmation_conflicts_status_idx" ON "confirmation_conflicts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "confirmations_parish_idx" ON "confirmations" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "confirmations_assignment_idx" ON "confirmations" USING btree ("assignmentId");--> statement-breakpoint
CREATE INDEX "event_participations_parish_idx" ON "event_participations" USING btree ("parishId");--> statement-breakpoint
CREATE UNIQUE INDEX "event_participations_event_server_idx" ON "event_participations" USING btree ("eventId","serverId");--> statement-breakpoint
CREATE INDEX "event_participations_event_idx" ON "event_participations" USING btree ("eventId");--> statement-breakpoint
CREATE UNIQUE INDEX "event_participations_event_responsible_idx" ON "event_participations" USING btree ("eventId","responsibleId");--> statement-breakpoint
CREATE INDEX "event_shift_assignments_parish_idx" ON "event_shift_assignments" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "event_shift_assignments_shift_idx" ON "event_shift_assignments" USING btree ("eventShiftId");--> statement-breakpoint
CREATE INDEX "event_shift_assignments_server_idx" ON "event_shift_assignments" USING btree ("serverId");--> statement-breakpoint
CREATE UNIQUE INDEX "event_shift_assignments_shift_server_idx" ON "event_shift_assignments" USING btree ("eventShiftId","serverId");--> statement-breakpoint
CREATE INDEX "event_shifts_parish_idx" ON "event_shifts" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "event_shifts_task_idx" ON "event_shifts" USING btree ("eventTaskId");--> statement-breakpoint
CREATE INDEX "event_shifts_event_idx" ON "event_shifts" USING btree ("eventId");--> statement-breakpoint
CREATE INDEX "event_tasks_parish_idx" ON "event_tasks" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "event_tasks_event_idx" ON "event_tasks" USING btree ("eventId");--> statement-breakpoint
CREATE INDEX "events_parish_idx" ON "events" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "events_start_idx" ON "events" USING btree ("startAt");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "family_links_parish_idx" ON "family_links" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "family_links_responsible_idx" ON "family_links" USING btree ("responsibleId");--> statement-breakpoint
CREATE INDEX "family_links_server_idx" ON "family_links" USING btree ("serverId");--> statement-breakpoint
CREATE INDEX "family_links_status_idx" ON "family_links" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "family_links_pair_idx" ON "family_links" USING btree ("responsibleId","serverId");--> statement-breakpoint
CREATE INDEX "formations_parish_idx" ON "formations" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "formations_server_idx" ON "formations" USING btree ("serverId");--> statement-breakpoint
CREATE UNIQUE INDEX "gamification_settings_parish_idx" ON "gamification_settings" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "notifications_parish_idx" ON "notifications" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "notifications_server_idx" ON "notifications" USING btree ("serverId");--> statement-breakpoint
CREATE INDEX "notifications_status_idx" ON "notifications" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "parish_members_unique_idx" ON "parish_members" USING btree ("parishId","userId","role");--> statement-breakpoint
CREATE INDEX "parish_members_parish_idx" ON "parish_members" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "parish_members_user_idx" ON "parish_members" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "parish_roles_name_idx" ON "parish_roles" USING btree ("parishId","name");--> statement-breakpoint
CREATE INDEX "parish_roles_parish_idx" ON "parish_roles" USING btree ("parishId");--> statement-breakpoint
CREATE UNIQUE INDEX "parishes_slug_idx" ON "parishes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "parishes_status_idx" ON "parishes" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_token_idx" ON "password_reset_tokens" USING btree ("tokenHash");--> statement-breakpoint
CREATE INDEX "password_reset_user_idx" ON "password_reset_tokens" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "point_rules_unique_idx" ON "point_rules" USING btree ("parishId","eventType");--> statement-breakpoint
CREATE UNIQUE INDEX "point_transactions_idempotency_idx" ON "point_transactions" USING btree ("idempotencyKey");--> statement-breakpoint
CREATE INDEX "point_transactions_parish_idx" ON "point_transactions" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "point_transactions_server_idx" ON "point_transactions" USING btree ("serverId");--> statement-breakpoint
CREATE INDEX "point_transactions_created_idx" ON "point_transactions" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "responsibles_parish_idx" ON "responsibles" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "responsibles_user_idx" ON "responsibles" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "responsibles_status_idx" ON "responsibles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "schedule_assignments_parish_idx" ON "schedule_assignments" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "schedule_assignments_schedule_idx" ON "schedule_assignments" USING btree ("scheduleId");--> statement-breakpoint
CREATE INDEX "schedule_assignments_server_idx" ON "schedule_assignments" USING btree ("serverId");--> statement-breakpoint
CREATE INDEX "schedule_assignments_celebration_idx" ON "schedule_assignments" USING btree ("celebrationId");--> statement-breakpoint
CREATE INDEX "schedule_assignments_status_idx" ON "schedule_assignments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_assignments_unique_idx" ON "schedule_assignments" USING btree ("scheduleId","serverId","parishRoleId","assignedAt");--> statement-breakpoint
CREATE INDEX "schedule_preferences_parish_idx" ON "schedule_preferences" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "schedule_preferences_server_idx" ON "schedule_preferences" USING btree ("serverId");--> statement-breakpoint
CREATE UNIQUE INDEX "schedules_celebration_idx" ON "schedules" USING btree ("celebrationId");--> statement-breakpoint
CREATE INDEX "schedules_parish_idx" ON "schedules" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "schedules_status_idx" ON "schedules" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "server_access_accessid_idx" ON "server_access" USING btree ("accessId");--> statement-breakpoint
CREATE UNIQUE INDEX "server_access_server_idx" ON "server_access" USING btree ("serverId");--> statement-breakpoint
CREATE INDEX "server_access_parish_idx" ON "server_access" USING btree ("parishId");--> statement-breakpoint
CREATE UNIQUE INDEX "server_achievements_unique_idx" ON "server_achievements" USING btree ("serverId","achievementId");--> statement-breakpoint
CREATE INDEX "server_achievements_parish_idx" ON "server_achievements" USING btree ("parishId");--> statement-breakpoint
CREATE UNIQUE INDEX "server_roles_unique_idx" ON "server_roles" USING btree ("serverId","parishRoleId");--> statement-breakpoint
CREATE INDEX "server_roles_parish_idx" ON "server_roles" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "server_roles_role_idx" ON "server_roles" USING btree ("parishRoleId");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_idx" ON "sessions" USING btree ("tokenHash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "sessions_server_idx" ON "sessions" USING btree ("serverId");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "substitution_requests_parish_idx" ON "substitution_requests" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "substitution_requests_assignment_idx" ON "substitution_requests" USING btree ("assignmentId");--> statement-breakpoint
CREATE INDEX "substitution_requests_status_idx" ON "substitution_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vacations_parish_idx" ON "vacations" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "vacations_server_idx" ON "vacations" USING btree ("serverId");--> statement-breakpoint
CREATE INDEX "vacations_range_idx" ON "vacations" USING btree ("startDate","endDate");--> statement-breakpoint
CREATE INDEX "volunteer_interests_parish_idx" ON "volunteer_interests" USING btree ("parishId");--> statement-breakpoint
CREATE INDEX "volunteer_interests_shift_idx" ON "volunteer_interests" USING btree ("eventShiftId");--> statement-breakpoint
CREATE INDEX "volunteer_interests_server_idx" ON "volunteer_interests" USING btree ("serverId");--> statement-breakpoint
CREATE UNIQUE INDEX "volunteer_interests_shift_server_idx" ON "volunteer_interests" USING btree ("eventShiftId","serverId");