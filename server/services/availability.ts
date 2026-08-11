/**
 * Resolução de disponibilidade.
 *
 * Este módulo concentra a única fonte de verdade sobre "este servidor pode
 * assumir esta função neste dia e horário?". Tanto a validação de escala manual
 * quanto o assistente de IA consomem estas funções, garantindo que ambos
 * apliquem exatamente as mesmas restrições.
 *
 * Hierarquia de decisão (da mais forte para a mais fraca):
 *   1. Férias                      → indisponível (restrição rígida)
 *   2. Exceção pontual na data     → sobrepõe a recorrência semanal
 *   3. Disponibilidade FAMILY      → restrição logística obrigatória
 *   4. Disponibilidade SERVER      → recorrência semanal do próprio servidor
 *   5. Preferências                → NUNCA restringem; apenas pontuam
 */
import { timeRangeContains, timeRangesOverlap, weekdayFromDateKey } from "@shared/domain";
import { and, eq, inArray, lte, gte, or, isNull } from "drizzle-orm";

import {
  availabilities,
  availabilityExceptions,
  schedulePreferences,
  vacations,
  type Availability,
  type AvailabilityException,
  type SchedulePreference,
  type Vacation,
} from "../../drizzle/schema";
import { getDbOrThrow } from "../db";

/** Conjunto de restrições carregado uma única vez para um período. */
export type AvailabilityContext = {
  recurring: Availability[];
  exceptions: AvailabilityException[];
  vacationList: Vacation[];
  preferences: SchedulePreference[];
};

export type AvailabilityVerdict = {
  available: boolean;
  /** Código estável da restrição que impediu a alocação. */
  code:
    | "AVAILABLE"
    | "SERVER_ON_VACATION"
    | "SERVER_UNAVAILABLE"
    | "SERVER_FAMILY_UNAVAILABLE";
  detail: string | null;
};

/**
 * Carrega todas as restrições dos servidores informados em um período.
 * Evita consultas por servidor durante a validação de uma escala inteira.
 */
export async function loadAvailabilityContext(params: {
  parishId: number;
  serverIds: number[];
  periodStart: string;
  periodEnd: string;
}): Promise<AvailabilityContext> {
  if (params.serverIds.length === 0) {
    return { recurring: [], exceptions: [], vacationList: [], preferences: [] };
  }

  const db = await getDbOrThrow();

  const recurring = await db
    .select()
    .from(availabilities)
    .where(
      and(
        eq(availabilities.parishId, params.parishId),
        eq(availabilities.status, "ACTIVE"),
        inArray(availabilities.serverId, params.serverIds),
        // Vigência: aceita janelas abertas em qualquer das pontas.
        or(isNull(availabilities.effectiveFrom), lte(availabilities.effectiveFrom, params.periodEnd)),
        or(
          isNull(availabilities.effectiveUntil),
          gte(availabilities.effectiveUntil, params.periodStart),
        ),
      ),
    );

  const exceptions = await db
    .select()
    .from(availabilityExceptions)
    .where(
      and(
        eq(availabilityExceptions.parishId, params.parishId),
        inArray(availabilityExceptions.serverId, params.serverIds),
        gte(availabilityExceptions.date, params.periodStart),
        lte(availabilityExceptions.date, params.periodEnd),
      ),
    );

  const vacationList = await db
    .select()
    .from(vacations)
    .where(
      and(
        eq(vacations.parishId, params.parishId),
        inArray(vacations.serverId, params.serverIds),
        // Sobreposição entre a janela de férias e o período consultado.
        lte(vacations.startDate, params.periodEnd),
        gte(vacations.endDate, params.periodStart),
      ),
    );

  const preferences = await db
    .select()
    .from(schedulePreferences)
    .where(
      and(
        eq(schedulePreferences.parishId, params.parishId),
        eq(schedulePreferences.status, "ACTIVE"),
        inArray(schedulePreferences.serverId, params.serverIds),
      ),
    );

  return { recurring, exceptions, vacationList, preferences };
}

/**
 * Decide se um servidor está disponível em uma data e faixa de horário.
 *
 * A função é pura: recebe o contexto já carregado e não consulta o banco, o que
 * permite validar centenas de combinações sem custo adicional de I/O.
 */
export function evaluateAvailability(
  context: AvailabilityContext,
  params: { serverId: number; date: string; startTime: string; endTime: string },
): AvailabilityVerdict {
  const { serverId, date, startTime, endTime } = params;

  // 1. Férias: restrição rígida, cobre o dia inteiro.
  const vacation = context.vacationList.find(
    v => v.serverId === serverId && v.startDate <= date && v.endDate >= date,
  );
  if (vacation) {
    return {
      available: false,
      code: "SERVER_ON_VACATION",
      detail: `Em férias de ${formatDate(vacation.startDate)} a ${formatDate(vacation.endDate)}.`,
    };
  }

  // 2. Exceções pontuais sobrepõem a recorrência semanal na data.
  const dayExceptions = context.exceptions.filter(e => e.serverId === serverId && e.date === date);

  const blockingException = dayExceptions.find(
    e => e.exceptionType === "UNAVAILABLE" && overlapsException(e, startTime, endTime),
  );
  if (blockingException) {
    return {
      available: false,
      code:
        blockingException.scope === "FAMILY"
          ? "SERVER_FAMILY_UNAVAILABLE"
          : "SERVER_UNAVAILABLE",
      detail: blockingException.reason ?? "Indisponibilidade registrada nesta data.",
    };
  }

  const grantingException = dayExceptions.find(
    e => e.exceptionType === "EXCEPTIONALLY_AVAILABLE" && coversException(e, startTime, endTime),
  );
  if (grantingException) {
    // Disponibilidade extraordinária declarada para a data: dispensa a recorrência.
    return { available: true, code: "AVAILABLE", detail: null };
  }

  const weekday = weekdayFromDateKey(date);

  // 3. Restrição logística da família.
  const familyVerdict = evaluateScope(context.recurring, {
    serverId,
    weekday,
    date,
    startTime,
    endTime,
    scope: "FAMILY",
  });
  if (familyVerdict === "BLOCKED") {
    return {
      available: false,
      code: "SERVER_FAMILY_UNAVAILABLE",
      detail: "A família não tem disponibilidade logística neste horário.",
    };
  }

  // 4. Recorrência semanal do próprio servidor.
  const serverVerdict = evaluateScope(context.recurring, {
    serverId,
    weekday,
    date,
    startTime,
    endTime,
    scope: "SERVER",
  });
  if (serverVerdict === "BLOCKED") {
    return {
      available: false,
      code: "SERVER_UNAVAILABLE",
      detail: "Fora da disponibilidade semanal declarada.",
    };
  }

  return { available: true, code: "AVAILABLE", detail: null };
}

type ScopeVerdict = "ALLOWED" | "BLOCKED";

/**
 * Avalia um escopo de disponibilidade recorrente.
 *
 * Semântica adotada: se o servidor declarou QUALQUER janela `AVAILABLE` para o
 * dia da semana, então apenas os horários contidos nessas janelas são
 * permitidos. Se não declarou nada para aquele dia, considera-se disponível —
 * isso evita travar a operação de paróquias que ainda não preencheram a agenda.
 * Janelas `UNAVAILABLE` sempre bloqueiam por sobreposição.
 */
function evaluateScope(
  recurring: Availability[],
  params: {
    serverId: number;
    weekday: number;
    date: string;
    startTime: string;
    endTime: string;
    scope: "SERVER" | "FAMILY";
  },
): ScopeVerdict {
  const entries = recurring.filter(
    a =>
      a.serverId === params.serverId &&
      a.scope === params.scope &&
      a.weekday === params.weekday &&
      isEffective(a, params.date),
  );

  if (entries.length === 0) return "ALLOWED";

  const blocked = entries.some(
    a =>
      a.availabilityType === "UNAVAILABLE" &&
      timeRangesOverlap(a.startTime, a.endTime, params.startTime, params.endTime),
  );
  if (blocked) return "BLOCKED";

  const positives = entries.filter(a => a.availabilityType === "AVAILABLE");
  if (positives.length === 0) return "ALLOWED";

  const covered = positives.some(a =>
    timeRangeContains(a.startTime, a.endTime, params.startTime, params.endTime),
  );
  return covered ? "ALLOWED" : "BLOCKED";
}

/** Verifica se a regra recorrente está vigente na data. */
function isEffective(entry: Availability, date: string): boolean {
  if (entry.effectiveFrom && entry.effectiveFrom > date) return false;
  if (entry.effectiveUntil && entry.effectiveUntil < date) return false;
  return true;
}

/** Exceção sem horário cobre o dia inteiro. */
function overlapsException(
  exception: AvailabilityException,
  startTime: string,
  endTime: string,
): boolean {
  if (!exception.startTime || !exception.endTime) return true;
  return timeRangesOverlap(exception.startTime, exception.endTime, startTime, endTime);
}

/** Exceção positiva precisa cobrir integralmente a faixa solicitada. */
function coversException(
  exception: AvailabilityException,
  startTime: string,
  endTime: string,
): boolean {
  if (!exception.startTime || !exception.endTime) return true;
  return timeRangeContains(exception.startTime, exception.endTime, startTime, endTime);
}

/**
 * Pontua o quanto uma alocação atende às preferências do servidor.
 * Retorna 0 quando não há preferência aplicável. NUNCA bloqueia.
 */
export function scorePreferences(
  context: AvailabilityContext,
  params: { serverId: number; date: string; startTime: string; parishRoleId: number },
): number {
  const weekday = weekdayFromDateKey(params.date);
  const period = periodOf(params.startTime);

  const applicable = context.preferences.filter(p => p.serverId === params.serverId);
  if (applicable.length === 0) return 0;

  let score = 0;
  for (const preference of applicable) {
    const weekdayMatch = preference.weekday === null || preference.weekday === weekday;
    const periodMatch = preference.period === null || preference.period === period;
    const roleMatch =
      preference.parishRoleId === null || preference.parishRoleId === params.parishRoleId;

    if (weekdayMatch && periodMatch && roleMatch) {
      // Prioridade 1 vale mais que prioridade 2, e assim por diante.
      score += Math.max(1, 4 - preference.priority);
    }
  }
  return score;
}

function periodOf(time: string): "MORNING" | "AFTERNOON" | "EVENING" {
  const hour = Number(time.slice(0, 2));
  if (hour < 12) return "MORNING";
  if (hour < 18) return "AFTERNOON";
  return "EVENING";
}

function formatDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
