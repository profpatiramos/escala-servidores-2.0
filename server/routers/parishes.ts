/**
 * Router de paróquias.
 *
 * A criação de uma paróquia provisiona todo o conjunto mínimo para operar:
 * funções litúrgicas padrão, regras de pontuação, conquistas e as configurações
 * de gamificação com penalização e ranking de menores DESABILITADOS por padrão.
 */
import {
  DEFAULT_ACHIEVEMENTS,
  DEFAULT_LITURGICAL_ROLES,
  DEFAULT_POINT_RULES,
  PARISH_STATUS,
  SECURITY,
} from "@shared/domain";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";

import {
  achievements,
  altarServers,
  gamificationSettings,
  parishes,
  parishMembers,
  parishRoles,
  pointRules,
  users,
} from "../../drizzle/schema";
import { hashSecret, validatePasswordStrength } from "../auth/crypto";
import { getDbOrThrow } from "../db";
import { recordAudit } from "../services/audit";
import {
  badRequest,
  notFound,
  parishAdminProcedure,
  platformAdminProcedure,
  requestMeta,
  router,
} from "../trpc";

/** Normaliza um nome em um slug estável e único. */
function toSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

const parishInput = z.object({
  name: z.string().trim().min(3, "Informe o nome da paróquia."),
  legalName: z.string().trim().max(220).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  state: z.string().trim().max(60).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  email: z.string().trim().email("E-mail inválido.").optional().nullable(),
  timezone: z.string().trim().max(64).default("America/Sao_Paulo"),
});

/**
 * Provisiona os dados padrão de uma paróquia recém-criada.
 * Executado apenas na criação, de forma idempotente por paróquia.
 */
export async function provisionParishDefaults(
  parishId: number,
  connection?: Pick<Awaited<ReturnType<typeof getDbOrThrow>>, "insert">
): Promise<void> {
  const db = connection ?? (await getDbOrThrow());

  await db.insert(parishRoles).values(
    DEFAULT_LITURGICAL_ROLES.map((role, index) => ({
      parishId,
      name: role.name,
      description: role.description,
      minAge: role.minAge,
      requiresQualification: true,
      sortOrder: index,
    }))
  );

  await db.insert(pointRules).values(
    DEFAULT_POINT_RULES.map(rule => ({
      parishId,
      eventType: rule.eventType,
      points: rule.points,
      enabled: rule.enabled,
      description: rule.description,
    }))
  );

  await db.insert(achievements).values(
    DEFAULT_ACHIEVEMENTS.map(achievement => ({
      parishId,
      name: achievement.name,
      description: achievement.description,
      criteriaKind: achievement.criteriaKind,
      threshold: achievement.threshold,
    }))
  );

  // Penalização e ranking de menores permanecem desabilitados por padrão.
  await db.insert(gamificationSettings).values({
    parishId,
    enabled: true,
    penaltiesEnabled: false,
    minorsRankingEnabled: false,
    rankingEnabled: false,
    historyEnabled: true,
  });
}

export const parishesRouter = router({
  /** Lista todas as paróquias da plataforma, com contagem de servidores. */
  list: platformAdminProcedure.query(async () => {
    const db = await getDbOrThrow();
    const rows = await db.select().from(parishes).orderBy(parishes.name);

    const counts = await db
      .select({ parishId: altarServers.parishId, total: count() })
      .from(altarServers)
      .where(eq(altarServers.status, "ACTIVE"))
      .groupBy(altarServers.parishId);

    const countMap = new Map(counts.map(c => [c.parishId, Number(c.total)]));

    return rows.map(parish => ({
      ...parish,
      activeServers: countMap.get(parish.id) ?? 0,
    }));
  }),

  /** Cria uma paróquia em estado de aguardando liberação. A plataforma libera depois. */
  create: platformAdminProcedure
    .input(
      parishInput.extend({
        /** Administrador inicial da paróquia, criado junto com ela. */
        adminName: z.string().trim().min(3, "Informe o nome do administrador."),
        adminEmail: z.string().trim().email("Informe um e-mail válido."),
        adminPassword: z.string().min(SECURITY.minPasswordLength),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const strength = validatePasswordStrength(
        input.adminPassword,
        SECURITY.minPasswordLength
      );
      if (!strength.valid) throw badRequest(strength.message!);

      const db = await getDbOrThrow();
      const passwordHash = await hashSecret(input.adminPassword);
      const created = await db.transaction(async tx => {
        const email = input.adminEmail.toLowerCase();

        const [existingUser] = await tx
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (existingUser) {
          throw badRequest(
            "Já existe uma conta com este e-mail. Vincule-a à paróquia após criá-la."
          );
        }

        let slug = toSlug(input.name);
        if (!slug) throw badRequest("Nome de paróquia inválido.");
        const [slugTaken] = await tx
          .select({ id: parishes.id })
          .from(parishes)
          .where(eq(parishes.slug, slug))
          .limit(1);
        if (slugTaken) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

        await tx.insert(parishes).values({
          name: input.name,
          legalName: input.legalName ?? null,
          slug,
          city: input.city ?? null,
          state: input.state ?? null,
          address: input.address ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          timezone: input.timezone,
          status: "INACTIVE",
          settings: { requireMinPreferences: true },
        });

        const [created] = await tx
          .select()
          .from(parishes)
          .where(eq(parishes.slug, slug))
          .limit(1);
        if (!created) throw badRequest("Não foi possível criar a paróquia.");

        await provisionParishDefaults(created.id, tx);

        await tx.insert(users).values({
          name: input.adminName,
          email,
          passwordHash,
          loginMethod: "password",
          status: "ACTIVE",
          // O administrador define a própria senha no primeiro acesso.
          mustChangePassword: true,
        });

        const [adminUser] = await tx
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (!adminUser)
          throw badRequest("Não foi possível criar o administrador.");
        {
          await tx.insert(parishMembers).values({
            parishId: created.id,
            userId: adminUser.id,
            role: "PARISH_ADMIN",
            status: "ACTIVE",
          });
        }

        return created;
      });

      await recordAudit(ctx.actor, {
        action: "PARISH_CREATED",
        entityType: "parish",
        entityId: created.id,
        parishId: created.id,
        metadata: {
          name: created.name,
          slug: created.slug,
          adminEmail: input.adminEmail.toLowerCase(),
        },
        ...requestMeta(ctx),
      });

      return { id: created.id, slug: created.slug };
    }),

  /** Altera o status da paróquia. Suspender impede o acesso de todos os atores. */
  setStatus: platformAdminProcedure
    .input(
      z.object({
        parishId: z.number().int().positive(),
        status: z.enum(PARISH_STATUS),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();
      const [parish] = await db
        .select()
        .from(parishes)
        .where(eq(parishes.id, input.parishId))
        .limit(1);
      if (!parish) throw notFound("Paróquia");

      await db
        .update(parishes)
        .set({ status: input.status })
        .where(eq(parishes.id, input.parishId));

      await recordAudit(ctx.actor, {
        action: "PARISH_STATUS_CHANGED",
        entityType: "parish",
        entityId: parish.id,
        parishId: parish.id,
        metadata: { from: parish.status, to: input.status },
        ...requestMeta(ctx),
      });

      return { success: true } as const;
    }),

  /** Retorna os dados da paróquia do contexto autenticado. */
  current: parishAdminProcedure.query(async ({ ctx }) => {
    const db = await getDbOrThrow();
    const [parish] = await db
      .select()
      .from(parishes)
      .where(eq(parishes.id, ctx.parishId))
      .limit(1);
    if (!parish) throw notFound("Paróquia");
    return parish;
  }),

  /** Atualiza os dados cadastrais da própria paróquia. */
  update: parishAdminProcedure
    .input(parishInput.partial())
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();

      await db
        .update(parishes)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.legalName !== undefined
            ? { legalName: input.legalName }
            : {}),
          ...(input.city !== undefined ? { city: input.city } : {}),
          ...(input.state !== undefined ? { state: input.state } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        })
        .where(eq(parishes.id, ctx.parishId));

      await recordAudit(ctx.actor, {
        action: "PARISH_UPDATED",
        entityType: "parish",
        entityId: ctx.parishId,
        metadata: { fields: Object.keys(input) },
        ...requestMeta(ctx),
      });

      return { success: true } as const;
    }),

  /** Atualiza as configurações operacionais da paróquia. */
  updateSettings: parishAdminProcedure
    .input(
      z.object({
        requireMinPreferences: z.boolean().optional(),
        confirmationDeadlineHours: z.number().int().min(0).max(336).optional(),
        earlyConfirmationHours: z.number().int().min(0).max(336).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();
      const [parish] = await db
        .select({ settings: parishes.settings })
        .from(parishes)
        .where(eq(parishes.id, ctx.parishId))
        .limit(1);

      const current =
        (parish?.settings as Record<string, unknown> | null) ?? {};
      const merged = { ...current, ...input };

      await db
        .update(parishes)
        .set({ settings: merged })
        .where(eq(parishes.id, ctx.parishId));

      await recordAudit(ctx.actor, {
        action: "PARISH_UPDATED",
        entityType: "parish",
        entityId: ctx.parishId,
        metadata: { settings: input },
        ...requestMeta(ctx),
      });

      return { success: true } as const;
    }),

  /** Lista os membros da paróquia com seus papéis. */
  members: parishAdminProcedure.query(async ({ ctx }) => {
    const db = await getDbOrThrow();
    return db
      .select({
        membershipId: parishMembers.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: parishMembers.role,
        membershipStatus: parishMembers.status,
        userStatus: users.status,
        lastSignedIn: users.lastSignedIn,
      })
      .from(parishMembers)
      .innerJoin(users, eq(users.id, parishMembers.userId))
      .where(eq(parishMembers.parishId, ctx.parishId))
      .orderBy(users.name);
  }),

  /** Cria ou vincula um membro à paróquia com o papel informado. */
  addMember: parishAdminProcedure
    .input(
      z.object({
        name: z.string().trim().min(3, "Informe o nome."),
        email: z.string().trim().email("Informe um e-mail válido."),
        phone: z.string().trim().max(32).optional().nullable(),
        role: z.enum(["PARISH_ADMIN", "COORDINATOR", "PRIEST", "RESPONSIBLE"]),
        temporaryPassword: z.string().min(SECURITY.minPasswordLength),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const strength = validatePasswordStrength(
        input.temporaryPassword,
        SECURITY.minPasswordLength
      );
      if (!strength.valid) throw badRequest(strength.message!);

      const db = await getDbOrThrow();
      const email = input.email.toLowerCase();

      let [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user) {
        await db.insert(users).values({
          name: input.name,
          email,
          phone: input.phone ?? null,
          passwordHash: await hashSecret(input.temporaryPassword),
          loginMethod: "password",
          status: "ACTIVE",
          mustChangePassword: true,
        });
        [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
      }

      if (!user) throw badRequest("Não foi possível criar o membro.");

      const [existing] = await db
        .select({ id: parishMembers.id, status: parishMembers.status })
        .from(parishMembers)
        .where(
          and(
            eq(parishMembers.parishId, ctx.parishId),
            eq(parishMembers.userId, user.id),
            eq(parishMembers.role, input.role)
          )
        )
        .limit(1);

      if (existing) {
        if (existing.status === "ACTIVE") {
          throw badRequest("Este membro já possui este papel na paróquia.");
        }
        await db
          .update(parishMembers)
          .set({ status: "ACTIVE" })
          .where(eq(parishMembers.id, existing.id));
      } else {
        await db.insert(parishMembers).values({
          parishId: ctx.parishId,
          userId: user.id,
          role: input.role,
          status: "ACTIVE",
        });
      }

      await recordAudit(ctx.actor, {
        action: "MEMBER_CREATED",
        entityType: "parish_member",
        entityId: user.id,
        metadata: { email, role: input.role },
        ...requestMeta(ctx),
      });

      return { userId: user.id } as const;
    }),

  /** Inativa o vínculo de um membro, preservando o histórico. */
  removeMember: parishAdminProcedure
    .input(z.object({ membershipId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();

      const [membership] = await db
        .select()
        .from(parishMembers)
        .where(
          and(
            eq(parishMembers.id, input.membershipId),
            eq(parishMembers.parishId, ctx.parishId)
          )
        )
        .limit(1);

      if (!membership) throw notFound("Vínculo");

      // Impede a paróquia de ficar sem nenhum administrador ativo.
      if (membership.role === "PARISH_ADMIN") {
        const [{ total } = { total: 0 }] = await db
          .select({ total: count() })
          .from(parishMembers)
          .where(
            and(
              eq(parishMembers.parishId, ctx.parishId),
              eq(parishMembers.role, "PARISH_ADMIN"),
              eq(parishMembers.status, "ACTIVE")
            )
          );
        if (Number(total) <= 1) {
          throw badRequest(
            "A paróquia precisa manter pelo menos um administrador ativo."
          );
        }
      }

      await db
        .update(parishMembers)
        .set({ status: "INACTIVE" })
        .where(eq(parishMembers.id, membership.id));

      // Encerra as sessões ativas do membro removido.
      const { revokeUserSessions } = await import("../auth/service");
      await revokeUserSessions(membership.userId);

      await recordAudit(ctx.actor, {
        action: "MEMBER_REMOVED",
        entityType: "parish_member",
        entityId: membership.userId,
        metadata: { role: membership.role },
        ...requestMeta(ctx),
      });

      return { success: true } as const;
    }),
});
