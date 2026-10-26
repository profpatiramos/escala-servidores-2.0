import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("./db", () => ({ getDbOrThrow: mocks.db }));
vi.mock("./services/audit", () => ({ recordAudit: vi.fn() }));
import { availabilityRouter } from "./routers/availability";
const caller = () =>
  availabilityRouter.createCaller({
    actor: { type: "SERVER", role: "SERVER", server: { id: 22 }, parishId: 7 },
    req: { headers: {} },
    res: {},
    user: null,
  } as any);
describe("edição das preferências do servidor", () => {
  let writes: any[], fail: boolean;
  beforeEach(() => {
    vi.clearAllMocks();
    writes = [];
    fail = false;
    mocks.db.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () =>
            Object.assign(Promise.resolve([]), {
              limit: async () => [{ id: 22 }],
            }),
        }),
      }),
      transaction: async (work: any) => {
        const pending: any[] = [];
        await work({
          update: () => ({
            set: (value: any) => ({ where: async () => pending.push(value) }),
          }),
          insert: () => ({
            values: async (value: any) => {
              if (fail) throw Error("falha");
              pending.push(value);
            },
          }),
        });
        writes.push(...pending);
      },
    });
  });
  it("recusa preferências vazias mesmo quando os campos são omitidos", async () => {
    await expect(
      caller().preferences.replace({ serverId: 22, preferences: [{}, {}] })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(writes).toHaveLength(0);
  });
  it("salva dias preferidos no próprio cadastro sem afetar outro servidor", async () => {
    await caller().preferences.replace({
      serverId: 22,
      preferences: [{ weekday: 0 }, { weekday: 6 }],
    });
    expect(writes[1]).toEqual([
      expect.objectContaining({ parishId: 7, serverId: 22, weekday: 0 }),
      expect.objectContaining({ parishId: 7, serverId: 22, weekday: 6 }),
    ]);
    await expect(
      caller().preferences.replace({ serverId: 23, preferences: [] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("recusa função que não pertence à paróquia", async () => {
    await expect(
      caller().preferences.replace({
        serverId: 22,
        preferences: [{ parishRoleId: 99 }, { weekday: 6 }],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(writes).toHaveLength(0);
  });
  it("mantém as preferências anteriores quando a gravação falha", async () => {
    fail = true;
    await expect(
      caller().preferences.replace({
        serverId: 22,
        preferences: [{ weekday: 0 }, { weekday: 6 }],
      })
    ).rejects.toThrow();
    expect(writes).toHaveLength(0);
  });
});
