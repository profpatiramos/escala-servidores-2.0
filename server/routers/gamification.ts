/**
 * Router de gamificação: configurações, regras, pontos, conquistas e ranking.
 *
 * O saldo nunca é armazenado: é sempre derivado das transações. Ajustes manuais
 * exigem motivo e ficam auditados. Correções são feitas por reversão, jamais
 * por edição ou exclusão de transação.
 */
import { POINT_EVENT_TYPES } from "@shared/domain";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  achievements,
  altarServers,
  familyLinks,
  gamificationSettings,
  pointRules,
  pointTransactions,
  responsibles,
  serverAchievements,
} from "../../drizzle/schema";
import { getDbOrThrow } from "../db";
import { recordAudit } from "../services/audit";
import {
  adjustPoints,
  getBalances,
  getRanking,
  getServerBalance,
  reverseTransaction,
} from "../services/gamification";
import { enqueueNotification } from "../services/notifications";
import {
  badRequest,
  coordinatorProcedure,
  forbidden,
  notFound,
  parishAdminProcedure,
  parishProcedure,
  requestMeta,
  router,
} from "../trpc";

/** Garante que o ator pode consultar os dados do servidor informado. */
export async function assertCanViewServer(
  ctx: { parishId: number; actor: any },
  serverId: number,
): Promise<void> {
  const db = await getDbOrThrow();

  if (ctx.actor.type === "SERVER") {
    if (ctx.actor.server.id !== serverId) {
      throw forbidden("Você só pode ver os seus próprios pontos.");
    }
    return;
  }

  const role = String(ctx.actor.role);
  if (["COORDINATOR", "PARISH_ADMIN", "SUPER_ADMIN"].includes(role)) return;

  if (role === "RESPONSIBLE") {
    const [link] = await db
      .select({ id: familyLinks.id })
      .from(familyLinks)
      .innerJoin(responsibles, eq(responsibles.id, familyLinks.responsibleId))
      .where(
        and(
          eq(familyLinks.parishId, ctx.parishId),
          eq(familyLinks.serverId, serverId),
          eq(responsibles.userId, ctx.actor.user.id),
          isNull(familyLinks.endedAt),
        ),
      )
      .limit(1);
    if (!link) throw forbidden("Você não é responsável por este servidor.");
    return;
  }

  throw forbidden("Seu perfil não permite consultar estes dados.");
}

export const gamificationRouter = router({
  /** Configurações de gamificação da paróquia. */
  settings: router({
    get: coordinatorProcedure.query(async ({ ctx }) => {
      const db = await getDbOrThrow();
      const [settings] = await db
        .select()
        .from(gamificationSettings)
        .where(eq(gamificationSettings.parishId, ctx.parishId))
        .limit(1);
      return settings ?? null;
    }),

    /**
     * Atualiza as configurações. Habilitar penalidades ou ranking de menores é
     * decisão consciente do administrador da paróquia, nunca um default.
     */
    update: parishAdminProcedure
      .input(
        z.object({
          enabled: z.boolean().optional(),
          penaltiesEnabled: z.boolean().optional(),
          rankingEnabled: z.boolean().optional(),
          minorsRankingEnabled: z.boolean().optional(),
          historyEnabled: z.boolean().optional(),
          earlyConfirmationHours: z.number().int().min(1).max(720).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [current] = await db
          .select()
          .from(gamificationSettings)
          .where(eq(gamificationSettings.parishId, ctx.parishId))
          .limit(1);
        if (!current) throw notFound("Configuração de gamificação");

        const patch: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(input)) {
          if (value !== undefined) patch[key] = value;
        }
        if (Object.keys(patch).length === 0) return { success: true } as const;

        // Ranking de menores só faz sentido com o ranking habilitado.
        const rankingEnabled =
          (patch.rankingEnabled as boolean | undefined) ?? current.rankingEnabled;
        const minorsEnabled =
          (patch.minorsRankingEnabled as boolean | undefined) ?? current.minorsRankingEnabled;
        if (minorsEnabled && !rankingEnabled) {
          throw badRequest("Habilite o ranking antes de incluir menores de idade nele.");
        }

        patch.updatedByUserId = ctx.actor.type === "USER" ? ctx.actor.user.id : null;

        await db
          .update(gamificationSettings)
          .set(patch)
          .where(eq(gamificationSettings.parishId, ctx.parishId));

        await recordAudit(ctx.actor, {
          action: "GAMIFICATION_SETTINGS_UPDATED",
          entityType: "gamification_settings",
          entityId: current.id,
          metadata: { fields: Object.keys(patch) },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),
  }),

  /** Regras de pontuação configuráveis. */
  rules: router({
    list: coordinatorProcedure.query(async ({ ctx }) => {
      const db = await getDbOrThrow();
      return db
        .select()
        .from(pointRules)
        .where(eq(pointRules.parishId, ctx.parishId))
        .orderBy(desc(pointRules.points));
    }),

    update: parishAdminProcedure
      .input(
        z.object({
          eventType: z.enum(POINT_EVENT_TYPES),
          points: z.number().int().min(-100).max(100).optional(),
          enabled: z.boolean().optional(),
          description: z.string().trim().max(300).optional().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [rule] = await db
          .select()
          .from(pointRules)
          .where(
            and(
              eq(pointRules.parishId, ctx.parishId),
              eq(pointRules.eventType, input.eventType),
            ),
          )
          .limit(1);
        if (!rule) throw notFound("Regra de pontuação");

        const patch: Record<string, unknown> = {};
        if (input.points !== undefined) patch.points = input.points;
        if (input.enabled !== undefined) patch.enabled = input.enabled;
        if (input.description !== undefined) patch.description = input.description;
        if (Object.keys(patch).length === 0) return { success: true } as const;

        await db.update(pointRules).set(patch).where(eq(pointRules.id, rule.id));

        await recordAudit(ctx.actor, {
          action: "GAMIFICATION_SETTINGS_UPDATED",
          entityType: "point_rule",
          entityId: rule.id,
          metadata: { eventType: input.eventType, ...patch },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),
  }),

  /** Extrato de pontos de um servidor. */
  balance: parishProcedure
    .input(z.object({ serverId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertCanViewServer(ctx, input.serverId);
      const db = await getDbOrThrow();

      const [settings] = await db
        .select({ historyEnabled: gamificationSettings.historyEnabled, enabled: gamificationSettings.enabled })
        .from(gamificationSettings)
        .where(eq(gamificationSettings.parishId, ctx.parishId))
        .limit(1);

      const balance = await getServerBalance({ parishId: ctx.parishId, serverId: input.serverId });

      const history =
        settings?.historyEnabled === false
          ? []
          : await db
              .select({
                id: pointTransactions.id,
                eventType: pointTransactions.eventType,
                pointsDelta: pointTransactions.pointsDelta,
                reason: pointTransactions.reason,
                isReversal: pointTransactions.isReversal,
                createdAt: pointTransactions.createdAt,
              })
              .from(pointTransactions)
              .where(
                and(
                  eq(pointTransactions.parishId, ctx.parishId),
                  eq(pointTransactions.serverId, input.serverId),
                ),
              )
              .orderBy(desc(pointTransactions.createdAt))
              .limit(200);

      const granted = await db
        .select({
          id: serverAchievements.id,
          achievementId: serverAchievements.achievementId,
          name: achievements.name,
          description: achievements.description,
          source: serverAchievements.source,
          grantedAt: serverAchievements.grantedAt,
        })
        .from(serverAchievements)
        .innerJoin(achievements, eq(achievements.id, serverAchievements.achievementId))
        .where(
          and(
            eq(serverAchievements.parishId, ctx.parishId),
            eq(serverAchievements.serverId, input.serverId),
          ),
        )
        .orderBy(desc(serverAchievements.grantedAt));

      return {
        enabled: settings?.enabled ?? false,
        balance,
        history,
        achievements: granted,
      };
    }),

  /** Ajuste manual de pontos. Motivo é obrigatório. */
  adjust: coordinatorProcedure
    .input(
      z.object({
        serverId: z.number().int().positive(),
        pointsDelta: z.number().int().refine(v => v !== 0, "Informe um valor diferente de zero."),
        reason: z.string().trim().min(5).max(500),
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

      const { transactionId } = await adjustPoints({
        parishId: ctx.parishId,
        serverId: input.serverId,
        pointsDelta: input.pointsDelta,
        reason: input.reason,
        createdByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
      });

      await recordAudit(ctx.actor, {
        action: "POINTS_ADJUSTED",
        entityType: "point_transaction",
        entityId: transactionId,
        metadata: { serverId: input.serverId, pointsDelta: input.pointsDelta },
        ...requestMeta(ctx),
      });

      return { transactionId } as const;
    }),

  /** Reverte uma transação preservando a original no histórico. */
  reverse: coordinatorProcedure
    .input(
      z.object({
        transactionId: z.number().int().positive(),
        reason: z.string().trim().min(5).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await reverseTransaction({
        parishId: ctx.parishId,
        transactionId: input.transactionId,
        reason: input.reason,
        createdByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
      });

      if (!result.reversed) throw badRequest(result.message ?? "Não foi possível reverter.");

      await recordAudit(ctx.actor, {
        action: "POINTS_REVERSED",
        entityType: "point_transaction",
        entityId: input.transactionId,
        metadata: { reason: input.reason },
        ...requestMeta(ctx),
      });

      return { success: true } as const;
    }),

  /** Catálogo de conquistas da paróquia. */
  achievements: router({
    list: coordinatorProcedure.query(async ({ ctx }) => {
      const db = await getDbOrThrow();
      return db
        .select()
        .from(achievements)
        .where(eq(achievements.parishId, ctx.parishId))
        .orderBy(achievements.name);
    }),

    /** Concessão manual de conquista, com motivo registrado. */
    grant: coordinatorProcedure
      .input(
        z.object({
          serverId: z.number().int().positive(),
          achievementId: z.number().int().positive(),
          reason: z.string().trim().min(3).max(500),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDbOrThrow();

        const [achievement] = await db
          .select({ id: achievements.id, name: achievements.name })
          .from(achievements)
          .where(
            and(
              eq(achievements.id, input.achievementId),
              eq(achievements.parishId, ctx.parishId),
            ),
          )
          .limit(1);
        if (!achievement) throw notFound("Conquista");

        const [server] = await db
          .select({ id: altarServers.id })
          .from(altarServers)
          .where(and(eq(altarServers.id, input.serverId), eq(altarServers.parishId, ctx.parishId)))
          .limit(1);
        if (!server) throw notFound("Servidor");

        const [existing] = await db
          .select({ id: serverAchievements.id })
          .from(serverAchievements)
          .where(
            and(
              eq(serverAchievements.serverId, input.serverId),
              eq(serverAchievements.achievementId, input.achievementId),
            ),
          )
          .limit(1);
        if (existing) throw badRequest("Este servidor já possui esta conquista.");

        await db.insert(serverAchievements).values({
          parishId: ctx.parishId,
          serverId: input.serverId,
          achievementId: input.achievementId,
          source: "MANUAL",
          reason: input.reason,
          grantedByUserId: ctx.actor.type === "USER" ? ctx.actor.user.id : null,
        });

        await enqueueNotification({
          parishId: ctx.parishId,
          serverId: input.serverId,
          type: "ACHIEVEMENT_GRANTED",
          title: "Você recebeu uma conquista",
          body: `Parabéns! Você recebeu a conquista "${achievement.name}".`,
          referenceType: "achievement",
          referenceId: input.achievementId,
        });

        await recordAudit(ctx.actor, {
          action: "ACHIEVEMENT_GRANTED",
          entityType: "server_achievement",
          entityId: input.achievementId,
          metadata: { serverId: input.serverId, source: "MANUAL" },
          ...requestMeta(ctx),
        });

        return { success: true } as const;
      }),
  }),

  /**
   * Ranking da paróquia. Retorna vazio e desabilitado quando a paróquia não
   * ativou o recurso — o default é não expor comparação entre servidores.
   */
  ranking: parishProcedure
    .input(
      z
        .object({
          periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
          periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
          limit: z.number().int().min(1).max(100).default(20),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) =>
      getRanking({
        parishId: ctx.parishId,
        periodStart: input?.periodStart ?? null,
        periodEnd: input?.periodEnd ?? null,
        limit: input?.limit ?? 20,
      }),
    ),

  /** Saldos de vários servidores, para a visão da coordenação. */
  balances: coordinatorProcedure
    .input(z.object({ serverIds: z.array(z.number().int().positive()).max(300) }))
    .query(async ({ ctx, input }) => {
      const balances = await getBalances({
        parishId: ctx.parishId,
        serverIds: input.serverIds,
      });
      return Array.from(balances.entries()).map(([serverId, points]) => ({ serverId, points }));
    }),
});
