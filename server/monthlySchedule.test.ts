import { describe, expect, it } from "vitest";
import {
  emptyMonthlyConfig,
  monthlyConfigSchema,
  monthlyPlan,
} from "../shared/monthlySchedule";

describe("escala mensal", () => {
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
  it("conta o quinto domingo independentemente do quinto sábado", () => {
    const plan = monthlyPlan(2026, 11, "BLUE");
    expect(plan.filter(p => p.date === "2026-11-29")).toHaveLength(3);
    expect(
      plan.filter(p => p.date === "2026-11-29").every(p => p.color === "BLUE")
    ).toBe(true);
    expect(
      plan.filter(p => p.date === "2026-11-28").every(p => p.occurrence === 4)
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
