/**
 * Testes de RBAC e isolamento multi-tenant.
 *
 * A garantia mais importante do sistema: um coordenador de uma paróquia não
 * alcança dados de outra, e o `parishId` do escopo vem SEMPRE da sessão. Estes
 * testes exercitam a cadeia identidade → paróquia → papel diretamente nas
 * procedures, sem depender do banco.
 */
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import type { Actor } from "./auth/types";
import {
  actorIsManager,
  authedProcedure,
  coordinatorProcedure,
  parishAdminProcedure,
  parishProcedure,
  platformAdminProcedure,
  responsibleProcedure,
  router,
  serverProcedure,
} from "./trpc";

function userActor(overrides: Partial<Actor> = {}): Actor {
  return {
    kind: "USER",
    userId: 1,
    parishId: 7,
    role: "COORDINATOR",
    name: "Coordenadora Ana",
    email: "ana@paroquia.test",
    responsibleId: null,
    serverId: null,
    sessionId: 100,
    ...overrides,
  } as Actor;
}

function serverActor(overrides: Partial<Actor> = {}): Actor {
  return {
    kind: "SERVER",
    userId: null,
    parishId: 7,
    role: "SERVER",
    name: "João",
    email: null,
    responsibleId: null,
    serverId: 42,
    sessionId: 200,
    ...overrides,
  } as Actor;
}

/** Monta um caller com um router mínimo que expõe o escopo resolvido. */
function callerFor(actor: Actor | null) {
  const appRouter = router({
    authed: authedProcedure.query(({ ctx }) => ({ role: ctx.actor.role })),
    parish: parishProcedure.query(({ ctx }) => ({ parishId: ctx.parishId })),
    coordinator: coordinatorProcedure.query(({ ctx }) => ({ parishId: ctx.parishId })),
    parishAdmin: parishAdminProcedure.query(() => ({ ok: true })),
    platformAdmin: platformAdminProcedure.query(() => ({ ok: true })),
    responsible: responsibleProcedure.query(({ ctx }) => ({ responsibleId: ctx.responsibleId })),
    server: serverProcedure.query(({ ctx }) => ({ serverId: ctx.actor.serverId })),
  });

  const ctx = {
    actor,
    user: null,
    req: { ip: "127.0.0.1", headers: {}, protocol: "https" },
    res: { clearCookie: () => {}, cookie: () => {} },
  } as never;

  return appRouter.createCaller(ctx);
}

async function expectCode(promise: Promise<unknown>, code: TRPCError["code"]) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("authedProcedure", () => {
  it("recusa requisição sem ator autenticado", async () => {
    await expectCode(callerFor(null).authed(), "UNAUTHORIZED");
  });

  it("aceita ator autenticado por e-mail e senha", async () => {
    await expect(callerFor(userActor()).authed()).resolves.toEqual({ role: "COORDINATOR" });
  });

  it("aceita ator autenticado por ID e PIN", async () => {
    await expect(callerFor(serverActor()).authed()).resolves.toEqual({ role: "SERVER" });
  });
});

describe("parishProcedure — isolamento multi-tenant", () => {
  it("deriva o parishId da sessão, não do cliente", async () => {
    const result = await callerFor(userActor({ parishId: 7 })).parish();
    expect(result).toEqual({ parishId: 7 });
  });

  it("dois atores de paróquias distintas recebem escopos distintos", async () => {
    const a = await callerFor(userActor({ parishId: 7 })).parish();
    const b = await callerFor(userActor({ userId: 2, parishId: 9 })).parish();

    expect(a.parishId).toBe(7);
    expect(b.parishId).toBe(9);
    expect(a.parishId).not.toBe(b.parishId);
  });

  it("recusa ator sem paróquia ativa", async () => {
    await expectCode(callerFor(userActor({ parishId: null })).parish(), "FORBIDDEN");
  });

  it("exige autenticação antes de exigir paróquia", async () => {
    await expectCode(callerFor(null).parish(), "UNAUTHORIZED");
  });
});

describe("coordinatorProcedure", () => {
  it("permite COORDINATOR, PARISH_ADMIN e SUPER_ADMIN", async () => {
    for (const role of ["COORDINATOR", "PARISH_ADMIN", "SUPER_ADMIN"] as const) {
      await expect(callerFor(userActor({ role })).coordinator()).resolves.toEqual({ parishId: 7 });
    }
  });

  it("recusa RESPONSIBLE e SERVER", async () => {
    await expectCode(callerFor(userActor({ role: "RESPONSIBLE" })).coordinator(), "FORBIDDEN");
    await expectCode(callerFor(serverActor()).coordinator(), "FORBIDDEN");
  });
});

describe("parishAdminProcedure", () => {
  it("permite apenas administração", async () => {
    await expect(callerFor(userActor({ role: "PARISH_ADMIN" })).parishAdmin()).resolves.toEqual({
      ok: true,
    });
    await expect(callerFor(userActor({ role: "SUPER_ADMIN" })).parishAdmin()).resolves.toEqual({
      ok: true,
    });
  });

  it("recusa coordenador — quem coordena não administra a paróquia", async () => {
    await expectCode(callerFor(userActor({ role: "COORDINATOR" })).parishAdmin(), "FORBIDDEN");
  });
});

describe("platformAdminProcedure", () => {
  it("permite somente SUPER_ADMIN", async () => {
    await expect(callerFor(userActor({ role: "SUPER_ADMIN" })).platformAdmin()).resolves.toEqual({
      ok: true,
    });
  });

  it("recusa administrador de paróquia", async () => {
    await expectCode(callerFor(userActor({ role: "PARISH_ADMIN" })).platformAdmin(), "FORBIDDEN");
  });

  it("não exige paróquia ativa, pois atua acima do tenant", async () => {
    await expect(
      callerFor(userActor({ role: "SUPER_ADMIN", parishId: null })).platformAdmin(),
    ).resolves.toEqual({ ok: true });
  });
});

describe("responsibleProcedure", () => {
  it("expõe o responsibleId da sessão", async () => {
    const result = await callerFor(
      userActor({ role: "RESPONSIBLE", responsibleId: 55 }),
    ).responsible();
    expect(result).toEqual({ responsibleId: 55 });
  });

  it("recusa responsável sem cadastro vinculado", async () => {
    await expectCode(
      callerFor(userActor({ role: "RESPONSIBLE", responsibleId: null })).responsible(),
      "FORBIDDEN",
    );
  });

  it("recusa coordenador tentando usar a rota do responsável", async () => {
    await expectCode(
      callerFor(userActor({ role: "COORDINATOR", responsibleId: 55 })).responsible(),
      "FORBIDDEN",
    );
  });
});

describe("serverProcedure", () => {
  it("expõe o serverId da sessão do próprio servidor", async () => {
    await expect(callerFor(serverActor({ serverId: 42 })).server()).resolves.toEqual({
      serverId: 42,
    });
  });

  it("recusa coordenador na rota exclusiva do servidor", async () => {
    await expectCode(callerFor(userActor()).server(), "FORBIDDEN");
  });
});

describe("actorIsManager", () => {
  it("reconhece os papéis de gestão", () => {
    expect(actorIsManager(userActor({ role: "SUPER_ADMIN" }))).toBe(true);
    expect(actorIsManager(userActor({ role: "PARISH_ADMIN" }))).toBe(true);
    expect(actorIsManager(userActor({ role: "COORDINATOR" }))).toBe(true);
  });

  it("não trata responsável nem servidor como gestão", () => {
    expect(actorIsManager(userActor({ role: "RESPONSIBLE" }))).toBe(false);
    expect(actorIsManager(serverActor())).toBe(false);
  });
});
