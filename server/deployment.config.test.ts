import { describe, expect, it } from "vitest";
import { normalizeDatabaseUrl } from "./database-config";
import { getSessionCookieOptions } from "./_core/cookies";

describe("configuração de deploy", () => {
  it("recusa URLs ausentes ou com protocolo incorreto sem expor segredo", () => {
    expect(() => normalizeDatabaseUrl(undefined)).toThrow(
      "DATABASE_URL ausente"
    );
    expect(() =>
      normalizeDatabaseUrl("https://user:senha-secreta@example.test/db")
    ).toThrow("DATABASE_URL inválida");
  });
  it("corrige sslmode req e exige verificação de certificado no Neon", () => {
    const url = new URL(
      normalizeDatabaseUrl(
        "postgresql://user:secret@host.neon.tech/db?sslmode=req"
      )
    );
    expect(url.searchParams.get("sslmode")).toBe("verify-full");
  });
  it("preserva conexão local sem SSL", () => {
    expect(normalizeDatabaseUrl("postgresql://localhost/escala_test")).toBe(
      "postgresql://localhost/escala_test"
    );
  });
  it("emite cookie aceito no navegador em HTTP local", () => {
    const cookie = getSessionCookieOptions({
      protocol: "http",
      headers: {},
    } as any);
    expect(cookie).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
    });
  });
  it("preserva cookie seguro em HTTPS e atrás do proxy de deploy", () => {
    expect(
      getSessionCookieOptions({ protocol: "https", headers: {} } as any)
    ).toMatchObject({ secure: true, sameSite: "none" });
    expect(
      getSessionCookieOptions({
        protocol: "http",
        headers: { "x-forwarded-proto": "https" },
      } as any)
    ).toMatchObject({ secure: true, sameSite: "none" });
  });
});
