/**
 * Testes da trilha de auditoria.
 *
 * A auditoria registra ações sobre crianças, então ela é ao mesmo tempo
 * obrigatória e perigosa: se um PIN ou token vazar para dentro do log, ele fica
 * lá permanentemente, porque a tabela é append-only. Estes testes travam a
 * higienização e a garantia de que uma falha de auditoria não derruba a
 * operação principal.
 */
import { describe, expect, it } from "vitest";

import { sanitizeMetadata } from "./services/audit";

describe("sanitizeMetadata — remoção de segredos", () => {
  it("remove o PIN em qualquer capitalização", () => {
    const result = sanitizeMetadata({ pin: "1234", PIN: "5678", Pin: "9012" }) as Record<
      string,
      unknown
    >;
    expect(result.pin).toBe("[removido]");
    expect(result.PIN).toBe("[removido]");
    expect(result.Pin).toBe("[removido]");
  });

  it("remove as variações de PIN usadas nos fluxos de troca", () => {
    const result = sanitizeMetadata({
      newPin: "1234",
      currentPin: "4321",
      pinHash: "abc",
    }) as Record<string, unknown>;
    expect(Object.values(result)).toEqual(["[removido]", "[removido]", "[removido]"]);
  });

  it("remove senhas e hashes de senha", () => {
    const result = sanitizeMetadata({
      password: "segredo",
      newPassword: "outro",
      passwordHash: "$scrypt$...",
    }) as Record<string, unknown>;
    expect(Object.values(result)).toEqual(["[removido]", "[removido]", "[removido]"]);
  });

  it("remove tokens de recuperação e cabeçalhos de autorização", () => {
    const result = sanitizeMetadata({
      token: "abc123",
      tokenHash: "def456",
      secret: "xyz",
      authorization: "Bearer abc",
    }) as Record<string, unknown>;
    expect(Object.values(result)).toEqual([
      "[removido]",
      "[removido]",
      "[removido]",
      "[removido]",
    ]);
  });

  it("remove segredos aninhados em objetos", () => {
    const result = sanitizeMetadata({
      request: { credentials: { pin: "1234", accessId: "SRV-ABC" } },
    }) as Record<string, Record<string, Record<string, unknown>>>;
    expect(result.request.credentials.pin).toBe("[removido]");
    // O ID de acesso não é segredo: identifica o servidor sem autenticá-lo.
    expect(result.request.credentials.accessId).toBe("SRV-ABC");
  });

  it("remove segredos dentro de arrays de objetos", () => {
    const result = sanitizeMetadata([{ pin: "1111" }, { pin: "2222" }]) as Record<
      string,
      unknown
    >[];
    expect(result.map(item => item.pin)).toEqual(["[removido]", "[removido]"]);
  });
});

describe("sanitizeMetadata — preservação de dados úteis", () => {
  it("mantém campos operacionais intactos", () => {
    const result = sanitizeMetadata({
      scheduleId: 12,
      status: "PUBLISHED",
      version: 3,
      published: true,
    });
    expect(result).toEqual({ scheduleId: 12, status: "PUBLISHED", version: 3, published: true });
  });

  it("converte Date em ISO, para o log ficar legível e estável", () => {
    const date = new Date("2026-08-16T12:00:00.000Z");
    const result = sanitizeMetadata({ occurredAt: date }) as Record<string, unknown>;
    expect(result.occurredAt).toBe("2026-08-16T12:00:00.000Z");
  });

  it("normaliza null e undefined", () => {
    const result = sanitizeMetadata({ a: null, b: undefined }) as Record<string, unknown>;
    expect(result.a).toBeNull();
    expect(result.b).toBeNull();
  });
});

describe("sanitizeMetadata — limites de tamanho e profundidade", () => {
  it("truncа strings muito longas para não inflar a tabela", () => {
    const long = "a".repeat(900);
    const result = sanitizeMetadata({ note: long }) as Record<string, string>;
    expect(result.note.length).toBeLessThanOrEqual(501);
    expect(result.note.endsWith("…")).toBe(true);
  });

  it("não trunca strings dentro do limite", () => {
    const result = sanitizeMetadata({ note: "observação curta" }) as Record<string, string>;
    expect(result.note).toBe("observação curta");
  });

  it("interrompe a recursão em estruturas profundas, sem estourar a pilha", () => {
    // Monta um objeto com 12 níveis de profundidade.
    let deep: Record<string, unknown> = { value: "fundo" };
    for (let i = 0; i < 12; i += 1) deep = { nested: deep };

    const result = sanitizeMetadata(deep);
    expect(JSON.stringify(result)).toContain("profundidade máxima");
  });

  it("não lança em referências circulares tratadas pelo limite de profundidade", () => {
    const node: Record<string, unknown> = { name: "raiz" };
    node.self = node;
    expect(() => sanitizeMetadata(node)).not.toThrow();
  });
});
