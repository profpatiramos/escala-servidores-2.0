/**
 * Router de eventos, tarefas, turnos e voluntariado.
 *
 * Duas regras estruturais moldam este módulo:
 *
 * 1. **Acompanhantes são apenas quantidade.** A especificação é explícita: não
 *    há cadastro individual de acompanhante. Isso evita coletar dados pessoais
 *    de terceiros (muitas vezes menores) sem necessidade operacional.
 * 2. **Nenhuma alocação sem interesse prévio.** Voluntariado é adesão
 *    voluntária. A coordenação só pode alocar quem manifestou interesse no
 *    turno, o que impede escalar alguém para trabalho não solicitado.
 */
import { EVENT_STATUS, EVENT_TYPES, PARTICIPATION_RESPONSES, isMinor } from "@shared/domain";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import {
  altarServers,
  eventParticipations,
  eventShiftAssignments,
  eventShifts,
  eventTasks,
  events,
  familyLinks,
  responsibles,
  volunteerInterests as volunteerInterestsRef,
} from "../../drizzle/schema";
import { getDbOrThrow } from "../db";
import { recordAudit } from "../services/audit";
import { grantPoints } from "../services/gamification";
import { enqueueNotification } from "../services/notifications";
import {
  badRequest,
  coordinatorProcedure,
  forbidden,
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
 * Resolve por quais servidores o ator pode responder.
 * Retorna `null` quando o ator é da coordenação (responde por todos).
 */
export async function resolveAllowedServerIds(ctx: {
  parishId: number;
  actor: any;
}): Promise<number[] | null> {
  const db = await getDbOrThrow();

  if (ctx.actor.type === "SERVER") {
    return [ctx.actor.server.id];
  }

  const role = ctx.actor.role as string;
  if (role === "RESPONSIBLE") {
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
    return links.map(l => l.serverId);
  }

  if (["COORDINATOR", "PARISH_ADMIN", "SUPER_ADMIN"].includes(role)) {
    return null;
  }

  return [];
}

/** Garante que o ator pode responder pelo servidor informado. */
export async function assertCanActFor(
  ctx: { parishId: number; actor: any },
  serverId: number,
): Promise<void> {
  const allowed = await resolveAllowedServerIds(ctx);
  if (allowed === null) return;
  if (!allowed.includes(serverId)) {
    throw forbidden("Você não pode responder por este servidor.");
  }
}

export const eventsRouter = router({
  // -------------------------------------------------------------------------
  // Eventos
  // -------------------------------------------------------------------------

  /** Lista eventos da paróquia. Não-coordenadores só veem os publicados. */
  list: parishProcedure
    .input(
      z
        .object({
          status: z.enum(EVENT_STATUS).optional(),
          type: z.enum(EVENT_TYPES).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDbOrThrow();
      const isCoordination = ["COORDINATOR", "PARISH_ADMIN", "SUPER_ADMIN"].includes(
        String(ctx.actor.role),
      );

      const conditions = [eq(events.parishId, ctx.parishId)];
      if (input?.status) conditions.push(eq(events.status, input.status));
      if (input?.type) conditions.push(eq(events.eventType, input.type));
      // Rascunho é trabalho interno da coordenação: não aparece para servidores.
      if (!isCoordination) conditions.push(eq(events.status, "PUBLISHED"));

      const rows = await db
        .select()
        .from(events)
        .where(and(...conditions))
        .orderBy(asc(events.startAt));

      const eventIds = rows.map(r => r.id);
      const counts = new Map<number, number>();
      if (eventIds.length > 0) {
        const grouped = await db
          .select({
            eventId: eventParticipations.eventId,
            total: count(),
            companions: sql<number>`COALESCE(SUM(${eventParticipations.companionsCount}), 0)`,
          })
          .from(eventParticipations)
          .where(
            and(
              eq(eventParticipations.parishId, ctx.parishId),
              inArray(eventParticipations.eventId, eventIds),
              inArray(eventParticipations.response, ["REGISTERED", "CONFIRMED", "INTERESTED"]),
            ),
          )
          .groupBy(eventParticipations.eventId);

        for (const row of grouped) {
          counts.set(row.eventId, Number(row.total) + Number(row.companions));
        }
      }

      return rows.map(row => ({
        ...row,
        totalAttendees: counts.get(row.id) ?? 0,
      }));
    }),

  get: parishProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDbOrThrow();

      const [event] = await db
        .select()
        .from(events)
        .where(and(eq(events.id, input.id), eq(events.parishId, ctx.parishId)))
        .limit(1);
      if (!event) throw notFound("Evento");

      const isCoordination = ["COORDINATOR", "PARISH_ADMIN", "SUPER_ADMIN"].includes(
        String(ctx.actor.role),
      );
      if (!isCoordination && event.status !== "PUBLISHED") {
        throw notFound("Evento");
      }

      const tasks = await db
        .select()
        .from(eventTasks)
        .where(and(eq(eventTasks.eventId, event.id), eq(eventTasks.parishId, ctx.parishId)))
        .orderBy(asc(eventTasks.name));

      const shifts = await db
        .select()
        .from(eventShifts)
        .where(and(eq(eventShifts.eventId, event.id), eq(eventShifts.parishId, ctx.parishId)))
        .orderBy(asc(eventShifts.date), asc(eventShifts.startTime));

      // Vagas restantes por turno, para o voluntário saber onde ainda cabe.
      const shiftIds = shifts.map(s => s.id);
      const filled = new Map<number, number>();
      if (shiftIds.length > 0) {
        const grouped = await db
          .select({ shiftId: eventShiftAssignments.eventShiftId, total: count() })
          .from(eventShiftAssignments)
          .where(
            and(
              eq(eventShiftAssignments.parishId, ctx.parishId),
              inArray(eventShiftAssignments.eventShiftId, shiftIds),
              inArray(eventShiftAssignments.status, ["ASSIGNED", "CONFIRMED"]),
            ),
          )
          .groupBy(eventShiftAssignments.eventShiftId);
        for (const row of grouped) filled.set(row.shiftId, Number(row.total));
      }

      return {
        event,
        tasks,
        shifts: shifts.map(shift => ({
          ...shift,
          filledSlots: filled.get(shift.id) ?? 0,
          remainingSlots: Math.max(0, shift.slots - (filled.get(shift.id) ?? 0)),
        })),
      };
    }),

  create: coordinatorProcedure
    .input(
      z.object({
        title: z.string().trim().min(3).max(180),
        type: z.enum(EVENT_TYPES),
        description: z.string().trim().max(2000).optional().nullable(),
        location: z.string().trim().max(200).optional().nullable(),
        startAt: z.date(),
        endAt: z.date().optional().nullable(),
        registrationOpensAt: z.date().optional().nullable(),
        registrationClosesAt: z.date().optional().nullable(),
        maxParticipants: z.number().int().positive().optional().nullable(),
        allowsCompanions: z.boolean().default(false),
        maxCompanionsPerServer: z.number().int().min(0).max(20).default(0),
        notes: z.string().trim().max(2000).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();

      if (input.endAt && input.endAt <= input.startAt) {
        throw badRequest("O término do evento deve ser depois do início.");
      }
      if (
        input.registrationOpensAt &&
        input.registrationClosesAt &&
        input.registrationClosesAt <= input.registrationOpensAt
      ) {
        throw badRequest("O encerramento das inscrições deve ser depois da abertura.");
      }
      if (input.allowsCompanions && input.maxCompanionsPerServer === 0) {
        throw badRequest("Informe quantos acompanhantes cada servidor pode levar.");
      }

      await db.insert(events).values({
        parishId: ctx.parishId,
        name: input.title,
        eventType: input.type,
        description: input.description ?? null,
        location: input.location ?? null,
        startAt: input.startAt,
        endAt: input.endAt ?? null,
        registrationOpensAt: input.registrationOpensAt ?? null,
        registrationClosesAt: input.registrationClosesAt ?? null,
        participantLimit: input.maxParticipants ?? null,
        allowCompanions: input.allowsCompanions,
        maxCompanions: input.allowsCompanions ? input.maxCompanionsPerServer : 0,
        organizerNote: input.notes ?? null,
        status: "DRAFT",
        createdByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
      });

      const [created] = await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.parishId, ctx.parishId), eq(events.name, input.title)))
        .orderBy(sql`${events.id} DESC`)
        .limit(1);

      await recordAudit(ctx.actor, {
        action: "EVENT_CREATED",
        entityType: "event",
        entityId: created?.id ?? null,
        metadata: { title: input.title, type: input.type },
        ...requestMeta(ctx),
      });

      return { id: created?.id ?? 0 } as const;
    }),

  update: coordinatorProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().trim().min(3).max(180).optional(),
        description: z.string().trim().max(2000).optional().nullable(),
        location: z.string().trim().max(200).optional().nullable(),
        startAt: z.date().optional(),
        endAt: z.date().optional().nullable(),
        registrationOpensAt: z.date().optional().nullable(),
        registrationClosesAt: z.date().optional().nullable(),
        maxParticipants: z.number().int().positive().optional().nullable(),
        allowsCompanions: z.boolean().optional(),
        maxCompanionsPerServer: z.number().int().min(0).max(20).optional(),
        notes: z.string().trim().max(2000).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();

      const [existing] = await db
        .select()
        .from(events)
        .where(and(eq(events.id, input.id), eq(events.parishId, ctx.parishId)))
        .limit(1);
      if (!existing) throw notFound("Evento");
      if (existing.status === "CANCELLED") {
        throw badRequest("Evento cancelado não pode ser alterado.");
      }

      // Mapeamento explícito: os nomes de entrada da API não coincidem com as
      // colunas do banco, então converter chave por chave evita gravar campo errado.
      const patch: Record<string, unknown> = {};
      if (input.title !== undefined) patch.name = input.title;
      if (input.description !== undefined) patch.description = input.description;
      if (input.location !== undefined) patch.location = input.location;
      if (input.startAt !== undefined) patch.startAt = input.startAt;
      if (input.endAt !== undefined) patch.endAt = input.endAt;
      if (input.registrationOpensAt !== undefined) {
        patch.registrationOpensAt = input.registrationOpensAt;
      }
      if (input.registrationClosesAt !== undefined) {
        patch.registrationClosesAt = input.registrationClosesAt;
      }
      if (input.maxParticipants !== undefined) patch.participantLimit = input.maxParticipants;
      if (input.allowsCompanions !== undefined) patch.allowCompanions = input.allowsCompanions;
      if (input.maxCompanionsPerServer !== undefined) {
        patch.maxCompanions = input.maxCompanionsPerServer;
      }
      if (input.notes !== undefined) patch.organizerNote = input.notes;

      if (Object.keys(patch).length === 0) return { success: true } as const;

      const startAt = (patch.startAt as Date | undefined) ?? existing.startAt;
      const endAt = (patch.endAt as Date | null | undefined) ?? existing.endAt;
      if (endAt && endAt <= startAt) {
        throw badRequest("O término do evento deve ser depois do início.");
      }

      await db.update(events).set(patch).where(eq(events.id, input.id));

      await recordAudit(ctx.actor, {
        action: "EVENT_UPDATED",
        entityType: "event",
        entityId: input.id,
        metadata: { fields: Object.keys(patch) },
        ...requestMeta(ctx),
      });

      return { success: true } as const;
    }),

  /** Publica o evento e avisa os servidores ativos. */
  publish: coordinatorProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();

      const [event] = await db
        .select()
        .from(events)
        .where(and(eq(events.id, input.id), eq(events.parishId, ctx.parishId)))
        .limit(1);
      if (!event) throw notFound("Evento");
      if (event.status === "PUBLISHED") throw badRequest("Este evento já está publicado.");
      if (event.status === "CANCELLED") throw badRequest("Evento cancelado não pode ser publicado.");

      await db.update(events).set({ status: "PUBLISHED" }).where(eq(events.id, input.id));

      // Avisa todos os servidores ativos. Falha de notificação não desfaz a publicação.
      const activeServers = await db
        .select({ id: altarServers.id })
        .from(altarServers)
        .where(
          and(
            eq(altarServers.parishId, ctx.parishId),
            inArray(altarServers.status, ["ACTIVE", "IN_FORMATION"]),
          ),
        );

      for (const server of activeServers) {
        await enqueueNotification({
          parishId: ctx.parishId,
          serverId: server.id,
          type: "EVENT_PUBLISHED",
          title: "Novo evento da paróquia",
          body: `${event.name} foi publicado. Veja os detalhes e confirme sua participação.`,
          referenceType: "event",
          referenceId: event.id,
        });
      }

      await recordAudit(ctx.actor, {
        action: "EVENT_PUBLISHED",
        entityType: "event",
        entityId: input.id,
        metadata: { notified: activeServers.length },
        ...requestMeta(ctx),
      });

      return { success: true } as const;
    }),

  cancel: coordinatorProcedure
    .input(z.object({ id: z.number().int().positive(), reason: z.string().trim().min(3).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();

      const [event] = await db
        .select()
        .from(events)
        .where(and(eq(events.id, input.id), eq(events.parishId, ctx.parishId)))
        .limit(1);
      if (!event) throw notFound("Evento");

      await db.update(events).set({ status: "CANCELLED" }).where(eq(events.id, input.id));

      const participants = await db
        .select({ serverId: eventParticipations.serverId })
        .from(eventParticipations)
        .where(
          and(
            eq(eventParticipations.eventId, input.id),
            eq(eventParticipations.parishId, ctx.parishId),
          ),
        );

      for (const participant of participants) {
        if (!participant.serverId) continue;
        await enqueueNotification({
          parishId: ctx.parishId,
          serverId: participant.serverId,
          type: "EVENT_PUBLISHED",
          title: "Evento cancelado",
          body: `${event.name} foi cancelado. Motivo: ${input.reason}`,
          referenceType: "event",
          referenceId: input.id,
        });
      }

      await recordAudit(ctx.actor, {
        action: "EVENT_CANCELLED",
        entityType: "event",
        entityId: input.id,
        metadata: { reason: input.reason },
        ...requestMeta(ctx),
      });

      return { success: true } as const;
    }),

  /** Encerra as inscrições sem cancelar o evento. */
  closeRegistrations: coordinatorProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();

      const [event] = await db
        .select({ status: events.status })
        .from(events)
        .where(and(eq(events.id, input.id), eq(events.parishId, ctx.parishId)))
        .limit(1);
      if (!event) throw notFound("Evento");
      if (event.status !== "PUBLISHED") {
        throw badRequest("Somente eventos publicados têm inscrições a encerrar.");
      }

      await db.update(events).set({ status: "CLOSED" }).where(eq(events.id, input.id));

      await recordAudit(ctx.actor, {
        action: "EVENT_UPDATED",
        entityType: "event",
        entityId: input.id,
        metadata: { status: "CLOSED" },
        ...requestMeta(ctx),
      });

      return { success: true } as const;
    }),

  /**
   * Arquiva o evento (exclusão lógica).
   * Não há exclusão física: o histórico de participação e voluntariado precisa
   * sobreviver ao encerramento do evento para fins de relatório e auditoria.
   */
  archive: coordinatorProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();

      const [event] = await db
        .select({ status: events.status, startAt: events.startAt })
        .from(events)
        .where(and(eq(events.id, input.id), eq(events.parishId, ctx.parishId)))
        .limit(1);
      if (!event) throw notFound("Evento");
      if (event.status === "ARCHIVED") throw badRequest("Este evento já está arquivado.");

      // Arquivar um evento publicado e futuro esconderia compromissos ativos dos
      // servidores. Cancelar primeiro força o aviso aos inscritos.
      if (event.status === "PUBLISHED" && event.startAt > new Date()) {
        throw badRequest(
          "Cancele o evento antes de arquivar: os inscritos precisam ser avisados.",
        );
      }

      await db.update(events).set({ status: "ARCHIVED" }).where(eq(events.id, input.id));

      await recordAudit(ctx.actor, {
        action: "EVENT_UPDATED",
        entityType: "event",
        entityId: input.id,
        metadata: { status: "ARCHIVED" },
        ...requestMeta(ctx),
      });

      return { success: true } as const;
    }),

  // -------------------------------------------------------------------------
  // Participação
  // -------------------------------------------------------------------------

  participation: router({
    /**
     * Registra a resposta de participação. Acompanhantes entram apenas como
     * quantidade — nunca como cadastro individual.
     */
    respond: parishProcedure
      .input(
        z.object({
          eventId: z.number().int().positive(),
          serverId: z.number().int().positive(),
          response: z.enum(PARTICIPATION_RESPONSES),
          companionsCount: z.number().int().min(0).max(20).default(0),
          note: z.string().trim().max(500).optional().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();
        await assertCanActFor(ctx, input.serverId);

        const [event] = await db
          .select()
          .from(events)
          .where(and(eq(events.id, input.eventId), eq(events.parishId, ctx.parishId)))
          .limit(1);
        if (!event) throw notFound("Evento");
        if (event.status === "DRAFT") throw badRequest("Este evento ainda não foi publicado.");
        if (event.status === "CANCELLED") throw badRequest("Este evento foi cancelado.");

        const isCoordination = ["COORDINATOR", "PARISH_ADMIN", "SUPER_ADMIN"].includes(
          String(ctx.actor.role),
        );

        // A coordenação pode registrar fora do prazo (ex.: inscrição por telefone).
        if (!isCoordination) {
          if (event.status === "CLOSED") throw badRequest("As inscrições foram encerradas.");
          const now = new Date();
          if (event.registrationOpensAt && now < event.registrationOpensAt) {
            throw badRequest("As inscrições ainda não foram abertas.");
          }
          if (event.registrationClosesAt && now > event.registrationClosesAt) {
            throw badRequest("O prazo de inscrição já encerrou.");
          }
        }

        const [server] = await db
          .select({ id: altarServers.id, name: altarServers.name, birthDate: altarServers.birthDate })
          .from(altarServers)
          .where(and(eq(altarServers.id, input.serverId), eq(altarServers.parishId, ctx.parishId)))
          .limit(1);
        if (!server) throw notFound("Servidor");

        // Menor de idade não decide sozinho a participação em evento: a
        // autorização é do responsável. Servidor menor pode registrar interesse,
        // mas a inscrição efetiva precisa vir do responsável ou da coordenação.
        if (
          ctx.actor.type === "SERVER" &&
          isMinor(server.birthDate) &&
          ["REGISTERED", "CONFIRMED"].includes(input.response)
        ) {
          throw forbidden(
            "A inscrição de menor de idade precisa ser feita pelo responsável. Você pode registrar interesse.",
          );
        }

        if (input.companionsCount > 0) {
          if (!event.allowCompanions) {
            throw badRequest("Este evento não permite acompanhantes.");
          }
          if (input.companionsCount > event.maxCompanions) {
            throw badRequest(
              `Máximo de ${event.maxCompanions} acompanhante(s) por servidor.`,
            );
          }
        }

        const [existing] = await db
          .select()
          .from(eventParticipations)
          .where(
            and(
              eq(eventParticipations.eventId, input.eventId),
              eq(eventParticipations.serverId, input.serverId),
              eq(eventParticipations.parishId, ctx.parishId),
            ),
          )
          .limit(1);

        // Limite de participantes conta inscritos + acompanhantes.
        if (
          event.participantLimit &&
          ["REGISTERED", "CONFIRMED"].includes(input.response) &&
          (!existing || !["REGISTERED", "CONFIRMED"].includes(existing.response))
        ) {
          const [current] = await db
            .select({
              total: count(),
              companions: sql<number>`COALESCE(SUM(${eventParticipations.companionsCount}), 0)`,
            })
            .from(eventParticipations)
            .where(
              and(
                eq(eventParticipations.eventId, input.eventId),
                eq(eventParticipations.parishId, ctx.parishId),
                inArray(eventParticipations.response, ["REGISTERED", "CONFIRMED"]),
              ),
            );

          const occupied = Number(current?.total ?? 0) + Number(current?.companions ?? 0);
          if (occupied + 1 + input.companionsCount > event.participantLimit) {
            throw badRequest("As vagas deste evento já foram preenchidas.");
          }
        }

        const respondedByUserId = ctx.actor.type === "USER" ? ctx.actor.user.id : null;
        const respondedByServerId = ctx.actor.type === "SERVER" ? ctx.actor.server.id : null;

        if (existing) {
          await db
            .update(eventParticipations)
            .set({
              response: input.response,
              companionsCount: input.companionsCount,
              note: input.note ?? null,
              respondedByUserId,
              respondedByServerId,
              respondedAt: new Date(),
            })
            .where(eq(eventParticipations.id, existing.id));
        } else {
          await db.insert(eventParticipations).values({
            parishId: ctx.parishId,
            eventId: input.eventId,
            serverId: input.serverId,
            response: input.response,
            companionsCount: input.companionsCount,
            note: input.note ?? null,
            respondedByUserId,
            respondedByServerId,
          });
        }

        await recordAudit(ctx.actor, {
          action: "PARTICIPATION_RECORDED",
          entityType: "event_participation",
          entityId: input.eventId,
          metadata: {
            serverId: input.serverId,
            response: input.response,
            companions: input.companionsCount,
          },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),

    /** Lista participações do evento. Coordenação vê todas. */
    list: coordinatorProcedure
      .input(z.object({ eventId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const rows = await db
          .select({
            id: eventParticipations.id,
            serverId: eventParticipations.serverId,
            serverName: altarServers.name,
            response: eventParticipations.response,
            companionsCount: eventParticipations.companionsCount,
            note: eventParticipations.note,
            respondedAt: eventParticipations.respondedAt,
          })
          .from(eventParticipations)
          .leftJoin(altarServers, eq(altarServers.id, eventParticipations.serverId))
          .where(
            and(
              eq(eventParticipations.eventId, input.eventId),
              eq(eventParticipations.parishId, ctx.parishId),
            ),
          )
          .orderBy(asc(altarServers.name));

        const totalCompanions = rows.reduce((sum, r) => sum + r.companionsCount, 0);

        return {
          participations: rows,
          summary: {
            registered: rows.filter(r => ["REGISTERED", "CONFIRMED"].includes(r.response)).length,
            declined: rows.filter(r => r.response === "DECLINED").length,
            companions: totalCompanions,
          },
        };
      }),

    /** Participações do próprio ator (servidor ou dependentes do responsável). */
    mine: parishProcedure
      .input(z.object({ eventId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDbOrThrow();
        const allowed = await resolveAllowedServerIds(ctx);
        if (allowed !== null && allowed.length === 0) return [];

        const conditions = [
          eq(eventParticipations.eventId, input.eventId),
          eq(eventParticipations.parishId, ctx.parishId),
        ];
        if (allowed !== null) {
          conditions.push(inArray(eventParticipations.serverId, allowed));
        }

        return db
          .select({
            serverId: eventParticipations.serverId,
            serverName: altarServers.name,
            response: eventParticipations.response,
            companionsCount: eventParticipations.companionsCount,
            note: eventParticipations.note,
          })
          .from(eventParticipations)
          .leftJoin(altarServers, eq(altarServers.id, eventParticipations.serverId))
          .where(and(...conditions));
      }),
  }),

  // -------------------------------------------------------------------------
  // Tarefas e turnos
  // -------------------------------------------------------------------------

  tasks: router({
    create: coordinatorProcedure
      .input(
        z.object({
          eventId: z.number().int().positive(),
          name: z.string().trim().min(2).max(180),
          description: z.string().trim().max(1000).optional().nullable(),
          requirements: z.string().trim().max(1000).optional().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [event] = await db
          .select({ id: events.id })
          .from(events)
          .where(and(eq(events.id, input.eventId), eq(events.parishId, ctx.parishId)))
          .limit(1);
        if (!event) throw notFound("Evento");

        await db.insert(eventTasks).values({
          parishId: ctx.parishId,
          eventId: input.eventId,
          name: input.name,
          description: input.description ?? null,
          requirements: input.requirements ?? null,
        });

        return { success: true } as const;
      }),

    update: coordinatorProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          name: z.string().trim().min(2).max(180).optional(),
          description: z.string().trim().max(1000).optional().nullable(),
          requirements: z.string().trim().max(1000).optional().nullable(),
          status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [task] = await db
          .select({ id: eventTasks.id })
          .from(eventTasks)
          .where(and(eq(eventTasks.id, input.id), eq(eventTasks.parishId, ctx.parishId)))
          .limit(1);
        if (!task) throw notFound("Tarefa");

        const { id, ...rest } = input;
        const patch: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(rest)) {
          if (value !== undefined) patch[key] = value;
        }
        if (Object.keys(patch).length === 0) return { success: true } as const;

        await db.update(eventTasks).set(patch).where(eq(eventTasks.id, id));
        return { success: true } as const;
      }),
  }),

  shifts: router({
    create: coordinatorProcedure
      .input(
        z.object({
          eventTaskId: z.number().int().positive(),
          date: dateSchema,
          startTime: timeSchema,
          endTime: timeSchema,
          slots: z.number().int().min(1).max(100).default(1),
          notes: z.string().trim().max(500).optional().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [task] = await db
          .select({ id: eventTasks.id, eventId: eventTasks.eventId })
          .from(eventTasks)
          .where(and(eq(eventTasks.id, input.eventTaskId), eq(eventTasks.parishId, ctx.parishId)))
          .limit(1);
        if (!task) throw notFound("Tarefa");

        const startTime = normalizeTime(input.startTime);
        const endTime = normalizeTime(input.endTime);
        if (endTime <= startTime) {
          throw badRequest("O término do turno deve ser depois do início.");
        }

        await db.insert(eventShifts).values({
          parishId: ctx.parishId,
          eventId: task.eventId,
          eventTaskId: input.eventTaskId,
          date: input.date,
          startTime,
          endTime,
          slots: input.slots,
          notes: input.notes ?? null,
        });

        return { success: true } as const;
      }),

    update: coordinatorProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          date: dateSchema.optional(),
          startTime: timeSchema.optional(),
          endTime: timeSchema.optional(),
          slots: z.number().int().min(1).max(100).optional(),
          notes: z.string().trim().max(500).optional().nullable(),
          status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [shift] = await db
          .select()
          .from(eventShifts)
          .where(and(eq(eventShifts.id, input.id), eq(eventShifts.parishId, ctx.parishId)))
          .limit(1);
        if (!shift) throw notFound("Turno");

        const startTime = input.startTime ? normalizeTime(input.startTime) : shift.startTime;
        const endTime = input.endTime ? normalizeTime(input.endTime) : shift.endTime;
        if (endTime <= startTime) {
          throw badRequest("O término do turno deve ser depois do início.");
        }

        // Reduzir vagas abaixo do já alocado deixaria o turno inconsistente.
        if (input.slots !== undefined) {
          const [assigned] = await db
            .select({ total: count() })
            .from(eventShiftAssignments)
            .where(
              and(
                eq(eventShiftAssignments.eventShiftId, input.id),
                eq(eventShiftAssignments.parishId, ctx.parishId),
                inArray(eventShiftAssignments.status, ["ASSIGNED", "CONFIRMED"]),
              ),
            );
          if (Number(assigned?.total ?? 0) > input.slots) {
            throw badRequest(
              `Já existem ${assigned?.total} voluntários alocados. Remova alocações antes de reduzir as vagas.`,
            );
          }
        }

        const patch: Record<string, unknown> = { startTime, endTime };
        if (input.date !== undefined) patch.date = input.date;
        if (input.slots !== undefined) patch.slots = input.slots;
        if (input.notes !== undefined) patch.notes = input.notes;
        if (input.status !== undefined) patch.status = input.status;

        await db.update(eventShifts).set(patch).where(eq(eventShifts.id, input.id));
        return { success: true } as const;
      }),
  }),

  // -------------------------------------------------------------------------
  // Voluntariado
  // -------------------------------------------------------------------------

  volunteering: router({
    /** Manifesta interesse em um turno. Interesse não é obrigação nem alocação. */
    express: parishProcedure
      .input(
        z.object({
          eventShiftId: z.number().int().positive(),
          serverId: z.number().int().positive(),
          availabilityNote: z.string().trim().max(500).optional().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();
        await assertCanActFor(ctx, input.serverId);

        const [shift] = await db
          .select()
          .from(eventShifts)
          .where(
            and(eq(eventShifts.id, input.eventShiftId), eq(eventShifts.parishId, ctx.parishId)),
          )
          .limit(1);
        if (!shift) throw notFound("Turno");
        if (shift.status !== "ACTIVE") throw badRequest("Este turno não está ativo.");

        const [event] = await db
          .select({ status: events.status, title: events.name })
          .from(events)
          .where(eq(events.id, shift.eventId))
          .limit(1);
        if (!event || event.status === "DRAFT") {
          throw badRequest("Este evento ainda não está aberto para voluntariado.");
        }
        if (event.status === "CANCELLED") throw badRequest("Este evento foi cancelado.");

        const [existing] = await db
          .select({ id: volunteerInterestsRef.id, status: volunteerInterestsRef.status })
          .from(volunteerInterestsRef)
          .where(
            and(
              eq(volunteerInterestsRef.eventShiftId, input.eventShiftId),
              eq(volunteerInterestsRef.serverId, input.serverId),
              eq(volunteerInterestsRef.parishId, ctx.parishId),
            ),
          )
          .limit(1);

        if (existing) {
          await db
            .update(volunteerInterestsRef)
            .set({ status: "INTERESTED", availabilityNote: input.availabilityNote ?? null })
            .where(eq(volunteerInterestsRef.id, existing.id));
        } else {
          await db.insert(volunteerInterestsRef).values({
            parishId: ctx.parishId,
            eventId: shift.eventId,
            eventShiftId: input.eventShiftId,
            eventTaskId: shift.eventTaskId,
            serverId: input.serverId,
            availabilityNote: input.availabilityNote ?? null,
            status: "INTERESTED",
          });
        }

        await recordAudit(ctx.actor, {
          action: "VOLUNTEER_INTEREST_RECORDED",
          entityType: "event_shift",
          entityId: input.eventShiftId,
          metadata: { serverId: input.serverId },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),

    /** Retira a manifestação de interesse. */
    withdraw: parishProcedure
      .input(
        z.object({
          eventShiftId: z.number().int().positive(),
          serverId: z.number().int().positive(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();
        await assertCanActFor(ctx, input.serverId);

        await db
          .update(volunteerInterestsRef)
          .set({ status: "WITHDRAWN" })
          .where(
            and(
              eq(volunteerInterestsRef.eventShiftId, input.eventShiftId),
              eq(volunteerInterestsRef.serverId, input.serverId),
              eq(volunteerInterestsRef.parishId, ctx.parishId),
            ),
          );

        // Se já havia alocação, ela também é cancelada: a coordenação é avisada
        // pela listagem de vagas em aberto.
        await db
          .update(eventShiftAssignments)
          .set({ status: "CANCELLED" })
          .where(
            and(
              eq(eventShiftAssignments.eventShiftId, input.eventShiftId),
              eq(eventShiftAssignments.serverId, input.serverId),
              eq(eventShiftAssignments.parishId, ctx.parishId),
              inArray(eventShiftAssignments.status, ["ASSIGNED", "CONFIRMED"]),
            ),
          );

        return { success: true } as const;
      }),

    /** Lista os interessados em um turno, para a coordenação alocar. */
    interests: coordinatorProcedure
      .input(z.object({ eventShiftId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const rows = await db
          .select({
            id: volunteerInterestsRef.id,
            serverId: volunteerInterestsRef.serverId,
            serverName: altarServers.name,
            birthDate: altarServers.birthDate,
            availabilityNote: volunteerInterestsRef.availabilityNote,
            status: volunteerInterestsRef.status,
          })
          .from(volunteerInterestsRef)
          .leftJoin(altarServers, eq(altarServers.id, volunteerInterestsRef.serverId))
          .where(
            and(
              eq(volunteerInterestsRef.eventShiftId, input.eventShiftId),
              eq(volunteerInterestsRef.parishId, ctx.parishId),
              eq(volunteerInterestsRef.status, "INTERESTED"),
            ),
          )
          .orderBy(asc(altarServers.name));

        const assigned = await db
          .select({ serverId: eventShiftAssignments.serverId })
          .from(eventShiftAssignments)
          .where(
            and(
              eq(eventShiftAssignments.eventShiftId, input.eventShiftId),
              eq(eventShiftAssignments.parishId, ctx.parishId),
              inArray(eventShiftAssignments.status, ["ASSIGNED", "CONFIRMED"]),
            ),
          );
        const assignedIds = new Set(assigned.map(a => a.serverId));

        return rows.map(row => ({
          ...row,
          isMinor: row.birthDate ? isMinor(row.birthDate) : false,
          alreadyAssigned: assignedIds.has(row.serverId),
        }));
      }),

    /**
     * Aloca um voluntário em um turno.
     * Regra estrutural: exige manifestação de interesse ativa. Ninguém é
     * escalado para voluntariado sem ter se oferecido.
     */
    assign: coordinatorProcedure
      .input(
        z.object({
          eventShiftId: z.number().int().positive(),
          serverId: z.number().int().positive(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [shift] = await db
          .select()
          .from(eventShifts)
          .where(
            and(eq(eventShifts.id, input.eventShiftId), eq(eventShifts.parishId, ctx.parishId)),
          )
          .limit(1);
        if (!shift) throw notFound("Turno");

        const [interest] = await db
          .select({ id: volunteerInterestsRef.id })
          .from(volunteerInterestsRef)
          .where(
            and(
              eq(volunteerInterestsRef.eventShiftId, input.eventShiftId),
              eq(volunteerInterestsRef.serverId, input.serverId),
              eq(volunteerInterestsRef.parishId, ctx.parishId),
              eq(volunteerInterestsRef.status, "INTERESTED"),
            ),
          )
          .limit(1);

        if (!interest) {
          throw badRequest(
            "Este servidor não manifestou interesse neste turno. O voluntariado depende de adesão voluntária.",
          );
        }

        const [current] = await db
          .select({ total: count() })
          .from(eventShiftAssignments)
          .where(
            and(
              eq(eventShiftAssignments.eventShiftId, input.eventShiftId),
              inArray(eventShiftAssignments.status, ["ASSIGNED", "CONFIRMED"]),
            ),
          );

        if (Number(current?.total ?? 0) >= shift.slots) {
          throw badRequest("Este turno já está com todas as vagas preenchidas.");
        }

        const [existing] = await db
          .select({ id: eventShiftAssignments.id, status: eventShiftAssignments.status })
          .from(eventShiftAssignments)
          .where(
            and(
              eq(eventShiftAssignments.eventShiftId, input.eventShiftId),
              eq(eventShiftAssignments.serverId, input.serverId),
              eq(eventShiftAssignments.parishId, ctx.parishId),
            ),
          )
          .limit(1);

        if (existing) {
          if (["ASSIGNED", "CONFIRMED"].includes(existing.status)) {
            throw badRequest("Este servidor já está alocado neste turno.");
          }
          await db
            .update(eventShiftAssignments)
            .set({
              status: "ASSIGNED",
              approvedByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
              assignedAt: new Date(),
            })
            .where(eq(eventShiftAssignments.id, existing.id));
        } else {
          await db.insert(eventShiftAssignments).values({
            parishId: ctx.parishId,
            eventId: shift.eventId,
            eventShiftId: input.eventShiftId,
            serverId: input.serverId,
            source: "MANUAL",
            status: "ASSIGNED",
            approvedByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
          });
        }

        await enqueueNotification({
          parishId: ctx.parishId,
          serverId: input.serverId,
          type: "SHIFT_ASSIGNED",
          title: "Você foi alocado em um turno de voluntariado",
          body: `Turno em ${formatDate(shift.date)}, das ${shift.startTime.slice(0, 5)} às ${shift.endTime.slice(0, 5)}.`,
          referenceType: "event_shift",
          referenceId: input.eventShiftId,
        });

        await recordAudit(ctx.actor, {
          action: "SHIFT_ASSIGNMENT_CREATED",
          entityType: "event_shift",
          entityId: input.eventShiftId,
          metadata: { serverId: input.serverId },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),

    /** Cancela a alocação de um voluntário em um turno. */
    unassign: coordinatorProcedure
      .input(
        z.object({
          eventShiftId: z.number().int().positive(),
          serverId: z.number().int().positive(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        await db
          .update(eventShiftAssignments)
          .set({ status: "CANCELLED" })
          .where(
            and(
              eq(eventShiftAssignments.eventShiftId, input.eventShiftId),
              eq(eventShiftAssignments.serverId, input.serverId),
              eq(eventShiftAssignments.parishId, ctx.parishId),
              inArray(eventShiftAssignments.status, ["ASSIGNED", "CONFIRMED"]),
            ),
          );

        await recordAudit(ctx.actor, {
          action: "SHIFT_ASSIGNMENT_CANCELLED",
          entityType: "event_shift",
          entityId: input.eventShiftId,
          metadata: { serverId: input.serverId },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),

    /** Confirma a participação no turno alocado. */
    confirm: parishProcedure
      .input(
        z.object({
          eventShiftId: z.number().int().positive(),
          serverId: z.number().int().positive(),
          accept: z.boolean(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();
        await assertCanActFor(ctx, input.serverId);

        const [assignment] = await db
          .select()
          .from(eventShiftAssignments)
          .where(
            and(
              eq(eventShiftAssignments.eventShiftId, input.eventShiftId),
              eq(eventShiftAssignments.serverId, input.serverId),
              eq(eventShiftAssignments.parishId, ctx.parishId),
            ),
          )
          .limit(1);
        if (!assignment) throw notFound("Alocação de turno");
        if (assignment.status === "CANCELLED") throw badRequest("Esta alocação foi cancelada.");

        await db
          .update(eventShiftAssignments)
          .set({
            status: input.accept ? "CONFIRMED" : "DECLINED",
            confirmedAt: input.accept ? new Date() : null,
          })
          .where(eq(eventShiftAssignments.id, assignment.id));

        return { success: true } as const;
      }),

    /**
     * Registra o cumprimento do turno e concede os pontos correspondentes.
     * Idempotente: reexecutar não duplica pontos.
     */
    markCompleted: coordinatorProcedure
      .input(
        z.object({
          eventShiftId: z.number().int().positive(),
          serverIds: z.array(z.number().int().positive()).min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const assignments = await db
          .select({
            id: eventShiftAssignments.id,
            serverId: sql<number>`${eventShiftAssignments.serverId}`,
          })
          .from(eventShiftAssignments)
          .where(
            and(
              eq(eventShiftAssignments.eventShiftId, input.eventShiftId),
              eq(eventShiftAssignments.parishId, ctx.parishId),
              inArray(eventShiftAssignments.serverId, input.serverIds),
              inArray(eventShiftAssignments.status, ["ASSIGNED", "CONFIRMED"]),
            ),
          );

        if (assignments.length === 0) {
          throw badRequest("Nenhuma alocação ativa encontrada para os servidores informados.");
        }

        const userId = ctx.actor.type === "USER" ? ctx.actor.user.id : null;
        let granted = 0;

        for (const assignment of assignments) {
          await db
            .update(eventShiftAssignments)
            .set({ status: "CONFIRMED", confirmedAt: new Date() })
            .where(eq(eventShiftAssignments.id, assignment.id));

          const result = await grantPoints({
            parishId: ctx.parishId,
            serverId: assignment.serverId,
            eventType: "VOLUNTEER_SHIFT_DONE",
            referenceType: "event_shift_assignment",
            referenceId: assignment.id,
            createdByUserId: userId,
          });
          if (result.granted) granted += 1;
        }

        await recordAudit(ctx.actor, {
          action: "SHIFT_ASSIGNMENT_CREATED",
          entityType: "event_shift",
          entityId: input.eventShiftId,
          metadata: { completed: assignments.length, pointsGranted: granted },
          ...requestMeta(ctx),
        });

        return { completed: assignments.length, pointsGranted: granted } as const;
      }),
  }),
});

function formatDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
