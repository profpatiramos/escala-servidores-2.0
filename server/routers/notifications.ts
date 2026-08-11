/**
 * Router de notificações in-app.
 *
 * Notificação é sempre acessória: nenhuma falha aqui invalida a operação que a
 * originou. Este router apenas lê e marca como lida — a criação acontece nos
 * serviços de domínio.
 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { notifications } from "../../drizzle/schema";
import { getDbOrThrow } from "../db";
import { authedProcedure, router } from "../trpc";
import type { Actor } from "../auth/types";

/**
 * Filtro de destinatário derivado do ator autenticado.
 * Um servidor só vê notificações endereçadas a ele; um usuário, às suas.
 */
function recipientFilter(actor: Actor) {
  if (actor.type === "SERVER") {
    return and(
      eq(notifications.parishId, actor.parishId),
      eq(notifications.serverId, actor.server.id),
    );
  }

  const conditions = [eq(notifications.userId, actor.user.id)];
  if (actor.parishId !== null) {
    conditions.push(eq(notifications.parishId, actor.parishId));
  }
  return and(...conditions);
}

export const notificationsRouter = router({
  /** Lista as notificações do ator, mais recentes primeiro. */
  list: authedProcedure
    .input(
      z
        .object({
          onlyUnread: z.boolean().default(false),
          limit: z.number().int().min(1).max(100).default(30),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDbOrThrow();
      const filters = [recipientFilter(ctx.actor)];
      if (input?.onlyUnread) filters.push(isNull(notifications.readAt));

      return db
        .select({
          id: notifications.id,
          type: notifications.type,
          title: notifications.title,
          body: notifications.body,
          referenceType: notifications.referenceType,
          referenceId: notifications.referenceId,
          actionPath: notifications.actionPath,
          readAt: notifications.readAt,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .where(and(...filters))
        .orderBy(desc(notifications.createdAt))
        .limit(input?.limit ?? 30);
    }),

  /** Contador de não lidas, para o badge da central. */
  unreadCount: authedProcedure.query(async ({ ctx }) => {
    const db = await getDbOrThrow();
    const [row] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(notifications)
      .where(and(recipientFilter(ctx.actor), isNull(notifications.readAt)));
    return Number(row?.total ?? 0);
  }),

  /** Marca uma notificação como lida. Só o destinatário consegue. */
  markRead: authedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();

      const [target] = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(eq(notifications.id, input.id), recipientFilter(ctx.actor)))
        .limit(1);

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Notificação não encontrada." });
      }

      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(eq(notifications.id, input.id));

      return { success: true } as const;
    }),

  /** Marca todas como lidas. */
  markAllRead: authedProcedure.mutation(async ({ ctx }) => {
    const db = await getDbOrThrow();
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(recipientFilter(ctx.actor), isNull(notifications.readAt)));
    return { success: true } as const;
  }),
});
