/**
 * Router de celebrações e escalas.
 *
 * Fluxo de status da escala: DRAFT → PROPOSED → UNDER_REVIEW → PUBLISHED,
 * com CANCELLED e ARCHIVED como estados terminais. A publicação só ocorre se a
 * validação não retornar nenhuma violação bloqueante.
 *
 * Nenhuma alocação é apagada fisicamente: substituições marcam a original como
 * REPLACED e criam uma nova, preservando a rastreabilidade completa.
 */
import {
  CELEBRATION_STATUS,
  CELEBRATION_TYPES,
  SCHEDULE_STATUS,
  type ScheduleStatus,
} from "@shared/domain";
import { and, asc, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { z } from "zod";

import {
  altarServers,
  celebrationRoleNeeds,
  celebrations,
  confirmations,
  parishRoles,
  scheduleAssignments,
  schedules,
} from "../../drizzle/schema";
import { getDbOrThrow } from "../db";
import { recordAudit } from "../services/audit";
import { notifyScheduleParticipants } from "../services/notifications";
import { listEligibleServers, validateAssignments } from "../services/scheduleValidation";
import {
  badRequest,
  coordinatorProcedure,
  notFound,
  parishProcedure,
  requestMeta,
  router,
} from "../trpc";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Horário inválido.");

function normalizeTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

/**
 * Transições permitidas no fluxo de status da escala.
 * Publicar exige passar por proposta ou revisão; nunca se salta do rascunho.
 */
const ALLOWED_TRANSITIONS: Record<ScheduleStatus, ScheduleStatus[]> = {
  DRAFT: ["PROPOSED", "CANCELLED"],
  PROPOSED: ["UNDER_REVIEW", "PUBLISHED", "DRAFT", "CANCELLED"],
  UNDER_REVIEW: ["PUBLISHED", "PROPOSED", "DRAFT", "CANCELLED"],
  PUBLISHED: ["ARCHIVED", "CANCELLED"],
  CANCELLED: [],
  ARCHIVED: [],
};

export const schedulesRouter = router({
  // =========================================================================
  // CELEBRAÇÕES
  // =========================================================================
  celebrations: router({
    list: parishProcedure
      .input(
        z.object({
          from: dateSchema,
          to: dateSchema,
          status: z.enum(CELEBRATION_STATUS).optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const conditions = [
          eq(celebrations.parishId, ctx.parishId),
          gte(celebrations.date, input.from),
          lte(celebrations.date, input.to),
        ];
        if (input.status) conditions.push(eq(celebrations.status, input.status));

        const rows = await db
          .select({
            id: celebrations.id,
            title: celebrations.title,
            celebrationType: celebrations.celebrationType,
            date: celebrations.date,
            startTime: celebrations.startTime,
            endTime: celebrations.endTime,
            location: celebrations.location,
            status: celebrations.status,
            scheduleId: schedules.id,
            scheduleStatus: schedules.status,
          })
          .from(celebrations)
          .leftJoin(schedules, eq(schedules.celebrationId, celebrations.id))
          .where(and(...conditions))
          .orderBy(asc(celebrations.date), asc(celebrations.startTime));

        if (rows.length === 0) return [];

        const celebrationIds = rows.map(r => r.id);

        const needs = await db
          .select({
            celebrationId: celebrationRoleNeeds.celebrationId,
            parishRoleId: celebrationRoleNeeds.parishRoleId,
            roleName: parishRoles.name,
            quantity: celebrationRoleNeeds.quantity,
          })
          .from(celebrationRoleNeeds)
          .innerJoin(parishRoles, eq(parishRoles.id, celebrationRoleNeeds.parishRoleId))
          .where(
            and(
              eq(celebrationRoleNeeds.parishId, ctx.parishId),
              inArray(celebrationRoleNeeds.celebrationId, celebrationIds),
            ),
          );

        const filled = await db
          .select({
            celebrationId: scheduleAssignments.celebrationId,
            parishRoleId: scheduleAssignments.parishRoleId,
            serverId: scheduleAssignments.serverId,
          })
          .from(scheduleAssignments)
          .where(
            and(
              eq(scheduleAssignments.parishId, ctx.parishId),
              inArray(scheduleAssignments.celebrationId, celebrationIds),
              inArray(scheduleAssignments.status, ["PENDING", "CONFIRMED"]),
            ),
          );

        return rows.map(row => {
          const celebrationNeeds = needs.filter(n => n.celebrationId === row.id);
          const celebrationFilled = filled.filter(f => f.celebrationId === row.id);
          const totalNeeded = celebrationNeeds.reduce((sum, n) => sum + n.quantity, 0);
          return {
            ...row,
            needs: celebrationNeeds.map(n => ({
              parishRoleId: n.parishRoleId,
              roleName: n.roleName,
              quantity: n.quantity,
              filled: celebrationFilled.filter(f => f.parishRoleId === n.parishRoleId).length,
            })),
            totalNeeded,
            totalFilled: celebrationFilled.length,
          };
        });
      }),

    create: coordinatorProcedure
      .input(
        z.object({
          title: z.string().trim().min(3, "Informe o título da celebração."),
          celebrationType: z.enum(CELEBRATION_TYPES).default("SUNDAY_MASS"),
          date: dateSchema,
          startTime: timeSchema,
          endTime: timeSchema,
          location: z.string().trim().max(180).optional().nullable(),
          notes: z.string().trim().max(1000).optional().nullable(),
          needs: z
            .array(
              z.object({
                parishRoleId: z.number().int().positive(),
                quantity: z.number().int().min(1).max(50),
                requirements: z.string().trim().max(500).optional().nullable(),
              }),
            )
            .default([]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const startTime = normalizeTime(input.startTime);
        const endTime = normalizeTime(input.endTime);
        if (startTime >= endTime) throw badRequest("O horário de término deve ser depois do início.");

        const db = await getDbOrThrow();

        // Funções informadas precisam pertencer à paróquia.
        if (input.needs.length > 0) {
          const roleIds = input.needs.map(n => n.parishRoleId);
          const roles = await db
            .select({ id: parishRoles.id })
            .from(parishRoles)
            .where(and(eq(parishRoles.parishId, ctx.parishId), inArray(parishRoles.id, roleIds)));
          if (roles.length !== new Set(roleIds).size) {
            throw badRequest("Uma das funções informadas não pertence a esta paróquia.");
          }
        }

        await db.insert(celebrations).values({
          parishId: ctx.parishId,
          title: input.title,
          celebrationType: input.celebrationType,
          date: input.date,
          startTime,
          endTime,
          location: input.location ?? null,
          notes: input.notes ?? null,
          status: "SCHEDULED",
          createdByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
        });

        const [created] = await db
          .select({ id: celebrations.id })
          .from(celebrations)
          .where(eq(celebrations.parishId, ctx.parishId))
          .orderBy(desc(celebrations.id))
          .limit(1);
        if (!created) throw badRequest("Não foi possível criar a celebração.");

        if (input.needs.length > 0) {
          await db.insert(celebrationRoleNeeds).values(
            input.needs.map(need => ({
              parishId: ctx.parishId,
              celebrationId: created.id,
              parishRoleId: need.parishRoleId,
              quantity: need.quantity,
              requirements: need.requirements ?? null,
            })),
          );
        }

        // A escala nasce como rascunho junto com a celebração.
        await db.insert(schedules).values({
          parishId: ctx.parishId,
          celebrationId: created.id,
          periodStart: input.date,
          periodEnd: input.date,
          status: "DRAFT",
          source: "MANUAL",
          generatedByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
        });

        await recordAudit(ctx.actor, {
          action: "CELEBRATION_CREATED",
          entityType: "celebration",
          entityId: created.id,
          metadata: { title: input.title, date: input.date },
          ...requestMeta(ctx),
        });

        return { id: created.id } as const;
      }),

    update: coordinatorProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          title: z.string().trim().min(3).optional(),
          celebrationType: z.enum(CELEBRATION_TYPES).optional(),
          date: dateSchema.optional(),
          startTime: timeSchema.optional(),
          endTime: timeSchema.optional(),
          location: z.string().trim().max(180).optional().nullable(),
          notes: z.string().trim().max(1000).optional().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [existing] = await db
          .select()
          .from(celebrations)
          .where(and(eq(celebrations.id, input.id), eq(celebrations.parishId, ctx.parishId)))
          .limit(1);
        if (!existing) throw notFound("Celebração");
        if (existing.status === "CANCELLED") {
          throw badRequest("Não é possível editar uma celebração cancelada.");
        }

        const startTime = input.startTime ? normalizeTime(input.startTime) : existing.startTime;
        const endTime = input.endTime ? normalizeTime(input.endTime) : existing.endTime;
        if (startTime >= endTime) throw badRequest("O horário de término deve ser depois do início.");

        await db
          .update(celebrations)
          .set({
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.celebrationType !== undefined
              ? { celebrationType: input.celebrationType }
              : {}),
            ...(input.date !== undefined ? { date: input.date } : {}),
            ...(input.startTime !== undefined ? { startTime } : {}),
            ...(input.endTime !== undefined ? { endTime } : {}),
            ...(input.location !== undefined ? { location: input.location } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
          })
          .where(eq(celebrations.id, input.id));

        const dateOrTimeChanged =
          (input.date !== undefined && input.date !== existing.date) ||
          startTime !== existing.startTime ||
          endTime !== existing.endTime;

        await recordAudit(ctx.actor, {
          action: "CELEBRATION_UPDATED",
          entityType: "celebration",
          entityId: input.id,
          metadata: { dateOrTimeChanged },
          ...requestMeta(ctx),
        });

        // Mudança de data ou horário pode invalidar alocações já feitas.
        let revalidation = null;
        let newVersion: number | null = null;
        if (dateOrTimeChanged) {
          const current = await db
            .select({
              serverId: scheduleAssignments.serverId,
              parishRoleId: scheduleAssignments.parishRoleId,
            })
            .from(scheduleAssignments)
            .where(
              and(
                eq(scheduleAssignments.celebrationId, input.id),
                eq(scheduleAssignments.parishId, ctx.parishId),
                inArray(scheduleAssignments.status, ["PENDING", "CONFIRMED"]),
              ),
            );

          if (current.length > 0) {
            revalidation = await validateAssignments({
              parishId: ctx.parishId,
              celebrationId: input.id,
              assignments: current,
            });
          }

          // Se a escala já estava publicada, mudar data ou horário altera o
          // compromisso de quem já confirmou. Gera nova versão e reavisa todos.
          const [linkedSchedule] = await db
            .select({ id: schedules.id, status: schedules.status, version: schedules.version })
            .from(schedules)
            .where(
              and(eq(schedules.celebrationId, input.id), eq(schedules.parishId, ctx.parishId)),
            )
            .limit(1);

          if (linkedSchedule && linkedSchedule.status === "PUBLISHED") {
            newVersion = linkedSchedule.version + 1;
            await db
              .update(schedules)
              .set({ version: newVersion })
              .where(eq(schedules.id, linkedSchedule.id));

            const newDate = input.date ?? existing.date;
            await notifyScheduleParticipants({
              parishId: ctx.parishId,
              celebrationId: input.id,
              type: "SCHEDULE_CHANGED",
              title: "Data ou horário da celebração mudou",
              body: `${input.title ?? existing.title} passou para ${formatDate(newDate)} às ${startTime.slice(0, 5)}. Confira sua participação.`,
            });
          }
        }

        return { success: true, revalidation, version: newVersion } as const;
      }),

    /** Define as necessidades de função da celebração, substituindo as anteriores. */
    setNeeds: coordinatorProcedure
      .input(
        z.object({
          celebrationId: z.number().int().positive(),
          needs: z.array(
            z.object({
              parishRoleId: z.number().int().positive(),
              quantity: z.number().int().min(1).max(50),
              requirements: z.string().trim().max(500).optional().nullable(),
            }),
          ),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [celebration] = await db
          .select({ id: celebrations.id })
          .from(celebrations)
          .where(
            and(eq(celebrations.id, input.celebrationId), eq(celebrations.parishId, ctx.parishId)),
          )
          .limit(1);
        if (!celebration) throw notFound("Celebração");

        const roleIds = input.needs.map(n => n.parishRoleId);
        if (roleIds.length !== new Set(roleIds).size) {
          throw badRequest("Cada função pode aparecer apenas uma vez.");
        }

        if (roleIds.length > 0) {
          const roles = await db
            .select({ id: parishRoles.id })
            .from(parishRoles)
            .where(and(eq(parishRoles.parishId, ctx.parishId), inArray(parishRoles.id, roleIds)));
          if (roles.length !== roleIds.length) {
            throw badRequest("Uma das funções informadas não pertence a esta paróquia.");
          }
        }

        await db
          .delete(celebrationRoleNeeds)
          .where(
            and(
              eq(celebrationRoleNeeds.celebrationId, input.celebrationId),
              eq(celebrationRoleNeeds.parishId, ctx.parishId),
            ),
          );

        if (input.needs.length > 0) {
          await db.insert(celebrationRoleNeeds).values(
            input.needs.map(need => ({
              parishId: ctx.parishId,
              celebrationId: input.celebrationId,
              parishRoleId: need.parishRoleId,
              quantity: need.quantity,
              requirements: need.requirements ?? null,
            })),
          );
        }

        await recordAudit(ctx.actor, {
          action: "CELEBRATION_UPDATED",
          entityType: "celebration",
          entityId: input.celebrationId,
          metadata: { needsCount: input.needs.length },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),

    cancel: coordinatorProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          reason: z.string().trim().max(500).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [existing] = await db
          .select()
          .from(celebrations)
          .where(and(eq(celebrations.id, input.id), eq(celebrations.parishId, ctx.parishId)))
          .limit(1);
        if (!existing) throw notFound("Celebração");

        await db
          .update(celebrations)
          .set({ status: "CANCELLED" })
          .where(eq(celebrations.id, input.id));

        // A escala e as alocações acompanham o cancelamento.
        await db
          .update(schedules)
          .set({ status: "CANCELLED" })
          .where(
            and(eq(schedules.celebrationId, input.id), eq(schedules.parishId, ctx.parishId)),
          );

        await db
          .update(scheduleAssignments)
          .set({ status: "CANCELLED" })
          .where(
            and(
              eq(scheduleAssignments.celebrationId, input.id),
              eq(scheduleAssignments.parishId, ctx.parishId),
              inArray(scheduleAssignments.status, ["PENDING", "CONFIRMED"]),
            ),
          );

        await recordAudit(ctx.actor, {
          action: "CELEBRATION_CANCELLED",
          entityType: "celebration",
          entityId: input.id,
          metadata: { reason: input.reason ?? null },
          ...requestMeta(ctx),
        });

        // Avisa quem estava escalado. Falha de notificação não invalida o cancelamento.
        await notifyScheduleParticipants({
          parishId: ctx.parishId,
          celebrationId: input.id,
          type: "SCHEDULE_CHANGED",
          title: "Celebração cancelada",
          body: `${existing.title} de ${formatDate(existing.date)} foi cancelada.`,
        });

        return { success: true } as const;
      }),
  }),

  // =========================================================================
  // ESCALA
  // =========================================================================
  /** Retorna a escala de uma celebração com as alocações e o estado de confirmação. */
  get: parishProcedure
    .input(z.object({ celebrationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDbOrThrow();

      const [celebration] = await db
        .select()
        .from(celebrations)
        .where(
          and(eq(celebrations.id, input.celebrationId), eq(celebrations.parishId, ctx.parishId)),
        )
        .limit(1);
      if (!celebration) throw notFound("Celebração");

      const [schedule] = await db
        .select()
        .from(schedules)
        .where(
          and(eq(schedules.celebrationId, input.celebrationId), eq(schedules.parishId, ctx.parishId)),
        )
        .limit(1);

      const needs = await db
        .select({
          parishRoleId: celebrationRoleNeeds.parishRoleId,
          roleName: parishRoles.name,
          quantity: celebrationRoleNeeds.quantity,
          requirements: celebrationRoleNeeds.requirements,
        })
        .from(celebrationRoleNeeds)
        .innerJoin(parishRoles, eq(parishRoles.id, celebrationRoleNeeds.parishRoleId))
        .where(
          and(
            eq(celebrationRoleNeeds.celebrationId, input.celebrationId),
            eq(celebrationRoleNeeds.parishId, ctx.parishId),
          ),
        )
        .orderBy(asc(parishRoles.displayOrder));

      const assignments = await db
        .select({
          id: scheduleAssignments.id,
          serverId: scheduleAssignments.serverId,
          serverName: altarServers.name,
          parishRoleId: scheduleAssignments.parishRoleId,
          roleName: parishRoles.name,
          status: scheduleAssignments.status,
          assignmentSource: scheduleAssignments.assignmentSource,
          notes: scheduleAssignments.notes,
          assignedAt: scheduleAssignments.assignedAt,
          replacesAssignmentId: scheduleAssignments.replacesAssignmentId,
        })
        .from(scheduleAssignments)
        .innerJoin(altarServers, eq(altarServers.id, scheduleAssignments.serverId))
        .innerJoin(parishRoles, eq(parishRoles.id, scheduleAssignments.parishRoleId))
        .where(
          and(
            eq(scheduleAssignments.celebrationId, input.celebrationId),
            eq(scheduleAssignments.parishId, ctx.parishId),
          ),
        )
        .orderBy(asc(parishRoles.displayOrder), asc(altarServers.name));

      return { celebration, schedule: schedule ?? null, needs, assignments };
    }),

  /** Lista servidores elegíveis para uma função, ordenados por afinidade e carga. */
  eligibleServers: coordinatorProcedure
    .input(
      z.object({
        celebrationId: z.number().int().positive(),
        parishRoleId: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }) =>
      listEligibleServers({
        parishId: ctx.parishId,
        celebrationId: input.celebrationId,
        parishRoleId: input.parishRoleId,
      }),
    ),

  /**
   * Substitui o conjunto de alocações da escala.
   * Retorna as violações encontradas; bloqueantes impedem a gravação.
   */
  setAssignments: coordinatorProcedure
    .input(
      z.object({
        celebrationId: z.number().int().positive(),
        assignments: z
          .array(
            z.object({
              serverId: z.number().int().positive(),
              parishRoleId: z.number().int().positive(),
              notes: z.string().trim().max(500).optional().nullable(),
            }),
          )
          .max(200),
        /** Permite gravar mesmo com avisos (nunca com bloqueios). */
        acceptWarnings: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();

      const [schedule] = await db
        .select()
        .from(schedules)
        .where(
          and(
            eq(schedules.celebrationId, input.celebrationId),
            eq(schedules.parishId, ctx.parishId),
          ),
        )
        .limit(1);
      if (!schedule) throw notFound("Escala");

      if (["CANCELLED", "ARCHIVED"].includes(schedule.status)) {
        throw badRequest("Esta escala está encerrada e não pode ser alterada.");
      }

      const validation = await validateAssignments({
        parishId: ctx.parishId,
        celebrationId: input.celebrationId,
        assignments: input.assignments,
        checkStaffing: true,
      });

      if (!validation.valid) {
        return { saved: false, validation } as const;
      }

      if (!input.acceptWarnings && validation.warnings.length > 0) {
        return { saved: false, validation } as const;
      }

      // Alocações anteriores são canceladas, não apagadas.
      await db
        .update(scheduleAssignments)
        .set({ status: "CANCELLED" })
        .where(
          and(
            eq(scheduleAssignments.scheduleId, schedule.id),
            eq(scheduleAssignments.parishId, ctx.parishId),
            inArray(scheduleAssignments.status, ["PENDING", "CONFIRMED"]),
          ),
        );

      if (input.assignments.length > 0) {
        await db.insert(scheduleAssignments).values(
          input.assignments.map(assignment => ({
            parishId: ctx.parishId,
            scheduleId: schedule.id,
            celebrationId: input.celebrationId,
            serverId: assignment.serverId,
            parishRoleId: assignment.parishRoleId,
            status: "PENDING" as const,
            assignmentSource: "MANUAL" as const,
            notes: assignment.notes ?? null,
            assignedByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
          })),
        );
      }

      await recordAudit(ctx.actor, {
        action: "SCHEDULE_UPDATED",
        entityType: "schedule",
        entityId: schedule.id,
        metadata: { total: input.assignments.length, warnings: validation.warnings.length },
        ...requestMeta(ctx),
      });

      // Alterar uma escala já publicada gera nova versão e reavisa os envolvidos.
      // Sem isso, o servidor que já confirmou não saberia que a escala mudou.
      let newVersion = schedule.version;
      if (schedule.status === "PUBLISHED") {
        newVersion = schedule.version + 1;
        await db
          .update(schedules)
          .set({ version: newVersion })
          .where(eq(schedules.id, schedule.id));

        const [celebration] = await db
          .select({ title: celebrations.title, date: celebrations.date })
          .from(celebrations)
          .where(eq(celebrations.id, input.celebrationId))
          .limit(1);

        await notifyScheduleParticipants({
          parishId: ctx.parishId,
          celebrationId: input.celebrationId,
          type: "SCHEDULE_CHANGED",
          title: "Escala alterada",
          body: celebration
            ? `A escala de ${celebration.title} em ${formatDate(celebration.date)} foi alterada. Confira sua participação.`
            : "Uma escala publicada foi alterada. Confira sua participação.",
        });
      }

      return { saved: true, validation, version: newVersion } as const;
    }),

  /** Valida a escala atual sem gravar nada. */
  validate: coordinatorProcedure
    .input(z.object({ celebrationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDbOrThrow();

      const current = await db
        .select({
          serverId: scheduleAssignments.serverId,
          parishRoleId: scheduleAssignments.parishRoleId,
        })
        .from(scheduleAssignments)
        .where(
          and(
            eq(scheduleAssignments.celebrationId, input.celebrationId),
            eq(scheduleAssignments.parishId, ctx.parishId),
            inArray(scheduleAssignments.status, ["PENDING", "CONFIRMED"]),
          ),
        );

      return validateAssignments({
        parishId: ctx.parishId,
        celebrationId: input.celebrationId,
        assignments: current,
        checkStaffing: true,
      });
    }),

  /**
   * Muda o status da escala respeitando o fluxo.
   * A publicação revalida tudo e é abortada se houver bloqueio.
   */
  setStatus: coordinatorProcedure
    .input(
      z.object({
        celebrationId: z.number().int().positive(),
        status: z.enum(SCHEDULE_STATUS),
        notes: z.string().trim().max(1000).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();

      const [schedule] = await db
        .select()
        .from(schedules)
        .where(
          and(
            eq(schedules.celebrationId, input.celebrationId),
            eq(schedules.parishId, ctx.parishId),
          ),
        )
        .limit(1);
      if (!schedule) throw notFound("Escala");

      const allowed = ALLOWED_TRANSITIONS[schedule.status];
      if (!allowed.includes(input.status)) {
        throw badRequest(
          `Não é possível mudar a escala de "${schedule.status}" para "${input.status}".`,
        );
      }

      // Publicar exige escala válida.
      if (input.status === "PUBLISHED") {
        const current = await db
          .select({
            serverId: scheduleAssignments.serverId,
            parishRoleId: scheduleAssignments.parishRoleId,
          })
          .from(scheduleAssignments)
          .where(
            and(
              eq(scheduleAssignments.scheduleId, schedule.id),
              eq(scheduleAssignments.parishId, ctx.parishId),
              inArray(scheduleAssignments.status, ["PENDING", "CONFIRMED"]),
            ),
          );

        if (current.length === 0) {
          throw badRequest("Não é possível publicar uma escala sem servidores atribuídos.");
        }

        const validation = await validateAssignments({
          parishId: ctx.parishId,
          celebrationId: input.celebrationId,
          assignments: current,
          checkStaffing: true,
        });

        if (!validation.valid) {
          return { published: false, validation } as const;
        }

        const now = new Date();
        await db
          .update(schedules)
          .set({
            status: "PUBLISHED",
            publishedAt: now,
            approvedByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
            approvedAt: now,
            version: schedule.version + 1,
            notes: input.notes ?? schedule.notes,
          })
          .where(eq(schedules.id, schedule.id));

        await recordAudit(ctx.actor, {
          action: "SCHEDULE_PUBLISHED",
          entityType: "schedule",
          entityId: schedule.id,
          metadata: { version: schedule.version + 1, assignments: current.length },
          ...requestMeta(ctx),
        });

        const [celebration] = await db
          .select({ title: celebrations.title, date: celebrations.date })
          .from(celebrations)
          .where(eq(celebrations.id, input.celebrationId))
          .limit(1);

        await notifyScheduleParticipants({
          parishId: ctx.parishId,
          celebrationId: input.celebrationId,
          type: "SCHEDULE_PUBLISHED",
          title: "Nova escala publicada",
          body: celebration
            ? `Você foi escalado para ${celebration.title} em ${formatDate(celebration.date)}. Confirme sua presença.`
            : "Uma nova escala foi publicada. Confirme sua presença.",
        });

        return { published: true, validation } as const;
      }

      await db
        .update(schedules)
        .set({ status: input.status, notes: input.notes ?? schedule.notes })
        .where(eq(schedules.id, schedule.id));

      const auditAction =
        input.status === "CANCELLED"
          ? "SCHEDULE_CANCELLED"
          : input.status === "ARCHIVED"
            ? "SCHEDULE_ARCHIVED"
            : "SCHEDULE_UPDATED";

      await recordAudit(ctx.actor, {
        action: auditAction,
        entityType: "schedule",
        entityId: schedule.id,
        metadata: { from: schedule.status, to: input.status },
        ...requestMeta(ctx),
      });

      return { published: false, validation: null } as const;
    }),
});

function formatDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
