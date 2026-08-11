/**
 * Serviço de notificações.
 *
 * Princípio inviolável: a falha no envio de uma notificação NUNCA invalida a
 * operação de negócio que a originou. Toda função deste módulo captura os
 * próprios erros e apenas registra o problema.
 */
import type { NotificationType } from "@shared/domain";
import { and, desc, eq, isNull, or } from "drizzle-orm";

import {
  altarServers,
  familyLinks,
  notifications,
  responsibles,
  scheduleAssignments,
} from "../../drizzle/schema";
import { getDb } from "../db";

export type NotificationInput = {
  parishId?: number | null;
  userId?: number | null;
  serverId?: number | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  referenceType?: string | null;
  referenceId?: number | null;
  actionPath?: string | null;
};

/**
 * Registra uma notificação in-app e dispara o canal de e-mail quando aplicável.
 * Retorna `false` quando não foi possível registrar, sem lançar exceção.
 */
export async function enqueueNotification(input: NotificationInput): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    if (!input.userId && !input.serverId) return false;

    await db.insert(notifications).values({
      parishId: input.parishId ?? 0,
      userId: input.userId ?? null,
      serverId: input.serverId ?? null,
      type: input.type,
      title: input.title.slice(0, 180),
      body: input.body ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      actionPath: input.actionPath ?? null,
      status: "SENT",
      sentAt: new Date(),
    });

    return true;
  } catch (error) {
    console.error("[Notificações] Falha ao registrar notificação:", input.type, error);
    return false;
  }
}

/** Registra várias notificações de uma vez, ignorando falhas individuais. */
export async function enqueueNotifications(inputs: NotificationInput[]): Promise<number> {
  let sent = 0;
  for (const input of inputs) {
    const ok = await enqueueNotification(input);
    if (ok) sent += 1;
  }
  return sent;
}

/** Lista as notificações do destinatário informado, mais recentes primeiro. */
export async function listNotifications(params: {
  parishId: number;
  userId?: number | null;
  serverId?: number | null;
  onlyUnread?: boolean;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const recipient = params.userId
    ? eq(notifications.userId, params.userId)
    : params.serverId
      ? eq(notifications.serverId, params.serverId)
      : null;

  if (!recipient) return [];

  const conditions = [eq(notifications.parishId, params.parishId), recipient];
  if (params.onlyUnread) conditions.push(isNull(notifications.readAt));

  return db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(params.limit ?? 50);
}

/** Marca uma notificação do próprio destinatário como lida. */
export async function markNotificationRead(params: {
  notificationId: number;
  parishId: number;
  userId?: number | null;
  serverId?: number | null;
}): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    const recipient = params.userId
      ? eq(notifications.userId, params.userId)
      : params.serverId
        ? eq(notifications.serverId, params.serverId)
        : null;
    if (!recipient) return false;

    await db
      .update(notifications)
      .set({ status: "READ", readAt: new Date() })
      .where(
        and(
          eq(notifications.id, params.notificationId),
          eq(notifications.parishId, params.parishId),
          recipient,
        ),
      );
    return true;
  } catch (error) {
    console.error("[Notificações] Falha ao marcar como lida:", error);
    return false;
  }
}

/** Marca todas as notificações do destinatário como lidas. */
export async function markAllNotificationsRead(params: {
  parishId: number;
  userId?: number | null;
  serverId?: number | null;
}): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    const recipient = params.userId
      ? eq(notifications.userId, params.userId)
      : params.serverId
        ? eq(notifications.serverId, params.serverId)
        : null;
    if (!recipient) return false;

    await db
      .update(notifications)
      .set({ status: "READ", readAt: new Date() })
      .where(
        and(eq(notifications.parishId, params.parishId), recipient, isNull(notifications.readAt)),
      );
    return true;
  } catch (error) {
    console.error("[Notificações] Falha ao marcar todas como lidas:", error);
    return false;
  }
}

/**
 * Notifica todos os servidores escalados em uma celebração e, quando houver
 * vínculo familiar ativo, também os responsáveis por eles.
 *
 * Menores frequentemente não acompanham o aplicativo por conta própria, então o
 * responsável precisa receber a mesma informação — é ele quem organiza o
 * transporte e a agenda da família.
 */
export async function notifyScheduleParticipants(params: {
  parishId: number;
  celebrationId: number;
  type: NotificationType;
  title: string;
  body: string;
  actionPath?: string | null;
}): Promise<number> {
  try {
    const db = await getDb();
    if (!db) return 0;

    const assigned = await db
      .selectDistinct({ serverId: scheduleAssignments.serverId })
      .from(scheduleAssignments)
      .where(
        and(
          eq(scheduleAssignments.parishId, params.parishId),
          eq(scheduleAssignments.celebrationId, params.celebrationId),
        ),
      );

    if (assigned.length === 0) return 0;

    const serverIds = assigned.map(row => row.serverId);
    const inputs: NotificationInput[] = [];

    for (const serverId of serverIds) {
      inputs.push({
        parishId: params.parishId,
        serverId,
        type: params.type,
        title: params.title,
        body: params.body,
        referenceType: "celebration",
        referenceId: params.celebrationId,
        actionPath: params.actionPath ?? null,
      });
    }

    // Responsáveis com vínculo ativo recebem a mesma notificação.
    const guardians = await db
      .select({
        responsibleUserId: responsibles.userId,
        serverName: altarServers.name,
      })
      .from(familyLinks)
      .innerJoin(responsibles, eq(responsibles.id, familyLinks.responsibleId))
      .innerJoin(altarServers, eq(altarServers.id, familyLinks.serverId))
      .where(
        and(
          eq(familyLinks.parishId, params.parishId),
          isNull(familyLinks.endedAt),
          or(...serverIds.map(id => eq(familyLinks.serverId, id))),
        ),
      );

    for (const guardian of guardians) {
      if (!guardian.responsibleUserId) continue;
      inputs.push({
        parishId: params.parishId,
        userId: guardian.responsibleUserId,
        type: params.type,
        title: params.title,
        body: `${guardian.serverName}: ${params.body}`,
        referenceType: "celebration",
        referenceId: params.celebrationId,
        actionPath: params.actionPath ?? null,
      });
    }

    return enqueueNotifications(inputs);
  } catch (error) {
    console.error("[Notificações] Falha ao notificar participantes da escala:", error);
    return 0;
  }
}
