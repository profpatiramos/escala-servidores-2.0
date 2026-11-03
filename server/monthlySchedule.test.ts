import { describe, expect, it } from "vitest";
import {
  emptyMonthlyConfig,
  monthlyConfigSchema,
  monthlyPlan,
} from "../shared/monthlySchedule";

describe("escala mensal", () => {
  it("permite equipe sem função definida, mas exige servidor válido", () => {
    const config = emptyMonthlyConfig();
    config.teams[0].members = [{ serverId: 4, parishRoleId: 0 }];
    expect(monthlyConfigSchema.safeParse(config).success).toBe(true);
    config.teams[0].members[0].serverId = 0;
    expect(monthlyConfigSchema.safeParse(config).success).toBe(false);
  });
  it("reproduz o rodízio de outubro de 2026 sem incluir novembro", () => {
    const plan = monthlyPlan(2026, 10, "MANUAL");
    expect(plan).toHaveLength(17);
    expect(plan.every(p => p.date.startsWith("2026-10-"))).toBe(true);
    expect(plan.filter(p => p.slot.id === "SAT19").map(p => p.color)).toEqual([
      "GREEN",
      "BLUE",
      "GREEN",
      "BLUE",
      null,
    ]);
    expect(plan.filter(p => p.slot.id === "SUN10").map(p => p.color)).toEqual([
      "GREEN",
      "GREEN",
      "BLUE",
      "BLUE",
    ]);
  });
  it("mantém o quinto fim de semana unido na virada de outubro para novembro", () => {
    const october = monthlyPlan(2026, 10, "MANUAL");
    const november = monthlyPlan(2026, 11, "MANUAL");
    const crossing = [...october, ...november].filter(p =>
      ["2026-10-31", "2026-11-01"].includes(p.date)
    );
    expect(crossing).toHaveLength(4);
    expect(crossing.every(p => p.occurrence === 5 && p.color === null)).toBe(true);
    const first = november.filter(p => ["2026-11-07", "2026-11-08"].includes(p.date));
    expect(first).toHaveLength(4);
    expect(first.every(p => p.occurrence === 1 && p.color === "GREEN")).toBe(true);
  });

  it("aplica a equipe do quinto fim de semana sem deslocar o rodízio de novembro", () => {
    const plan = monthlyPlan(2026, 11, "BLUE");
    expect(plan.filter(p => p.date === "2026-11-01")).toHaveLength(3);
    expect(
      plan.filter(p => p.date === "2026-11-01").every(p => p.color === "BLUE")
    ).toBe(true);
    expect(
      plan.filter(p => ["2026-11-28", "2026-11-29"].includes(p.date)).every(p => p.occurrence === 4)
    ).toBe(true);
  });
  it("trata fevereiro bissexto e recusa mês inválido", () => {
    expect(monthlyPlan(2024, 2, "MANUAL")).toHaveLength(16);
    expect(() => monthlyPlan(2026, 13, "MANUAL")).toThrow();
  });
  it("exige oito equipes únicas", () => {
    const config = emptyMonthlyConfig();
    expect(monthlyConfigSchema.safeParse(config).success).toBe(true);
    config.teams[1] = config.teams[0];
    expect(monthlyConfigSchema.safeParse(config).success).toBe(false);
  });
  it("recusa integrantes repetidos e seleção incompleta", () => {
    const config = emptyMonthlyConfig();
    config.teams[0].members = [
      { serverId: 1, parishRoleId: 1 },
      { serverId: 1, parishRoleId: 2 },
    ];
    expect(monthlyConfigSchema.safeParse(config).success).toBe(false);
    config.teams[0].members = [{ serverId: 0, parishRoleId: 1 }];
    expect(monthlyConfigSchema.safeParse(config).success).toBe(false);
  });
});
