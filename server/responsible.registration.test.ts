import { beforeEach, describe, expect, it, vi } from "vitest";
import { altarServers, familyLinks, responsibles } from "../drizzle/schema";

const mocks = vi.hoisted(() => ({ db: vi.fn(), audit: vi.fn() }));
vi.mock("./db", () => ({ getDbOrThrow: mocks.db }));
vi.mock("./services/audit", () => ({ recordAudit: mocks.audit }));
import { peopleRouter } from "./routers/people";

const caller = () => peopleRouter.createCaller({
  actor: { type: "USER", user: { id: 5 }, parishId: 7, role: "COORDINATOR" },
  user: null, req: { headers: {} }, res: {},
} as any);

describe("cadastro de responsável com servidor", () => {
  let writes: { table: unknown; value: any }[];
  let missingServer: boolean;
  let failLink: boolean;
  beforeEach(() => {
    vi.clearAllMocks();
    writes = []; missingServer = false; failLink = false;
    mocks.db.mockResolvedValue({ transaction: async (work: any) => {
      const pending: typeof writes = [];
      const result = await work({
        select: () => ({ from: (table: unknown) => ({ where: () => ({
          limit: async () => table === altarServers && !missingServer ? [{ id: 20 }] : [],
        }) }) }),
        insert: (table: unknown) => ({ values: (value: any) => {
          if (table === familyLinks && failLink) throw new Error("falha de vínculo");
          pending.push({ table, value });
          return { returning: async () => [{ id: 42 }] };
        } }),
      });
      writes.push(...pending);
      return result;
    } });
  });

  it("usa o ID retornado pelo cadastro e salva o vínculo na mesma transação", async () => {
    await expect(caller().responsibles.create({ name: "Maria Silva", serverId: 20, relationshipType: "MOTHER" })).resolves.toEqual({ id: 42 });
    expect(writes).toEqual([
      { table: responsibles, value: expect.objectContaining({ parishId: 7, name: "Maria Silva" }) },
      { table: familyLinks, value: expect.objectContaining({ parishId: 7, responsibleId: 42, serverId: 20, relationshipType: "MOTHER", createdByUserId: 5 }) },
    ]);
  });
  it("mantém o cadastro sem vínculo opcional", async () => {
    await caller().responsibles.create({ name: "Maria Silva" });
    expect(writes).toHaveLength(1);
  });
  it("recusa servidor não encontrado no escopo da paróquia antes de gravar", async () => {
    missingServer = true;
    await expect(caller().responsibles.create({ name: "Maria Silva", serverId: 20 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(writes).toHaveLength(0);
  });
  it("não confirma o cadastro quando o vínculo falha", async () => {
    failLink = true;
    await expect(caller().responsibles.create({ name: "Maria Silva", serverId: 20 })).rejects.toThrow();
    expect(writes).toHaveLength(0);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
