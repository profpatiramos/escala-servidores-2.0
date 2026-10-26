import { describe, expect, it, vi } from "vitest";
import { calendarDateSchema } from "../shared/validation";

const { getDbOrThrow } = vi.hoisted(() => ({ getDbOrThrow: vi.fn() }));
vi.mock("./db", () => ({ getDbOrThrow }));
import { peopleRouter } from "./routers/people";

describe("datas de calendário", () => {
  it.each(["2026-02-31", "2025-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-01-00", "26-01-01", "2026-1-1"])(
    "recusa a data inexistente ou malformada %s", value => {
      expect(calendarDateSchema.safeParse(value).success).toBe(false);
    }
  );

  it.each(["2024-02-29", "2000-02-29", "2026-12-31", "2026-01-01"])(
    "aceita a data real %s", value => {
      expect(calendarDateSchema.parse(value)).toBe(value);
    }
  );

  it("recusa nascimento impossível na API antes de consultar o banco", async () => {
    const caller = peopleRouter.createCaller({
      actor: { kind: "USER", userId: 1, parishId: 1, role: "PARISH_ADMIN" },
      parishId: 1,
      req: { headers: {} }, res: {}, user: null,
    } as any);
    await expect(caller.servers.create({
      name: "Servidor Teste", birthDate: "2012-02-31",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getDbOrThrow).not.toHaveBeenCalled();
  });
});
