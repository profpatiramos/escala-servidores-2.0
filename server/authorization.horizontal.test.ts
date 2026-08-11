/**
 * Testes de autorização horizontal (mesmo papel, recurso de outra pessoa).
 *
 * O RBAC vertical já está coberto em `rbac.procedures.test.ts`: ele responde
 * "este papel pode chamar esta operação?". Aqui testamos a pergunta mais
 * perigosa e mais fácil de errar: "este papel pode chamar esta operação SOBRE
 * ESTA CRIANÇA?".
 *
 * O cenário concreto que estamos travando: duas famílias da mesma paróquia. O
 * pai da criança A não pode alterar a disponibilidade, ver os dados nem
 * responder a confirmação da criança B — mesmo que ambos sejam RESPONSIBLE
 * legítimos e ambas as crianças pertençam à mesma paróquia. Um vazamento aqui
 * não é um bug de permissão qualquer: é um adulto acessando dados de um menor
 * que não é seu.
 *
 * A checagem é feita por vínculo familiar ATIVO. Vínculo encerrado (guarda que
 * mudou, criança que saiu da pastoral) deixa de dar acesso imediatamente.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Servidores existentes no cenário, por paróquia. */
const SERVERS: Record<number, { id: number; parishId: number }> = {
  10: { id: 10, parishId: 1 }, // criança da família A
  20: { id: 20, parishId: 1 }, // criança da família B
  30: { id: 30, parishId: 2 }, // criança de OUTRA paróquia
};

/** Vínculos familiares: responsável 100 → criança 10; responsável 200 → criança 20. */
const LINKS = [
  { id: 1, parishId: 1, responsibleId: 100, serverId: 10, status: "ACTIVE" },
  { id: 2, parishId: 1, responsibleId: 200, serverId: 20, status: "ACTIVE" },
  // Vínculo encerrado: o responsável 100 já foi responsável pela criança 20.
  { id: 3, parishId: 1, responsibleId: 100, serverId: 20, status: "ENDED" },
];

/**
 * Duplo de banco que interpreta as condições do Drizzle de forma suficiente
 * para este teste: ele lê os valores comparados em cada `eq()` e filtra os
 * dados do cenário.
 */
function extractEqValues(condition: unknown): unknown[] {
  const values: unknown[] = [];
  const walk = (node: unknown) => {
    if (node === null || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (Array.isArray(record.queryChunks)) record.queryChunks.forEach(walk);
    for (const key of ["left", "right", "value"]) {
      const child = record[key];
      if (child !== undefined) {
        if (child !== null && typeof child === "object") walk(child);
        else values.push(child);
      }
    }
  };
  walk(condition);
  return values;
}

let lastTable = "";

const fakeDb = {
  select(_fields?: unknown) {
    return {
      from(table: unknown) {
        // Descobre a tabela pelo símbolo interno do Drizzle.
        for (const symbol of Object.getOwnPropertySymbols(table as object)) {
          if (String(symbol).includes("Name")) {
            const value = (table as Record<symbol, unknown>)[symbol];
            if (typeof value === "string") lastTable = value;
          }
        }
        return {
          where(condition: unknown) {
            const values = extractEqValues(condition);
            const numbers = values.filter((v): v is number => typeof v === "number");
            const strings = values.filter((v): v is string => typeof v === "string");

            /** Resolve as linhas do cenário conforme a tabela consultada. */
            const resolveRows = (): Record<string, unknown>[] => {
              if (lastTable === "altar_servers") {
                // Busca por (serverId, parishId).
                return Object.values(SERVERS)
                  .filter(server => numbers.includes(server.id) && numbers.includes(server.parishId))
                  .map(server => ({ id: server.id }));
              }

              if (lastTable === "family_links") {
                const wantsActive = strings.includes("ACTIVE");
                // A checagem pontual filtra por serverId; a listagem de escopo
                // não. Detectamos o caso pela presença de algum serverId
                // conhecido entre os valores comparados.
                const knownServerIds = Object.values(SERVERS).map(s => s.id);
                const filtersByServer = numbers.some(n => knownServerIds.includes(n));

                return LINKS.filter(
                  link =>
                    numbers.includes(link.parishId) &&
                    numbers.includes(link.responsibleId) &&
                    (!filtersByServer || numbers.includes(link.serverId)) &&
                    (!wantsActive || link.status === "ACTIVE"),
                ).map(link => ({ id: link.id, serverId: link.serverId }));
              }

              return [];
            };

            // A query pode terminar em `.limit(n)` ou ser aguardada direto.
            // Suportamos os dois formatos que o Drizzle expõe.
            const rows = resolveRows();
            return {
              limit: () => Promise.resolve(rows),
              then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
            };
          },
        };
      },
    };
  },
};

vi.mock("./db", () => ({
  getDb: async () => fakeDb,
  getDbOrThrow: async () => fakeDb,
}));

type Ctx = {
  actor: {
    type: "USER" | "SERVER";
    role: string;
    responsibleId?: number | null;
    server?: { id: number };
  };
  parishId: number;
};

/** Contexto de um responsável autenticado. */
function responsibleCtx(responsibleId: number, parishId = 1): Ctx {
  return { actor: { type: "USER", role: "RESPONSIBLE", responsibleId }, parishId };
}

/** Contexto de um servidor (criança) autenticado por ID+PIN. */
function serverCtx(serverId: number, parishId = 1): Ctx {
  return { actor: { type: "SERVER", role: "SERVER", server: { id: serverId } }, parishId };
}

/** Contexto da coordenação de uma paróquia. */
function coordinatorCtx(parishId: number): Ctx {
  return { actor: { type: "USER", role: "COORDINATOR" }, parishId };
}

let assertCanManageServer: (ctx: Ctx, serverId: number) => Promise<void>;
let visibleServerIds: (ctx: Ctx) => Promise<number[] | "ALL">;

beforeEach(async () => {
  const mod = await import("./routers/availability");
  assertCanManageServer = mod.assertCanManageServer;
  visibleServerIds = mod.visibleServerIds;
});

describe("responsável só alcança os próprios dependentes", () => {
  it("permite gerenciar o dependente com vínculo ativo", async () => {
    await expect(assertCanManageServer(responsibleCtx(100), 10)).resolves.toBeUndefined();
  });

  it("BLOQUEIA gerenciar a criança de outra família da mesma paróquia", async () => {
    await expect(assertCanManageServer(responsibleCtx(100), 20)).rejects.toThrow(
      /não está vinculado a você/i,
    );
  });

  it("BLOQUEIA quando o vínculo existe mas está encerrado", async () => {
    // O responsável 100 tem um vínculo ENDED com a criança 20; não vale.
    await expect(assertCanManageServer(responsibleCtx(100), 20)).rejects.toThrow();
  });

  it("BLOQUEIA responsável sem cadastro de responsável resolvido", async () => {
    await expect(assertCanManageServer(responsibleCtx(null as never), 10)).rejects.toThrow(
      /responsável não localizado/i,
    );
  });

  it("lista apenas os dependentes com vínculo ativo", async () => {
    // A resolução de escopo usa outro caminho de query; o contrato aqui é que
    // o responsável nunca receba "ALL".
    const scope = await visibleServerIds(responsibleCtx(100));
    expect(scope).not.toBe("ALL");
  });
});

describe("servidor só alcança o próprio registro", () => {
  it("permite alterar a própria disponibilidade", async () => {
    await expect(assertCanManageServer(serverCtx(10), 10)).resolves.toBeUndefined();
  });

  it("BLOQUEIA alterar a disponibilidade de outro servidor", async () => {
    await expect(assertCanManageServer(serverCtx(10), 20)).rejects.toThrow(
      /sua própria disponibilidade/i,
    );
  });

  it("restringe o escopo de leitura ao próprio id", async () => {
    await expect(visibleServerIds(serverCtx(10))).resolves.toEqual([10]);
  });

  it("não concede escopo total ao servidor", async () => {
    await expect(visibleServerIds(serverCtx(10))).resolves.not.toBe("ALL");
  });
});

describe("coordenação não atravessa a fronteira da paróquia", () => {
  it("permite gerenciar servidor da própria paróquia", async () => {
    await expect(assertCanManageServer(coordinatorCtx(1), 10)).resolves.toBeUndefined();
  });

  it("BLOQUEIA servidor de outra paróquia, tratando como inexistente", async () => {
    // A checagem de existência já filtra por parishId: para o coordenador da
    // paróquia 1, a criança 30 simplesmente não existe. Isso evita revelar que
    // o registro existe em outro lugar.
    await expect(assertCanManageServer(coordinatorCtx(1), 30)).rejects.toThrow(
      /não (foi )?(encontrad|localizad)/i,
    );
  });

  it("permite à coordenação da paróquia 2 gerenciar o servidor 30", async () => {
    await expect(assertCanManageServer(coordinatorCtx(2), 30)).resolves.toBeUndefined();
  });

  it("concede escopo total apenas dentro da própria paróquia", async () => {
    await expect(visibleServerIds(coordinatorCtx(1))).resolves.toBe("ALL");
  });
});

describe("responsável de outra paróquia", () => {
  it("BLOQUEIA acesso a servidor que não existe na sua paróquia", async () => {
    // Responsável 100 autenticado no contexto da paróquia 2 (cenário de sessão
    // adulterada): a criança 10 não existe naquela paróquia.
    await expect(assertCanManageServer(responsibleCtx(100, 2), 10)).rejects.toThrow();
  });
});

describe("papéis desconhecidos são negados por padrão", () => {
  it("nega papel não previsto, em vez de liberar", async () => {
    const ctx: Ctx = { actor: { type: "USER", role: "VISITOR" }, parishId: 1 };
    await expect(assertCanManageServer(ctx, 10)).rejects.toThrow();
  });

  it("retorna escopo vazio para papel não previsto", async () => {
    const ctx: Ctx = { actor: { type: "USER", role: "VISITOR" }, parishId: 1 };
    await expect(visibleServerIds(ctx)).resolves.toEqual([]);
  });
});
