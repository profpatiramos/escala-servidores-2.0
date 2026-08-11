/**
 * Testes do provisionamento de uma paróquia nova.
 *
 * Uma paróquia recém-criada é onde os defaults de proteção mais importam:
 * ninguém revisa flags de gamificação no primeiro dia de uso. Estes testes
 * interceptam os INSERTs reais emitidos pelo provisionamento com um duplo de
 * banco, garantindo que penalização e ranking nasçam desligados e que toda
 * linha criada carregue o `parishId` correto (isolamento multi-tenant).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_ACHIEVEMENTS, DEFAULT_LITURGICAL_ROLES, DEFAULT_POINT_RULES } from "@shared/domain";

type Captured = { table: string; values: Record<string, unknown>[] };

const captured: Captured[] = [];

/** Extrai o nome da tabela do símbolo interno do Drizzle. */
function tableName(table: unknown): string {
  for (const symbol of Object.getOwnPropertySymbols(table as object)) {
    if (String(symbol).includes("Name")) {
      const value = (table as Record<symbol, unknown>)[symbol];
      if (typeof value === "string") return value;
    }
  }
  return "unknown";
}

const fakeDb = {
  insert(table: unknown) {
    return {
      values(values: unknown) {
        captured.push({
          table: tableName(table),
          values: Array.isArray(values) ? values : [values],
        });
        return Promise.resolve();
      },
    };
  },
};

vi.mock("./db", () => ({
  getDb: async () => fakeDb,
  getDbOrThrow: async () => fakeDb,
}));

/** Retorna as linhas capturadas para uma tabela. */
function rowsFor(table: string): Record<string, unknown>[] {
  return captured.filter(c => c.table === table).flatMap(c => c.values);
}

describe("provisionParishDefaults", () => {
  const PARISH_ID = 77;

  beforeEach(async () => {
    captured.length = 0;
    const { provisionParishDefaults } = await import("./routers/parishes");
    await provisionParishDefaults(PARISH_ID);
  });

  it("cria as configurações de gamificação com penalização DESLIGADA", () => {
    const [settings] = rowsFor("gamification_settings");
    expect(settings).toBeDefined();
    expect(settings!.penaltiesEnabled).toBe(false);
  });

  it("cria as configurações com ranking geral DESLIGADO", () => {
    const [settings] = rowsFor("gamification_settings");
    expect(settings!.rankingEnabled).toBe(false);
  });

  it("cria as configurações com ranking de menores DESLIGADO", () => {
    // A salvaguarda central: nenhuma criança entra em ranking público sem que
    // a coordenação decida explicitamente por isso.
    const [settings] = rowsFor("gamification_settings");
    expect(settings!.minorsRankingEnabled).toBe(false);
  });

  it("mantém o histórico de pontos habilitado, para permitir auditoria", () => {
    const [settings] = rowsFor("gamification_settings");
    expect(settings!.historyEnabled).toBe(true);
  });

  it("provisiona a regra de ausência injustificada desabilitada", () => {
    const rules = rowsFor("point_rules");
    const penalty = rules.find(r => r.eventType === "UNJUSTIFIED_ABSENCE");
    expect(penalty).toBeDefined();
    expect(penalty!.enabled).toBe(false);
  });

  it("provisiona todas as regras de pontuação previstas no domínio", () => {
    expect(rowsFor("point_rules")).toHaveLength(DEFAULT_POINT_RULES.length);
  });

  it("provisiona as funções litúrgicas padrão", () => {
    expect(rowsFor("parish_roles")).toHaveLength(DEFAULT_LITURGICAL_ROLES.length);
  });

  it("provisiona as conquistas padrão", () => {
    expect(rowsFor("achievements")).toHaveLength(DEFAULT_ACHIEVEMENTS.length);
  });

  it("vincula TODA linha provisionada à paróquia correta", () => {
    // Se uma única linha escapar sem parishId, ela vaza entre paróquias.
    const allRows = captured.flatMap(c => c.values);
    expect(allRows.length).toBeGreaterThan(0);
    for (const row of allRows) {
      expect(row.parishId).toBe(PARISH_ID);
    }
  });

  it("não provisiona nenhuma linha com parishId de outra paróquia", () => {
    const foreign = captured
      .flatMap(c => c.values)
      .filter(row => row.parishId !== PARISH_ID);
    expect(foreign).toEqual([]);
  });
});

