import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  auditLogs,
  scheduleAssignments,
  schedules,
  attendanceRecords,
} from "../drizzle/schema";
const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  validate: vi.fn(),
  points: vi.fn(),
}));
vi.mock("./db", () => ({ getDbOrThrow: mocks.db }));
vi.mock("./services/scheduleValidation", () => ({
  validateAssignments: mocks.validate,
}));
vi.mock("./services/gamification", () => ({ grantPoints: mocks.points }));
import { participationRouter } from "./routers/participation";
const caller = (manager = false) =>
  participationRouter.createCaller({
    actor: manager
      ? { type: "USER", user: { id: 1 }, role: "COORDINATOR", parishId: 7 }
      : {
          type: "SERVER",
          server: { id: 22, name: "Servidor Teste" },
          role: "SERVER",
          parishId: 7,
        },
    user: null,
    req: { headers: {} },
    res: {},
  } as any);
describe("participação fora da escala", () => {
  let assigned: boolean,
    resolved: boolean,
    writes: { table: unknown; value: any }[];
  beforeEach(() => {
    vi.clearAllMocks();
    assigned = false;
    resolved = false;
    writes = [];
    mocks.validate.mockResolvedValue({
      valid: true,
      blocking: [],
      warnings: [],
    });
    mocks.db.mockResolvedValue({
      execute: async () => ({ rows: [{ id: 6 }] }),
      transaction: async (work: any) =>
        work({
          execute: vi.fn(),
          select: () => ({
            from: (table: unknown) => ({
              where: (condition: any) => ({
                limit: () => {
                  const params = new PgDialect().sqlToQuery(condition).params;
                  let rows: any[] = [];
                  if (table === auditLogs)
                    rows = params.includes("extra_service_resolved")
                      ? resolved
                        ? [{ id: 5 }]
                        : []
                      : params.includes("extra_service") && params.includes(4)
                        ? [
                            {
                              id: 4,
                              actorServerId: 22,
                              entityId: 6,
                              metadata: { parishRoleId: 3 },
                            },
                          ]
                        : [];
                  if (table === scheduleAssignments)
                    rows = assigned ? [{ id: 10 }] : [];
                  if (table === schedules)
                    rows = [{ id: 8, status: "PUBLISHED" }];
                  (rows as any).for = async () => rows;
                  return rows;
                },
              }),
            }),
          }),
          insert: (table: unknown) => ({
            values: (value: any) => {
              writes.push({ table, value });
              if (
                table === auditLogs &&
                value.entityType === "extra_service_resolved"
              )
                resolved = true;
              return { returning: async () => [{ id: 40 }] };
            },
          }),
        }),
    });
  });
  it("solicitar não concede pontos nem marca presença", async () => {
    await caller().requestExtra({ celebrationId: 6, parishRoleId: 3 });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      table: auditLogs,
      value: { actorServerId: 22, entityType: "extra_service" },
    });
    expect(mocks.points).not.toHaveBeenCalled();
  });
  it("impede pedido duplicado por alguém que já estava escalado", async () => {
    assigned = true;
    await expect(
      caller().requestExtra({ celebrationId: 6, parishRoleId: 3 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(writes).toHaveLength(0);
    expect(mocks.points).not.toHaveBeenCalled();
  });
  it("aprovação registra presença e pontua uma única vez", async () => {
    await caller(true).reviewExtra({
      requestId: 4,
      approve: true,
      reason: "Serviço conferido",
    });
    expect(
      writes.find(w => w.table === attendanceRecords)?.value
    ).toMatchObject({ assignmentId: 40, status: "PRESENT", parishId: 7 });
    expect(mocks.points).toHaveBeenCalledWith(
      expect.objectContaining({
        serverId: 22,
        eventType: "PARTICIPATION_DONE",
        referenceId: 40,
      })
    );
    await expect(
      caller(true).reviewExtra({
        requestId: 4,
        approve: true,
        reason: "Serviço conferido",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.points).toHaveBeenCalledTimes(1);
  });
  it("recusa não cria alocação nem concede pontos", async () => {
    await caller(true).reviewExtra({
      requestId: 4,
      approve: false,
      reason: "Não confirmado",
    });
    expect(writes.every(w => w.table === auditLogs)).toBe(true);
    expect(mocks.points).not.toHaveBeenCalled();
  });
});
