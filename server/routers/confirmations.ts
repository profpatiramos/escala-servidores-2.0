/**
 * Router de confirmações, substituições e presença.
 *
 * Toda confirmação é append-only: cada resposta gera uma nova linha em
 * `confirmations` e o status da alocação é derivado da resposta mais recente.
 * Isso permite auditar mudanças de opinião ("confirmou, depois recusou") e é
 * essencial quando responsável e servidor divergem.
 *
 * Divergência entre responsável e servidor sobre a mesma alocação abre um
 * conflito explícito para a coordenação resolver, em vez de deixar a última
 * resposta sobrescrever silenciosamente a anterior.
 */
import { CONFIRMATION_STATUS, ATTENDANCE_STATUS } from "@shared/domain";
import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";

import {
  altarServers,
  attendanceRecords,
  celebrations,
  confirmationConflicts,
  confirmations,
  familyLinks,
  parishRoles,
  responsibles,
  scheduleAssignments,
  schedules,
  substitutionRequests as substitutionRequestsTable,
} from "../../drizzle/schema";
import { getDbOrThrow } from "../db";
import { recordAudit } from "../services/audit";
import { grantPoints } from "../services/gamification";
import { enqueueNotification } from "../services/notifications";
import { validateAssignments } from "../services/scheduleValidation";
import {
  badRequest,
  coordinatorProcedure,
  forbidden,
  notFound,
  parishProcedure,
  requestMeta,
  router,
} from "../trpc";

/**
 * Verifica se o ator pode responder pela alocação informada.
 *
 * Regras:
 * - SERVER responde apenas pelas próprias alocações.
 * - RESPONSIBLE responde pelas alocações dos dependentes com vínculo ativo.
 * - COORDINATOR e acima respondem por qualquer alocação da paróquia.
 */
export async function assertCanRespond(
  ctx: { parishId: number; actor: any },
  assignmentId: number,
): Promise<{
  assignment: typeof scheduleAssignments.$inferSelect;
  respondentKind: "SERVER" | "RESPONSIBLE" | "COORDINATION";
}> {
  const db = await getDbOrThrow();

  const [assignment] = await db
    .select()
    .from(scheduleAssignments)
    .where(
      and(
        eq(scheduleAssignments.id, assignmentId),
        eq(scheduleAssignments.parishId, ctx.parishId),
      ),
    )
    .limit(1);
  if (!assignment) throw notFound("Alocação");

  // A escala precisa estar publicada para receber confirmações.
  const [schedule] = await db
    .select({ status: schedules.status })
    .from(schedules)
    // A alocação já foi filtrada por paróquia; repetir o filtro protege contra
    // qualquer inconsistência entre alocação e escala.
    .where(and(eq(schedules.id, assignment.scheduleId), eq(schedules.parishId, ctx.parishId)))
    .limit(1);

  if (!schedule || schedule.status !== "PUBLISHED") {
    throw badRequest("Somente escalas publicadas aceitam confirmação.");
  }

  if (assignment.status === "REPLACED" || assignment.status === "CANCELLED") {
    throw badRequest("Esta alocação não está mais ativa.");
  }

  if (ctx.actor.type === "SERVER") {
    if (ctx.actor.server.id !== assignment.serverId) {
      throw forbidden("Você só pode responder pelas suas próprias escalas.");
    }
    return { assignment, respondentKind: "SERVER" };
  }

  const role = ctx.actor.role as string;

  if (role === "RESPONSIBLE") {
    const [link] = await db
      .select({ id: familyLinks.id })
      .from(familyLinks)
      .innerJoin(responsibles, eq(responsibles.id, familyLinks.responsibleId))
      .where(
        and(
          eq(familyLinks.parishId, ctx.parishId),
          eq(familyLinks.serverId, assignment.serverId),
          eq(responsibles.userId, ctx.actor.user.id),
          isNull(familyLinks.endedAt),
        ),
      )
      .limit(1);

    if (!link) throw forbidden("Você não é responsável por este servidor.");
    return { assignment, respondentKind: "RESPONSIBLE" };
  }

  if (["COORDINATOR", "PARISH_ADMIN", "SUPER_ADMIN"].includes(role)) {
    return { assignment, respondentKind: "COORDINATION" };
  }

  throw forbidden("Seu perfil não permite responder confirmações.");
}

export const confirmationsRouter = router({
  /**
   * Registra a resposta de confirmação. Sempre insere uma nova linha.
   * O status da alocação passa a refletir a resposta mais recente.
   */
  respond: parishProcedure
    .input(
      z.object({
        assignmentId: z.number().int().positive(),
        status: z.enum(CONFIRMATION_STATUS),
        reason: z.string().trim().max(500).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();
      const { assignment, respondentKind } = await assertCanRespond(ctx, input.assignmentId);

      // Recusa exige justificativa: a coordenação precisa entender o motivo
      // para decidir se abre substituição ou apenas remove a alocação.
      if (input.status === "DECLINED" && !input.reason) {
        throw badRequest("Informe o motivo ao recusar a escala.");
      }

      const actorUserId = ctx.actor.type === "USER" ? ctx.actor.user.id : null;
      const actorServerId = ctx.actor.type === "SERVER" ? ctx.actor.server.id : null;

      await db.insert(confirmations).values({
        parishId: ctx.parishId,
        assignmentId: input.assignmentId,
        respondedByUserId: actorUserId,
        respondedByServerId: actorServerId,
        actorRole: ctx.actor.role,
        status: input.status,
        reason: input.reason ?? null,
      });

      // Detecção de divergência: procura a resposta mais recente de outra
      // origem (servidor vs responsável) com status diferente.
      const history = await db
        .select({
          status: confirmations.status,
          actorRole: confirmations.actorRole,
          respondedAt: confirmations.respondedAt,
        })
        .from(confirmations)
        .where(
          and(
            eq(confirmations.assignmentId, input.assignmentId),
            eq(confirmations.parishId, ctx.parishId),
          ),
        )
        .orderBy(desc(confirmations.respondedAt))
        .limit(10);

      let conflictOpened = false;
      if (respondentKind !== "COORDINATION") {
        const counterpartRole = respondentKind === "SERVER" ? "RESPONSIBLE" : "SERVER";
        const counterpart = history.find(h => h.actorRole === counterpartRole);

        if (counterpart && counterpart.status !== input.status) {
          const [openConflict] = await db
            .select({ id: confirmationConflicts.id })
            .from(confirmationConflicts)
            .where(
              and(
                eq(confirmationConflicts.assignmentId, input.assignmentId),
                eq(confirmationConflicts.parishId, ctx.parishId),
                eq(confirmationConflicts.status, "OPEN"),
              ),
            )
            .limit(1);

          if (!openConflict) {
            await db.insert(confirmationConflicts).values({
              parishId: ctx.parishId,
              assignmentId: input.assignmentId,
              status: "OPEN",
              detail: `Servidor e responsável divergem: ${counterpartRole} respondeu "${counterpart.status}" e ${ctx.actor.role} respondeu "${input.status}".`,
            });
            conflictOpened = true;

            await recordAudit(ctx.actor, {
              action: "CONFIRMATION_CONFLICT_OPENED",
              entityType: "assignment",
              entityId: input.assignmentId,
              metadata: { counterpartRole, counterpartStatus: counterpart.status },
              ...requestMeta(ctx),
            });
          }
        }
      }

      // O status da alocação segue a resposta mais recente. Havendo conflito
      // aberto, mantemos PENDING para forçar a decisão da coordenação.
      const newStatus = conflictOpened
        ? "PENDING"
        : input.status === "CONFIRMED"
          ? "CONFIRMED"
          : "DECLINED";

      await db
        .update(scheduleAssignments)
        .set({ status: newStatus })
        .where(eq(scheduleAssignments.id, input.assignmentId));

      await recordAudit(ctx.actor, {
        action: "CONFIRMATION_RECORDED",
        entityType: "assignment",
        entityId: input.assignmentId,
        metadata: { status: input.status, respondentKind },
        ...requestMeta(ctx),
      });

      // Recusa avisa a coordenação para providenciar substituto.
      if (input.status === "DECLINED") {
        const [info] = await db
          .select({
            serverName: altarServers.name,
            celebrationTitle: celebrations.title,
            celebrationDate: celebrations.date,
          })
          .from(scheduleAssignments)
          .innerJoin(altarServers, eq(altarServers.id, scheduleAssignments.serverId))
          .innerJoin(celebrations, eq(celebrations.id, scheduleAssignments.celebrationId))
          .where(eq(scheduleAssignments.id, input.assignmentId))
          .limit(1);

        if (info) {
          await enqueueNotification({
            parishId: ctx.parishId,
            userId: assignment.assignedByUserId,
            type: "CONFIRMATION_PENDING",
            title: "Recusa de escala registrada",
            body: `${info.serverName} não poderá participar de ${info.celebrationTitle}.`,
            referenceType: "assignment",
            referenceId: input.assignmentId,
          });
        }
      }

      return { success: true, assignmentStatus: newStatus, conflictOpened } as const;
    }),

  /** Histórico completo de respostas de uma alocação. */
  history: parishProcedure
    .input(z.object({ assignmentId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDbOrThrow();
      return db
        .select()
        .from(confirmations)
        .where(
          and(
            eq(confirmations.assignmentId, input.assignmentId),
            eq(confirmations.parishId, ctx.parishId),
          ),
        )
        .orderBy(desc(confirmations.respondedAt));
    }),

  /** Alocações do próprio usuário ou dos dependentes aguardando resposta. */
  pending: parishProcedure.query(async ({ ctx }) => {
    const db = await getDbOrThrow();
    const today = new Date().toISOString().slice(0, 10);

    let serverIds: number[] = [];

    if (ctx.actor.type === "SERVER") {
      serverIds = [ctx.actor.server.id];
    } else if (ctx.actor.role === "RESPONSIBLE") {
      const links = await db
        .select({ serverId: familyLinks.serverId })
        .from(familyLinks)
        .innerJoin(responsibles, eq(responsibles.id, familyLinks.responsibleId))
        .where(
          and(
            eq(familyLinks.parishId, ctx.parishId),
            eq(responsibles.userId, ctx.actor.user.id),
            isNull(familyLinks.endedAt),
          ),
        );
      serverIds = links.map(l => l.serverId);
    }

    if (serverIds.length === 0) return [];

    return db
      .select({
        assignmentId: scheduleAssignments.id,
        serverId: scheduleAssignments.serverId,
        serverName: altarServers.name,
        roleName: parishRoles.name,
        status: scheduleAssignments.status,
        celebrationId: celebrations.id,
        celebrationTitle: celebrations.title,
        celebrationDate: celebrations.date,
        celebrationStartTime: celebrations.startTime,
        location: celebrations.location,
      })
      .from(scheduleAssignments)
      .innerJoin(altarServers, eq(altarServers.id, scheduleAssignments.serverId))
      .innerJoin(parishRoles, eq(parishRoles.id, scheduleAssignments.parishRoleId))
      .innerJoin(celebrations, eq(celebrations.id, scheduleAssignments.celebrationId))
      .innerJoin(schedules, eq(schedules.id, scheduleAssignments.scheduleId))
      .where(
        and(
          eq(scheduleAssignments.parishId, ctx.parishId),
          inArray(scheduleAssignments.serverId, serverIds),
          eq(scheduleAssignments.status, "PENDING"),
          eq(schedules.status, "PUBLISHED"),
          gte(celebrations.date, today),
        ),
      )
      .orderBy(celebrations.date, celebrations.startTime);
  }),

  // =========================================================================
  // CONFLITOS
  // =========================================================================
  conflicts: router({
    list: coordinatorProcedure
      .input(z.object({ onlyOpen: z.boolean().default(true) }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDbOrThrow();
        const conditions = [eq(confirmationConflicts.parishId, ctx.parishId)];
        if (input?.onlyOpen !== false) {
          conditions.push(eq(confirmationConflicts.status, "OPEN"));
        }

        return db
          .select({
            id: confirmationConflicts.id,
            assignmentId: confirmationConflicts.assignmentId,
            status: confirmationConflicts.status,
            detail: confirmationConflicts.detail,
            resolution: confirmationConflicts.resolution,
            createdAt: confirmationConflicts.createdAt,
            serverName: altarServers.name,
            roleName: parishRoles.name,
            celebrationTitle: celebrations.title,
            celebrationDate: celebrations.date,
          })
          .from(confirmationConflicts)
          .innerJoin(
            scheduleAssignments,
            eq(scheduleAssignments.id, confirmationConflicts.assignmentId),
          )
          .innerJoin(altarServers, eq(altarServers.id, scheduleAssignments.serverId))
          .innerJoin(parishRoles, eq(parishRoles.id, scheduleAssignments.parishRoleId))
          .innerJoin(celebrations, eq(celebrations.id, scheduleAssignments.celebrationId))
          .where(and(...conditions))
          .orderBy(desc(confirmationConflicts.createdAt));
      }),

    /** A coordenação decide o status final da alocação e encerra o conflito. */
    resolve: coordinatorProcedure
      .input(
        z.object({
          conflictId: z.number().int().positive(),
          finalStatus: z.enum(CONFIRMATION_STATUS),
          resolution: z.string().trim().min(3, "Descreva como o conflito foi resolvido."),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [conflict] = await db
          .select()
          .from(confirmationConflicts)
          .where(
            and(
              eq(confirmationConflicts.id, input.conflictId),
              eq(confirmationConflicts.parishId, ctx.parishId),
            ),
          )
          .limit(1);
        if (!conflict) throw notFound("Conflito");
        if (conflict.status === "RESOLVED") throw badRequest("Este conflito já foi resolvido.");

        await db
          .update(confirmationConflicts)
          .set({
            status: "RESOLVED",
            resolution: input.resolution,
            resolvedByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
            resolvedAt: new Date(),
          })
          .where(eq(confirmationConflicts.id, input.conflictId));

        // A decisão da coordenação também é registrada como confirmação.
        await db.insert(confirmations).values({
          parishId: ctx.parishId,
          assignmentId: conflict.assignmentId,
          respondedByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
          respondedByServerId: null,
          actorRole: ctx.actor.role,
          status: input.finalStatus,
          reason: `Resolução de conflito: ${input.resolution}`,
        });

        await db
          .update(scheduleAssignments)
          .set({ status: input.finalStatus === "CONFIRMED" ? "CONFIRMED" : "DECLINED" })
          .where(eq(scheduleAssignments.id, conflict.assignmentId));

        await recordAudit(ctx.actor, {
          action: "CONFIRMATION_CONFLICT_RESOLVED",
          entityType: "assignment",
          entityId: conflict.assignmentId,
          metadata: { conflictId: input.conflictId, finalStatus: input.finalStatus },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),
  }),

  // =========================================================================
  // SUBSTITUIÇÕES
  // =========================================================================
  substitutions: router({
    /** Servidor, responsável ou coordenação solicita substituição. */
    request: parishProcedure
      .input(
        z.object({
          assignmentId: z.number().int().positive(),
          reason: z.string().trim().min(3, "Informe o motivo da substituição."),
          suggestedServerId: z.number().int().positive().optional().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();
        await assertCanRespond(ctx, input.assignmentId);

        const [pending] = await db
          .select({ id: substitutionRequestsTable.id })
          .from(substitutionRequestsTable)
          .where(
            and(
              eq(substitutionRequestsTable.assignmentId, input.assignmentId),
              eq(substitutionRequestsTable.parishId, ctx.parishId),
              eq(substitutionRequestsTable.status, "PENDING"),
            ),
          )
          .limit(1);
        if (pending) throw badRequest("Já existe uma solicitação em análise para esta escala.");

        await db.insert(substitutionRequestsTable).values({
          parishId: ctx.parishId,
          assignmentId: input.assignmentId,
          requestedByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
          requestedByServerId: ctx.actor.type === "SERVER" ? ctx.actor.server.id : null,
          reason: input.reason,
          status: "PENDING",
          replacementServerId: input.suggestedServerId ?? null,
        });

        await recordAudit(ctx.actor, {
          action: "SUBSTITUTION_REQUESTED",
          entityType: "assignment",
          entityId: input.assignmentId,
          metadata: { suggestedServerId: input.suggestedServerId ?? null },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),

    list: coordinatorProcedure
      .input(z.object({ onlyPending: z.boolean().default(true) }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDbOrThrow();
        const conditions = [eq(substitutionRequestsTable.parishId, ctx.parishId)];
        if (input?.onlyPending !== false) {
          conditions.push(eq(substitutionRequestsTable.status, "PENDING"));
        }

        return db
          .select({
            id: substitutionRequestsTable.id,
            assignmentId: substitutionRequestsTable.assignmentId,
            reason: substitutionRequestsTable.reason,
            status: substitutionRequestsTable.status,
            replacementServerId: substitutionRequestsTable.replacementServerId,
            createdAt: substitutionRequestsTable.createdAt,
            serverId: scheduleAssignments.serverId,
            serverName: altarServers.name,
            parishRoleId: scheduleAssignments.parishRoleId,
            roleName: parishRoles.name,
            celebrationId: celebrations.id,
            celebrationTitle: celebrations.title,
            celebrationDate: celebrations.date,
          })
          .from(substitutionRequestsTable)
          .innerJoin(
            scheduleAssignments,
            eq(scheduleAssignments.id, substitutionRequestsTable.assignmentId),
          )
          .innerJoin(altarServers, eq(altarServers.id, scheduleAssignments.serverId))
          .innerJoin(parishRoles, eq(parishRoles.id, scheduleAssignments.parishRoleId))
          .innerJoin(celebrations, eq(celebrations.id, scheduleAssignments.celebrationId))
          .where(and(...conditions))
          .orderBy(desc(substitutionRequestsTable.createdAt));
      }),

    /**
     * Aprova a substituição. A alocação original vira REPLACED e uma nova é
     * criada para o substituto, validada com as mesmas regras da escala.
     */
    approve: coordinatorProcedure
      .input(
        z.object({
          requestId: z.number().int().positive(),
          replacementServerId: z.number().int().positive(),
          reviewNotes: z.string().trim().max(500).optional().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [request] = await db
          .select()
          .from(substitutionRequestsTable)
          .where(
            and(
              eq(substitutionRequestsTable.id, input.requestId),
              eq(substitutionRequestsTable.parishId, ctx.parishId),
            ),
          )
          .limit(1);
        if (!request) throw notFound("Solicitação");
        if (request.status !== "PENDING") throw badRequest("Esta solicitação já foi analisada.");

        const [original] = await db
          .select()
          .from(scheduleAssignments)
          .where(eq(scheduleAssignments.id, request.assignmentId))
          .limit(1);
        if (!original) throw notFound("Alocação");

        if (input.replacementServerId === original.serverId) {
          throw badRequest("O substituto precisa ser diferente do servidor original.");
        }

        // O substituto passa pelas mesmas validações da escala.
        const validation = await validateAssignments({
          parishId: ctx.parishId,
          celebrationId: original.celebrationId,
          assignments: [
            { serverId: input.replacementServerId, parishRoleId: original.parishRoleId },
          ],
        });

        if (!validation.valid) {
          return { approved: false, validation } as const;
        }

        await db.insert(scheduleAssignments).values({
          parishId: ctx.parishId,
          scheduleId: original.scheduleId,
          celebrationId: original.celebrationId,
          serverId: input.replacementServerId,
          parishRoleId: original.parishRoleId,
          status: "PENDING",
          assignmentSource: original.assignmentSource,
          replacesAssignmentId: original.id,
          notes: `Substituição da alocação #${original.id}`,
          assignedByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
        });

        const [replacement] = await db
          .select({ id: scheduleAssignments.id })
          .from(scheduleAssignments)
          .where(
            and(
              eq(scheduleAssignments.replacesAssignmentId, original.id),
              eq(scheduleAssignments.parishId, ctx.parishId),
            ),
          )
          .orderBy(desc(scheduleAssignments.id))
          .limit(1);

        await db
          .update(scheduleAssignments)
          .set({ status: "REPLACED", replacedByAssignmentId: replacement?.id ?? null })
          .where(eq(scheduleAssignments.id, original.id));

        await db
          .update(substitutionRequestsTable)
          .set({
            status: "APPROVED",
            replacementServerId: input.replacementServerId,
            reviewedByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
            reviewNotes: input.reviewNotes ?? null,
            resolvedAt: new Date(),
          })
          .where(eq(substitutionRequestsTable.id, input.requestId));

        await recordAudit(ctx.actor, {
          action: "SUBSTITUTION_APPROVED",
          entityType: "assignment",
          entityId: original.id,
          metadata: {
            requestId: input.requestId,
            replacementServerId: input.replacementServerId,
            newAssignmentId: replacement?.id ?? null,
          },
          ...requestMeta(ctx),
        });

        const [celebration] = await db
          .select({ title: celebrations.title, date: celebrations.date })
          .from(celebrations)
          .where(eq(celebrations.id, original.celebrationId))
          .limit(1);

        await enqueueNotification({
          parishId: ctx.parishId,
          serverId: input.replacementServerId,
          type: "SUBSTITUTION_RESOLVED",
          title: "Você foi escalado como substituto",
          body: celebration
            ? `Substituição confirmada para ${celebration.title} em ${formatDate(celebration.date)}.`
            : "Substituição confirmada. Confirme sua presença.",
          referenceType: "assignment",
          referenceId: replacement?.id ?? null,
        });

        return { approved: true, validation, newAssignmentId: replacement?.id ?? null } as const;
      }),

    reject: coordinatorProcedure
      .input(
        z.object({
          requestId: z.number().int().positive(),
          reviewNotes: z.string().trim().min(3, "Explique o motivo da recusa."),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [request] = await db
          .select()
          .from(substitutionRequestsTable)
          .where(
            and(
              eq(substitutionRequestsTable.id, input.requestId),
              eq(substitutionRequestsTable.parishId, ctx.parishId),
            ),
          )
          .limit(1);
        if (!request) throw notFound("Solicitação");
        if (request.status !== "PENDING") throw badRequest("Esta solicitação já foi analisada.");

        await db
          .update(substitutionRequestsTable)
          .set({
            status: "REJECTED",
            reviewedByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
            reviewNotes: input.reviewNotes,
            resolvedAt: new Date(),
          })
          .where(eq(substitutionRequestsTable.id, input.requestId));

        await recordAudit(ctx.actor, {
          action: "SUBSTITUTION_REJECTED",
          entityType: "assignment",
          entityId: request.assignmentId,
          metadata: { requestId: input.requestId },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),
  }),

  // =========================================================================
  // PRESENÇA
  // =========================================================================
  attendance: router({
    /** Alocações de uma celebração já realizada, para registro de presença. */
    forCelebration: coordinatorProcedure
      .input(z.object({ celebrationId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        return db
          .select({
            assignmentId: scheduleAssignments.id,
            serverId: scheduleAssignments.serverId,
            serverName: altarServers.name,
            roleName: parishRoles.name,
            assignmentStatus: scheduleAssignments.status,
            attendanceStatus: attendanceRecords.status,
            justification: attendanceRecords.justification,
          })
          .from(scheduleAssignments)
          .innerJoin(altarServers, eq(altarServers.id, scheduleAssignments.serverId))
          .innerJoin(parishRoles, eq(parishRoles.id, scheduleAssignments.parishRoleId))
          .leftJoin(
            attendanceRecords,
            eq(attendanceRecords.assignmentId, scheduleAssignments.id),
          )
          .where(
            and(
              eq(scheduleAssignments.celebrationId, input.celebrationId),
              eq(scheduleAssignments.parishId, ctx.parishId),
              inArray(scheduleAssignments.status, ["PENDING", "CONFIRMED", "DECLINED"]),
            ),
          )
          .orderBy(parishRoles.displayOrder, altarServers.name);
      }),

    /** Registra ou atualiza a presença de várias alocações de uma vez. */
    record: coordinatorProcedure
      .input(
        z.object({
          celebrationId: z.number().int().positive(),
          records: z
            .array(
              z.object({
                assignmentId: z.number().int().positive(),
                status: z.enum(ATTENDANCE_STATUS),
                justification: z.string().trim().max(500).optional().nullable(),
              }),
            )
            .min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        // Só aceita alocações que pertençam à celebração e à paróquia do ator.
        const valid = await db
          .select({ id: scheduleAssignments.id, serverId: scheduleAssignments.serverId })
          .from(scheduleAssignments)
          .where(
            and(
              eq(scheduleAssignments.celebrationId, input.celebrationId),
              eq(scheduleAssignments.parishId, ctx.parishId),
              inArray(
                scheduleAssignments.id,
                input.records.map(r => r.assignmentId),
              ),
            ),
          );

        const validIds = new Set(valid.map(v => v.id));
        const serverByAssignment = new Map(valid.map(v => [v.id, v.serverId]));
        const accepted = input.records.filter(r => validIds.has(r.assignmentId));
        if (accepted.length === 0) throw badRequest("Nenhuma alocação válida informada.");

        const userId = ctx.actor.type === "USER" ? ctx.actor.user.id : null;

        for (const record of accepted) {
          const [existing] = await db
            .select({ id: attendanceRecords.id })
            .from(attendanceRecords)
            .where(eq(attendanceRecords.assignmentId, record.assignmentId))
            .limit(1);

          if (existing) {
            await db
              .update(attendanceRecords)
              .set({
                status: record.status,
                justification: record.justification ?? null,
                registeredByUserId: userId,
              })
              .where(eq(attendanceRecords.id, existing.id));
          } else {
            await db.insert(attendanceRecords).values({
              parishId: ctx.parishId,
              assignmentId: record.assignmentId,
              status: record.status,
              justification: record.justification ?? null,
              registeredByUserId: userId,
            });
          }
        }

        // Gamificação: a presença gera pontos e a ausência só penaliza se a
        // paróquia tiver habilitado penalidades. A chave de idempotência é
        // derivada da alocação, então reenviar a chamada não duplica pontos.
        for (const record of accepted) {
          const serverId = serverByAssignment.get(record.assignmentId);
          if (!serverId) continue;

          const eventType =
            record.status === "PRESENT"
              ? "PARTICIPATION_DONE"
              : record.status === "JUSTIFIED_ABSENCE" || record.status === "COMMUNICATED_ABSENCE"
                ? "JUSTIFIED_ABSENCE"
                : record.status === "UNJUSTIFIED_ABSENCE"
                  ? "UNJUSTIFIED_ABSENCE"
                  : null;

          if (!eventType) continue;

          await grantPoints({
            parishId: ctx.parishId,
            serverId,
            eventType,
            referenceType: "schedule_assignment",
            referenceId: record.assignmentId,
            createdByUserId: userId,
          });
        }

        // A celebração passa a constar como realizada.
        await db
          .update(celebrations)
          .set({ status: "DONE" })
          .where(
            and(eq(celebrations.id, input.celebrationId), eq(celebrations.parishId, ctx.parishId)),
          );

        await recordAudit(ctx.actor, {
          action: "ATTENDANCE_RECORDED",
          entityType: "celebration",
          entityId: input.celebrationId,
          metadata: { total: accepted.length },
          ...requestMeta(ctx),
        });

        return { success: true, recorded: accepted.length } as const;
      }),
  }),
});

function formatDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
