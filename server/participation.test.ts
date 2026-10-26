import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkinWindow, isEarlyConfirmation } from "../shared/participation";
import { substitutionRequests } from "../drizzle/schema";
const mocks = vi.hoisted(() => ({ db: vi.fn(), points: vi.fn() }));
vi.mock("./db", () => ({ getDbOrThrow: mocks.db }));
vi.mock("./services/gamification", () => ({ grantPoints: mocks.points }));
vi.mock("./services/audit", () => ({ recordAudit: vi.fn() }));
import { participationRouter } from "./routers/participation";
const start = Date.UTC(2026, 9, 26, 19),
  end = start + 3600000;
const actor = {
  type: "SERVER",
  server: { id: 22, name: "Servidor Teste" },
  parishId: 7,
  role: "SERVER",
};
const caller = (a: any = actor) =>
  participationRouter.createCaller({
    actor: a,
    user: null,
    req: { headers: {} },
    res: {},
  } as any);
describe("horários de participação", () => {
  it("distingue confirmação antecipada do check-in de chegada", () => {
    expect(isEarlyConfirmation(start, start - 48 * 3600000, 48)).toBe(true);
    expect(isEarlyConfirmation(start, start - 48 * 3600000 + 1, 48)).toBe(
      false
    );
    expect(checkinWindow(start, end, start - 7200001).allowed).toBe(false);
    expect(checkinWindow(start, end, start - 7200000)).toEqual({
      allowed: true,
      beforeStart: true,
    });
    expect(checkinWindow(start, end, start + 1)).toEqual({
      allowed: true,
      beforeStart: false,
    });
    expect(checkinWindow(start, end, end + 1).allowed).toBe(false);
  });
});

describe("regressões da revisão de participação", () => {
  beforeEach(() => vi.clearAllMocks());
  it("recusa candidatura de alguém já escalado na mesma celebração", async () => {
    const update = vi.fn();
    let assignmentsRead = 0;
    mocks.db.mockResolvedValue({
      transaction: async (work: any) =>
        work({
          execute: vi.fn(),
          update,
          select: () => ({
            from: (table: unknown) => ({
              where: () => ({
                limit: () => {
                  const rows =
                    table === substitutionRequests
                      ? [{ id: 4, status: "PENDING", assignmentId: 10 }]
                      : ++assignmentsRead === 1
                        ? [
                            {
                              id: 10,
                              serverId: 11,
                              celebrationId: 6,
                              status: "CONFIRMED",
                            },
                          ]
                        : [{ id: 12 }];
                  return Object.assign(rows, { for: async () => rows });
                },
              }),
            }),
          }),
        }),
    });
    await expect(caller().volunteer({ requestId: 4 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(update).not.toHaveBeenCalled();
    expect(mocks.points).not.toHaveBeenCalled();
  });
  it("informa falha de pontos e permite reprocessar uma presença já salva", async () => {
    const upsert = vi.fn();
    mocks.points
      .mockResolvedValueOnce({ granted: false, reason: "ERROR" })
      .mockResolvedValueOnce({ granted: true, points: 10, transactionId: 3 });
    mocks.db.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              { id: 10, celebrationId: 6, serverId: 22, status: "CONFIRMED" },
            ],
          }),
        }),
      }),
      execute: async () => ({
        rows: [
          {
            assignmentId: 10,
            start: Date.now() - 1000,
            attendanceStatus: "PRESENT",
          },
        ],
      }),
      insert: () => ({ values: () => ({ onConflictDoUpdate: upsert }) }),
    });
    const manager = caller({
      type: "USER",
      user: { id: 1 },
      parishId: 7,
      role: "COORDINATOR",
    });
    await expect(
      manager.validatePresence({ assignmentId: 10 })
    ).resolves.toMatchObject({ points: { granted: false, reason: "ERROR" } });
    await expect(
      manager.validatePresence({ assignmentId: 10 })
    ).resolves.toMatchObject({ points: { granted: true } });
    expect(upsert).toHaveBeenCalledTimes(2);
  });
});
describe("check-in e permissões", () => {
  let rows: any[], written: any[], hasCheckin: boolean;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(start - 1000);
    hasCheckin = false;
    written = [];
    rows = [
      { assignmentId: 10, serverId: 22, start, end, status: "CONFIRMED" },
    ];
    mocks.db.mockResolvedValue({
      execute: async () => ({ rows }),
      transaction: async (work: any) =>
        work({
          execute: vi.fn(),
          select: () => ({
            from: () => ({
              where: () => ({
                limit: async () => (hasCheckin ? [{ id: 1 }] : []),
              }),
            }),
          }),
          insert: () => ({
            values: async (value: any) => {
              written.push(value);
              hasCheckin = true;
            },
          }),
        }),
    });
  });
  it("registra horário do sistema e não concede pontos só pela chegada", async () => {
    await caller().checkIn({ assignmentId: 10 });
    await caller().checkIn({ assignmentId: 10 });
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      parishId: 7,
      actorServerId: 22,
      entityId: 10,
      metadata: { beforeStart: true },
    });
    expect(mocks.points).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it("recusa check-in fora da janela ou sem confirmação", async () => {
    rows[0].status = "PENDING";
    await expect(caller().checkIn({ assignmentId: 10 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    rows[0].status = "CONFIRMED";
    vi.setSystemTime(end + 1);
    await expect(caller().checkIn({ assignmentId: 10 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(written).toHaveLength(0);
    vi.useRealTimers();
  });
  it("recusa alocação ausente do escopo do servidor", async () => {
    await expect(caller().checkIn({ assignmentId: 11 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(written).toHaveLength(0);
    vi.useRealTimers();
  });
  it("não permite que servidor aprove presença ou serviço extra", async () => {
    await expect(
      caller().validatePresence({ assignmentId: 10 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller().reviewExtra({ requestId: 1, approve: true, reason: "teste" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.points).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
