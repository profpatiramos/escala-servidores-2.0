import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { users, parishMembers, responsibles } from "../drizzle/schema";
import { verifySecret } from "./auth/crypto";
const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("./db", () => ({ getDbOrThrow: mocks.db }));
import { enableResponsibleLogin } from "./services/responsibleLogin";
import { peopleRouter } from "./routers/people";
const input = {
  parishId: 7,
  responsibleId: 17,
  email: " Pai@Example.test ",
  temporaryPassword: "Provisoria123",
};
describe("habilitar login de responsável existente", () => {
  let responsible: any,
    existing: boolean,
    conflict: boolean,
    failMembership: boolean;
  let committed: { table: unknown; value: any; kind: string }[];
  let scopes: unknown[][];
  beforeEach(() => {
    vi.clearAllMocks();
    responsible = {
      id: 17,
      name: "Responsável Teste",
      phone: "",
      userId: null,
      status: "ACTIVE",
    };
    existing = false;
    conflict = false;
    failMembership = false;
    committed = [];
    scopes = [];
    mocks.db.mockResolvedValue({
      transaction: async (work: any) => {
        const pending: typeof committed = [];
        const result = await work({
          select: () => ({
            from: (table: unknown) => ({
              where: (condition: any) => {
                scopes.push(new PgDialect().sqlToQuery(condition).params);
                return {
                  limit: () =>
                    table === responsibles
                      ? { for: async () => (responsible ? [responsible] : []) }
                      : Promise.resolve(existing ? [{ id: 99 }] : []),
                };
              },
            }),
          }),
          insert: (table: unknown) => ({
            values: (value: any) => {
              if (table === parishMembers && failMembership)
                throw Error("membership failed");
              pending.push({ table, value, kind: "insert" });
              return table === users
                ? {
                    onConflictDoNothing: () => ({
                      returning: async () => (conflict ? [] : [{ id: 42 }]),
                    }),
                  }
                : Promise.resolve();
            },
          }),
          update: (table: unknown) => ({
            set: (value: any) => ({
              where: async (condition: any) => {
                scopes.push(new PgDialect().sqlToQuery(condition).params);
                pending.push({ table, value, kind: "update" });
              },
            }),
          }),
        });
        committed.push(...pending);
        return result;
      },
    });
  });
  it("cria o acesso com senha criptografada e atualiza o mesmo cadastro, sem recriar vínculos", async () => {
    await expect(enableResponsibleLogin(input)).resolves.toEqual({
      success: true,
    });
    expect(committed.map(w => w.table)).toEqual([
      users,
      parishMembers,
      responsibles,
    ]);
    expect(committed[0].value.email).toBe("pai@example.test");
    expect(committed[0].value.mustChangePassword).toBe(true);
    expect(
      await verifySecret(
        input.temporaryPassword,
        committed[0].value.passwordHash
      )
    ).toBe(true);
    expect(committed[1].value).toMatchObject({
      role: "RESPONSIBLE",
      parishId: 7,
      userId: 42,
    });
    expect(committed[2].value).toEqual({
      userId: 42,
      email: "pai@example.test",
    });
    expect(scopes[0]).toEqual([17, 7]);
    expect(scopes.at(-1)).toEqual([17, 7]);
  });
  it("não altera conta já existente nem sua senha", async () => {
    existing = true;
    await expect(enableResponsibleLogin(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(committed).toHaveLength(0);
  });
  it("recusa responsável que já tem login", async () => {
    responsible.userId = 99;
    await expect(enableResponsibleLogin(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(committed).toHaveLength(0);
  });
  it("não grava fora do escopo paroquial", async () => {
    responsible = null;
    await expect(enableResponsibleLogin(input)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(committed).toHaveLength(0);
  });
  it("recusa cadastro inativo e senha fraca", async () => {
    responsible.status = "INACTIVE";
    await expect(enableResponsibleLogin(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      enableResponsibleLogin({ ...input, temporaryPassword: "123" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(committed).toHaveLength(0);
  });
  it("reverte toda a criação se o vínculo de acesso falhar", async () => {
    failMembership = true;
    await expect(enableResponsibleLogin(input)).rejects.toThrow();
    expect(committed).toHaveLength(0);
  });
  it("trata concorrência de e-mail sem vincular uma conta alheia", async () => {
    conflict = true;
    await expect(enableResponsibleLogin(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(committed).toHaveLength(0);
  });
  it("impede que um responsável habilite acessos", async () => {
    const caller = peopleRouter.createCaller({
      actor: {
        type: "USER",
        user: { id: 5 },
        parishId: 7,
        role: "RESPONSIBLE",
      },
      req: { headers: {} },
      res: {},
      user: null,
    } as any);
    await expect(
      caller.responsibles.enableLogin({
        id: 17,
        email: "pai@example.test",
        temporaryPassword: "Provisoria123",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.db).not.toHaveBeenCalled();
  });
});
