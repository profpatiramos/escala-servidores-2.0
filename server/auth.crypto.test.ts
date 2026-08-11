/**
 * Testes das primitivas de credencial.
 *
 * O foco é a garantia que mais importa aqui: nada de PIN ou senha em texto puro
 * sobrevive ao armazenamento, e PINs trivialmente adivinháveis são recusados
 * antes de proteger a conta de uma criança.
 */
import { describe, expect, it } from "vitest";

import {
  generateAccessId,
  generateResetToken,
  generateSessionToken,
  hashSecret,
  hashToken,
  isValidPinFormat,
  isWeakPin,
  validatePasswordStrength,
  verifySecret,
} from "./auth/crypto";

describe("hashSecret / verifySecret", () => {
  it("nunca guarda o segredo em texto puro no hash derivado", async () => {
    const stored = await hashSecret("4207");
    expect(stored).not.toContain("4207");
    expect(stored.startsWith("scrypt$")).toBe(true);
  });

  it("gera hashes diferentes para o mesmo segredo (salt aleatório)", async () => {
    const a = await hashSecret("mesmo-segredo");
    const b = await hashSecret("mesmo-segredo");
    expect(a).not.toBe(b);
  });

  it("aceita o segredo correto e recusa o incorreto", async () => {
    const stored = await hashSecret("4207");
    await expect(verifySecret("4207", stored)).resolves.toBe(true);
    await expect(verifySecret("4208", stored)).resolves.toBe(false);
  });

  it("recusa verificação quando não há hash armazenado", async () => {
    // Servidor que ainda não ativou o acesso: não deve autenticar por omissão.
    await expect(verifySecret("qualquer", null)).resolves.toBe(false);
  });

  it("recusa hashes malformados sem lançar exceção", async () => {
    await expect(verifySecret("x", "formato-invalido")).resolves.toBe(false);
    await expect(verifySecret("x", "scrypt$a$b$c$zz$zz")).resolves.toBe(false);
    await expect(verifySecret("x", "")).resolves.toBe(false);
  });
});

describe("tokens de sessão e recuperação", () => {
  it("gera tokens de sessão distintos a cada chamada", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateSessionToken()));
    expect(tokens.size).toBe(50);
  });

  it("o hash do token é determinístico e não reversível ao valor original", () => {
    const token = generateSessionToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
    expect(hashToken(token)).toHaveLength(64);
  });

  it("tokens de recuperação são distintos entre si", () => {
    expect(generateResetToken()).not.toBe(generateResetToken());
  });
});

describe("generateAccessId", () => {
  it("segue o formato SRV-XXXX-XXXX", () => {
    expect(generateAccessId()).toMatch(/^SRV-[ACDEFGHJKMNPQRTUVWXY2346789]{4}-[ACDEFGHJKMNPQRTUVWXY2346789]{4}$/);
  });

  it("evita caracteres ambíguos, porque famílias ditam o ID por telefone", () => {
    // Só a parte aleatória importa: o prefixo fixo "SRV-" é lido como palavra.
    const random = Array.from({ length: 200 }, () => generateAccessId().slice(4)).join("");
    // 0/O, 1/I/L, 5/S, 8/B são as confusões clássicas em leitura oral.
    expect(random).not.toMatch(/[01OIL5SB]/);
  });

  it("não repete o mesmo ID em série (não é sequencial nem previsível)", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateAccessId()));
    expect(ids.size).toBeGreaterThan(95);
  });
});

describe("isValidPinFormat", () => {
  it("exige exatamente o número de dígitos configurado", () => {
    expect(isValidPinFormat("4207", 4)).toBe(true);
    expect(isValidPinFormat("420", 4)).toBe(false);
    expect(isValidPinFormat("42071", 4)).toBe(false);
  });

  it("recusa PIN com letras, espaços ou sinais", () => {
    expect(isValidPinFormat("42a7", 4)).toBe(false);
    expect(isValidPinFormat("42 7", 4)).toBe(false);
    expect(isValidPinFormat("+207", 4)).toBe(false);
    expect(isValidPinFormat("", 4)).toBe(false);
  });
});

describe("isWeakPin", () => {
  it("rejeita todos os dígitos iguais", () => {
    expect(isWeakPin("0000")).toBe(true);
    expect(isWeakPin("7777")).toBe(true);
  });

  it("rejeita sequências crescentes e decrescentes", () => {
    expect(isWeakPin("1234")).toBe(true);
    expect(isWeakPin("4321")).toBe(true);
    expect(isWeakPin("6789")).toBe(true);
  });

  it("aceita PINs sem padrão trivial", () => {
    expect(isWeakPin("4207")).toBe(false);
    expect(isWeakPin("1357")).toBe(false);
    expect(isWeakPin("2846")).toBe(false);
  });
});

describe("validatePasswordStrength", () => {
  it("recusa senha curta informando o mínimo exigido", () => {
    const result = validatePasswordStrength("abc1", 8);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("8");
  });

  it("exige letra e número", () => {
    expect(validatePasswordStrength("12345678", 8).valid).toBe(false);
    expect(validatePasswordStrength("abcdefgh", 8).valid).toBe(false);
  });

  it("aceita senha que cumpre todos os critérios", () => {
    const result = validatePasswordStrength("paroquia2026", 8);
    expect(result.valid).toBe(true);
    expect(result.message).toBeUndefined();
  });
});
