/**
 * Router de pessoas: responsáveis, servidores do altar, vínculos familiares e
 * credenciais de acesso (ID + PIN).
 *
 * Regras estruturais aplicadas aqui:
 * - A idade NUNCA é persistida: é sempre derivada de `birthDate`.
 * - Exclusão é lógica (`status = INACTIVE`), preservando histórico de escalas.
 * - Menores não precisam de e-mail; o contato é do responsável.
 * - Todo dado é filtrado por `ctx.parishId`, que vem da sessão.
 */
import { RELATIONSHIP_TYPES, SECURITY, SERVER_STATUS, calculateAge, isMinor } from "@shared/domain";
import { and, count, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { z } from "zod";

import {
  altarServers,
  familyLinks,
  formations,
  parishMembers,
  parishRoles,
  responsibles,
  serverAccess,
  serverRoles,
  users,
} from "../../drizzle/schema";
import { generateAccessId, hashSecret, validatePasswordStrength } from "../auth/crypto";
import { getDbOrThrow } from "../db";
import { recordAudit } from "../services/audit";
import { issueAccessCode } from "../services/accessCodes";
import {
  badRequest,
  coordinatorProcedure,
  notFound,
  parishAdminProcedure,
  requestMeta,
  responsibleProcedure,
  router,
} from "../trpc";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.")
  .refine(value => {
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime());
  }, "Data inválida.");

const serverInput = z.object({
  name: z.string().trim().min(3, "Informe o nome completo."),
  birthDate: dateSchema,
  heightCm: z.number().int().min(80).max(230).optional().nullable(),
  fatherName: z.string().trim().max(180).optional().nullable(),
  motherName: z.string().trim().max(180).optional().nullable(),
  status: z.enum(SERVER_STATUS).default("IN_FORMATION"),
  notes: z.string().trim().max(1000).optional().nullable(),
  joinedAt: dateSchema.optional().nullable(),
});

/** Valida que a data de nascimento é plausível para um servidor do altar. */
function assertPlausibleBirthDate(birthDate: string): void {
  const age = calculateAge(birthDate);
  if (age < 4) throw badRequest("A data de nascimento informada resulta em idade menor que 4 anos.");
  if (age > 100) throw badRequest("Verifique a data de nascimento informada.");
}

export const peopleRouter = router({
  // =========================================================================
  // RESPONSÁVEIS
  // =========================================================================
  responsibles: router({
    /** Lista os responsáveis da paróquia com a contagem de dependentes ativos. */
    list: coordinatorProcedure
      .input(
        z
          .object({
            search: z.string().trim().max(120).optional(),
            includeInactive: z.boolean().default(false),
          })
          .default({ includeInactive: false }),
      )
      .query(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const conditions = [eq(responsibles.parishId, ctx.parishId)];
        if (!input.includeInactive) conditions.push(eq(responsibles.status, "ACTIVE"));
        if (input.search) conditions.push(like(responsibles.name, `%${input.search}%`));

        const rows = await db
          .select({
            id: responsibles.id,
            name: responsibles.name,
            phone: responsibles.phone,
            email: responsibles.email,
            status: responsibles.status,
            userId: responsibles.userId,
            notes: responsibles.notes,
          })
          .from(responsibles)
          .where(and(...conditions))
          .orderBy(responsibles.name);

        if (rows.length === 0) return [];

        const dependentCounts = await db
          .select({ responsibleId: familyLinks.responsibleId, total: count() })
          .from(familyLinks)
          .where(
            and(
              eq(familyLinks.parishId, ctx.parishId),
              eq(familyLinks.status, "ACTIVE"),
              inArray(
                familyLinks.responsibleId,
                rows.map(r => r.id),
              ),
            ),
          )
          .groupBy(familyLinks.responsibleId);

        const countMap = new Map(dependentCounts.map(c => [c.responsibleId, Number(c.total)]));
        return rows.map(row => ({ ...row, dependents: countMap.get(row.id) ?? 0 }));
      }),

    /**
     * Cria um responsável. O acesso por e-mail e senha é opcional: responsáveis
     * sem conta continuam registrados para fins de contato e vínculo.
     */
    create: coordinatorProcedure
      .input(
        z.object({
          name: z.string().trim().min(3, "Informe o nome do responsável."),
          phone: z.string().trim().max(32).optional().nullable(),
          email: z.string().trim().email("E-mail inválido.").optional().nullable(),
          notes: z.string().trim().max(1000).optional().nullable(),
          /** Quando informado, cria a conta de acesso do responsável. */
          temporaryPassword: z.string().optional().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();
        const email = input.email?.toLowerCase() ?? null;

        if (input.temporaryPassword && !email) {
          throw badRequest("Para criar acesso é necessário informar um e-mail.");
        }

        let userId: number | null = null;

        if (email && input.temporaryPassword) {
          const strength = validatePasswordStrength(
            input.temporaryPassword,
            SECURITY.minPasswordLength,
          );
          if (!strength.valid) throw badRequest(strength.message!);

          let [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
          if (!existing) {
            await db.insert(users).values({
              name: input.name,
              email,
              phone: input.phone ?? null,
              passwordHash: await hashSecret(input.temporaryPassword),
              loginMethod: "password",
              status: "ACTIVE",
              mustChangePassword: true,
            });
            [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
          }

          if (existing) {
            userId = existing.id;
            const [membership] = await db
              .select({ id: parishMembers.id })
              .from(parishMembers)
              .where(
                and(
                  eq(parishMembers.parishId, ctx.parishId),
                  eq(parishMembers.userId, existing.id),
                  eq(parishMembers.role, "RESPONSIBLE"),
                ),
              )
              .limit(1);
            if (!membership) {
              await db.insert(parishMembers).values({
                parishId: ctx.parishId,
                userId: existing.id,
                role: "RESPONSIBLE",
                status: "ACTIVE",
              });
            }
          }
        }

        await db.insert(responsibles).values({
          parishId: ctx.parishId,
          userId,
          name: input.name,
          phone: input.phone ?? null,
          email,
          notes: input.notes ?? null,
          status: "ACTIVE",
        });

        const [created] = await db
          .select({ id: responsibles.id })
          .from(responsibles)
          .where(eq(responsibles.parishId, ctx.parishId))
          .orderBy(desc(responsibles.id))
          .limit(1);

        await recordAudit(ctx.actor, {
          action: "RESPONSIBLE_CREATED",
          entityType: "responsible",
          entityId: created?.id ?? null,
          metadata: { name: input.name, hasAccount: userId !== null },
          ...requestMeta(ctx),
        });

        return { id: created?.id ?? null } as const;
      }),

    /** Atualiza os dados de um responsável da própria paróquia. */
    update: coordinatorProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          name: z.string().trim().min(3).optional(),
          phone: z.string().trim().max(32).optional().nullable(),
          email: z.string().trim().email("E-mail inválido.").optional().nullable(),
          notes: z.string().trim().max(1000).optional().nullable(),
          status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [existing] = await db
          .select()
          .from(responsibles)
          .where(and(eq(responsibles.id, input.id), eq(responsibles.parishId, ctx.parishId)))
          .limit(1);
        if (!existing) throw notFound("Responsável");

        await db
          .update(responsibles)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.phone !== undefined ? { phone: input.phone } : {}),
            ...(input.email !== undefined ? { email: input.email?.toLowerCase() ?? null } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
          })
          .where(eq(responsibles.id, input.id));

        await recordAudit(ctx.actor, {
          action: "RESPONSIBLE_UPDATED",
          entityType: "responsible",
          entityId: input.id,
          metadata: { fields: Object.keys(input).filter(k => k !== "id") },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),
  }),

  // =========================================================================
  // SERVIDORES DO ALTAR
  // =========================================================================
  servers: router({
    /**
     * Lista os servidores da paróquia. A idade é calculada em tempo de leitura,
     * nunca lida de uma coluna persistida.
     */
    list: coordinatorProcedure
      .input(
        z
          .object({
            search: z.string().trim().max(120).optional(),
            status: z.enum(SERVER_STATUS).optional(),
            roleId: z.number().int().positive().optional(),
            includeInactive: z.boolean().default(false),
          })
          .default({ includeInactive: false }),
      )
      .query(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const conditions = [eq(altarServers.parishId, ctx.parishId)];
        if (input.status) conditions.push(eq(altarServers.status, input.status));
        else if (!input.includeInactive) conditions.push(sql`${altarServers.status} <> 'INACTIVE'`);
        if (input.search) conditions.push(like(altarServers.name, `%${input.search}%`));

        const rows = await db
          .select({
            id: altarServers.id,
            name: altarServers.name,
            birthDate: altarServers.birthDate,
            heightCm: altarServers.heightCm,
            status: altarServers.status,
            joinedAt: altarServers.joinedAt,
            accessId: serverAccess.accessId,
            accessStatus: serverAccess.status,
            lastLoginAt: serverAccess.lastLoginAt,
          })
          .from(altarServers)
          .leftJoin(serverAccess, eq(serverAccess.serverId, altarServers.id))
          .where(and(...conditions))
          .orderBy(altarServers.name);

        if (rows.length === 0) return [];

        const ids = rows.map(r => r.id);

        const qualifications = await db
          .select({
            serverId: serverRoles.serverId,
            roleId: serverRoles.parishRoleId,
            roleName: parishRoles.name,
            status: serverRoles.qualificationStatus,
          })
          .from(serverRoles)
          .innerJoin(parishRoles, eq(parishRoles.id, serverRoles.parishRoleId))
          .where(and(eq(serverRoles.parishId, ctx.parishId), inArray(serverRoles.serverId, ids)));

        const links = await db
          .select({
            serverId: familyLinks.serverId,
            responsibleId: responsibles.id,
            responsibleName: responsibles.name,
            responsiblePhone: responsibles.phone,
            isPrimary: familyLinks.isPrimary,
          })
          .from(familyLinks)
          .innerJoin(responsibles, eq(responsibles.id, familyLinks.responsibleId))
          .where(
            and(
              eq(familyLinks.parishId, ctx.parishId),
              eq(familyLinks.status, "ACTIVE"),
              inArray(familyLinks.serverId, ids),
            ),
          );

        const result = rows.map(row => {
          const serverQualifications = qualifications.filter(q => q.serverId === row.id);
          const serverLinks = links.filter(l => l.serverId === row.id);
          return {
            ...row,
            age: calculateAge(row.birthDate),
            isMinor: isMinor(row.birthDate),
            roles: serverQualifications.map(q => ({
              roleId: q.roleId,
              name: q.roleName,
              status: q.status,
            })),
            responsibles: serverLinks.map(l => ({
              id: l.responsibleId,
              name: l.responsibleName,
              phone: l.responsiblePhone,
              isPrimary: l.isPrimary,
            })),
          };
        });

        // Filtro por função é aplicado após o agrupamento das habilitações.
        if (input.roleId) {
          return result.filter(server =>
            server.roles.some(role => role.roleId === input.roleId && role.status === "QUALIFIED"),
          );
        }

        return result;
      }),

    /** Detalha um servidor, incluindo habilitações, formações e responsáveis. */
    get: coordinatorProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [server] = await db
          .select()
          .from(altarServers)
          .where(and(eq(altarServers.id, input.id), eq(altarServers.parishId, ctx.parishId)))
          .limit(1);
        if (!server) throw notFound("Servidor");

        const [access] = await db
          .select({
            accessId: serverAccess.accessId,
            status: serverAccess.status,
            lastLoginAt: serverAccess.lastLoginAt,
            lockedUntil: serverAccess.lockedUntil,
            activatedAt: serverAccess.activatedAt,
          })
          .from(serverAccess)
          .where(eq(serverAccess.serverId, server.id))
          .limit(1);

        const qualifications = await db
          .select({
            id: serverRoles.id,
            roleId: serverRoles.parishRoleId,
            roleName: parishRoles.name,
            minAge: parishRoles.minAge,
            status: serverRoles.qualificationStatus,
            qualifiedAt: serverRoles.qualifiedAt,
            notes: serverRoles.notes,
          })
          .from(serverRoles)
          .innerJoin(parishRoles, eq(parishRoles.id, serverRoles.parishRoleId))
          .where(and(eq(serverRoles.serverId, server.id), eq(serverRoles.parishId, ctx.parishId)));

        const serverFormations = await db
          .select()
          .from(formations)
          .where(and(eq(formations.serverId, server.id), eq(formations.parishId, ctx.parishId)))
          .orderBy(desc(formations.startedAt));

        const linkedResponsibles = await db
          .select({
            linkId: familyLinks.id,
            responsibleId: responsibles.id,
            name: responsibles.name,
            phone: responsibles.phone,
            email: responsibles.email,
            relationshipType: familyLinks.relationshipType,
            isPrimary: familyLinks.isPrimary,
            status: familyLinks.status,
          })
          .from(familyLinks)
          .innerJoin(responsibles, eq(responsibles.id, familyLinks.responsibleId))
          .where(and(eq(familyLinks.serverId, server.id), eq(familyLinks.parishId, ctx.parishId)));

        return {
          ...server,
          age: calculateAge(server.birthDate),
          isMinor: isMinor(server.birthDate),
          access: access ?? null,
          qualifications,
          formations: serverFormations,
          responsibles: linkedResponsibles,
        };
      }),

    /**
     * Cria um servidor do altar e, opcionalmente, o vínculo com um responsável
     * e a credencial de acesso pendente de ativação.
     */
    create: coordinatorProcedure
      .input(
        serverInput.extend({
          responsibleId: z.number().int().positive().optional().nullable(),
          relationshipType: z.enum(RELATIONSHIP_TYPES).default("GUARDIAN"),
          /** Gera o ID de acesso já na criação. O PIN é definido na ativação. */
          createAccess: z.boolean().default(true),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        assertPlausibleBirthDate(input.birthDate);

        const db = await getDbOrThrow();

        // Menores precisam de um responsável vinculado.
        if (isMinor(input.birthDate) && !input.responsibleId) {
          throw badRequest(
            "Servidores menores de idade precisam de um responsável vinculado no cadastro.",
          );
        }

        if (input.responsibleId) {
          const [responsible] = await db
            .select({ id: responsibles.id })
            .from(responsibles)
            .where(
              and(
                eq(responsibles.id, input.responsibleId),
                eq(responsibles.parishId, ctx.parishId),
                eq(responsibles.status, "ACTIVE"),
              ),
            )
            .limit(1);
          if (!responsible) throw notFound("Responsável");
        }

        await db.insert(altarServers).values({
          parishId: ctx.parishId,
          name: input.name,
          birthDate: input.birthDate,
          heightCm: input.heightCm ?? null,
          fatherName: input.fatherName ?? null,
          motherName: input.motherName ?? null,
          status: input.status,
          notes: input.notes ?? null,
          joinedAt: input.joinedAt ?? null,
        });

        const [created] = await db
          .select({ id: altarServers.id })
          .from(altarServers)
          .where(eq(altarServers.parishId, ctx.parishId))
          .orderBy(desc(altarServers.id))
          .limit(1);

        if (!created) throw badRequest("Não foi possível criar o servidor.");

        if (input.responsibleId) {
          await db.insert(familyLinks).values({
            parishId: ctx.parishId,
            responsibleId: input.responsibleId,
            serverId: created.id,
            relationshipType: input.relationshipType,
            isPrimary: true,
            status: "ACTIVE",
            createdByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
          });
        }

        let accessId: string | null = null;
        let activationCode: string | null = null;

        if (input.createAccess) {
          accessId = await generateUniqueAccessId(ctx.parishId);
          await db.insert(serverAccess).values({
            parishId: ctx.parishId,
            serverId: created.id,
            accessId,
            status: "PENDING_ACTIVATION",
          });

          const issued = await issueAccessCode({
            parishId: ctx.parishId,
            serverId: created.id,
            purpose: "ACTIVATION",
            issuedByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
          });
          activationCode = issued.code;
        }

        await recordAudit(ctx.actor, {
          action: "SERVER_CREATED",
          entityType: "altar_server",
          entityId: created.id,
          metadata: { name: input.name, status: input.status, accessCreated: accessId !== null },
          ...requestMeta(ctx),
        });

        // O código de ativação é retornado uma única vez, para entrega à família.
        return { id: created.id, accessId, activationCode } as const;
      }),

    /** Atualiza os dados pastorais de um servidor. */
    update: coordinatorProcedure
      .input(serverInput.partial().extend({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [existing] = await db
          .select()
          .from(altarServers)
          .where(and(eq(altarServers.id, input.id), eq(altarServers.parishId, ctx.parishId)))
          .limit(1);
        if (!existing) throw notFound("Servidor");

        if (input.birthDate) assertPlausibleBirthDate(input.birthDate);

        await db
          .update(altarServers)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.birthDate !== undefined ? { birthDate: input.birthDate } : {}),
            ...(input.heightCm !== undefined ? { heightCm: input.heightCm } : {}),
            ...(input.fatherName !== undefined ? { fatherName: input.fatherName } : {}),
            ...(input.motherName !== undefined ? { motherName: input.motherName } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
            ...(input.joinedAt !== undefined ? { joinedAt: input.joinedAt } : {}),
          })
          .where(eq(altarServers.id, input.id));

        await recordAudit(ctx.actor, {
          action: "SERVER_UPDATED",
          entityType: "altar_server",
          entityId: input.id,
          metadata: { fields: Object.keys(input).filter(k => k !== "id") },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),

    /**
     * Altera o status do servidor. `INACTIVE` funciona como exclusão lógica:
     * o histórico de escalas e presenças é integralmente preservado.
     */
    setStatus: coordinatorProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          status: z.enum(SERVER_STATUS),
          reason: z.string().trim().max(500).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [existing] = await db
          .select()
          .from(altarServers)
          .where(and(eq(altarServers.id, input.id), eq(altarServers.parishId, ctx.parishId)))
          .limit(1);
        if (!existing) throw notFound("Servidor");

        await db
          .update(altarServers)
          .set({ status: input.status })
          .where(eq(altarServers.id, input.id));

        // Servidor inativo perde o acesso operacional e as sessões abertas.
        if (input.status === "INACTIVE") {
          await db
            .update(serverAccess)
            .set({ status: "REVOKED" })
            .where(eq(serverAccess.serverId, input.id));

          const { revokeServerSessions } = await import("../auth/service");
          await revokeServerSessions(input.id);
        }

        await recordAudit(ctx.actor, {
          action: "SERVER_STATUS_CHANGED",
          entityType: "altar_server",
          entityId: input.id,
          metadata: { from: existing.status, to: input.status, reason: input.reason ?? null },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),
  }),

  // =========================================================================
  // VÍNCULOS FAMILIARES
  // =========================================================================
  familyLinks: router({
    /** Cria um vínculo entre responsável e servidor. */
    create: coordinatorProcedure
      .input(
        z.object({
          responsibleId: z.number().int().positive(),
          serverId: z.number().int().positive(),
          relationshipType: z.enum(RELATIONSHIP_TYPES).default("GUARDIAN"),
          isPrimary: z.boolean().default(false),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [responsible] = await db
          .select({ id: responsibles.id })
          .from(responsibles)
          .where(
            and(eq(responsibles.id, input.responsibleId), eq(responsibles.parishId, ctx.parishId)),
          )
          .limit(1);
        if (!responsible) throw notFound("Responsável");

        const [server] = await db
          .select({ id: altarServers.id })
          .from(altarServers)
          .where(and(eq(altarServers.id, input.serverId), eq(altarServers.parishId, ctx.parishId)))
          .limit(1);
        if (!server) throw notFound("Servidor");

        const [existing] = await db
          .select({ id: familyLinks.id, status: familyLinks.status })
          .from(familyLinks)
          .where(
            and(
              eq(familyLinks.responsibleId, input.responsibleId),
              eq(familyLinks.serverId, input.serverId),
            ),
          )
          .limit(1);

        if (existing?.status === "ACTIVE") {
          throw badRequest("Este vínculo já existe e está ativo.");
        }

        // Apenas um vínculo primário ativo por servidor.
        if (input.isPrimary) {
          await db
            .update(familyLinks)
            .set({ isPrimary: false })
            .where(
              and(
                eq(familyLinks.parishId, ctx.parishId),
                eq(familyLinks.serverId, input.serverId),
                eq(familyLinks.status, "ACTIVE"),
              ),
            );
        }

        if (existing) {
          await db
            .update(familyLinks)
            .set({
              status: "ACTIVE",
              isPrimary: input.isPrimary,
              relationshipType: input.relationshipType,
              endedAt: null,
              endedByUserId: null,
            })
            .where(eq(familyLinks.id, existing.id));
        } else {
          await db.insert(familyLinks).values({
            parishId: ctx.parishId,
            responsibleId: input.responsibleId,
            serverId: input.serverId,
            relationshipType: input.relationshipType,
            isPrimary: input.isPrimary,
            status: "ACTIVE",
            createdByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
          });
        }

        await recordAudit(ctx.actor, {
          action: "FAMILY_LINK_CREATED",
          entityType: "family_link",
          entityId: input.serverId,
          metadata: { responsibleId: input.responsibleId, isPrimary: input.isPrimary },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),

    /** Encerra um vínculo, mantendo o registro histórico. */
    end: coordinatorProcedure
      .input(z.object({ linkId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [link] = await db
          .select()
          .from(familyLinks)
          .where(and(eq(familyLinks.id, input.linkId), eq(familyLinks.parishId, ctx.parishId)))
          .limit(1);
        if (!link) throw notFound("Vínculo");

        // Um menor nunca pode ficar sem responsável ativo.
        const [server] = await db
          .select({ birthDate: altarServers.birthDate })
          .from(altarServers)
          .where(eq(altarServers.id, link.serverId))
          .limit(1);

        if (server && isMinor(server.birthDate)) {
          const [{ total } = { total: 0 }] = await db
            .select({ total: count() })
            .from(familyLinks)
            .where(
              and(
                eq(familyLinks.parishId, ctx.parishId),
                eq(familyLinks.serverId, link.serverId),
                eq(familyLinks.status, "ACTIVE"),
              ),
            );
          if (Number(total) <= 1) {
            throw badRequest(
              "Servidores menores de idade precisam de pelo menos um responsável ativo. Vincule outro responsável antes de encerrar este vínculo.",
            );
          }
        }

        await db
          .update(familyLinks)
          .set({
            status: "ENDED",
            endedAt: new Date(),
            endedByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
          })
          .where(eq(familyLinks.id, input.linkId));

        await recordAudit(ctx.actor, {
          action: "FAMILY_LINK_ENDED",
          entityType: "family_link",
          entityId: link.serverId,
          metadata: { responsibleId: link.responsibleId },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),
  }),

  // =========================================================================
  // CREDENCIAIS DE ACESSO DO SERVIDOR
  // =========================================================================
  access: router({
    /** Cria a credencial de acesso de um servidor que ainda não a possui. */
    create: coordinatorProcedure
      .input(z.object({ serverId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [server] = await db
          .select({ id: altarServers.id, name: altarServers.name, status: altarServers.status })
          .from(altarServers)
          .where(and(eq(altarServers.id, input.serverId), eq(altarServers.parishId, ctx.parishId)))
          .limit(1);
        if (!server) throw notFound("Servidor");
        if (server.status === "INACTIVE") {
          throw badRequest("Não é possível criar acesso para um servidor inativo.");
        }

        const [existing] = await db
          .select({ id: serverAccess.id })
          .from(serverAccess)
          .where(eq(serverAccess.serverId, server.id))
          .limit(1);
        if (existing) throw badRequest("Este servidor já possui credencial de acesso.");

        const accessId = await generateUniqueAccessId(ctx.parishId);
        await db.insert(serverAccess).values({
          parishId: ctx.parishId,
          serverId: server.id,
          accessId,
          status: "PENDING_ACTIVATION",
        });

        const issued = await issueAccessCode({
          parishId: ctx.parishId,
          serverId: server.id,
          purpose: "ACTIVATION",
          issuedByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
        });

        await recordAudit(ctx.actor, {
          action: "SERVER_ACCESS_CREATED",
          entityType: "server_access",
          entityId: server.id,
          metadata: { accessId },
          ...requestMeta(ctx),
        });

        return { accessId, activationCode: issued.code, expiresAt: issued.expiresAt } as const;
      }),

    /**
     * Emite um novo código de uso único para redefinição de PIN.
     * O código é exibido uma única vez a quem o solicitou.
     */
    issuePinResetCode: coordinatorProcedure
      .input(z.object({ serverId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [row] = await db
          .select({ access: serverAccess, serverName: altarServers.name })
          .from(serverAccess)
          .innerJoin(altarServers, eq(altarServers.id, serverAccess.serverId))
          .where(
            and(eq(serverAccess.serverId, input.serverId), eq(serverAccess.parishId, ctx.parishId)),
          )
          .limit(1);
        if (!row) throw notFound("Acesso do servidor");

        const issued = await issueAccessCode({
          parishId: ctx.parishId,
          serverId: input.serverId,
          purpose: "PIN_RESET",
          issuedByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
        });

        await db
          .update(serverAccess)
          .set({ pinResetRequested: true, failedAttempts: 0, lockedUntil: null })
          .where(eq(serverAccess.id, row.access.id));

        await recordAudit(ctx.actor, {
          action: "SERVER_ACCESS_PIN_RESET",
          entityType: "server_access",
          entityId: input.serverId,
          metadata: { accessId: row.access.accessId },
          ...requestMeta(ctx),
        });

        return {
          accessId: row.access.accessId,
          serverName: row.serverName,
          code: issued.code,
          expiresAt: issued.expiresAt,
        } as const;
      }),

    /** Bloqueia ou desbloqueia o acesso de um servidor. */
    setBlocked: coordinatorProcedure
      .input(z.object({ serverId: z.number().int().positive(), blocked: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [access] = await db
          .select()
          .from(serverAccess)
          .where(
            and(eq(serverAccess.serverId, input.serverId), eq(serverAccess.parishId, ctx.parishId)),
          )
          .limit(1);
        if (!access) throw notFound("Acesso do servidor");

        await db
          .update(serverAccess)
          .set({
            // Bloqueio administrativo não usa `lockedUntil`: é permanente até
            // ser revertido manualmente, diferente do bloqueio por tentativas.
            status: input.blocked ? "BLOCKED" : "ACTIVE",
            lockedUntil: null,
            failedAttempts: 0,
          })
          .where(eq(serverAccess.id, access.id));

        if (input.blocked) {
          const { revokeServerSessions } = await import("../auth/service");
          await revokeServerSessions(input.serverId);
        }

        await recordAudit(ctx.actor, {
          action: input.blocked ? "SERVER_ACCESS_BLOCKED" : "SERVER_ACCESS_UNBLOCKED",
          entityType: "server_access",
          entityId: input.serverId,
          metadata: { accessId: access.accessId },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),
  }),

  // =========================================================================
  // VISÃO DO RESPONSÁVEL
  // =========================================================================
  myDependents: responsibleProcedure.query(async ({ ctx }) => {
    const db = await getDbOrThrow();

    const rows = await db
      .select({
        id: altarServers.id,
        name: altarServers.name,
        birthDate: altarServers.birthDate,
        status: altarServers.status,
        relationshipType: familyLinks.relationshipType,
        isPrimary: familyLinks.isPrimary,
        accessId: serverAccess.accessId,
        accessStatus: serverAccess.status,
      })
      .from(familyLinks)
      .innerJoin(altarServers, eq(altarServers.id, familyLinks.serverId))
      .leftJoin(serverAccess, eq(serverAccess.serverId, altarServers.id))
      .where(
        and(
          eq(familyLinks.parishId, ctx.parishId),
          eq(familyLinks.responsibleId, ctx.responsibleId),
          eq(familyLinks.status, "ACTIVE"),
        ),
      )
      .orderBy(altarServers.name);

    return rows.map(row => ({
      ...row,
      age: calculateAge(row.birthDate),
      isMinor: isMinor(row.birthDate),
    }));
  }),
});

/** Gera um ID de acesso único, com tentativas limitadas para evitar colisão. */
async function generateUniqueAccessId(parishId: number): Promise<string> {
  const db = await getDbOrThrow();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = generateAccessId();
    const [existing] = await db
      .select({ id: serverAccess.id })
      .from(serverAccess)
      .where(eq(serverAccess.accessId, candidate))
      .limit(1);
    if (!existing) return candidate;
  }

  throw badRequest("Não foi possível gerar um ID de acesso. Tente novamente.");
}
