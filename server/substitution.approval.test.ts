import { beforeEach, describe, expect, it, vi } from "vitest";
import { substitutionRequests, scheduleAssignments } from "../drizzle/schema";
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
vi.mock("./services/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("./services/notifications", () => ({ enqueueNotification: vi.fn() }));
import { approveSubstitution } from "./services/substitutionApproval";
import { recordAudit } from "./services/audit";
import { enqueueNotification } from "./services/notifications";
const params = {
  parishId: 7,
  requestId: 4,
  replacementServerId: 22,
  actor: {
    type: "USER",
    user: { id: 1 },
    role: "COORDINATOR",
    parishId: 7,
  } as any,
};
describe("aprovação da substituição", () => {
  let request: any, created: any[], fail: boolean, alreadyAssigned: boolean;
  beforeEach(() => {
    vi.clearAllMocks();
    request = { id: 4, parishId: 7, status: "PENDING", assignmentId: 10 };
    created = [];
    fail = false;
    alreadyAssigned = false;
    mocks.validate.mockResolvedValue({
      valid: true,
      blocking: [],
      warnings: [],
    });
    mocks.db.mockResolvedValue({
      transaction: async (work: any) =>
        work({
          select: () => ({
            from: (table: unknown) => ({
              where: () => ({
                limit: () =>
                  Object.assign(
                    request.status === "APPROVED"
                      ? [{ id: 20 }]
                      : alreadyAssigned
                        ? [{ id: 99 }]
                        : [],
                    {
                      for: async () =>
                        table === substitutionRequests
                          ? [request]
                          : [
                              {
                                id: 10,
                                parishId: 7,
                                serverId: 11,
                                scheduleId: 5,
                                celebrationId: 6,
                                parishRoleId: 3,
                                status: "CONFIRMED",
                                assignmentSource: "MANUAL",
                              },
                            ],
                    }
                  ),
              }),
            }),
          }),
          execute: async () => ({ rows: [{ id: 6 }] }),
          insert: () => ({
            values: (value: any) => ({
              returning: async () => {
                if (fail) throw Error("falha");
                created.push(value);
                return [{ id: 20 }];
              },
            }),
          }),
          update: (table: unknown) => ({
            set: (value: any) => ({
              where: async () => {
                if (table === substitutionRequests)
                  request = { ...request, ...value };
              },
            }),
          }),
        }),
    });
  });
  it("pontua após aprovação e impede nova aprovação do mesmo pedido", async () => {
    await expect(approveSubstitution(params)).resolves.toMatchObject({
      approved: true,
      newAssignmentId: 20,
    });
    expect(created).toHaveLength(1);
    expect(mocks.points).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "SUBSTITUTION_ACCEPTED",
        referenceId: 4,
        serverId: 22,
        parishId: 7,
      })
    );
    await expect(approveSubstitution(params)).resolves.toMatchObject({
      approved: true,
      replayed: true,
    });
    expect(created).toHaveLength(1);
    expect(mocks.points).toHaveBeenCalledTimes(2);
    expect(mocks.points.mock.calls[1]).toEqual(mocks.points.mock.calls[0]);
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(enqueueNotification).toHaveBeenCalledTimes(1);
  });
  it("não grava nem pontua candidato incompatível", async () => {
    mocks.validate.mockResolvedValue({
      valid: false,
      blocking: [{ message: "Sem habilitação" }],
      warnings: [],
    });
    await expect(approveSubstitution(params)).resolves.toMatchObject({
      approved: false,
    });
    expect(created).toHaveLength(0);
    expect(mocks.points).not.toHaveBeenCalled();
  });
  it("não pontua se a criação da nova alocação falhar", async () => {
    fail = true;
    await expect(approveSubstitution(params)).rejects.toThrow();
    expect(mocks.points).not.toHaveBeenCalled();
  });
  it("impede substituir quem já está escalado na mesma celebração", async () => {
    alreadyAssigned = true;
    await expect(approveSubstitution(params)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(created).toHaveLength(0);
    expect(mocks.points).not.toHaveBeenCalled();
  });
  it("recupera bônus que falhou após aprovação sem recriar alocação", async () => {
    mocks.points
      .mockResolvedValueOnce({ granted: false, reason: "ERROR" })
      .mockResolvedValueOnce({ granted: true, points: 5, transactionId: 2 });
    await expect(approveSubstitution(params)).resolves.toMatchObject({
      points: { granted: false, reason: "ERROR" },
    });
    await expect(approveSubstitution(params)).resolves.toMatchObject({
      replayed: true,
      points: { granted: true },
    });
    expect(created).toHaveLength(1);
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(enqueueNotification).toHaveBeenCalledTimes(1);
    await expect(
      approveSubstitution({ ...params, replacementServerId: 23 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
