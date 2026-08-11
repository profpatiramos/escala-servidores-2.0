/**
 * Router de funções litúrgicas, habilitações, formações, disponibilidade,
 * exceções, férias e preferências.
 *
 * Todas as escritas são escopadas por `ctx.parishId`, derivado da sessão.
 * Responsáveis podem manter a disponibilidade dos próprios dependentes;
 * servidores podem manter a sua própria. A coordenação pode manter a de todos.
 */
import {
  AVAILABILITY_SCOPES,
  AVAILABILITY_TYPES,
  DAY_PERIODS,
  EXCEPTION_TYPES,
  FORMATION_STATUS,
  QUALIFICATION_STATUS,
  SECURITY,
  isMinor,
  timeRangesOverlap,
} from "@shared/domain";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";

import {
  altarServers,
  availabilities,
  availabilityExceptions,
  familyLinks,
  formations,
  parishRoles,
  schedulePreferences,
  serverRoles,
  vacations,
} from "../../drizzle/schema";
import { getDbOrThrow } from "../db";
import { recordAudit } from "../services/audit";
import {
  authedProcedure,
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

/** Normaliza o horário para HH:MM:SS, formato aceito pela coluna TIME. */
function normalizeTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

/**
 * Autoriza a manutenção de dados de um servidor específico.
 *
 * - Coordenação e administração: qualquer servidor da paróquia.
 * - Responsável: apenas dependentes com vínculo ativo.
 * - Servidor: apenas o próprio registro.
 */
export async function assertCanManageServer(
  ctx: { actor: { type: "USER" | "SERVER"; role: string; responsibleId?: number | null; server?: { id: number } }; parishId: number },
  serverId: number,
): Promise<void> {
  const db = await getDbOrThrow();

  const [server] = await db
    .select({ id: altarServers.id })
    .from(altarServers)
    .where(and(eq(altarServers.id, serverId), eq(altarServers.parishId, ctx.parishId)))
    .limit(1);
  if (!server) throw notFound("Servidor");

  if (["SUPER_ADMIN", "PARISH_ADMIN", "COORDINATOR"].includes(ctx.actor.role)) return;

  if (ctx.actor.role === "SERVER") {
    if (ctx.actor.server?.id !== serverId) {
      throw forbidden("Você só pode alterar a sua própria disponibilidade.");
    }
    return;
  }

  if (ctx.actor.role === "RESPONSIBLE") {
    const responsibleId = ctx.actor.responsibleId;
    if (!responsibleId) throw forbidden("Cadastro de responsável não localizado.");

    const [link] = await db
      .select({ id: familyLinks.id })
      .from(familyLinks)
      .where(
        and(
          eq(familyLinks.parishId, ctx.parishId),
          eq(familyLinks.responsibleId, responsibleId),
          eq(familyLinks.serverId, serverId),
          eq(familyLinks.status, "ACTIVE"),
        ),
      )
      .limit(1);
    if (!link) throw forbidden("Este servidor não está vinculado a você.");
    return;
  }

  throw forbidden();
}

/** Resolve os IDs de servidores que o ator pode consultar. */
export async function visibleServerIds(ctx: {
  actor: { role: string; responsibleId?: number | null; server?: { id: number } };
  parishId: number;
}): Promise<number[] | "ALL"> {
  if (["SUPER_ADMIN", "PARISH_ADMIN", "COORDINATOR"].includes(ctx.actor.role)) return "ALL";

  if (ctx.actor.role === "SERVER") return ctx.actor.server ? [ctx.actor.server.id] : [];

  if (ctx.actor.role === "RESPONSIBLE" && ctx.actor.responsibleId) {
    const db = await getDbOrThrow();
    const rows = await db
      .select({ serverId: familyLinks.serverId })
      .from(familyLinks)
      .where(
        and(
          eq(familyLinks.parishId, ctx.parishId),
          eq(familyLinks.responsibleId, ctx.actor.responsibleId),
          eq(familyLinks.status, "ACTIVE"),
        ),
      );
    return rows.map(r => r.serverId);
  }

  return [];
}

export const availabilityRouter = router({
  // =========================================================================
  // FUNÇÕES LITÚRGICAS
  // =========================================================================
  roles: router({
    list: parishProcedure
      .input(z.object({ includeInactive: z.boolean().default(false) }).default({ includeInactive: false }))
      .query(async ({ ctx, input }) => {
        const db = await getDbOrThrow();
        const conditions = [eq(parishRoles.parishId, ctx.parishId)];
        if (!input.includeInactive) conditions.push(eq(parishRoles.status, "ACTIVE"));

        return db
          .select()
          .from(parishRoles)
          .where(and(...conditions))
          .orderBy(asc(parishRoles.displayOrder), asc(parishRoles.name));
      }),

    create: coordinatorProcedure
      .input(
        z.object({
          name: z.string().trim().min(2, "Informe o nome da função."),
          description: z.string().trim().max(500).optional().nullable(),
          minAge: z.number().int().min(0).max(99).optional().nullable(),
          requiresQualification: z.boolean().default(true),
          displayOrder: z.number().int().min(0).max(999).default(0),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [duplicate] = await db
          .select({ id: parishRoles.id })
          .from(parishRoles)
          .where(and(eq(parishRoles.parishId, ctx.parishId), eq(parishRoles.name, input.name)))
          .limit(1);
        if (duplicate) throw badRequest("Já existe uma função com este nome.");

        await db.insert(parishRoles).values({
          parishId: ctx.parishId,
          name: input.name,
          description: input.description ?? null,
          minAge: input.minAge ?? null,
          requiresQualification: input.requiresQualification,
          displayOrder: input.displayOrder,
          status: "ACTIVE",
        });

        await recordAudit(ctx.actor, {
          action: "ROLE_CREATED",
          entityType: "parish_role",
          metadata: { name: input.name },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),

    update: coordinatorProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          name: z.string().trim().min(2).optional(),
          description: z.string().trim().max(500).optional().nullable(),
          minAge: z.number().int().min(0).max(99).optional().nullable(),
          requiresQualification: z.boolean().optional(),
          displayOrder: z.number().int().min(0).max(999).optional(),
          status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [existing] = await db
          .select()
          .from(parishRoles)
          .where(and(eq(parishRoles.id, input.id), eq(parishRoles.parishId, ctx.parishId)))
          .limit(1);
        if (!existing) throw notFound("Função");

        await db
          .update(parishRoles)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.minAge !== undefined ? { minAge: input.minAge } : {}),
            ...(input.requiresQualification !== undefined
              ? { requiresQualification: input.requiresQualification }
              : {}),
            ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
          })
          .where(eq(parishRoles.id, input.id));

        await recordAudit(ctx.actor, {
          action: "ROLE_UPDATED",
          entityType: "parish_role",
          entityId: input.id,
          metadata: { fields: Object.keys(input).filter(k => k !== "id") },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),
  }),

  // =========================================================================
  // HABILITAÇÕES DO SERVIDOR
  // =========================================================================
  qualifications: router({
    /**
     * Define a habilitação de um servidor para uma função.
     * A idade mínima da função é validada contra a idade derivada do nascimento.
     */
    set: coordinatorProcedure
      .input(
        z.object({
          serverId: z.number().int().positive(),
          parishRoleId: z.number().int().positive(),
          qualificationStatus: z.enum(QUALIFICATION_STATUS),
          qualifiedAt: dateSchema.optional().nullable(),
          validUntil: dateSchema.optional().nullable(),
          notes: z.string().trim().max(500).optional().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [server] = await db
          .select({ id: altarServers.id, birthDate: altarServers.birthDate, name: altarServers.name })
          .from(altarServers)
          .where(and(eq(altarServers.id, input.serverId), eq(altarServers.parishId, ctx.parishId)))
          .limit(1);
        if (!server) throw notFound("Servidor");

        const [role] = await db
          .select()
          .from(parishRoles)
          .where(and(eq(parishRoles.id, input.parishRoleId), eq(parishRoles.parishId, ctx.parishId)))
          .limit(1);
        if (!role) throw notFound("Função");

        // Idade mínima é bloqueio de habilitação, não apenas aviso.
        if (role.minAge !== null && input.qualificationStatus === "QUALIFIED") {
          const { calculateAge } = await import("@shared/domain");
          const age = calculateAge(server.birthDate);
          if (age < role.minAge) {
            throw badRequest(
              `${server.name} tem ${age} anos e a função ${role.name} exige idade mínima de ${role.minAge} anos.`,
            );
          }
        }

        const [existing] = await db
          .select({ id: serverRoles.id })
          .from(serverRoles)
          .where(
            and(
              eq(serverRoles.serverId, input.serverId),
              eq(serverRoles.parishRoleId, input.parishRoleId),
            ),
          )
          .limit(1);

        if (existing) {
          await db
            .update(serverRoles)
            .set({
              qualificationStatus: input.qualificationStatus,
              qualifiedAt: input.qualifiedAt ?? null,
              validUntil: input.validUntil ?? null,
              notes: input.notes ?? null,
            })
            .where(eq(serverRoles.id, existing.id));
        } else {
          await db.insert(serverRoles).values({
            parishId: ctx.parishId,
            serverId: input.serverId,
            parishRoleId: input.parishRoleId,
            qualificationStatus: input.qualificationStatus,
            qualifiedAt: input.qualifiedAt ?? null,
            validUntil: input.validUntil ?? null,
            notes: input.notes ?? null,
          });
        }

        await recordAudit(ctx.actor, {
          action: "QUALIFICATION_UPDATED",
          entityType: "server_role",
          entityId: input.serverId,
          metadata: {
            parishRoleId: input.parishRoleId,
            qualificationStatus: input.qualificationStatus,
          },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),

    remove: coordinatorProcedure
      .input(z.object({ serverId: z.number().int().positive(), parishRoleId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [existing] = await db
          .select({ id: serverRoles.id })
          .from(serverRoles)
          .where(
            and(
              eq(serverRoles.parishId, ctx.parishId),
              eq(serverRoles.serverId, input.serverId),
              eq(serverRoles.parishRoleId, input.parishRoleId),
            ),
          )
          .limit(1);
        if (!existing) throw notFound("Habilitação");

        await db.delete(serverRoles).where(eq(serverRoles.id, existing.id));

        await recordAudit(ctx.actor, {
          action: "QUALIFICATION_REMOVED",
          entityType: "server_role",
          entityId: input.serverId,
          metadata: { parishRoleId: input.parishRoleId },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),
  }),

  // =========================================================================
  // FORMAÇÕES
  // =========================================================================
  formations: router({
    listByServer: parishProcedure
      .input(z.object({ serverId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        await assertCanManageServer(ctx as never, input.serverId);
        const db = await getDbOrThrow();
        return db
          .select()
          .from(formations)
          .where(and(eq(formations.parishId, ctx.parishId), eq(formations.serverId, input.serverId)))
          .orderBy(desc(formations.startedAt));
      }),

    create: coordinatorProcedure
      .input(
        z.object({
          serverId: z.number().int().positive(),
          name: z.string().trim().min(2, "Informe o nome da formação."),
          description: z.string().trim().max(1000).optional().nullable(),
          parishRoleId: z.number().int().positive().optional().nullable(),
          status: z.enum(FORMATION_STATUS).default("IN_PROGRESS"),
          startedAt: dateSchema.optional().nullable(),
          completedAt: dateSchema.optional().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [server] = await db
          .select({ id: altarServers.id })
          .from(altarServers)
          .where(and(eq(altarServers.id, input.serverId), eq(altarServers.parishId, ctx.parishId)))
          .limit(1);
        if (!server) throw notFound("Servidor");

        if (input.status === "COMPLETED" && !input.completedAt) {
          throw badRequest("Informe a data de conclusão para uma formação concluída.");
        }

        await db.insert(formations).values({
          parishId: ctx.parishId,
          serverId: input.serverId,
          name: input.name,
          description: input.description ?? null,
          parishRoleId: input.parishRoleId ?? null,
          status: input.status,
          startedAt: input.startedAt ?? null,
          completedAt: input.completedAt ?? null,
          registeredByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
        });

        await recordAudit(ctx.actor, {
          action: "FORMATION_CREATED",
          entityType: "formation",
          entityId: input.serverId,
          metadata: { name: input.name, status: input.status },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),

    update: coordinatorProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          name: z.string().trim().min(2).optional(),
          description: z.string().trim().max(1000).optional().nullable(),
          status: z.enum(FORMATION_STATUS).optional(),
          startedAt: dateSchema.optional().nullable(),
          completedAt: dateSchema.optional().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [existing] = await db
          .select()
          .from(formations)
          .where(and(eq(formations.id, input.id), eq(formations.parishId, ctx.parishId)))
          .limit(1);
        if (!existing) throw notFound("Formação");

        await db
          .update(formations)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
            ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
          })
          .where(eq(formations.id, input.id));

        await recordAudit(ctx.actor, {
          action: "FORMATION_UPDATED",
          entityType: "formation",
          entityId: input.id,
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),
  }),

  // =========================================================================
  // DISPONIBILIDADE RECORRENTE
  // =========================================================================
  recurring: router({
    /** Lista a disponibilidade recorrente visível ao ator. */
    list: parishProcedure
      .input(z.object({ serverId: z.number().int().positive().optional() }).default({}))
      .query(async ({ ctx, input }) => {
        const db = await getDbOrThrow();
        const allowed = await visibleServerIds(ctx as never);

        if (allowed !== "ALL" && allowed.length === 0) return [];

        const conditions = [eq(availabilities.parishId, ctx.parishId), eq(availabilities.status, "ACTIVE")];

        if (input.serverId) {
          if (allowed !== "ALL" && !allowed.includes(input.serverId)) {
            throw forbidden("Você não tem acesso à disponibilidade deste servidor.");
          }
          conditions.push(eq(availabilities.serverId, input.serverId));
        } else if (allowed !== "ALL") {
          conditions.push(inArray(availabilities.serverId, allowed));
        }

        return db
          .select({
            id: availabilities.id,
            serverId: availabilities.serverId,
            serverName: altarServers.name,
            scope: availabilities.scope,
            weekday: availabilities.weekday,
            startTime: availabilities.startTime,
            endTime: availabilities.endTime,
            availabilityType: availabilities.availabilityType,
            effectiveFrom: availabilities.effectiveFrom,
            effectiveUntil: availabilities.effectiveUntil,
            notes: availabilities.notes,
          })
          .from(availabilities)
          .innerJoin(altarServers, eq(altarServers.id, availabilities.serverId))
          .where(and(...conditions))
          .orderBy(asc(availabilities.weekday), asc(availabilities.startTime));
      }),

    /** Cria uma janela recorrente semanal, rejeitando sobreposição no mesmo escopo. */
    create: parishProcedure
      .input(
        z.object({
          serverId: z.number().int().positive(),
          scope: z.enum(AVAILABILITY_SCOPES).default("SERVER"),
          weekday: z.number().int().min(0).max(6),
          startTime: timeSchema,
          endTime: timeSchema,
          availabilityType: z.enum(AVAILABILITY_TYPES).default("AVAILABLE"),
          effectiveFrom: dateSchema.optional().nullable(),
          effectiveUntil: dateSchema.optional().nullable(),
          notes: z.string().trim().max(500).optional().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertCanManageServer(ctx as never, input.serverId);

        const startTime = normalizeTime(input.startTime);
        const endTime = normalizeTime(input.endTime);
        if (startTime >= endTime) throw badRequest("O horário final deve ser depois do inicial.");

        if (input.effectiveFrom && input.effectiveUntil && input.effectiveFrom > input.effectiveUntil) {
          throw badRequest("A data final da vigência deve ser depois da inicial.");
        }

        const db = await getDbOrThrow();

        const sameScope = await db
          .select({ startTime: availabilities.startTime, endTime: availabilities.endTime })
          .from(availabilities)
          .where(
            and(
              eq(availabilities.parishId, ctx.parishId),
              eq(availabilities.serverId, input.serverId),
              eq(availabilities.scope, input.scope),
              eq(availabilities.weekday, input.weekday),
              eq(availabilities.availabilityType, input.availabilityType),
              eq(availabilities.status, "ACTIVE"),
            ),
          );

        const overlapping = sameScope.some(row =>
          timeRangesOverlap(row.startTime, row.endTime, startTime, endTime),
        );
        if (overlapping) {
          throw badRequest("Já existe uma janela cadastrada que se sobrepõe a este horário.");
        }

        await db.insert(availabilities).values({
          parishId: ctx.parishId,
          serverId: input.serverId,
          scope: input.scope,
          weekday: input.weekday,
          startTime,
          endTime,
          availabilityType: input.availabilityType,
          effectiveFrom: input.effectiveFrom ?? null,
          effectiveUntil: input.effectiveUntil ?? null,
          notes: input.notes ?? null,
          status: "ACTIVE",
          createdByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
        });

        await recordAudit(ctx.actor, {
          action: "AVAILABILITY_UPDATED",
          entityType: "availability",
          entityId: input.serverId,
          metadata: { scope: input.scope, weekday: input.weekday, startTime, endTime },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),

    /** Desativa uma janela recorrente, preservando o histórico. */
    remove: parishProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [existing] = await db
          .select()
          .from(availabilities)
          .where(and(eq(availabilities.id, input.id), eq(availabilities.parishId, ctx.parishId)))
          .limit(1);
        if (!existing) throw notFound("Disponibilidade");

        await assertCanManageServer(ctx as never, existing.serverId);

        await db.update(availabilities).set({ status: "INACTIVE" }).where(eq(availabilities.id, input.id));

        await recordAudit(ctx.actor, {
          action: "AVAILABILITY_UPDATED",
          entityType: "availability",
          entityId: existing.serverId,
          metadata: { removed: input.id },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),
  }),

  // =========================================================================
  // EXCEÇÕES PONTUAIS
  // =========================================================================
  exceptions: router({
    list: parishProcedure
      .input(
        z.object({
          serverId: z.number().int().positive().optional(),
          from: dateSchema,
          to: dateSchema,
        }),
      )
      .query(async ({ ctx, input }) => {
        const db = await getDbOrThrow();
        const allowed = await visibleServerIds(ctx as never);
        if (allowed !== "ALL" && allowed.length === 0) return [];

        const conditions = [
          eq(availabilityExceptions.parishId, ctx.parishId),
          gte(availabilityExceptions.date, input.from),
          lte(availabilityExceptions.date, input.to),
        ];

        if (input.serverId) {
          if (allowed !== "ALL" && !allowed.includes(input.serverId)) {
            throw forbidden("Você não tem acesso aos dados deste servidor.");
          }
          conditions.push(eq(availabilityExceptions.serverId, input.serverId));
        } else if (allowed !== "ALL") {
          conditions.push(inArray(availabilityExceptions.serverId, allowed));
        }

        return db
          .select({
            id: availabilityExceptions.id,
            serverId: availabilityExceptions.serverId,
            serverName: altarServers.name,
            scope: availabilityExceptions.scope,
            date: availabilityExceptions.date,
            startTime: availabilityExceptions.startTime,
            endTime: availabilityExceptions.endTime,
            exceptionType: availabilityExceptions.exceptionType,
            reason: availabilityExceptions.reason,
          })
          .from(availabilityExceptions)
          .innerJoin(altarServers, eq(altarServers.id, availabilityExceptions.serverId))
          .where(and(...conditions))
          .orderBy(asc(availabilityExceptions.date));
      }),

    create: parishProcedure
      .input(
        z.object({
          serverId: z.number().int().positive(),
          scope: z.enum(AVAILABILITY_SCOPES).default("SERVER"),
          date: dateSchema,
          startTime: timeSchema.optional().nullable(),
          endTime: timeSchema.optional().nullable(),
          exceptionType: z.enum(EXCEPTION_TYPES).default("UNAVAILABLE"),
          reason: z.string().trim().max(500).optional().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertCanManageServer(ctx as never, input.serverId);

        const startTime = input.startTime ? normalizeTime(input.startTime) : null;
        const endTime = input.endTime ? normalizeTime(input.endTime) : null;

        if ((startTime && !endTime) || (!startTime && endTime)) {
          throw badRequest("Informe os dois horários ou nenhum, para indicar o dia inteiro.");
        }
        if (startTime && endTime && startTime >= endTime) {
          throw badRequest("O horário final deve ser depois do inicial.");
        }

        const db = await getDbOrThrow();
        await db.insert(availabilityExceptions).values({
          parishId: ctx.parishId,
          serverId: input.serverId,
          scope: input.scope,
          date: input.date,
          startTime,
          endTime,
          exceptionType: input.exceptionType,
          reason: input.reason ?? null,
          createdByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
        });

        await recordAudit(ctx.actor, {
          action: "AVAILABILITY_EXCEPTION_CREATED",
          entityType: "availability_exception",
          entityId: input.serverId,
          metadata: { date: input.date, exceptionType: input.exceptionType },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),

    remove: parishProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [existing] = await db
          .select()
          .from(availabilityExceptions)
          .where(
            and(
              eq(availabilityExceptions.id, input.id),
              eq(availabilityExceptions.parishId, ctx.parishId),
            ),
          )
          .limit(1);
        if (!existing) throw notFound("Exceção");

        await assertCanManageServer(ctx as never, existing.serverId);
        await db.delete(availabilityExceptions).where(eq(availabilityExceptions.id, input.id));

        await recordAudit(ctx.actor, {
          action: "AVAILABILITY_EXCEPTION_REMOVED",
          entityType: "availability_exception",
          entityId: existing.serverId,
          metadata: { date: existing.date },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),
  }),

  // =========================================================================
  // FÉRIAS
  // =========================================================================
  vacations: router({
    list: parishProcedure
      .input(z.object({ serverId: z.number().int().positive().optional() }).default({}))
      .query(async ({ ctx, input }) => {
        const db = await getDbOrThrow();
        const allowed = await visibleServerIds(ctx as never);
        if (allowed !== "ALL" && allowed.length === 0) return [];

        const conditions = [eq(vacations.parishId, ctx.parishId)];
        if (input.serverId) {
          if (allowed !== "ALL" && !allowed.includes(input.serverId)) {
            throw forbidden("Você não tem acesso aos dados deste servidor.");
          }
          conditions.push(eq(vacations.serverId, input.serverId));
        } else if (allowed !== "ALL") {
          conditions.push(inArray(vacations.serverId, allowed));
        }

        return db
          .select({
            id: vacations.id,
            serverId: vacations.serverId,
            serverName: altarServers.name,
            startDate: vacations.startDate,
            endDate: vacations.endDate,
            reason: vacations.reason,
          })
          .from(vacations)
          .innerJoin(altarServers, eq(altarServers.id, vacations.serverId))
          .where(and(...conditions))
          .orderBy(desc(vacations.startDate));
      }),

    /** Registra férias com data de saída e retorno obrigatórias. */
    create: parishProcedure
      .input(
        z.object({
          serverId: z.number().int().positive(),
          startDate: dateSchema,
          endDate: dateSchema,
          reason: z.string().trim().max(500).optional().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertCanManageServer(ctx as never, input.serverId);

        if (input.startDate > input.endDate) {
          throw badRequest("A data de retorno deve ser posterior à data de saída.");
        }

        const db = await getDbOrThrow();

        // Rejeita sobreposição com períodos já registrados.
        const existing = await db
          .select({ startDate: vacations.startDate, endDate: vacations.endDate })
          .from(vacations)
          .where(and(eq(vacations.parishId, ctx.parishId), eq(vacations.serverId, input.serverId)));

        const overlaps = existing.some(
          row => row.startDate <= input.endDate && row.endDate >= input.startDate,
        );
        if (overlaps) throw badRequest("Já existe um período de férias que se sobrepõe a este.");

        await db.insert(vacations).values({
          parishId: ctx.parishId,
          serverId: input.serverId,
          startDate: input.startDate,
          endDate: input.endDate,
          reason: input.reason ?? null,
          createdByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
        });

        await recordAudit(ctx.actor, {
          action: "VACATION_CREATED",
          entityType: "vacation",
          entityId: input.serverId,
          metadata: { startDate: input.startDate, endDate: input.endDate },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),

    remove: parishProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [existing] = await db
          .select()
          .from(vacations)
          .where(and(eq(vacations.id, input.id), eq(vacations.parishId, ctx.parishId)))
          .limit(1);
        if (!existing) throw notFound("Período de férias");

        await assertCanManageServer(ctx as never, existing.serverId);
        await db.delete(vacations).where(eq(vacations.id, input.id));

        await recordAudit(ctx.actor, {
          action: "VACATION_REMOVED",
          entityType: "vacation",
          entityId: existing.serverId,
          metadata: { startDate: existing.startDate, endDate: existing.endDate },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),
  }),

  // =========================================================================
  // PREFERÊNCIAS DE ESCALA
  // =========================================================================
  preferences: router({
    listByServer: parishProcedure
      .input(z.object({ serverId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        await assertCanManageServer(ctx as never, input.serverId);
        const db = await getDbOrThrow();

        return db
          .select({
            id: schedulePreferences.id,
            weekday: schedulePreferences.weekday,
            period: schedulePreferences.period,
            parishRoleId: schedulePreferences.parishRoleId,
            roleName: parishRoles.name,
            priority: schedulePreferences.priority,
          })
          .from(schedulePreferences)
          .leftJoin(parishRoles, eq(parishRoles.id, schedulePreferences.parishRoleId))
          .where(
            and(
              eq(schedulePreferences.parishId, ctx.parishId),
              eq(schedulePreferences.serverId, input.serverId),
              eq(schedulePreferences.status, "ACTIVE"),
            ),
          )
          .orderBy(asc(schedulePreferences.priority));
      }),

    /**
     * Substitui o conjunto de preferências do servidor.
     * A especificação exige no mínimo 2 preferências quando informadas.
     */
    replace: parishProcedure
      .input(
        z.object({
          serverId: z.number().int().positive(),
          preferences: z
            .array(
              z.object({
                weekday: z.number().int().min(0).max(6).optional().nullable(),
                period: z.enum(DAY_PERIODS).optional().nullable(),
                parishRoleId: z.number().int().positive().optional().nullable(),
                priority: z.number().int().min(1).max(10).default(1),
              }),
            )
            .max(20),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertCanManageServer(ctx as never, input.serverId);

        if (input.preferences.length > 0 && input.preferences.length < SECURITY.minPreferences) {
          throw badRequest(
            `Informe pelo menos ${SECURITY.minPreferences} preferências para orientar a montagem da escala.`,
          );
        }

        for (const preference of input.preferences) {
          if (
            preference.weekday === null &&
            preference.period === null &&
            preference.parishRoleId === null
          ) {
            throw badRequest("Cada preferência precisa indicar dia, período ou função.");
          }
        }

        const db = await getDbOrThrow();

        // Preferências antigas são desativadas, não apagadas.
        await db
          .update(schedulePreferences)
          .set({ status: "INACTIVE" })
          .where(
            and(
              eq(schedulePreferences.parishId, ctx.parishId),
              eq(schedulePreferences.serverId, input.serverId),
            ),
          );

        if (input.preferences.length > 0) {
          await db.insert(schedulePreferences).values(
            input.preferences.map(preference => ({
              parishId: ctx.parishId,
              serverId: input.serverId,
              weekday: preference.weekday ?? null,
              period: preference.period ?? null,
              parishRoleId: preference.parishRoleId ?? null,
              priority: preference.priority,
              status: "ACTIVE" as const,
            })),
          );
        }

        await recordAudit(ctx.actor, {
          action: "PREFERENCE_UPDATED",
          entityType: "schedule_preference",
          entityId: input.serverId,
          metadata: { total: input.preferences.length },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),
  }),
});
