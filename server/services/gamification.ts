/**
 * Serviço de gamificação.
 *
 * Três invariantes governam este módulo:
 *
 * 1. **Append-only.** Nenhuma transação é editada ou apagada. Corrigir um erro
 *    significa lançar uma transação de reversão que aponta para a original.
 * 2. **Idempotência.** Cada concessão carrega uma `idempotencyKey` derivada do
 *    tipo de evento e da referência. Rodar a mesma concessão duas vezes não
 *    duplica pontos — importante porque o registro de presença pode ser
 *    reenviado pelo coordenador.
 * 3. **Saldo derivado.** Não existe coluna de saldo. O total é sempre a soma
 *    das transações, o que torna impossível o saldo divergir do histórico.
 *
 * Salvaguardas para menores: a penalização por ausência vem desabilitada por
 * padrão e o ranking de menores também. Gamificação em contexto pastoral com
 * crianças pode virar constrangimento público, então o default é conservador.
 */
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";

import {
  achievements,
  altarServers,
  attendanceRecords,
  celebrations,
  gamificationSettings,
  pointRules,
  pointTransactions,
  scheduleAssignments,
  serverAchievements,
} from "../../drizzle/schema";
import { getDb, getDbOrThrow } from "../db";
import { calculateAge, type PointEventType } from "@shared/domain";

/** Eventos que subtraem pontos. Só são aplicados se a paróquia habilitar penalidades. */
const PENALTY_EVENTS: PointEventType[] = ["JUSTIFIED_ABSENCE", "UNJUSTIFIED_ABSENCE"];

export type GrantResult =
  | { granted: true; transactionId: number; points: number }
  | { granted: false; reason: "DISABLED" | "RULE_DISABLED" | "PENALTIES_DISABLED" | "DUPLICATE" | "ERROR" };

/**
 * Concede pontos a um servidor conforme a regra configurada na paróquia.
 *
 * Nunca lança exceção: a gamificação é acessória e não pode derrubar o registro
 * de presença ou a confirmação que a originou.
 */
export async function grantPoints(params: {
  parishId: number;
  serverId: number;
  eventType: PointEventType;
  referenceType: string;
  referenceId: number | null;
  reason?: string | null;
  createdByUserId?: number | null;
}): Promise<GrantResult> {
  try {
    const db = await getDb();
    if (!db) return { granted: false, reason: "ERROR" };

    const [settings] = await db
      .select()
      .from(gamificationSettings)
      .where(eq(gamificationSettings.parishId, params.parishId))
      .limit(1);

    if (!settings || !settings.enabled) return { granted: false, reason: "DISABLED" };

    // Penalidades exigem opt-in explícito da paróquia.
    if (PENALTY_EVENTS.includes(params.eventType) && !settings.penaltiesEnabled) {
      return { granted: false, reason: "PENALTIES_DISABLED" };
    }

    const [rule] = await db
      .select()
      .from(pointRules)
      .where(
        and(
          eq(pointRules.parishId, params.parishId),
          eq(pointRules.eventType, params.eventType),
        ),
      )
      .limit(1);

    if (!rule || !rule.enabled) return { granted: false, reason: "RULE_DISABLED" };
    if (rule.points === 0) return { granted: false, reason: "RULE_DISABLED" };

    const idempotencyKey = buildIdempotencyKey({
      parishId: params.parishId,
      serverId: params.serverId,
      eventType: params.eventType,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
    });

    const [existing] = await db
      .select({ id: pointTransactions.id })
      .from(pointTransactions)
      // A chave já embute a paróquia, mas o filtro explícito garante o isolamento
      // mesmo se a composição da chave mudar no futuro.
      .where(
        and(
          eq(pointTransactions.idempotencyKey, idempotencyKey),
          eq(pointTransactions.parishId, params.parishId),
        ),
      )
      .limit(1);

    if (existing) return { granted: false, reason: "DUPLICATE" };

    await db.insert(pointTransactions).values({
      parishId: params.parishId,
      serverId: params.serverId,
      eventType: params.eventType,
      pointsDelta: rule.points,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      idempotencyKey,
      reason: params.reason ?? rule.description ?? null,
      createdByUserId: params.createdByUserId ?? null,
    });

    const [created] = await db
      .select({ id: pointTransactions.id })
      .from(pointTransactions)
      .where(
        and(
          eq(pointTransactions.idempotencyKey, idempotencyKey),
          eq(pointTransactions.parishId, params.parishId),
        ),
      )
      .limit(1);

    // A concessão de pontos pode desbloquear conquistas automáticas.
    await evaluateAutomaticAchievements({
      parishId: params.parishId,
      serverId: params.serverId,
    });

    return { granted: true, transactionId: created?.id ?? 0, points: rule.points };
  } catch (error) {
    console.error("[Gamificação] Falha ao conceder pontos:", params.eventType, error);
    return { granted: false, reason: "ERROR" };
  }
}

/**
 * Chave de idempotência. Inclui a paróquia para evitar qualquer chance de
 * colisão entre instalações diferentes que compartilham o banco.
 */
function buildIdempotencyKey(params: {
  parishId: number;
  serverId: number;
  eventType: string;
  referenceType: string;
  referenceId: number | null;
}): string {
  return [
    `p${params.parishId}`,
    `s${params.serverId}`,
    params.eventType,
    params.referenceType,
    params.referenceId ?? "null",
  ].join(":");
}

/** Saldo do servidor, sempre derivado da soma das transações. */
export async function getServerBalance(params: {
  parishId: number;
  serverId: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${pointTransactions.pointsDelta}), 0)` })
    .from(pointTransactions)
    .where(
      and(
        eq(pointTransactions.parishId, params.parishId),
        eq(pointTransactions.serverId, params.serverId),
      ),
    );

  return Number(row?.total ?? 0);
}

/** Saldos de vários servidores em uma única consulta. */
export async function getBalances(params: {
  parishId: number;
  serverIds: number[];
}): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (params.serverIds.length === 0) return result;

  const db = await getDb();
  if (!db) return result;

  const rows = await db
    .select({
      serverId: pointTransactions.serverId,
      total: sql<number>`COALESCE(SUM(${pointTransactions.pointsDelta}), 0)`,
    })
    .from(pointTransactions)
    .where(
      and(
        eq(pointTransactions.parishId, params.parishId),
        inArray(pointTransactions.serverId, params.serverIds),
      ),
    )
    .groupBy(pointTransactions.serverId);

  for (const row of rows) {
    result.set(row.serverId, Number(row.total));
  }
  for (const id of params.serverIds) {
    if (!result.has(id)) result.set(id, 0);
  }

  return result;
}

/**
 * Reverte uma transação criando outra de sinal oposto.
 * A transação original permanece intacta no histórico.
 */
export async function reverseTransaction(params: {
  parishId: number;
  transactionId: number;
  reason: string;
  createdByUserId: number | null;
}): Promise<{ reversed: boolean; message?: string }> {
  const db = await getDbOrThrow();

  const [original] = await db
    .select()
    .from(pointTransactions)
    .where(
      and(
        eq(pointTransactions.id, params.transactionId),
        eq(pointTransactions.parishId, params.parishId),
      ),
    )
    .limit(1);

  if (!original) return { reversed: false, message: "Transação não encontrada." };
  if (original.isReversal) {
    return { reversed: false, message: "Não é possível reverter uma reversão." };
  }

  const [alreadyReversed] = await db
    .select({ id: pointTransactions.id })
    .from(pointTransactions)
    .where(
      and(
        eq(pointTransactions.parishId, params.parishId),
        eq(pointTransactions.reversesTransactionId, params.transactionId),
      ),
    )
    .limit(1);

  if (alreadyReversed) return { reversed: false, message: "Esta transação já foi revertida." };

  await db.insert(pointTransactions).values({
    parishId: params.parishId,
    serverId: original.serverId,
    eventType: original.eventType,
    pointsDelta: -original.pointsDelta,
    referenceType: original.referenceType,
    referenceId: original.referenceId,
    idempotencyKey: `reversal:${params.transactionId}`,
    reason: params.reason,
    createdByUserId: params.createdByUserId,
    isReversal: true,
    reversesTransactionId: params.transactionId,
  });

  return { reversed: true };
}

/**
 * Ajuste manual da coordenação. Exige motivo e é sempre auditável.
 * Usa timestamp na chave porque ajustes legítimos podem repetir-se.
 */
export async function adjustPoints(params: {
  parishId: number;
  serverId: number;
  pointsDelta: number;
  reason: string;
  createdByUserId: number | null;
}): Promise<{ transactionId: number }> {
  const db = await getDbOrThrow();

  const idempotencyKey = `manual:${params.parishId}:${params.serverId}:${Date.now()}`;

  await db.insert(pointTransactions).values({
    parishId: params.parishId,
    serverId: params.serverId,
    eventType: "MANUAL_ADJUSTMENT",
    pointsDelta: params.pointsDelta,
    referenceType: "manual_adjustment",
    referenceId: null,
    idempotencyKey,
    reason: params.reason,
    createdByUserId: params.createdByUserId,
  });

  const [created] = await db
    .select({ id: pointTransactions.id })
    .from(pointTransactions)
    .where(
      and(
        eq(pointTransactions.idempotencyKey, idempotencyKey),
        eq(pointTransactions.parishId, params.parishId),
      ),
    )
    .limit(1);

  return { transactionId: created?.id ?? 0 };
}

/**
 * Avalia conquistas automáticas do servidor e concede as que atingiram o
 * critério. Falhas são silenciosas: conquista é reconhecimento, não contrato.
 */
export async function evaluateAutomaticAchievements(params: {
  parishId: number;
  serverId: number;
}): Promise<number> {
  try {
    const db = await getDb();
    if (!db) return 0;

    const catalog = await db
      .select()
      .from(achievements)
      .where(
        and(
          eq(achievements.parishId, params.parishId),
          eq(achievements.status, "ACTIVE"),
        ),
      );

    const automatic = catalog.filter(a => a.criteriaKind !== "MANUAL_ONLY");
    if (automatic.length === 0) return 0;

    const alreadyGranted = await db
      .select({ achievementId: serverAchievements.achievementId })
      .from(serverAchievements)
      .where(
        and(
          eq(serverAchievements.parishId, params.parishId),
          eq(serverAchievements.serverId, params.serverId),
        ),
      );
    const grantedIds = new Set(alreadyGranted.map(g => g.achievementId));

    const pending = automatic.filter(a => !grantedIds.has(a.id));
    if (pending.length === 0) return 0;

    const transactions = await db
      .select({
        eventType: pointTransactions.eventType,
        pointsDelta: pointTransactions.pointsDelta,
      })
      .from(pointTransactions)
      .where(
        and(
          eq(pointTransactions.parishId, params.parishId),
          eq(pointTransactions.serverId, params.serverId),
        ),
      );

    const totalPoints = transactions.reduce((sum, t) => sum + t.pointsDelta, 0);
    const countBy = (type: PointEventType) =>
      transactions.filter(t => t.eventType === type && t.pointsDelta > 0).length;

    // Consecutividade não pode ser inferida da contagem de transações: depende
    // da ordem cronológica das celebrações. Resolvido sob demanda para não
    // custar uma consulta extra quando nenhuma conquista pendente usa o critério.
    let streakCache: number | null = null;
    const resolveStreak = async (): Promise<number> => {
      if (streakCache === null) {
        streakCache = await countConsecutiveConfirmations({
          parishId: params.parishId,
          serverId: params.serverId,
        });
      }
      return streakCache;
    };

    let granted = 0;

    for (const achievement of pending) {
      let reached = false;

      switch (achievement.criteriaKind) {
        case "FIRST_PARTICIPATION":
          reached = countBy("PARTICIPATION_DONE") >= 1;
          break;
        case "PARTICIPATION_COUNT":
          reached = countBy("PARTICIPATION_DONE") >= achievement.threshold;
          break;
        case "CONSECUTIVE_CONFIRMATIONS":
          reached = (await resolveStreak()) >= achievement.threshold;
          break;
        case "VOLUNTEER_COUNT":
          reached = countBy("VOLUNTEER_SHIFT_DONE") >= achievement.threshold;
          break;
        case "FORMATION_COUNT":
          reached = countBy("FORMATION_COMPLETED") >= achievement.threshold;
          break;
        default:
          reached = false;
      }

      if (!reached) continue;

      try {
        await db.insert(serverAchievements).values({
          parishId: params.parishId,
          serverId: params.serverId,
          achievementId: achievement.id,
          source: "AUTOMATIC",
          reason: `Critério atingido: ${achievement.threshold}`,
        });
        granted += 1;
      } catch {
        // Índice único garante que a conquista não seja concedida duas vezes.
      }
    }

    return granted;
  } catch (error) {
    console.error("[Gamificação] Falha ao avaliar conquistas:", error);
    return 0;
  }
}

/**
 * Conta a sequência atual de confirmações consecutivas do servidor.
 *
 * Percorre as alocações do servidor em ordem cronológica decrescente de
 * celebração e conta quantas confirmações positivas houve em sequência antes de
 * encontrar uma recusa ou uma ausência. Pendências (sem resposta) não quebram a
 * sequência: elas simplesmente ainda não aconteceram.
 */
export async function countConsecutiveConfirmations(params: {
  parishId: number;
  serverId: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const rows = await db
    .select({
      assignmentStatus: scheduleAssignments.status,
      attendanceStatus: attendanceRecords.status,
      date: celebrations.date,
      startTime: celebrations.startTime,
    })
    .from(scheduleAssignments)
    .innerJoin(celebrations, eq(celebrations.id, scheduleAssignments.celebrationId))
    .leftJoin(attendanceRecords, eq(attendanceRecords.assignmentId, scheduleAssignments.id))
    .where(
      and(
        eq(scheduleAssignments.parishId, params.parishId),
        eq(scheduleAssignments.serverId, params.serverId),
      ),
    )
    .orderBy(desc(celebrations.date), desc(celebrations.startTime))
    .limit(200);

  let streak = 0;
  for (const row of rows) {
    // Ausência registrada quebra a sequência, mesmo que tenha sido confirmada.
    if (
      row.attendanceStatus &&
      ["UNJUSTIFIED_ABSENCE", "JUSTIFIED_ABSENCE", "COMMUNICATED_ABSENCE"].includes(
        row.attendanceStatus,
      )
    ) {
      break;
    }

    if (row.assignmentStatus === "CONFIRMED") {
      streak += 1;
      continue;
    }

    if (["DECLINED", "SUBSTITUTED", "CANCELLED", "CONFLICT"].includes(row.assignmentStatus)) {
      break;
    }

    // PENDING e demais estados intermediários: nada a contar, sem quebrar.
  }

  return streak;
}

/**
 * Ranking da paróquia. Respeita duas configurações independentes:
 * `rankingEnabled` habilita o recurso e `minorsRankingEnabled` decide se
 * menores de idade aparecem. Ambas vêm desabilitadas por padrão.
 */
export async function getRanking(params: {
  parishId: number;
  periodStart?: string | null;
  periodEnd?: string | null;
  limit?: number;
}): Promise<{
  enabled: boolean;
  includesMinors: boolean;
  entries: Array<{ serverId: number; name: string; points: number; isMinor: boolean }>;
}> {
  const db = await getDb();
  if (!db) return { enabled: false, includesMinors: false, entries: [] };

  const [settings] = await db
    .select()
    .from(gamificationSettings)
    .where(eq(gamificationSettings.parishId, params.parishId))
    .limit(1);

  if (!settings || !settings.enabled || !settings.rankingEnabled) {
    return { enabled: false, includesMinors: false, entries: [] };
  }

  const conditions = [eq(pointTransactions.parishId, params.parishId)];
  if (params.periodStart) {
    conditions.push(gte(pointTransactions.createdAt, new Date(`${params.periodStart}T00:00:00`)));
  }
  if (params.periodEnd) {
    conditions.push(lte(pointTransactions.createdAt, new Date(`${params.periodEnd}T23:59:59`)));
  }

  const rows = await db
    .select({
      serverId: pointTransactions.serverId,
      name: altarServers.name,
      birthDate: altarServers.birthDate,
      points: sql<number>`COALESCE(SUM(${pointTransactions.pointsDelta}), 0)`,
    })
    .from(pointTransactions)
    .innerJoin(
      altarServers,
      and(
        eq(altarServers.id, pointTransactions.serverId),
        // Defesa em profundidade: o join também é restrito à paróquia, para que
        // nenhum nome de outra instalação possa aparecer no ranking.
        eq(altarServers.parishId, params.parishId),
      ),
    )
    .where(and(...conditions))
    .groupBy(pointTransactions.serverId, altarServers.name, altarServers.birthDate)
    .orderBy(desc(sql`COALESCE(SUM(${pointTransactions.pointsDelta}), 0)`))
    .limit(params.limit ?? 100);

  const entries = rows
    .map(row => ({
      serverId: row.serverId,
      name: row.name,
      points: Number(row.points),
      isMinor: calculateAge(row.birthDate) < 18,
    }))
    .filter(entry => settings.minorsRankingEnabled || !entry.isMinor);

  return {
    enabled: true,
    includesMinors: settings.minorsRankingEnabled,
    entries,
  };
}
