/**
 * Trilha de auditoria append-only.
 *
 * Garantias:
 * - Nenhum registro é atualizado ou removido após a gravação.
 * - Segredos (PIN, senha, token) são removidos dos metadados antes de persistir.
 * - Falha de auditoria nunca derruba a operação principal, mas é logada.
 */
import type { AuditAction } from "@shared/domain";

import { auditLogs } from "../../drizzle/schema";
import { getDb } from "../db";
import { toActorIdentity, type Actor } from "../auth/types";

/** Chaves que nunca podem ser persistidas em metadados de auditoria. */
const FORBIDDEN_KEYS = [
  "pin",
  "newpin",
  "currentpin",
  "pinhash",
  "password",
  "newpassword",
  "currentpassword",
  "passwordhash",
  "token",
  "tokenhash",
  "secret",
  "authorization",
];

/** Remove recursivamente qualquer campo sensível dos metadados. */
export function sanitizeMetadata(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[profundidade máxima]";
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(item => sanitizeMetadata(item, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.includes(key.toLowerCase())) {
        result[key] = "[removido]";
        continue;
      }
      result[key] = sanitizeMetadata(raw, depth + 1);
    }
    return result;
  }
  if (typeof value === "string" && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

export type AuditInput = {
  action: AuditAction;
  entityType?: string;
  entityId?: number | null;
  parishId?: number | null;
  metadata?: Record<string, unknown>;
  result?: "SUCCESS" | "FAILURE" | "DENIED";
  ip?: string | null;
  userAgent?: string | null;
};

/** Registra uma ação executada por um ator autenticado. */
export async function recordAudit(actor: Actor, input: AuditInput): Promise<void> {
  const identity = toActorIdentity(actor);
  await writeAudit({
    parishId: input.parishId ?? identity.parishId,
    actorUserId: identity.actorUserId,
    actorServerId: identity.actorServerId,
    actorRole: identity.actorRole,
    actorLabel: identity.actorLabel,
    ...input,
  });
}

/**
 * Registra uma ação sem ator autenticado (ex.: tentativa de login falhada).
 * Usado apenas em fluxos anônimos.
 */
export async function recordAnonymousAudit(
  input: AuditInput & { actorLabel?: string | null },
): Promise<void> {
  await writeAudit({
    parishId: input.parishId ?? null,
    actorUserId: null,
    actorServerId: null,
    actorRole: null,
    actorLabel: input.actorLabel ?? null,
    ...input,
  });
}

type WriteAuditInput = AuditInput & {
  parishId: number | null;
  actorUserId: number | null;
  actorServerId: number | null;
  actorRole: string | null;
  actorLabel: string | null;
};

async function writeAudit(input: WriteAuditInput): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db.insert(auditLogs).values({
      parishId: input.parishId,
      actorUserId: input.actorUserId,
      actorServerId: input.actorServerId,
      actorRole: (input.actorRole as never) ?? null,
      actorLabel: input.actorLabel?.slice(0, 180) ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      metadata: input.metadata ? (sanitizeMetadata(input.metadata) as never) : null,
      result: input.result ?? "SUCCESS",
      ip: input.ip?.slice(0, 64) ?? null,
      userAgent: input.userAgent?.slice(0, 255) ?? null,
    });
  } catch (error) {
    // Auditoria nunca invalida a operação principal.
    console.error("[Auditoria] Falha ao registrar ação:", input.action, error);
  }
}
