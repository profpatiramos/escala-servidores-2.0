/**
 * Emissão de códigos de uso único para ativação de acesso e redefinição de PIN.
 *
 * O código puro existe apenas no retorno da emissão, para que a coordenação ou
 * o responsável o entregue pessoalmente à família. Somente o hash é persistido.
 */
import { randomInt } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { accessActivationCodes } from "../../drizzle/schema";
import { hashToken } from "../auth/crypto";
import { getDbOrThrow } from "../db";

/** Alfabeto sem caracteres ambíguos, adequado para ditar por telefone. */
const CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY2346789";

/** Validade do código de ativação, em horas. */
export const ACCESS_CODE_VALID_HOURS = 72;

export type AccessCodePurpose = "ACTIVATION" | "PIN_RESET";

function generateCode(): string {
  const block = () =>
    Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return `${block()}-${block()}`;
}

/**
 * Emite um código de uso único, invalidando os códigos anteriores pendentes do
 * mesmo servidor para o mesmo propósito.
 *
 * Retorna o código em texto puro APENAS para exibição imediata a quem o emitiu.
 */
export async function issueAccessCode(params: {
  parishId: number;
  serverId: number;
  purpose: AccessCodePurpose;
  issuedByUserId: number | null;
}): Promise<{ code: string; expiresAt: Date }> {
  const db = await getDbOrThrow();

  // Invalida códigos pendentes anteriores: apenas o mais recente vale.
  await db
    .update(accessActivationCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(accessActivationCodes.serverId, params.serverId),
        eq(accessActivationCodes.purpose, params.purpose),
        isNull(accessActivationCodes.usedAt),
      ),
    );

  const code = generateCode();
  const expiresAt = new Date(Date.now() + ACCESS_CODE_VALID_HOURS * 60 * 60 * 1000);

  await db.insert(accessActivationCodes).values({
    parishId: params.parishId,
    serverId: params.serverId,
    codeHash: hashToken(code),
    purpose: params.purpose,
    expiresAt,
    issuedByUserId: params.issuedByUserId,
  });

  return { code, expiresAt };
}
