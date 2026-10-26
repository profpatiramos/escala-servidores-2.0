import { describe, expect, it } from "vitest";
import { formatDateTime } from "../client/src/lib/format";

describe("horários no acompanhamento da paróquia", () => {
  it("mostra o instante no fuso da paróquia, sem depender do navegador", () => {
    const instant = "2026-10-26T21:48:00.000Z";
    expect(formatDateTime(instant, "America/Sao_Paulo")).toBe("26/10/2026, 18:48");
    expect(formatDateTime(instant, "UTC")).toBe("26/10/2026, 21:48");
  });
  it("preserva a data local quando o instante UTC já está no dia seguinte", () => {
    expect(formatDateTime("2026-10-27T01:00:00Z", "America/Sao_Paulo")).toBe("26/10/2026, 22:00");
    expect(formatDateTime(null, "America/Sao_Paulo")).toBe("—");
  });
});
