/**
 * Primitivas criptográficas de autenticação.
 *
 * Regras invioláveis:
 * - PIN e senha são armazenados EXCLUSIVAMENTE como hash derivado (scrypt).
 * - Nenhum valor em texto puro é retornado, logado ou persistido.
 * - A comparação usa `timingSafeEqual` para evitar ataques de tempo.
 */
import {
  createHash,
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

type ScryptOptions = { N: number; r: number; p: number };

const scrypt = promisify(scryptCallback) as (
  secret: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384; // 2^14
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

/** Deriva um hash no formato `scrypt$N$r$p$saltHex$hashHex`. */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(secret, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  });
  return [
    "scrypt",
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

/** Verifica um segredo contra o hash armazenado. Retorna false para hashes inválidos. */
export async function verifySecret(secret: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, costRaw, blockRaw, parallelRaw, saltHex, hashHex] = parts;
  const cost = Number(costRaw);
  const blockSize = Number(blockRaw);
  const parallelization = Number(parallelRaw);
  if (!Number.isFinite(cost) || !Number.isFinite(blockSize) || !Number.isFinite(parallelization)) {
    return false;
  }

  try {
    const salt = Buffer.from(saltHex!, "hex");
    const expected = Buffer.from(hashHex!, "hex");
    const derived = await scrypt(secret, salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelization,
    });
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Gera um token de sessão opaco de alta entropia. */
export function generateSessionToken(): string {
  return randomBytes(48).toString("base64url");
}

/** Calcula o hash determinístico de um token, usado como chave de busca. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Alfabeto sem caracteres ambíguos (0/O, 1/I/L) para IDs ditados por telefone
 * ou copiados manualmente por famílias.
 */
const ACCESS_ID_ALPHABET = "ACDEFGHJKMNPQRTUVWXY2346789";

/**
 * Gera um ID de acesso não previsível no formato `SRV-XXXX-XXXX`.
 * O ID é um identificador operacional, NÃO um segredo de autenticação.
 */
export function generateAccessId(): string {
  const pick = () =>
    Array.from(
      { length: 4 },
      () => ACCESS_ID_ALPHABET[randomInt(ACCESS_ID_ALPHABET.length)],
    ).join("");
  return `SRV-${pick()}-${pick()}`;
}

/** Gera um token de uso único para redefinição de senha. */
export function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Valida o formato do PIN: exatamente `length` dígitos numéricos. */
export function isValidPinFormat(pin: string, length: number): boolean {
  return new RegExp(`^\\d{${length}}$`).test(pin);
}

/**
 * Rejeita PINs trivialmente adivinháveis: todos os dígitos iguais
 * ou sequências crescentes/decrescentes contínuas.
 */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;
  const digits = pin.split("").map(Number);
  const ascending = digits.every((d, i) => i === 0 || d === digits[i - 1]! + 1);
  const descending = digits.every((d, i) => i === 0 || d === digits[i - 1]! - 1);
  return ascending || descending;
}

/** Avalia a robustez mínima da senha administrativa. */
export function validatePasswordStrength(
  password: string,
  minLength: number,
): { valid: boolean; message?: string } {
  if (password.length < minLength) {
    return { valid: false, message: `A senha precisa ter pelo menos ${minLength} caracteres.` };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, message: "A senha precisa conter pelo menos uma letra." };
  }
  if (!/\d/.test(password)) {
    return { valid: false, message: "A senha precisa conter pelo menos um número." };
  }
  return { valid: true };
}
