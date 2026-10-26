import { describe, expect, it, vi, beforeEach } from "vitest";
import { DEFAULT_ACHIEVEMENTS } from "../shared/domain";
import {
  approvedAchievementReached,
  MANUAL_ACHIEVEMENTS,
  type AchievementFacts,
} from "../shared/achievementRules";
const mock = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("./db", () => ({ getDbOrThrow: mock.db }));
import {
  evaluateApprovedAchievements,
  installApprovedAchievements,
} from "./services/approvedAchievements";
import { achievements, gamificationSettings } from "../drizzle/schema";
const empty: AchievementFacts = {
  participations: 0,
  substitutions: 0,
  responses: 0,
  special: 0,
  anniversary: false,
};
describe("sete conquistas aprovadas", () => {
  it("oferece somente os nomes aprovados, sem os descartados", () => {
    expect(DEFAULT_ACHIEVEMENTS.map(a => a.name)).toEqual([
      "Pode contar comigo",
      "Mão amiga",
      "Quem acolhe, ensina",
      "Comunicação responsável",
      "Servir além do altar",
      "Presença especial",
      "Nossa caminhada",
    ]);
  });
  it.each([
    ["Pode contar comigo", { participations: 5 }],
    ["Mão amiga", { substitutions: 1 }],
    ["Comunicação responsável", { responses: 5 }],
    ["Presença especial", { special: 1 }],
    ["Nossa caminhada", { anniversary: true }],
  ])("concede %s somente após atingir o marco", (name, patch) => {
    expect(approvedAchievementReached(name as string, empty)).toBe(false);
    expect(
      approvedAchievementReached(name as string, {
        ...empty,
        ...(patch as Partial<AchievementFacts>),
      })
    ).toBe(true);
  });
  it("não antecipa o marco de cinco presenças ou cinco respostas", () => {
    expect(
      approvedAchievementReached("Pode contar comigo", {
        ...empty,
        participations: 4,
      })
    ).toBe(false);
    expect(
      approvedAchievementReached("Comunicação responsável", {
        ...empty,
        responses: 4,
      })
    ).toBe(false);
  });
  it("deixa acolhimento e solidariedade sob confirmação humana", () => {
    for (const name of MANUAL_ACHIEVEMENTS)
      expect(
        approvedAchievementReached(name, {
          participations: 500,
          substitutions: 500,
          responses: 500,
          special: 500,
          anniversary: true,
        })
      ).toBe(false);
  });
});
describe("persistência das conquistas", () => {
  beforeEach(() => vi.clearAllMocks());
  it("arquiva o catálogo anterior e faz upsert das sete definições sem apagar concessões", async () => {
    const update = vi.fn(() => ({ set: () => ({ where: async () => {} }) }));
    const upsert = vi.fn(async () => {});
    const insert = vi.fn(() => ({
      values: () => ({ onConflictDoUpdate: upsert }),
    }));
    mock.db.mockResolvedValue({
      transaction: async (fn: any) => fn({ update, insert }),
    });
    await installApprovedAchievements(7);
    expect(update).toHaveBeenCalledWith(achievements);
    expect(insert).toHaveBeenCalledTimes(7);
    expect(upsert).toHaveBeenCalledTimes(7);
  });
  it("não avalia nem concede com reconhecimento desativado", async () => {
    const execute = vi.fn();
    mock.db.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [{ enabled: false }] }),
        }),
      }),
      execute,
    });
    await evaluateApprovedAchievements(7, 20);
    expect(execute).not.toHaveBeenCalled();
  });
  it("grava apenas marcos atingidos e usa unicidade para não duplicar", async () => {
    const grants: any[] = [];
    const conflict = vi.fn(async () => {});
    mock.db.mockResolvedValue({
      select: () => ({
        from: (table: unknown) => ({
          where: () =>
            table === gamificationSettings
              ? { limit: async () => [{ enabled: true }] }
              : Promise.resolve(
                  DEFAULT_ACHIEVEMENTS.map((a, i) => ({ ...a, id: i + 1 }))
                ),
        }),
      }),
      execute: async () => ({
        rows: [{ ...empty, participations: 5, responses: 5 }],
      }),
      insert: () => ({
        values: (value: any) => {
          grants.push(value);
          return { onConflictDoNothing: conflict };
        },
      }),
    });
    await evaluateApprovedAchievements(7, 20);
    expect(grants.map(g => g.achievementId)).toEqual([1, 4]);
    expect(
      grants.every(
        g => g.parishId === 7 && g.serverId === 20 && g.source === "AUTOMATIC"
      )
    ).toBe(true);
    expect(conflict).toHaveBeenCalledTimes(2);
  });
});
