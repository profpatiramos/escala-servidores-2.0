/**
 * Testes das regras de disponibilidade.
 *
 * `evaluateAvailability` é pura, então estes testes exercitam a hierarquia real
 * de decisão sem tocar no banco. É a camada que impede escalar uma criança em
 * férias ou fora do horário que a família autorizou — vale testar a fundo.
 */
import { describe, expect, it } from "vitest";

import { evaluateAvailability, scorePreferences, type AvailabilityContext } from "./services/availability";
import type {
  Availability,
  AvailabilityException,
  SchedulePreference,
  Vacation,
} from "../drizzle/schema";

/** 2026-08-16 é um domingo; weekday 0. */
const SUNDAY = "2026-08-16";
/** 2026-08-19 é uma quarta-feira; weekday 3. */
const WEDNESDAY = "2026-08-19";

function emptyContext(): AvailabilityContext {
  return { recurring: [], exceptions: [], vacationList: [], preferences: [] };
}

function recurring(overrides: Partial<Availability>): Availability {
  return {
    id: 1,
    parishId: 1,
    serverId: 10,
    scope: "SERVER",
    weekday: 0,
    startTime: "07:00",
    endTime: "12:00",
    availabilityType: "AVAILABLE",
    effectiveFrom: null,
    effectiveUntil: null,
    status: "ACTIVE",
    notes: null,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Availability;
}

function exception(overrides: Partial<AvailabilityException>): AvailabilityException {
  return {
    id: 1,
    parishId: 1,
    serverId: 10,
    date: SUNDAY,
    scope: "SERVER",
    exceptionType: "UNAVAILABLE",
    startTime: null,
    endTime: null,
    reason: null,
    createdBy: null,
    createdAt: new Date(),
    ...overrides,
  } as AvailabilityException;
}

function vacation(overrides: Partial<Vacation>): Vacation {
  return {
    id: 1,
    parishId: 1,
    serverId: 10,
    startDate: "2026-08-10",
    endDate: "2026-08-20",
    reason: null,
    createdBy: null,
    createdAt: new Date(),
    ...overrides,
  } as Vacation;
}

function preference(overrides: Partial<SchedulePreference>): SchedulePreference {
  return {
    id: 1,
    parishId: 1,
    serverId: 10,
    weekday: null,
    period: null,
    parishRoleId: null,
    priority: 1,
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as SchedulePreference;
}

describe("evaluateAvailability — sem restrições cadastradas", () => {
  it("permite a alocação quando a paróquia ainda não preencheu agenda alguma", () => {
    // Decisão deliberada: agenda vazia não trava a operação de quem está começando.
    const verdict = evaluateAvailability(emptyContext(), {
      serverId: 10,
      date: SUNDAY,
      startTime: "09:00",
      endTime: "10:00",
    });

    expect(verdict.available).toBe(true);
    expect(verdict.code).toBe("AVAILABLE");
  });
});

describe("evaluateAvailability — férias têm precedência máxima", () => {
  it("bloqueia mesmo quando existe janela semanal declarada como disponível", () => {
    const context: AvailabilityContext = {
      ...emptyContext(),
      recurring: [recurring({ weekday: 0, startTime: "07:00", endTime: "22:00" })],
      vacationList: [vacation({ startDate: "2026-08-10", endDate: "2026-08-20" })],
    };

    const verdict = evaluateAvailability(context, {
      serverId: 10,
      date: SUNDAY,
      startTime: "09:00",
      endTime: "10:00",
    });

    expect(verdict.available).toBe(false);
    expect(verdict.code).toBe("SERVER_ON_VACATION");
    expect(verdict.detail).toContain("10/08/2026");
  });

  it("não bloqueia fora da janela de férias", () => {
    const context: AvailabilityContext = {
      ...emptyContext(),
      vacationList: [vacation({ startDate: "2026-07-01", endDate: "2026-07-31" })],
    };

    const verdict = evaluateAvailability(context, {
      serverId: 10,
      date: SUNDAY,
      startTime: "09:00",
      endTime: "10:00",
    });

    expect(verdict.available).toBe(true);
  });

  it("ignora férias de outro servidor", () => {
    const context: AvailabilityContext = {
      ...emptyContext(),
      vacationList: [vacation({ serverId: 99 })],
    };

    const verdict = evaluateAvailability(context, {
      serverId: 10,
      date: SUNDAY,
      startTime: "09:00",
      endTime: "10:00",
    });

    expect(verdict.available).toBe(true);
  });
});

describe("evaluateAvailability — exceções pontuais sobrepõem a recorrência", () => {
  it("bloqueia na data mesmo com recorrência semanal favorável", () => {
    const context: AvailabilityContext = {
      ...emptyContext(),
      recurring: [recurring({ weekday: 0, startTime: "07:00", endTime: "22:00" })],
      exceptions: [exception({ reason: "Viagem da família" })],
    };

    const verdict = evaluateAvailability(context, {
      serverId: 10,
      date: SUNDAY,
      startTime: "09:00",
      endTime: "10:00",
    });

    expect(verdict.available).toBe(false);
    expect(verdict.detail).toBe("Viagem da família");
  });

  it("uma exceção sem horário cobre o dia inteiro", () => {
    const context: AvailabilityContext = {
      ...emptyContext(),
      exceptions: [exception({ startTime: null, endTime: null })],
    };

    const verdict = evaluateAvailability(context, {
      serverId: 10,
      date: SUNDAY,
      startTime: "19:00",
      endTime: "20:00",
    });

    expect(verdict.available).toBe(false);
  });

  it("uma exceção com horário só bloqueia a faixa que ela cobre", () => {
    const context: AvailabilityContext = {
      ...emptyContext(),
      exceptions: [exception({ startTime: "07:00", endTime: "12:00" })],
    };

    expect(
      evaluateAvailability(context, {
        serverId: 10,
        date: SUNDAY,
        startTime: "09:00",
        endTime: "10:00",
      }).available,
    ).toBe(false);

    expect(
      evaluateAvailability(context, {
        serverId: 10,
        date: SUNDAY,
        startTime: "19:00",
        endTime: "20:00",
      }).available,
    ).toBe(true);
  });

  it("distingue indisponibilidade da família da do próprio servidor", () => {
    const context: AvailabilityContext = {
      ...emptyContext(),
      exceptions: [exception({ scope: "FAMILY" })],
    };

    const verdict = evaluateAvailability(context, {
      serverId: 10,
      date: SUNDAY,
      startTime: "09:00",
      endTime: "10:00",
    });

    expect(verdict.code).toBe("SERVER_FAMILY_UNAVAILABLE");
  });

  it("disponibilidade extraordinária dispensa a recorrência semanal", () => {
    // A família avisou que naquele domingo, excepcionalmente, pode.
    const context: AvailabilityContext = {
      ...emptyContext(),
      recurring: [recurring({ weekday: 0, startTime: "07:00", endTime: "09:00" })],
      exceptions: [
        exception({
          exceptionType: "EXCEPTIONALLY_AVAILABLE",
          startTime: "18:00",
          endTime: "21:00",
        }),
      ],
    };

    const verdict = evaluateAvailability(context, {
      serverId: 10,
      date: SUNDAY,
      startTime: "19:00",
      endTime: "20:00",
    });

    expect(verdict.available).toBe(true);
  });

  it("indisponibilidade vence disponibilidade extraordinária na mesma data", () => {
    // Havendo contradição no mesmo dia, o sistema protege a criança.
    const context: AvailabilityContext = {
      ...emptyContext(),
      exceptions: [
        exception({ exceptionType: "EXCEPTIONALLY_AVAILABLE", startTime: "18:00", endTime: "21:00" }),
        exception({ id: 2, exceptionType: "UNAVAILABLE", startTime: "18:00", endTime: "21:00" }),
      ],
    };

    const verdict = evaluateAvailability(context, {
      serverId: 10,
      date: SUNDAY,
      startTime: "19:00",
      endTime: "20:00",
    });

    expect(verdict.available).toBe(false);
  });
});

describe("evaluateAvailability — recorrência semanal", () => {
  it("permite apenas horários contidos nas janelas positivas do dia", () => {
    const context: AvailabilityContext = {
      ...emptyContext(),
      recurring: [recurring({ weekday: 0, startTime: "07:00", endTime: "12:00" })],
    };

    expect(
      evaluateAvailability(context, {
        serverId: 10,
        date: SUNDAY,
        startTime: "09:00",
        endTime: "10:00",
      }).available,
    ).toBe(true);

    expect(
      evaluateAvailability(context, {
        serverId: 10,
        date: SUNDAY,
        startTime: "19:00",
        endTime: "20:00",
      }).available,
    ).toBe(false);
  });

  it("recusa alocação que extrapola parcialmente a janela declarada", () => {
    // A janela precisa CONTER a celebração inteira, não apenas encostar nela.
    const context: AvailabilityContext = {
      ...emptyContext(),
      recurring: [recurring({ weekday: 0, startTime: "07:00", endTime: "09:30" })],
    };

    const verdict = evaluateAvailability(context, {
      serverId: 10,
      date: SUNDAY,
      startTime: "09:00",
      endTime: "10:00",
    });

    expect(verdict.available).toBe(false);
    expect(verdict.code).toBe("SERVER_UNAVAILABLE");
  });

  it("não aplica janela de outro dia da semana", () => {
    const context: AvailabilityContext = {
      ...emptyContext(),
      recurring: [recurring({ weekday: 3, startTime: "07:00", endTime: "09:00" })],
    };

    // Domingo não tem regra: permitido.
    expect(
      evaluateAvailability(context, {
        serverId: 10,
        date: SUNDAY,
        startTime: "19:00",
        endTime: "20:00",
      }).available,
    ).toBe(true);

    // Quarta tem regra restrita: bloqueia fora dela.
    expect(
      evaluateAvailability(context, {
        serverId: 10,
        date: WEDNESDAY,
        startTime: "19:00",
        endTime: "20:00",
      }).available,
    ).toBe(false);
  });

  it("janela negativa bloqueia por sobreposição, sem exigir cobertura total", () => {
    const context: AvailabilityContext = {
      ...emptyContext(),
      recurring: [
        recurring({ weekday: 0, availabilityType: "UNAVAILABLE", startTime: "09:30", endTime: "11:00" }),
      ],
    };

    const verdict = evaluateAvailability(context, {
      serverId: 10,
      date: SUNDAY,
      startTime: "09:00",
      endTime: "10:00",
    });

    expect(verdict.available).toBe(false);
  });

  it("restrição da família bloqueia antes de avaliar o servidor", () => {
    const context: AvailabilityContext = {
      ...emptyContext(),
      recurring: [
        recurring({ id: 1, scope: "SERVER", weekday: 0, startTime: "07:00", endTime: "22:00" }),
        recurring({ id: 2, scope: "FAMILY", weekday: 0, startTime: "07:00", endTime: "09:00" }),
      ],
    };

    const verdict = evaluateAvailability(context, {
      serverId: 10,
      date: SUNDAY,
      startTime: "19:00",
      endTime: "20:00",
    });

    expect(verdict.available).toBe(false);
    expect(verdict.code).toBe("SERVER_FAMILY_UNAVAILABLE");
  });

  it("respeita a vigência da regra recorrente", () => {
    const context: AvailabilityContext = {
      ...emptyContext(),
      recurring: [
        recurring({
          weekday: 0,
          startTime: "07:00",
          endTime: "09:00",
          effectiveUntil: "2026-07-31",
        }),
      ],
    };

    // Regra expirada não restringe mais.
    const verdict = evaluateAvailability(context, {
      serverId: 10,
      date: SUNDAY,
      startTime: "19:00",
      endTime: "20:00",
    });

    expect(verdict.available).toBe(true);
  });
});

describe("scorePreferences — preferências pontuam, nunca bloqueiam", () => {
  it("retorna zero quando o servidor não declarou preferências", () => {
    expect(
      scorePreferences(emptyContext(), {
        serverId: 10,
        date: SUNDAY,
        startTime: "09:00",
        parishRoleId: 5,
      }),
    ).toBe(0);
  });

  it("dá mais peso à preferência de prioridade 1 do que à de prioridade 3", () => {
    const high = scorePreferences(
      { ...emptyContext(), preferences: [preference({ priority: 1, period: "MORNING" })] },
      { serverId: 10, date: SUNDAY, startTime: "09:00", parishRoleId: 5 },
    );
    const low = scorePreferences(
      { ...emptyContext(), preferences: [preference({ priority: 3, period: "MORNING" })] },
      { serverId: 10, date: SUNDAY, startTime: "09:00", parishRoleId: 5 },
    );

    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThanOrEqual(1);
  });

  it("não pontua quando o período da celebração não casa com a preferência", () => {
    const score = scorePreferences(
      { ...emptyContext(), preferences: [preference({ period: "MORNING" })] },
      { serverId: 10, date: SUNDAY, startTime: "19:00", parishRoleId: 5 },
    );

    expect(score).toBe(0);
  });

  it("acumula pontuação quando várias preferências casam", () => {
    const score = scorePreferences(
      {
        ...emptyContext(),
        preferences: [
          preference({ id: 1, priority: 1, period: "MORNING" }),
          preference({ id: 2, priority: 2, weekday: 0 }),
        ],
      },
      { serverId: 10, date: SUNDAY, startTime: "09:00", parishRoleId: 5 },
    );

    expect(score).toBeGreaterThan(3);
  });

  it("preferência de função só pontua para a função correspondente", () => {
    const context: AvailabilityContext = {
      ...emptyContext(),
      preferences: [preference({ parishRoleId: 5 })],
    };

    expect(
      scorePreferences(context, { serverId: 10, date: SUNDAY, startTime: "09:00", parishRoleId: 5 }),
    ).toBeGreaterThan(0);
    expect(
      scorePreferences(context, { serverId: 10, date: SUNDAY, startTime: "09:00", parishRoleId: 7 }),
    ).toBe(0);
  });
});
