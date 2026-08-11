/**
 * Testes dos helpers de domínio.
 *
 * São funções pequenas, mas erradas elas causam os piores bugs do sistema:
 * escalar uma criança abaixo da idade mínima, aceitar uma celebração que
 * atravessa a meia-noite ou deslocar a data por fuso horário.
 */
import { describe, expect, it } from "vitest";

import {
  calculateAge,
  isMinor,
  minutesToTime,
  periodFromTime,
  timeRangeContains,
  timeRangesOverlap,
  timeToMinutes,
  toDateKey,
  weekdayFromDateKey,
  SECURITY,
} from "@shared/domain";

describe("calculateAge", () => {
  const reference = new Date("2026-08-10T12:00:00");

  it("calcula a idade em anos completos", () => {
    expect(calculateAge("2010-08-10", reference)).toBe(16);
  });

  it("não conta o aniversário que ainda não chegou no ano de referência", () => {
    // Aniversário no dia seguinte: a criança ainda tem 15.
    expect(calculateAge("2010-08-11", reference)).toBe(15);
  });

  it("conta o aniversário no próprio dia", () => {
    expect(calculateAge("2012-08-10", reference)).toBe(14);
  });

  it("aceita Date além de string", () => {
    expect(calculateAge(new Date("2000-01-01"), reference)).toBe(26);
  });

  it("lida com 29 de fevereiro sem estourar a idade", () => {
    const age = calculateAge("2008-02-29", new Date("2026-02-28T12:00:00"));
    expect(age).toBe(17);
  });
});

describe("isMinor", () => {
  const reference = new Date("2026-08-10T12:00:00");

  it("classifica como menor quem está abaixo da idade adulta configurada", () => {
    expect(isMinor("2012-08-10", reference)).toBe(true);
  });

  it("classifica como adulto exatamente ao completar a idade adulta", () => {
    const birth = `${reference.getFullYear() - SECURITY.adultAge}-08-10`;
    expect(isMinor(birth, reference)).toBe(false);
  });

  it("um dia antes do aniversário de maioridade ainda é menor", () => {
    const birth = `${reference.getFullYear() - SECURITY.adultAge}-08-11`;
    expect(isMinor(birth, reference)).toBe(true);
  });
});

describe("timeToMinutes / minutesToTime", () => {
  it("converte HH:MM em minutos desde a meia-noite", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("19:00")).toBe(1140);
  });

  it("aceita o formato HH:MM:SS vindo do banco", () => {
    expect(timeToMinutes("09:30:00")).toBe(570);
  });

  it("é reversível via minutesToTime", () => {
    for (const time of ["00:00", "07:15", "12:00", "19:45", "23:59"]) {
      expect(minutesToTime(timeToMinutes(time))).toBe(time);
    }
  });

  it("formata minutesToTime com dois dígitos", () => {
    expect(minutesToTime(65)).toBe("01:05");
  });
});

describe("timeRangesOverlap", () => {
  it("detecta sobreposição parcial nas duas direções", () => {
    expect(timeRangesOverlap("09:00", "10:30", "10:00", "11:00")).toBe(true);
    expect(timeRangesOverlap("10:00", "11:00", "09:00", "10:30")).toBe(true);
  });

  it("não considera sobreposição quando uma termina exatamente onde a outra começa", () => {
    // Missa das 9h às 10h e das 10h às 11h: o servidor consegue fazer as duas.
    expect(timeRangesOverlap("09:00", "10:00", "10:00", "11:00")).toBe(false);
  });

  it("detecta contenção total", () => {
    expect(timeRangesOverlap("09:00", "12:00", "10:00", "10:30")).toBe(true);
  });

  it("retorna falso para faixas totalmente separadas", () => {
    expect(timeRangesOverlap("07:00", "08:00", "19:00", "20:00")).toBe(false);
  });
});

describe("timeRangeContains", () => {
  it("exige contenção integral, não apenas encostar", () => {
    expect(timeRangeContains("07:00", "12:00", "09:00", "10:00")).toBe(true);
    expect(timeRangeContains("07:00", "09:30", "09:00", "10:00")).toBe(false);
  });

  it("aceita limites coincidentes", () => {
    expect(timeRangeContains("09:00", "10:00", "09:00", "10:00")).toBe(true);
  });
});

describe("periodFromTime", () => {
  it("classifica manhã, tarde e noite", () => {
    expect(periodFromTime("07:00")).toBe("MORNING");
    expect(periodFromTime("11:59")).toBe("MORNING");
    expect(periodFromTime("12:00")).toBe("AFTERNOON");
    expect(periodFromTime("17:59")).toBe("AFTERNOON");
    expect(periodFromTime("18:00")).toBe("EVENING");
    expect(periodFromTime("23:00")).toBe("EVENING");
  });
});

describe("toDateKey", () => {
  it("normaliza para YYYY-MM-DD", () => {
    expect(toDateKey("2026-08-16")).toBe("2026-08-16");
  });

  it("preserva o dia local, sem deslocar por fuso", () => {
    // O bug clássico: toISOString() em data local vira o dia anterior.
    const local = new Date(2026, 7, 16, 8, 0, 0);
    expect(toDateKey(local)).toBe("2026-08-16");
  });
});

describe("weekdayFromDateKey", () => {
  it("mapeia domingo como 0 e sábado como 6", () => {
    expect(weekdayFromDateKey("2026-08-16")).toBe(0); // domingo
    expect(weekdayFromDateKey("2026-08-19")).toBe(3); // quarta
    expect(weekdayFromDateKey("2026-08-22")).toBe(6); // sábado
  });

  it("não desloca o dia da semana por fuso horário", () => {
    // Se houvesse parsing UTC, esta data cairia no dia anterior em GMT-3.
    expect(weekdayFromDateKey("2026-01-01")).toBe(4); // quinta
  });
});
