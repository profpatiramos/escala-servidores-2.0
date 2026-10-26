import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  auditLogs,
  attendanceRecords,
  celebrations,
  scheduleAssignments,
  schedules,
  substitutionRequests,
} from "../../drizzle/schema";
import { checkinWindow } from "../../shared/participation";
import { getDbOrThrow } from "../db";
import {
  badRequest,
  coordinatorProcedure,
  notFound,
  parishProcedure,
  router,
  serverProcedure,
} from "../trpc";
import { validateAssignments } from "../services/scheduleValidation";
import { grantPoints } from "../services/gamification";
import { recordAudit } from "../services/audit";

type Activity = {
  assignmentId: number;
  serverId: number;
  serverName: string;
  celebrationId: number;
  celebrationTitle: string;
  celebrationDate: string;
  celebrationStartTime: string;
  roleName: string;
  status: string;
  start: number;
  end: number;
  respondedAt: Date | null;
  early: boolean;
  checkedInAt: Date | null;
  checkinEarly: boolean | null;
  attendanceStatus: string | null;
  timeZone: string;
};
async function activities(
  parishId: number,
  serverId?: number,
  celebrationId?: number
) {
  const db = await getDbOrThrow();
  const result =
    await db.execute(sql`SELECT a.id AS "assignmentId",a."serverId",s.name AS "serverName",e.id AS "celebrationId",e.title AS "celebrationTitle",e.date::text AS "celebrationDate",e."startTime"::text AS "celebrationStartTime",r.name AS "roleName",a.status,
    (extract(epoch FROM ((e.date::date+e."startTime"::time) AT TIME ZONE p.timezone))*1000)::double precision AS start,
    (extract(epoch FROM ((e.date::date+e."endTime"::time) AT TIME ZONE p.timezone))*1000)::double precision AS "end",
    c."respondedAt",COALESCE((c."respondedAt" AT TIME ZONE 'UTC')<=((e.date::date+e."startTime"::time) AT TIME ZONE p.timezone)-make_interval(hours=>COALESCE(g."earlyConfirmationHours",48)),false) AS early,
    ci."createdAt" AS "checkedInAt",(ci.metadata->>'beforeStart')::boolean AS "checkinEarly",ar.status AS "attendanceStatus",p.timezone AS "timeZone"
    FROM schedule_assignments a JOIN altar_servers s ON s.id=a."serverId" JOIN celebrations e ON e.id=a."celebrationId" JOIN schedules sc ON sc.id=a."scheduleId" JOIN parish_roles r ON r.id=a."parishRoleId" JOIN parishes p ON p.id=a."parishId"
    LEFT JOIN gamification_settings g ON g."parishId"=p.id
    LEFT JOIN LATERAL (SELECT "respondedAt" FROM confirmations WHERE "assignmentId"=a.id AND "parishId"=${parishId} ORDER BY "respondedAt" DESC,id DESC LIMIT 1) c ON true
    LEFT JOIN LATERAL (SELECT "createdAt",metadata FROM audit_logs WHERE "parishId"=${parishId} AND "entityType"='server_checkin' AND "entityId"=a.id ORDER BY id LIMIT 1) ci ON true
    LEFT JOIN attendance_records ar ON ar."assignmentId"=a.id AND ar."parishId"=${parishId}
    WHERE a."parishId"=${parishId} AND e."parishId"=${parishId} AND sc."parishId"=${parishId} AND sc.status='PUBLISHED' AND e.status IN ('SCHEDULED','DONE') AND a.status IN ('PENDING','CONFIRMED','DECLINED')
    AND e.date BETWEEN (CURRENT_TIMESTAMP AT TIME ZONE p.timezone)::date-30 AND (CURRENT_TIMESTAMP AT TIME ZONE p.timezone)::date+90
    ${serverId ? sql`AND a."serverId"=${serverId}` : sql``} ${celebrationId ? sql`AND e.id=${celebrationId}` : sql``} ORDER BY e.date,e."startTime",s.name LIMIT 1000`);
  // Raw SQL bypasses Drizzle's timestamp decoder: UTC timestamp columns arrive
  // without an offset. Decode them before serializing to the browser, where a
  // bare timestamp would otherwise be interpreted in the device's local zone.
  const rows = result.rows as unknown as Array<Omit<Activity, "respondedAt" | "checkedInAt"> & {
    respondedAt: Date | string | null;
    checkedInAt: Date | string | null;
  }>;
  const instant = (value: Date | string | null) => {
    if (!value || value instanceof Date) return value ?? null;
    return new Date(/(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value)
      ? value
      : `${value.replace(" ", "T")}Z`);
  };
  return rows.map(row => ({ ...row, respondedAt: instant(row.respondedAt), checkedInAt: instant(row.checkedInAt) }));
}
export const participationRouter = router({
  mine: serverProcedure.query(({ ctx }) =>
    activities(ctx.parishId, ctx.actor.server.id)
  ),
  report: coordinatorProcedure
    .input(z.object({ celebrationId: z.number().int().positive() }))
    .query(({ ctx, input }) =>
      activities(ctx.parishId, undefined, input.celebrationId)
    ),
  checkIn: serverProcedure
    .input(z.object({ assignmentId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();
      const row = (await activities(ctx.parishId, ctx.actor.server.id)).find(
        a => a.assignmentId === input.assignmentId
      );
      if (!row) throw notFound("Alocação");
      if (row.status !== "CONFIRMED")
        throw badRequest("Confirme a participação antes de fazer check-in.");
      const window = checkinWindow(row.start, row.end, Date.now());
      if (!window.allowed)
        throw badRequest(
          "O check-in fica disponível desde duas horas antes do início até o término da celebração."
        );
      await db.transaction(async tx => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${ctx.parishId},${input.assignmentId})`
        );
        const [existing] = await tx
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.parishId, ctx.parishId),
              eq(auditLogs.entityType, "server_checkin"),
              eq(auditLogs.entityId, input.assignmentId)
            )
          )
          .limit(1);
        if (!existing)
          await tx.insert(auditLogs).values({
            parishId: ctx.parishId,
            actorServerId: ctx.actor.server.id,
            actorRole: "SERVER",
            actorLabel: ctx.actor.server.name,
            action: "SERVER_CHECKIN",
            entityType: "server_checkin",
            entityId: input.assignmentId,
            metadata: { beforeStart: window.beforeStart },
            createdAt: new Date(),
          });
      });
      return { success: true };
    }),
  validatePresence: coordinatorProcedure
    .input(z.object({ assignmentId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();
      const result = await db
        .select()
        .from(scheduleAssignments)
        .where(
          and(
            eq(scheduleAssignments.id, input.assignmentId),
            eq(scheduleAssignments.parishId, ctx.parishId)
          )
        )
        .limit(1);
      const a = result[0];
      if (!a) throw notFound("Alocação");
      if (!["PENDING", "CONFIRMED"].includes(a.status))
        throw badRequest("Esta alocação não permite registro de presença.");
      const row = (
        await activities(ctx.parishId, undefined, a.celebrationId)
      ).find(r => r.assignmentId === a.id);
      if (!row || Date.now() < row.start)
        throw badRequest("Valide a presença a partir do início da celebração.");
      await db
        .insert(attendanceRecords)
        .values({
          parishId: ctx.parishId,
          assignmentId: a.id,
          status: "PRESENT",
          registeredByUserId:
            ctx.actor.type === "USER" ? ctx.actor.user.id : null,
        })
        .onConflictDoUpdate({
          target: attendanceRecords.assignmentId,
          set: {
            status: "PRESENT",
            registeredByUserId:
              ctx.actor.type === "USER" ? ctx.actor.user.id : null,
          },
        });
      await recordAudit(ctx.actor, {
        action: "ATTENDANCE_RECORDED",
        entityType: "assignment",
        entityId: a.id,
        metadata: { status: "PRESENT", source: "coordination_validation" },
      });
      const points = await grantPoints({
        parishId: ctx.parishId,
        serverId: a.serverId,
        eventType: "PARTICIPATION_DONE",
        referenceType: "schedule_assignment",
        referenceId: a.id,
      });
      return { success: true, points };
    }),
  board: parishProcedure.query(async ({ ctx }) => {
    const db = await getDbOrThrow();
    const result = await db.execute(
      sql`SELECT x.id,x."replacementServerId",a."serverId" AS "originalServerId",e.title,e.date::text AS date,e."startTime"::text AS time,r.name AS "roleName",(SELECT split_part(name,' ',1) FROM altar_servers WHERE id=x."replacementServerId" AND "parishId"=${ctx.parishId}) AS "candidateName" FROM substitution_requests x JOIN schedule_assignments a ON a.id=x."assignmentId" JOIN celebrations e ON e.id=a."celebrationId" JOIN schedules s ON s.id=a."scheduleId" JOIN parish_roles r ON r.id=a."parishRoleId" JOIN parishes p ON p.id=x."parishId" WHERE x."parishId"=${ctx.parishId} AND a."parishId"=${ctx.parishId} AND e."parishId"=${ctx.parishId} AND x.status='PENDING' AND s.status='PUBLISHED' AND e.status='SCHEDULED' AND ((e.date::date+e."startTime"::time) AT TIME ZONE p.timezone)>CURRENT_TIMESTAMP ORDER BY e.date,e."startTime" LIMIT 200`
    );
    return result.rows as unknown as {
      id: number;
      replacementServerId: number | null;
      originalServerId: number;
      title: string;
      date: string;
      time: string;
      roleName: string;
      candidateName: string | null;
    }[];
  }),
  volunteer: serverProcedure
    .input(z.object({ requestId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();
      await db.transaction(async tx => {
        const [request] = await tx
          .select()
          .from(substitutionRequests)
          .where(
            and(
              eq(substitutionRequests.id, input.requestId),
              eq(substitutionRequests.parishId, ctx.parishId)
            )
          )
          .limit(1)
          .for("update");
        if (!request || request.status !== "PENDING")
          throw badRequest("Esta vaga não está mais disponível.");
        if (request.replacementServerId)
          throw badRequest("Já há um candidato aguardando análise nesta vaga.");
        const [a] = await tx
          .select()
          .from(scheduleAssignments)
          .where(
            and(
              eq(scheduleAssignments.id, request.assignmentId),
              eq(scheduleAssignments.parishId, ctx.parishId)
            )
          )
          .limit(1);
        if (!a || a.serverId === ctx.actor.server.id)
          throw badRequest("Você não pode substituir a própria escala.");
        if (!["PENDING", "CONFIRMED", "DECLINED"].includes(a.status))
          throw badRequest("Esta alocação não permite substituição.");
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${ctx.parishId},${a.celebrationId})`
        );
        const [alreadyAssigned] = await tx
          .select({ id: scheduleAssignments.id })
          .from(scheduleAssignments)
          .where(
            and(
              eq(scheduleAssignments.parishId, ctx.parishId),
              eq(scheduleAssignments.celebrationId, a.celebrationId),
              eq(scheduleAssignments.serverId, ctx.actor.server.id),
              inArray(scheduleAssignments.status, ["PENDING", "CONFIRMED"])
            )
          )
          .limit(1);
        if (alreadyAssigned)
          throw badRequest("Você já está escalado nesta celebração.");
        const open = await db.execute(
          sql`SELECT e.id FROM celebrations e JOIN schedules sc ON sc."celebrationId"=e.id JOIN parishes p ON p.id=e."parishId" WHERE e.id=${a.celebrationId} AND e."parishId"=${ctx.parishId} AND sc."parishId"=${ctx.parishId} AND sc.status='PUBLISHED' AND e.status='SCHEDULED' AND ((e.date::date+e."startTime"::time) AT TIME ZONE p.timezone)>CURRENT_TIMESTAMP`
        );
        if (!open.rows.length)
          throw badRequest(
            "Esta celebração não está disponível para candidatura."
          );
        const validation = await validateAssignments({
          parishId: ctx.parishId,
          celebrationId: a.celebrationId,
          assignments: [
            { serverId: ctx.actor.server.id, parishRoleId: a.parishRoleId },
          ],
        });
        if (!validation.valid)
          throw badRequest(validation.blocking.map(v => v.message).join(" "));
        await tx
          .update(substitutionRequests)
          .set({ replacementServerId: ctx.actor.server.id })
          .where(eq(substitutionRequests.id, request.id));
      });
      return { success: true };
    }),
  recent: serverProcedure.query(async ({ ctx }) => {
    const db = await getDbOrThrow();
    const rows = await db.execute(
      sql`SELECT e.id,e.title,e.date::text AS date FROM celebrations e JOIN schedules s ON s."celebrationId"=e.id JOIN parishes p ON p.id=e."parishId" WHERE e."parishId"=${ctx.parishId} AND s."parishId"=${ctx.parishId} AND s.status='PUBLISHED' AND e.status IN ('SCHEDULED','DONE') AND e.date>=(CURRENT_TIMESTAMP AT TIME ZONE p.timezone)::date-7 AND ((e.date::date+e."startTime"::time) AT TIME ZONE p.timezone)<=CURRENT_TIMESTAMP ORDER BY e.date DESC LIMIT 50`
    );
    return rows.rows as unknown as {
      id: number;
      title: string;
      date: string;
    }[];
  }),
  requestExtra: serverProcedure
    .input(
      z.object({
        celebrationId: z.number().int().positive(),
        parishRoleId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();
      const recent = await db.execute(
        sql`SELECT e.id FROM celebrations e JOIN schedules sc ON sc."celebrationId"=e.id JOIN parishes p ON p.id=e."parishId" WHERE e.id=${input.celebrationId} AND e."parishId"=${ctx.parishId} AND sc."parishId"=${ctx.parishId} AND sc.status='PUBLISHED' AND e.status IN ('SCHEDULED','DONE') AND e.date>=(CURRENT_TIMESTAMP AT TIME ZONE p.timezone)::date-7 AND ((e.date::date+e."startTime"::time) AT TIME ZONE p.timezone)<=CURRENT_TIMESTAMP`
      );
      if (!recent.rows.length)
        throw badRequest(
          "Selecione uma celebração iniciada nos últimos sete dias."
        );
      const valid = await validateAssignments({
        parishId: ctx.parishId,
        celebrationId: input.celebrationId,
        assignments: [
          { serverId: ctx.actor.server.id, parishRoleId: input.parishRoleId },
        ],
      });
      if (!valid.valid)
        throw badRequest(valid.blocking.map(b => b.message).join(" "));
      await db.transaction(async tx => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${ctx.parishId},${input.celebrationId})`
        );
        const [assigned] = await tx
          .select({ id: scheduleAssignments.id })
          .from(scheduleAssignments)
          .where(
            and(
              eq(scheduleAssignments.parishId, ctx.parishId),
              eq(scheduleAssignments.serverId, ctx.actor.server.id),
              eq(scheduleAssignments.celebrationId, input.celebrationId)
            )
          )
          .limit(1);
        if (assigned)
          throw badRequest(
            "Você já possui uma alocação nesta celebração. Peça à coordenação para conferir a presença."
          );
        const [existing] = await tx
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.parishId, ctx.parishId),
              eq(auditLogs.entityType, "extra_service"),
              eq(auditLogs.entityId, input.celebrationId),
              eq(auditLogs.actorServerId, ctx.actor.server.id)
            )
          )
          .limit(1);
        if (existing) throw badRequest("Você já solicitou este registro.");
        await tx.insert(auditLogs).values({
          parishId: ctx.parishId,
          actorServerId: ctx.actor.server.id,
          actorRole: "SERVER",
          actorLabel: ctx.actor.server.name,
          action: "EXTRA_SERVICE_REQUESTED",
          entityType: "extra_service",
          entityId: input.celebrationId,
          metadata: { parishRoleId: input.parishRoleId },
        });
      });
      return { success: true };
    }),
  extras: coordinatorProcedure.query(async ({ ctx }) => {
    const db = await getDbOrThrow();
    const rows = await db.execute(
      sql`SELECT l.id,l."actorServerId" AS "serverId",l."actorLabel" AS "serverName",l."entityId" AS "celebrationId",(l.metadata->>'parishRoleId')::int AS "parishRoleId",e.title,e.date::text AS date FROM audit_logs l JOIN celebrations e ON e.id=l."entityId" AND e."parishId"=${ctx.parishId} WHERE l."parishId"=${ctx.parishId} AND l."entityType"='extra_service' AND NOT EXISTS(SELECT 1 FROM audit_logs resolved WHERE resolved."parishId"=${ctx.parishId} AND resolved."entityType"='extra_service_resolved' AND resolved."entityId"=l.id) ORDER BY l."createdAt" DESC LIMIT 200`
    );
    return rows.rows as unknown as {
      id: number;
      serverId: number;
      serverName: string;
      celebrationId: number;
      parishRoleId: number;
      title: string;
      date: string;
    }[];
  }),
  reviewExtra: coordinatorProcedure
    .input(
      z.object({
        requestId: z.number().int().positive(),
        approve: z.boolean(),
        reason: z.string().trim().min(3).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();
      let assignmentId: number | null = null;
      let serverId: number | null = null;
      await db.transaction(async tx => {
        const [request] = await tx
          .select()
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.id, input.requestId),
              eq(auditLogs.parishId, ctx.parishId),
              eq(auditLogs.entityType, "extra_service")
            )
          )
          .limit(1)
          .for("update");
        if (!request || !request.actorServerId || !request.entityId)
          throw notFound("Solicitação");
        const [resolved] = await tx
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.parishId, ctx.parishId),
              eq(auditLogs.entityType, "extra_service_resolved"),
              eq(auditLogs.entityId, request.id)
            )
          )
          .limit(1);
        if (resolved) throw badRequest("Esta solicitação já foi analisada.");
        if (input.approve) {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(${ctx.parishId},${request.entityId})`
          );
          const [existing] = await tx
            .select({ id: scheduleAssignments.id })
            .from(scheduleAssignments)
            .where(
              and(
                eq(scheduleAssignments.parishId, ctx.parishId),
                eq(scheduleAssignments.serverId, request.actorServerId),
                eq(scheduleAssignments.celebrationId, request.entityId)
              )
            )
            .limit(1);
          if (existing)
            throw badRequest(
              "Já existe uma alocação para este servidor. Confira a presença nela."
            );
          const roleId = Number(
            (request.metadata as { parishRoleId?: number })?.parishRoleId
          );
          const validation = await validateAssignments({
            parishId: ctx.parishId,
            celebrationId: request.entityId,
            assignments: [
              { serverId: request.actorServerId, parishRoleId: roleId },
            ],
          });
          if (!validation.valid)
            throw badRequest(validation.blocking.map(v => v.message).join(" "));
          const [schedule] = await tx
            .select()
            .from(schedules)
            .where(
              and(
                eq(schedules.parishId, ctx.parishId),
                eq(schedules.celebrationId, request.entityId),
                eq(schedules.status, "PUBLISHED")
              )
            )
            .limit(1);
          if (!schedule) throw badRequest("A escala não está publicada.");
          const [created] = await tx
            .insert(scheduleAssignments)
            .values({
              parishId: ctx.parishId,
              scheduleId: schedule.id,
              celebrationId: request.entityId,
              serverId: request.actorServerId,
              parishRoleId: roleId,
              status: "CONFIRMED",
              assignmentSource: "MANUAL",
              notes: "Participação extra validada pela coordenação.",
              assignedByUserId:
                ctx.actor.type === "USER" ? ctx.actor.user.id : null,
            })
            .returning({ id: scheduleAssignments.id });
          await tx.insert(attendanceRecords).values({
            parishId: ctx.parishId,
            assignmentId: created.id,
            status: "PRESENT",
            registeredByUserId:
              ctx.actor.type === "USER" ? ctx.actor.user.id : null,
          });
          assignmentId = created.id;
          serverId = request.actorServerId;
        }
        await tx.insert(auditLogs).values({
          parishId: ctx.parishId,
          actorUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
          actorRole: ctx.actor.role,
          action: input.approve
            ? "EXTRA_SERVICE_APPROVED"
            : "EXTRA_SERVICE_REJECTED",
          entityType: "extra_service_resolved",
          entityId: request.id,
          metadata: { reason: input.reason, approved: input.approve },
        });
      });
      const points =
        assignmentId && serverId
          ? await grantPoints({
              parishId: ctx.parishId,
              serverId,
              eventType: "PARTICIPATION_DONE",
              referenceType: "schedule_assignment",
              referenceId: assignmentId,
            })
          : null;
      return { success: true, points };
    }),
});
