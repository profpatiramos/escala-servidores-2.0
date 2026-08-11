/**
 * Testes de autorização horizontal nos módulos sensíveis além da disponibilidade.
 *
 * `authorization.horizontal.test.ts` cobre o helper do módulo de disponibilidade.
 * O risco real, porém, é a checagem existir em um módulo e faltar em outro: o pai
 * bloqueado de editar a agenda da criança alheia conseguiria, ainda assim,
 * responder pela confirmação dela, inscrevê-la num evento ou ler os pontos dela.
 *
 * Aqui exercitamos os três helpers restantes com o mesmo cenário de duas
 * famílias na mesma paróquia:
 *   - `assertCanRespond`   (confirmações e substituições)
 *   - `assertCanActFor`    (eventos e voluntariado)
 *   - `assertCanViewServer` (extrato de pontos e conquistas)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Servidores do cenário. 10 = família A, 20 = família B, 30 = outra paróquia. */
const SERVERS = [
  { id: 10, parishId: 1 },
  { id: 20, parishId: 1 },
  { id: 30, parishId: 2 },
];

/** Vínculos familiares. O usuário 1000 responde pela criança 10; o 2000, pela 20. */
const LINKS = [
  { id: 1, parishId: 1, responsibleUserId: 1000, serverId: 10, ended: false },
  { id: 2, parishId: 1, responsibleUserId: 2000, serverId: 20, ended: false },
  // Vínculo já encerrado: o usuário 1000 foi responsável pela criança 20 no passado.
  { id: 3, parishId: 1, responsibleUserId: 1000, serverId: 20, ended: true },
];

/**
 * Alocações de escala. A alocação 500 pertence à criança 10; a 600, à criança 20.
 * A 700 está numa escala ainda em rascunho e a 800 já foi substituída.
 */
const ASSIGNMENTS = [
  { id: 500, parishId: 1, serverId: 10, scheduleId: 5000, status: "PENDING" },
  { id: 600, parishId: 1, serverId: 20, scheduleId: 5000, status: "PENDING" },
  { id: 700, parishId: 1, serverId: 10, scheduleId: 7000, status: "PENDING" },
  { id: 800, parishId: 1, serverId: 10, scheduleId: 5000, status: "REPLACED" },
];

/** Escalas: 5000 publicada (aceita confirmação), 7000 em rascunho (não aceita). */
const SCHEDULES = [
  { id: 5000, status: "PUBLISHED" },
  { id: 7000, status: "DRAFT" },
];

/** Coleta os valores literais comparados nas condições do Drizzle. */
function extractValues(condition: unknown): unknown[] {
  const values: unknown[] = [];
  const walk = (node: unknown) => {
    if (node === null || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (Array.isArray(record.queryChunks)) record.queryChunks.forEach(walk);
    if (Array.isArray(record.values)) record.values.forEach(walk);
    for (const key of ["left", "right", "value"]) {
      const child = record[key];
      if (child === undefined) continue;
      if (child !== null && typeof child === "object") walk(child);
      else values.push(child);
    }
  };
  walk(condition);
  return values;
}

/** Descobre o nome da tabela a partir dos símbolos internos do Drizzle. */
function tableName(table: unknown): string {
  for (const symbol of Object.getOwnPropertySymbols(table as object)) {
    if (String(symbol).includes("Name")) {
      const value = (table as Record<symbol, unknown>)[symbol];
      if (typeof value === "string") return value;
    }
  }
  return "";
}

/**
 * Duplo de banco. Interpreta apenas o suficiente para as consultas de
 * autorização: alocação por (id, parishId), escala por id, e vínculo familiar
 * por (parishId, serverId?, responsibleUserId, endedAt IS NULL).
 */
const fakeDb = {
  select(_fields?: unknown) {
    let current = "";
    const builder = {
      from(table: unknown) {
        current = tableName(table);
        return builder;
      },
      // Os helpers fazem innerJoin entre family_links e responsibles; o join não
      // muda o filtro que nos interessa, então é absorvido sem efeito.
      innerJoin() {
        return builder;
      },
      where(condition: unknown) {
        const values = extractValues(condition);
        const numbers = values.filter((v): v is number => typeof v === "number");

        const rows = (() => {
          if (current === "schedule_assignments") {
            return ASSIGNMENTS.filter(
              a => numbers.includes(a.id) && numbers.includes(a.parishId),
            ).map(a => ({ ...a }));
          }
          if (current === "schedules") {
            return SCHEDULES.filter(s => numbers.includes(s.id)).map(s => ({ status: s.status }));
          }
          if (current === "family_links") {
            // Quando algum serverId conhecido aparece na condição, a consulta é
            // pontual (um dependente). Caso contrário, é a listagem de escopo.
            const serverIds = SERVERS.map(s => s.id);
            const pointQuery = numbers.some(n => serverIds.includes(n));
            return LINKS.filter(
              link =>
                !link.ended &&
                numbers.includes(link.parishId) &&
                numbers.includes(link.responsibleUserId) &&
                (!pointQuery || numbers.includes(link.serverId)),
            ).map(link => ({ id: link.id, serverId: link.serverId }));
          }
          return [] as Record<string, unknown>[];
        })();

        return {
          limit: () => Promise.resolve(rows),
          then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
        };
      },
    };
    return builder;
  },
};

vi.mock("./db", () => ({
  getDb: async () => fakeDb,
  getDbOrThrow: async () => fakeDb,
}));

type Ctx = { parishId: number; actor: any };

/** Responsável autenticado por e-mail e senha (o vínculo é resolvido pelo userId). */
function responsibleCtx(userId: number, parishId = 1): Ctx {
  return { parishId, actor: { type: "USER", role: "RESPONSIBLE", user: { id: userId } } };
}

/** Servidor (criança) autenticado por ID de acesso e PIN. */
function serverCtx(serverId: number, parishId = 1): Ctx {
  return { parishId, actor: { type: "SERVER", role: "SERVER", server: { id: serverId } } };
}

function coordinatorCtx(parishId = 1): Ctx {
  return { parishId, actor: { type: "USER", role: "COORDINATOR", user: { id: 9000 } } };
}

let assertCanRespond: (ctx: Ctx, assignmentId: number) => Promise<unknown>;
let assertCanActFor: (ctx: Ctx, serverId: number) => Promise<void>;
let resolveAllowedServerIds: (ctx: Ctx) => Promise<number[] | null>;
let assertCanViewServer: (ctx: Ctx, serverId: number) => Promise<void>;

beforeEach(async () => {
  const confirmations = await import("./routers/confirmations");
  const events = await import("./routers/events");
  const gamification = await import("./routers/gamification");
  assertCanRespond = confirmations.assertCanRespond;
  assertCanActFor = events.assertCanActFor;
  resolveAllowedServerIds = events.resolveAllowedServerIds;
  assertCanViewServer = gamification.assertCanViewServer;
});

describe("confirmações: quem pode responder por uma alocação", () => {
  it("permite ao servidor responder pela própria alocação", async () => {
    const result = (await assertCanRespond(serverCtx(10), 500)) as {
      respondentKind: string;
    };
    expect(result.respondentKind).toBe("SERVER");
  });

  it("BLOQUEIA o servidor de responder pela alocação de outro servidor", async () => {
    await expect(assertCanRespond(serverCtx(10), 600)).rejects.toThrow(/próprias escalas/i);
  });

  it("permite ao responsável responder pelo próprio dependente", async () => {
    const result = (await assertCanRespond(responsibleCtx(1000), 500)) as {
      respondentKind: string;
    };
    expect(result.respondentKind).toBe("RESPONSIBLE");
  });

  it("BLOQUEIA o responsável de responder pela criança de outra família", async () => {
    await expect(assertCanRespond(responsibleCtx(1000), 600)).rejects.toThrow(
      /não é responsável/i,
    );
  });

  it("BLOQUEIA responsável cujo vínculo com a criança já foi encerrado", async () => {
    // O usuário 1000 tem histórico com a criança 20, mas o vínculo terminou.
    await expect(assertCanRespond(responsibleCtx(1000), 600)).rejects.toThrow();
  });

  it("permite à coordenação responder por qualquer alocação da paróquia", async () => {
    const result = (await assertCanRespond(coordinatorCtx(1), 600)) as {
      respondentKind: string;
    };
    expect(result.respondentKind).toBe("COORDINATION");
  });

  it("BLOQUEIA a coordenação de outra paróquia, tratando a alocação como inexistente", async () => {
    await expect(assertCanRespond(coordinatorCtx(2), 500)).rejects.toThrow(
      /não (foi )?(encontrad|localizad)/i,
    );
  });

  it("recusa confirmação em escala que ainda não foi publicada", async () => {
    await expect(assertCanRespond(serverCtx(10), 700)).rejects.toThrow(/publicadas/i);
  });

  it("recusa confirmação em alocação já substituída", async () => {
    await expect(assertCanRespond(serverCtx(10), 800)).rejects.toThrow(/não está mais ativa/i);
  });

  it("nega papel não previsto em vez de liberar", async () => {
    const ctx: Ctx = { parishId: 1, actor: { type: "USER", role: "VISITOR", user: { id: 1 } } };
    await expect(assertCanRespond(ctx, 500)).rejects.toThrow(/não permite/i);
  });
});

describe("eventos e voluntariado: por quem o ator pode agir", () => {
  it("permite ao servidor se inscrever por si mesmo", async () => {
    await expect(assertCanActFor(serverCtx(10), 10)).resolves.toBeUndefined();
  });

  it("BLOQUEIA o servidor de inscrever outro servidor", async () => {
    await expect(assertCanActFor(serverCtx(10), 20)).rejects.toThrow(
      /não pode responder por este servidor/i,
    );
  });

  it("permite ao responsável inscrever o próprio dependente", async () => {
    await expect(assertCanActFor(responsibleCtx(1000), 10)).resolves.toBeUndefined();
  });

  it("BLOQUEIA o responsável de inscrever a criança de outra família", async () => {
    await expect(assertCanActFor(responsibleCtx(1000), 20)).rejects.toThrow(
      /não pode responder por este servidor/i,
    );
  });

  it("dá escopo total à coordenação da própria paróquia", async () => {
    await expect(resolveAllowedServerIds(coordinatorCtx(1))).resolves.toBeNull();
  });

  it("restringe o escopo do servidor ao próprio id", async () => {
    await expect(resolveAllowedServerIds(serverCtx(10))).resolves.toEqual([10]);
  });

  it("restringe o escopo do responsável aos dependentes com vínculo ativo", async () => {
    await expect(resolveAllowedServerIds(responsibleCtx(1000))).resolves.toEqual([10]);
  });

  it("retorna escopo vazio para papel não previsto", async () => {
    const ctx: Ctx = { parishId: 1, actor: { type: "USER", role: "VISITOR", user: { id: 1 } } };
    await expect(resolveAllowedServerIds(ctx)).resolves.toEqual([]);
  });
});

describe("gamificação: quem pode ver o extrato de pontos", () => {
  it("permite ao servidor ver os próprios pontos", async () => {
    await expect(assertCanViewServer(serverCtx(10), 10)).resolves.toBeUndefined();
  });

  it("BLOQUEIA o servidor de ver os pontos de outro servidor", async () => {
    await expect(assertCanViewServer(serverCtx(10), 20)).rejects.toThrow(/próprios pontos/i);
  });

  it("permite ao responsável ver os pontos do próprio dependente", async () => {
    await expect(assertCanViewServer(responsibleCtx(1000), 10)).resolves.toBeUndefined();
  });

  it("BLOQUEIA o responsável de ver os pontos da criança de outra família", async () => {
    await expect(assertCanViewServer(responsibleCtx(1000), 20)).rejects.toThrow(
      /não é responsável/i,
    );
  });

  it("permite à coordenação consultar qualquer servidor da paróquia", async () => {
    await expect(assertCanViewServer(coordinatorCtx(1), 20)).resolves.toBeUndefined();
  });

  it("nega papel não previsto em vez de liberar", async () => {
    const ctx: Ctx = { parishId: 1, actor: { type: "USER", role: "VISITOR", user: { id: 1 } } };
    await expect(assertCanViewServer(ctx, 10)).rejects.toThrow(/não permite/i);
  });
});
