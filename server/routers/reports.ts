/**
 * Router de relatórios operacionais e trilha de auditoria.
 *
 * Todos os relatórios são derivados dos registros append-only (confirmações,
 * presenças, transações de pontos). Nada aqui recalcula ou reescreve histórico:
 * relatório que discorda do log de origem é relatório errado.
 */
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";

import {
  altarServers,
  attendanceRecords,
  auditLogs,
  celebrations,
  confirmations,
  parishRoles,
  scheduleAssignments,
  serverRoles,
  substitutionRequests,
} from "../../drizzle/schema";
import { getDbOrThrow } from "../db";
import { recordAudit } from "../services/audit";
import { coordinatorProcedure, requestMeta, router } from "../trpc";

const periodInput = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const reportsRouter = router({
  /** Escalas do período: celebrações, funções e servidores alocados. */
  schedulesByPeriod: coordinatorProcedure.input(periodInput).query(async ({ ctx, input }) => {
    const db = await getDbOrThrow();

    const rows = await db
      .select({
        celebrationId: celebrations.id,
        celebrationTitle: celebrations.title,
        date: celebrations.date,
        startTime: celebrations.startTime,
        celebrationStatus: celebrations.status,
        roleName: parishRoles.name,
        serverId: altarServers.id,
        serverName: altarServers.name,
        assignmentStatus: scheduleAssignments.status,
        attendanceStatus: attendanceRecords.status,
      })
      .from(celebrations)
      .leftJoin(
        scheduleAssignments,
        eq(scheduleAssignments.celebrationId, celebrations.id),
      )
      .leftJoin(parishRoles, eq(parishRoles.id, scheduleAssignments.parishRoleId))
      .leftJoin(altarServers, eq(altarServers.id, scheduleAssignments.serverId))
      .leftJoin(attendanceRecords, eq(attendanceRecords.assignmentId, scheduleAssignments.id))
      .where(
        and(
          eq(celebrations.parishId, ctx.parishId),
          gte(celebrations.date, input.periodStart),
          lte(celebrations.date, input.periodEnd),
        ),
      )
      .orderBy(asc(celebrations.date), asc(celebrations.startTime), asc(parishRoles.name));

    return rows;
  }),

  /**
   * Participação por servidor no período.
   * Conta alocações, presenças e ausências a partir dos registros de presença.
   */
  participation: coordinatorProcedure.input(periodInput).query(async ({ ctx, input }) => {
    const db = await getDbOrThrow();

    const rows = await db
      .select({
        serverId: altarServers.id,
        serverName: altarServers.name,
        serverStatus: altarServers.status,
        assignments: sql<number>`COUNT(${scheduleAssignments.id})`,
        confirmed: sql<number>`SUM(CASE WHEN ${scheduleAssignments.status} = 'CONFIRMED' THEN 1 ELSE 0 END)`,
        declined: sql<number>`SUM(CASE WHEN ${scheduleAssignments.status} = 'DECLINED' THEN 1 ELSE 0 END)`,
        pending: sql<number>`SUM(CASE WHEN ${scheduleAssignments.status} = 'PENDING' THEN 1 ELSE 0 END)`,
        present: sql<number>`SUM(CASE WHEN ${attendanceRecords.status} = 'PRESENT' THEN 1 ELSE 0 END)`,
        absences: sql<number>`SUM(CASE WHEN ${attendanceRecords.status} IN ('JUSTIFIED_ABSENCE','UNJUSTIFIED_ABSENCE','COMMUNICATED_ABSENCE') THEN 1 ELSE 0 END)`,
      })
      .from(altarServers)
      .leftJoin(
        scheduleAssignments,
        eq(scheduleAssignments.serverId, altarServers.id),
      )
      .leftJoin(celebrations, eq(celebrations.id, scheduleAssignments.celebrationId))
      .leftJoin(attendanceRecords, eq(attendanceRecords.assignmentId, scheduleAssignments.id))
      .where(
        and(
          eq(altarServers.parishId, ctx.parishId),
          sql`(${celebrations.date} IS NULL OR (${celebrations.date} >= ${input.periodStart} AND ${celebrations.date} <= ${input.periodEnd}))`,
        ),
      )
      .groupBy(altarServers.id, altarServers.name, altarServers.status)
      .orderBy(desc(sql`COUNT(${scheduleAssignments.id})`), asc(altarServers.name));

    return rows.map(row => ({
      ...row,
      assignments: Number(row.assignments ?? 0),
      confirmed: Number(row.confirmed ?? 0),
      declined: Number(row.declined ?? 0),
      pending: Number(row.pending ?? 0),
      present: Number(row.present ?? 0),
      absences: Number(row.absences ?? 0),
    }));
  }),

  /**
   * Situação das confirmações do período.
   * Mostra quem respondeu, quem não respondeu e quem tem divergência aberta.
   */
  confirmations: coordinatorProcedure.input(periodInput).query(async ({ ctx, input }) => {
    const db = await getDbOrThrow();

    const rows = await db
      .select({
        assignmentId: scheduleAssignments.id,
        celebrationTitle: celebrations.title,
        date: celebrations.date,
        startTime: celebrations.startTime,
        serverName: altarServers.name,
        roleName: parishRoles.name,
        assignmentStatus: scheduleAssignments.status,
        lastResponse: sql<string | null>`MAX(${confirmations.status})`,
        responseCount: sql<number>`COUNT(${confirmations.id})`,
        lastRespondedAt: sql<Date | null>`MAX(${confirmations.respondedAt})`,
      })
      .from(scheduleAssignments)
      .innerJoin(celebrations, eq(celebrations.id, scheduleAssignments.celebrationId))
      .innerJoin(altarServers, eq(altarServers.id, scheduleAssignments.serverId))
      .innerJoin(parishRoles, eq(parishRoles.id, scheduleAssignments.parishRoleId))
      .leftJoin(
        confirmations,
        eq(confirmations.assignmentId, scheduleAssignments.id),
      )
      .where(
        and(
          eq(scheduleAssignments.parishId, ctx.parishId),
          gte(celebrations.date, input.periodStart),
          lte(celebrations.date, input.periodEnd),
        ),
      )
      .groupBy(
        scheduleAssignments.id,
        celebrations.title,
        celebrations.date,
        celebrations.startTime,
        altarServers.name,
        parishRoles.name,
        scheduleAssignments.status,
      )
      .orderBy(asc(celebrations.date), asc(celebrations.startTime));

    return rows.map(row => ({
      ...row,
      responseCount: Number(row.responseCount ?? 0),
      /** Sem resposta é diferente de recusa: é ausência de comunicação. */
      awaitingResponse: Number(row.responseCount ?? 0) === 0,
    }));
  }),

  /** Ausências do período, com justificativa quando registrada. */
  absences: coordinatorProcedure.input(periodInput).query(async ({ ctx, input }) => {
    const db = await getDbOrThrow();

    return db
      .select({
        attendanceId: attendanceRecords.id,
        date: celebrations.date,
        startTime: celebrations.startTime,
        celebrationTitle: celebrations.title,
        serverId: altarServers.id,
        serverName: altarServers.name,
        roleName: parishRoles.name,
        status: attendanceRecords.status,
        justification: attendanceRecords.justification,
        recordedAt: attendanceRecords.registeredAt,
      })
      .from(attendanceRecords)
      .innerJoin(scheduleAssignments, eq(scheduleAssignments.id, attendanceRecords.assignmentId))
      .innerJoin(celebrations, eq(celebrations.id, scheduleAssignments.celebrationId))
      .innerJoin(altarServers, eq(altarServers.id, scheduleAssignments.serverId))
      .innerJoin(parishRoles, eq(parishRoles.id, scheduleAssignments.parishRoleId))
      .where(
        and(
          eq(attendanceRecords.parishId, ctx.parishId),
          inArray(attendanceRecords.status, [
            "JUSTIFIED_ABSENCE",
            "UNJUSTIFIED_ABSENCE",
            "COMMUNICATED_ABSENCE",
          ]),
          gte(celebrations.date, input.periodStart),
          lte(celebrations.date, input.periodEnd),
        ),
      )
      .orderBy(desc(celebrations.date));
  }),

  /** Servidores habilitados por função: base para dimensionar a escala. */
  serversByRole: coordinatorProcedure.query(async ({ ctx }) => {
    const db = await getDbOrThrow();

    const rows = await db
      .select({
        parishRoleId: parishRoles.id,
        roleName: parishRoles.name,
        minAge: parishRoles.minAge,
        qualified: sql<number>`SUM(CASE WHEN ${serverRoles.qualificationStatus} = 'QUALIFIED' THEN 1 ELSE 0 END)`,
        inTraining: sql<number>`SUM(CASE WHEN ${serverRoles.qualificationStatus} = 'IN_TRAINING' THEN 1 ELSE 0 END)`,
      })
      .from(parishRoles)
      .leftJoin(
        serverRoles,
        eq(serverRoles.parishRoleId, parishRoles.id),
      )
      .leftJoin(altarServers, eq(altarServers.id, serverRoles.serverId))
      .where(and(eq(parishRoles.parishId, ctx.parishId), eq(parishRoles.status, "ACTIVE")))
      .groupBy(parishRoles.id, parishRoles.name, parishRoles.minAge)
      .orderBy(asc(parishRoles.name));

    return rows.map(row => ({
      ...row,
      qualified: Number(row.qualified ?? 0),
      inTraining: Number(row.inTraining ?? 0),
    }));
  }),

  /** Substituições do período, com solicitante e desfecho. */
  substitutions: coordinatorProcedure.input(periodInput).query(async ({ ctx, input }) => {
    const db = await getDbOrThrow();

    return db
      .select({
        id: substitutionRequests.id,
        status: substitutionRequests.status,
        reason: substitutionRequests.reason,
        date: celebrations.date,
        celebrationTitle: celebrations.title,
        roleName: parishRoles.name,
        requestedAt: substitutionRequests.createdAt,
        resolvedAt: substitutionRequests.resolvedAt,
      })
      .from(substitutionRequests)
      .innerJoin(
        scheduleAssignments,
        eq(scheduleAssignments.id, substitutionRequests.assignmentId),
      )
      .innerJoin(celebrations, eq(celebrations.id, scheduleAssignments.celebrationId))
      .innerJoin(parishRoles, eq(parishRoles.id, scheduleAssignments.parishRoleId))
      .where(
        and(
          eq(substitutionRequests.parishId, ctx.parishId),
          gte(celebrations.date, input.periodStart),
          lte(celebrations.date, input.periodEnd),
        ),
      )
      .orderBy(desc(substitutionRequests.createdAt));
  }),

  /**
   * Trilha de auditoria da paróquia.
   * Append-only: este router só lê. Não existe endpoint de edição ou exclusão.
   */
  auditTrail: coordinatorProcedure
    .input(
      z.object({
        action: z.string().max(80).optional(),
        entityType: z.string().max(60).optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDbOrThrow();

      const filters = [eq(auditLogs.parishId, ctx.parishId)];
      if (input.action) filters.push(eq(auditLogs.action, input.action));
      if (input.entityType) filters.push(eq(auditLogs.entityType, input.entityType));
      if (input.from) filters.push(gte(auditLogs.createdAt, new Date(`${input.from}T00:00:00`)));
      if (input.to) filters.push(lte(auditLogs.createdAt, new Date(`${input.to}T23:59:59`)));

      return db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          actorLabel: auditLogs.actorLabel,
          actorRole: auditLogs.actorRole,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          metadata: auditLogs.metadata,
          result: auditLogs.result,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .where(and(...filters))
        .orderBy(desc(auditLogs.createdAt))
        .limit(input.limit);
    }),

  /** Registra a exportação de um relatório na trilha de auditoria. */
  registerExport: coordinatorProcedure
    .input(
      z.object({
        reportKey: z.string().max(60),
        periodStart: z.string().optional(),
        periodEnd: z.string().optional(),
        format: z.enum(["CSV", "PDF", "SCREEN"]).default("CSV"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await recordAudit(ctx.actor, {
        action: "REPORT_EXPORTED",
        entityType: "report",
        entityId: null,
        metadata: {
          reportKey: input.reportKey,
          periodStart: input.periodStart ?? null,
          periodEnd: input.periodEnd ?? null,
          format: input.format,
        },
        ...requestMeta(ctx),
      });

      return { success: true } as const;
    }),
});
