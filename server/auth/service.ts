/**
 * Serviço de autenticação: login por e-mail/senha, login por ID+PIN,
 * emissão e revogação de sessões, bloqueio por tentativas inválidas.
 */
import { SECURITY, type RoleName } from "@shared/domain";
import { TRPCError } from "@trpc/server";
import { and, eq, gt, isNull, or } from "drizzle-orm";

import {
  altarServers,
  parishMembers,
  parishes,
  responsibles,
  serverAccess,
  sessions,
  users,
} from "../../drizzle/schema";
import { getDbOrThrow } from "../db";
import { generateSessionToken, hashToken, verifySecret } from "./crypto";
import type { Actor } from "./types";

/** Retorna o instante de expiração padrão de uma sessão. */
function sessionExpiry(): Date {
  return new Date(Date.now() + SECURITY.sessionDays * 24 * 60 * 60 * 1000);
}

/** Erro genérico de credencial. A mensagem nunca revela qual campo falhou. */
function invalidCredentials(): TRPCError {
  return new TRPCError({
    code: "UNAUTHORIZED",
    message: "Credenciais inválidas. Verifique os dados informados.",
  });
}

function accountLocked(until: Date): TRPCError {
  const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000));
  return new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message: `Acesso temporariamente bloqueado por tentativas inválidas. Tente novamente em ${minutes} minuto(s).`,
  });
}

/**
 * Erro único para qualquer estado administrativo que impeça o acesso
 * (conta inativa, bloqueada, revogada, aguardando ativação, paróquia suspensa).
 *
 * A mensagem é deliberadamente idêntica em todos os casos para que a resposta
 * não permita inferir a existência nem a situação de uma conta antes da
 * autenticação. O detalhe real fica registrado apenas na trilha de auditoria.
 */
function accessUnavailable(): TRPCError {
  return new TRPCError({
    code: "FORBIDDEN",
    message:
      "Não foi possível concluir o acesso. Procure a coordenação da sua paróquia para verificar sua situação.",
  });
}

export type LoginMeta = { ip?: string | null; userAgent?: string | null };

export type LoginResult = {
  token: string;
  expiresAt: Date;
  actorType: "USER" | "SERVER";
  role: RoleName;
  parishId: number | null;
  displayName: string;
  mustChangePassword?: boolean;
  pinResetRequested?: boolean;
};

/**
 * Determina o papel ativo e a paróquia de um usuário.
 * Um usuário pode ter múltiplos vínculos; o papel de maior autoridade prevalece.
 */
export async function resolveUserScope(userId: number): Promise<{
  role: RoleName;
  parishId: number | null;
  responsibleId: number | null;
}> {
  const db = await getDbOrThrow();

  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRow || userRow.status !== "ACTIVE") throw invalidCredentials();

  if (userRow.isPlatformAdmin) {
    return { role: "SUPER_ADMIN", parishId: null, responsibleId: null };
  }

  const memberships = await db
    .select({
      parishId: parishMembers.parishId,
      role: parishMembers.role,
      parishStatus: parishes.status,
    })
    .from(parishMembers)
    .innerJoin(parishes, eq(parishes.id, parishMembers.parishId))
    .where(and(eq(parishMembers.userId, userId), eq(parishMembers.status, "ACTIVE")));

  const active = memberships.filter(m => m.parishStatus === "ACTIVE");
  if (active.length === 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Sua conta não está vinculada a nenhuma paróquia ativa. Procure a coordenação.",
    });
  }

  const priority: RoleName[] = ["PARISH_ADMIN", "COORDINATOR", "PRIEST", "RESPONSIBLE"];
  const chosen =
    priority.map(role => active.find(m => m.role === role)).find(Boolean) ?? active[0]!;

  let responsibleId: number | null = null;
  if (chosen.role === "RESPONSIBLE") {
    const [responsibleRow] = await db
      .select({ id: responsibles.id })
      .from(responsibles)
      .where(
        and(
          eq(responsibles.userId, userId),
          eq(responsibles.parishId, chosen.parishId),
          eq(responsibles.status, "ACTIVE"),
        ),
      )
      .limit(1);
    responsibleId = responsibleRow?.id ?? null;
  }

  return { role: chosen.role as RoleName, parishId: chosen.parishId, responsibleId };
}

/** Cria uma sessão persistida e devolve o token opaco. */
export async function createSession(params: {
  actorType: "USER" | "SERVER";
  userId?: number;
  serverId?: number;
  parishId: number | null;
  activeRole: RoleName;
  meta?: LoginMeta;
}): Promise<{ token: string; expiresAt: Date }> {
  const db = await getDbOrThrow();
  const token = generateSessionToken();
  const expiresAt = sessionExpiry();

  await db.insert(sessions).values({
    actorType: params.actorType,
    userId: params.userId ?? null,
    serverId: params.serverId ?? null,
    tokenHash: hashToken(token),
    parishId: params.parishId,
    activeRole: params.activeRole,
    expiresAt,
    ip: params.meta?.ip?.slice(0, 64) ?? null,
    userAgent: params.meta?.userAgent?.slice(0, 255) ?? null,
  });

  return { token, expiresAt };
}

/** Revoga a sessão associada ao token informado. */
export async function revokeSession(token: string): Promise<void> {
  const db = await getDbOrThrow();
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.tokenHash, hashToken(token)));
}

/** Revoga todas as sessões de um servidor (usado ao bloquear ou revogar acesso). */
export async function revokeServerSessions(serverId: number): Promise<void> {
  const db = await getDbOrThrow();
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.serverId, serverId), isNull(sessions.revokedAt)));
}

/** Revoga todas as sessões de um usuário. */
export async function revokeUserSessions(userId: number): Promise<void> {
  const db = await getDbOrThrow();
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/**
 * Resolve o ator autenticado a partir do token de sessão.
 * Retorna null quando o token é inválido, expirado ou revogado.
 */
export async function resolveActorFromToken(token: string): Promise<Actor | null> {
  const db = await getDbOrThrow();
  const now = new Date();

  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
      ),
    )
    .limit(1);

  if (!session) return null;

  if (session.actorType === "SERVER") {
    if (!session.serverId) return null;
    const [server] = await db
      .select()
      .from(altarServers)
      .where(eq(altarServers.id, session.serverId))
      .limit(1);
    if (!server) return null;

    // Acesso revogado ou bloqueado invalida a sessão imediatamente.
    const [access] = await db
      .select({ status: serverAccess.status })
      .from(serverAccess)
      .where(eq(serverAccess.serverId, server.id))
      .limit(1);
    if (!access || access.status !== "ACTIVE") return null;

    // Paróquia suspensa impede o acesso.
    const [parish] = await db
      .select({ status: parishes.status })
      .from(parishes)
      .where(eq(parishes.id, server.parishId))
      .limit(1);
    if (!parish || parish.status !== "ACTIVE") return null;

    return {
      type: "SERVER",
      server,
      parishId: server.parishId,
      role: "SERVER",
      sessionId: session.id,
    };
  }

  if (!session.userId) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user || user.status !== "ACTIVE") return null;

  let scope: { role: RoleName; parishId: number | null; responsibleId: number | null };
  try {
    scope = await resolveUserScope(user.id);
  } catch {
    return null;
  }

  return {
    type: "USER",
    user,
    parishId: scope.parishId,
    role: scope.role,
    responsibleId: scope.responsibleId,
    sessionId: session.id,
  };
}

/** Login administrativo por e-mail e senha, com controle de tentativas. */
export async function loginWithPassword(
  email: string,
  password: string,
  meta?: LoginMeta,
): Promise<LoginResult> {
  const db = await getDbOrThrow();
  const normalizedEmail = email.trim().toLowerCase();

  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

  if (!user || !user.passwordHash) {
    throw invalidCredentials();
  }

  // O bloqueio temporal é verificado primeiro: quando a janela expira,
  // o acesso é devolvido automaticamente, sem intervenção manual.
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw accountLocked(user.lockedUntil);
  }

  if (user.status !== "ACTIVE") {
    throw accessUnavailable();
  }

  const valid = await verifySecret(password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= SECURITY.maxPasswordAttempts;
    await db
      .update(users)
      .set({
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock
          ? new Date(Date.now() + SECURITY.passwordLockMinutes * 60 * 1000)
          : null,
      })
      .where(eq(users.id, user.id));
    throw invalidCredentials();
  }

  const scope = await resolveUserScope(user.id);

  await db
    .update(users)
    .set({ failedLoginAttempts: 0, lockedUntil: null, lastSignedIn: new Date() })
    .where(eq(users.id, user.id));

  const { token, expiresAt } = await createSession({
    actorType: "USER",
    userId: user.id,
    parishId: scope.parishId,
    activeRole: scope.role,
    meta,
  });

  return {
    token,
    expiresAt,
    actorType: "USER",
    role: scope.role,
    parishId: scope.parishId,
    displayName: user.name ?? normalizedEmail,
    mustChangePassword: user.mustChangePassword,
  };
}

/** Login do servidor por ID de acesso e PIN, com bloqueio temporário. */
export async function loginWithAccessId(
  accessId: string,
  pin: string,
  meta?: LoginMeta,
): Promise<LoginResult> {
  const db = await getDbOrThrow();
  const normalizedAccessId = accessId.trim().toUpperCase();

  const [row] = await db
    .select({
      access: serverAccess,
      server: altarServers,
      parishStatus: parishes.status,
    })
    .from(serverAccess)
    .innerJoin(altarServers, eq(altarServers.id, serverAccess.serverId))
    .innerJoin(parishes, eq(parishes.id, serverAccess.parishId))
    .where(eq(serverAccess.accessId, normalizedAccessId))
    .limit(1);

  if (!row || !row.access.pinHash) {
    throw invalidCredentials();
  }

  const { access, server, parishStatus } = row;

  // Bloqueio temporal antes de qualquer verificação de estado.
  if (access.lockedUntil && access.lockedUntil.getTime() > Date.now()) {
    throw accountLocked(access.lockedUntil);
  }

  // Bloqueio cuja janela já expirou é liberado automaticamente. Só o bloqueio
  // aplicado manualmente pela coordenação (sem `lockedUntil`) permanece.
  if (access.status === "BLOCKED" && access.lockedUntil) {
    await db
      .update(serverAccess)
      .set({ status: "ACTIVE", failedAttempts: 0, lockedUntil: null })
      .where(eq(serverAccess.id, access.id));
    access.status = "ACTIVE";
    access.failedAttempts = 0;
    access.lockedUntil = null;
  }

  if (parishStatus !== "ACTIVE" || access.status !== "ACTIVE" || server.status === "INACTIVE") {
    throw accessUnavailable();
  }

  const valid = await verifySecret(pin, access.pinHash);
  if (!valid) {
    const attempts = access.failedAttempts + 1;
    const shouldLock = attempts >= SECURITY.maxPinAttempts;
    await db
      .update(serverAccess)
      .set({
        failedAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + SECURITY.pinLockMinutes * 60 * 1000) : null,
        // O status permanece ACTIVE: o bloqueio é puramente temporal e expira
        // por `lockedUntil`, evitando bloqueio permanente por engano da criança.
        status: access.status,
      })
      .where(eq(serverAccess.id, access.id));
    throw invalidCredentials();
  }

  await db
    .update(serverAccess)
    .set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(serverAccess.id, access.id));

  const { token, expiresAt } = await createSession({
    actorType: "SERVER",
    serverId: server.id,
    parishId: server.parishId,
    activeRole: "SERVER",
    meta,
  });

  return {
    token,
    expiresAt,
    actorType: "SERVER",
    role: "SERVER",
    parishId: server.parishId,
    displayName: server.name,
    pinResetRequested: access.pinResetRequested,
  };
}

/** Busca um usuário ativo por e-mail (usado em fluxos de recuperação). */
export async function findActiveUserByEmail(email: string) {
  const db = await getDbOrThrow();
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.email, email.trim().toLowerCase()),
        or(eq(users.status, "ACTIVE"), eq(users.status, "INACTIVE")),
      ),
    )
    .limit(1);
  return user ?? null;
}
