/**
 * Router de autenticação.
 *
 * Dois fluxos independentes:
 * 1. E-mail e senha — administradores de paróquia, coordenadores e responsáveis.
 * 2. ID de acesso e PIN — servidores, incluindo menores sem e-mail.
 *
 * Ambos os fluxos emitem o mesmo cookie de sessão httpOnly e registram auditoria.
 */
import { SECURITY } from "@shared/domain";
import { SESSION_COOKIE } from "@shared/const";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  altarServers,
  accessActivationCodes,
  familyLinks,
  parishes,
  passwordResetTokens,
  responsibles,
  serverAccess,
  users,
} from "../../drizzle/schema";
import {
  generateResetToken,
  hashSecret,
  hashToken,
  isValidPinFormat,
  isWeakPin,
  validatePasswordStrength,
  verifySecret,
} from "../auth/crypto";
import {
  findActiveUserByEmail,
  loginWithAccessId,
  loginWithPassword,
  revokeSession,
  revokeUserSessions,
} from "../auth/service";
import { getDbOrThrow } from "../db";
import { recordAnonymousAudit, recordAudit } from "../services/audit";
import { authedProcedure, badRequest, publicProcedure, requestMeta, router } from "../trpc";
import { getSessionCookieOptions } from "../_core/cookies";

/** Opções do cookie de sessão, incluindo validade. */
function sessionCookieOptions(req: Parameters<typeof getSessionCookieOptions>[0], expiresAt: Date) {
  return {
    ...getSessionCookieOptions(req),
    expires: expiresAt,
  };
}

export const authRouter = router({
  /** Retorna o ator autenticado e o contexto de escopo, ou null. */
  session: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.actor) return null;

    const db = await getDbOrThrow();
    let parishName: string | null = null;
    if (ctx.actor.parishId) {
      const [parish] = await db
        .select({ name: parishes.name })
        .from(parishes)
        .where(eq(parishes.id, ctx.actor.parishId))
        .limit(1);
      parishName = parish?.name ?? null;
    }

    if (ctx.actor.type === "SERVER") {
      const [access] = await db
        .select({ pinResetRequested: serverAccess.pinResetRequested })
        .from(serverAccess)
        .where(eq(serverAccess.serverId, ctx.actor.server.id))
        .limit(1);

      return {
        actorType: "SERVER" as const,
        role: "SERVER" as const,
        parishId: ctx.actor.parishId,
        parishName,
        displayName: ctx.actor.server.name,
        serverId: ctx.actor.server.id,
        userId: null,
        responsibleId: null,
        email: null,
        mustChangePassword: false,
        pinResetRequested: access?.pinResetRequested ?? false,
      };
    }

    return {
      actorType: "USER" as const,
      role: ctx.actor.role,
      parishId: ctx.actor.parishId,
      parishName,
      displayName: ctx.actor.user.name ?? ctx.actor.user.email ?? "Usuário",
      serverId: null,
      userId: ctx.actor.user.id,
      responsibleId: ctx.actor.responsibleId,
      email: ctx.actor.user.email,
      mustChangePassword: ctx.actor.user.mustChangePassword,
      pinResetRequested: false,
    };
  }),

  /** Login administrativo por e-mail e senha. */
  loginWithPassword: publicProcedure
    .input(
      z.object({
        email: z.string().trim().email("Informe um e-mail válido."),
        password: z.string().min(1, "Informe a senha."),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const meta = requestMeta(ctx);
      try {
        const result = await loginWithPassword(input.email, input.password, meta);
        ctx.res.cookie(SESSION_COOKIE, result.token, sessionCookieOptions(ctx.req, result.expiresAt));

        await recordAnonymousAudit({
          action: "LOGIN_SUCCESS",
          entityType: "user",
          parishId: result.parishId,
          actorLabel: result.displayName,
          metadata: { method: "PASSWORD", email: input.email.toLowerCase() },
          ...meta,
        });

        return {
          role: result.role,
          parishId: result.parishId,
          displayName: result.displayName,
          mustChangePassword: result.mustChangePassword ?? false,
        };
      } catch (error) {
        await recordAnonymousAudit({
          action: "LOGIN_FAILED",
          entityType: "user",
          result: "FAILURE",
          metadata: { method: "PASSWORD", email: input.email.toLowerCase() },
          ...meta,
        });
        throw error;
      }
    }),

  /** Login do servidor por ID de acesso e PIN. */
  loginWithAccessId: publicProcedure
    .input(
      z.object({
        accessId: z.string().trim().min(4, "Informe o ID de acesso."),
        pin: z.string().min(1, "Informe o PIN."),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const meta = requestMeta(ctx);
      try {
        const result = await loginWithAccessId(input.accessId, input.pin, meta);
        ctx.res.cookie(SESSION_COOKIE, result.token, sessionCookieOptions(ctx.req, result.expiresAt));

        await recordAnonymousAudit({
          action: "LOGIN_SUCCESS",
          entityType: "server_access",
          parishId: result.parishId,
          actorLabel: result.displayName,
          metadata: { method: "ACCESS_ID", accessId: input.accessId.toUpperCase() },
          ...meta,
        });

        return {
          role: result.role,
          parishId: result.parishId,
          displayName: result.displayName,
          pinResetRequested: result.pinResetRequested ?? false,
        };
      } catch (error) {
        await recordAnonymousAudit({
          action: "LOGIN_FAILED",
          entityType: "server_access",
          result: "FAILURE",
          metadata: { method: "ACCESS_ID", accessId: input.accessId.toUpperCase() },
          ...meta,
        });
        throw error;
      }
    }),

  /** Encerra a sessão atual. */
  logout: publicProcedure.mutation(async ({ ctx }) => {
    const cookieHeader = ctx.req.headers.cookie ?? "";
    const token = cookieHeader
      .split(";")
      .map(part => part.trim())
      .find(part => part.startsWith(`${SESSION_COOKIE}=`))
      ?.slice(SESSION_COOKIE.length + 1);

    if (token) {
      await revokeSession(decodeURIComponent(token));
    }

    if (ctx.actor) {
      await recordAudit(ctx.actor, { action: "LOGOUT", ...requestMeta(ctx) });
    }

    const options = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(SESSION_COOKIE, { ...options, maxAge: -1 });
    return { success: true } as const;
  }),

  /** Troca da própria senha, exigindo a senha atual. */
  changePassword: authedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1, "Informe a senha atual."),
        newPassword: z.string().min(SECURITY.minPasswordLength),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.actor.type !== "USER") {
        throw badRequest("Este acesso usa PIN. Utilize a troca de PIN.");
      }

      const strength = validatePasswordStrength(input.newPassword, SECURITY.minPasswordLength);
      if (!strength.valid) throw badRequest(strength.message!);

      const db = await getDbOrThrow();
      const [user] = await db.select().from(users).where(eq(users.id, ctx.actor.user.id)).limit(1);
      if (!user?.passwordHash) {
        throw badRequest("Esta conta não usa senha. Utilize o acesso pelo Manus.");
      }

      const valid = await verifySecret(input.currentPassword, user.passwordHash);
      if (!valid) throw badRequest("A senha atual não confere.");

      await db
        .update(users)
        .set({
          passwordHash: await hashSecret(input.newPassword),
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
        })
        .where(eq(users.id, user.id));

      await recordAudit(ctx.actor, {
        action: "MEMBER_UPDATED",
        entityType: "user",
        entityId: user.id,
        metadata: { change: "password" },
        ...requestMeta(ctx),
      });

      return { success: true } as const;
    }),

  /**
   * Solicita a recuperação de senha.
   *
   * A resposta é sempre idêntica, independentemente da existência do e-mail,
   * para impedir enumeração de contas. O código é entregue por e-mail quando o
   * canal está configurado; caso contrário, permanece disponível para a
   * administração da paróquia repassá-lo pessoalmente, e o registro guarda qual
   * canal foi usado.
   */
  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().trim().email("Informe um e-mail válido.") }))
    .mutation(async ({ ctx, input }) => {
      const user = await findActiveUserByEmail(input.email);
      const meta = requestMeta(ctx);

      if (user?.passwordHash) {
        const db = await getDbOrThrow();
        const token = generateResetToken();

        // A entrega ocorre antes da persistência do estado final, para que o
        // canal efetivamente utilizado fique registrado de forma fiel.
        const { deliverPasswordResetToken } = await import("../services/passwordDelivery");
        const delivery = await deliverPasswordResetToken({
          email: user.email!,
          name: user.name,
          token,
        });

        await db.insert(passwordResetTokens).values({
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          deliveryChannel: delivery.channel,
          deliveredAt: delivery.delivered ? new Date() : null,
        });

        await recordAnonymousAudit({
          action: "MEMBER_UPDATED",
          entityType: "user",
          entityId: user.id,
          actorLabel: user.email,
          metadata: {
            change: "password_reset_requested",
            channel: delivery.channel,
            delivered: delivery.delivered,
          },
          ...meta,
        });
      }

      return {
        success: true,
        message:
          "Se este e-mail estiver cadastrado, enviaremos as instruções para redefinir a senha. Caso não receba, procure a administração da paróquia.",
      } as const;
    }),

  /** Conclui a redefinição de senha com o token recebido. */
  confirmPasswordReset: publicProcedure
    .input(
      z.object({
        token: z.string().min(10, "Código inválido."),
        newPassword: z.string().min(SECURITY.minPasswordLength),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const strength = validatePasswordStrength(input.newPassword, SECURITY.minPasswordLength);
      if (!strength.valid) throw badRequest(strength.message!);

      const db = await getDbOrThrow();
      const [record] = await db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.tokenHash, hashToken(input.token)),
            isNull(passwordResetTokens.usedAt),
          ),
        )
        .limit(1);

      if (!record || record.expiresAt.getTime() < Date.now()) {
        throw badRequest("Código inválido ou expirado. Solicite um novo.");
      }

      await db
        .update(users)
        .set({
          passwordHash: await hashSecret(input.newPassword),
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
          status: "ACTIVE",
        })
        .where(eq(users.id, record.userId));

      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, record.id));

      // Toda sessão anterior é invalidada após a redefinição.
      await revokeUserSessions(record.userId);

      await recordAnonymousAudit({
        action: "MEMBER_UPDATED",
        entityType: "user",
        entityId: record.userId,
        metadata: { change: "password_reset_confirmed" },
        ...requestMeta(ctx),
      });

      return { success: true } as const;
    }),

  /**
   * Ativação do acesso do servidor ou redefinição de PIN.
   *
   * Exige o ID de acesso e um código de uso único emitido pela coordenação ou
   * pelo responsável e entregue fora da aplicação. Nenhum dado pessoal do menor
   * (como data de nascimento) é aceito como credencial, pois seria facilmente
   * descoberto por terceiros.
   */
  activateServerAccess: publicProcedure
    .input(
      z.object({
        accessId: z.string().trim().min(4, "Informe o ID de acesso."),
        activationCode: z.string().trim().min(6, "Informe o código de ativação."),
        newPin: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isValidPinFormat(input.newPin, SECURITY.pinLength)) {
        throw badRequest(`O PIN precisa ter exatamente ${SECURITY.pinLength} dígitos numéricos.`);
      }
      if (isWeakPin(input.newPin)) {
        throw badRequest("Escolha um PIN menos previsível, sem dígitos repetidos ou em sequência.");
      }

      const db = await getDbOrThrow();
      const [row] = await db
        .select({ access: serverAccess, server: altarServers })
        .from(serverAccess)
        .innerJoin(altarServers, eq(altarServers.id, serverAccess.serverId))
        .where(eq(serverAccess.accessId, input.accessId.trim().toUpperCase()))
        .limit(1);

      // Mensagem única para qualquer falha, evitando revelar se o ID existe.
      const activationFailed = () =>
        badRequest(
          "Não foi possível ativar este acesso. Confira o ID e o código, ou solicite um novo código à coordenação.",
        );

      if (!row) throw activationFailed();
      if (row.access.status === "REVOKED") throw activationFailed();

      const [code] = await db
        .select()
        .from(accessActivationCodes)
        .where(
          and(
            eq(accessActivationCodes.codeHash, hashToken(input.activationCode.trim().toUpperCase())),
            eq(accessActivationCodes.serverId, row.server.id),
            isNull(accessActivationCodes.usedAt),
          ),
        )
        .limit(1);

      if (!code || code.expiresAt.getTime() < Date.now()) throw activationFailed();

      const isFirstActivation = code.purpose === "ACTIVATION";

      await db
        .update(serverAccess)
        .set({
          pinHash: await hashSecret(input.newPin),
          status: "ACTIVE",
          pinResetRequested: false,
          failedAttempts: 0,
          lockedUntil: null,
          activatedAt: row.access.activatedAt ?? new Date(),
        })
        .where(eq(serverAccess.id, row.access.id));

      // O código é consumido imediatamente: uso único, sem reaproveitamento.
      await db
        .update(accessActivationCodes)
        .set({ usedAt: new Date() })
        .where(eq(accessActivationCodes.id, code.id));

      await recordAnonymousAudit({
        action: "SERVER_ACCESS_ACTIVATED",
        entityType: "server_access",
        entityId: row.access.id,
        parishId: row.access.parishId,
        actorLabel: row.server.name,
        metadata: { accessId: row.access.accessId, firstActivation: isFirstActivation },
        ...requestMeta(ctx),
      });

      return { success: true } as const;
    }),

  /** Troca do próprio PIN pelo servidor autenticado. */
  changePin: authedProcedure
    .input(
      z.object({
        currentPin: z.string().min(1, "Informe o PIN atual."),
        newPin: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.actor.type !== "SERVER") {
        throw badRequest("Apenas o acesso por ID e PIN pode trocar o PIN.");
      }
      if (!isValidPinFormat(input.newPin, SECURITY.pinLength)) {
        throw badRequest(`O PIN precisa ter exatamente ${SECURITY.pinLength} dígitos numéricos.`);
      }
      if (isWeakPin(input.newPin)) {
        throw badRequest("Escolha um PIN menos previsível, sem dígitos repetidos ou em sequência.");
      }

      const db = await getDbOrThrow();
      const [access] = await db
        .select()
        .from(serverAccess)
        .where(eq(serverAccess.serverId, ctx.actor.server.id))
        .limit(1);

      if (!access) throw badRequest("Acesso não localizado.");

      const valid = await verifySecret(input.currentPin, access.pinHash);
      if (!valid) throw badRequest("O PIN atual não confere.");

      await db
        .update(serverAccess)
        .set({
          pinHash: await hashSecret(input.newPin),
          pinResetRequested: false,
          failedAttempts: 0,
          lockedUntil: null,
        })
        .where(eq(serverAccess.id, access.id));

      await recordAudit(ctx.actor, {
        action: "SERVER_ACCESS_PIN_RESET",
        entityType: "server_access",
        entityId: access.id,
        metadata: { change: "pin_self_service" },
        ...requestMeta(ctx),
      });

      return { success: true } as const;
    }),

  /**
   * Redefinição do PIN de um dependente pelo responsável autenticado.
   * O responsável só pode agir sobre servidores vinculados a ele.
   */
  resetDependentPin: authedProcedure
    .input(z.object({ serverId: z.number().int().positive(), newPin: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.actor.type !== "USER" || ctx.actor.role !== "RESPONSIBLE") {
        throw badRequest("Ação disponível apenas para responsáveis.");
      }
      if (!ctx.actor.responsibleId || !ctx.actor.parishId) {
        throw badRequest("Cadastro de responsável não localizado.");
      }
      if (!isValidPinFormat(input.newPin, SECURITY.pinLength)) {
        throw badRequest(`O PIN precisa ter exatamente ${SECURITY.pinLength} dígitos numéricos.`);
      }
      if (isWeakPin(input.newPin)) {
        throw badRequest("Escolha um PIN menos previsível, sem dígitos repetidos ou em sequência.");
      }

      const db = await getDbOrThrow();
      const [link] = await db
        .select({ id: familyLinks.id })
        .from(familyLinks)
        .where(
          and(
            eq(familyLinks.responsibleId, ctx.actor.responsibleId),
            eq(familyLinks.serverId, input.serverId),
            eq(familyLinks.parishId, ctx.actor.parishId),
            eq(familyLinks.status, "ACTIVE"),
          ),
        )
        .limit(1);

      if (!link) throw badRequest("Este servidor não está vinculado a você.");

      const [access] = await db
        .select()
        .from(serverAccess)
        .where(
          and(
            eq(serverAccess.serverId, input.serverId),
            eq(serverAccess.parishId, ctx.actor.parishId),
          ),
        )
        .limit(1);

      if (!access) throw badRequest("Este servidor ainda não possui acesso criado.");

      await db
        .update(serverAccess)
        .set({
          pinHash: await hashSecret(input.newPin),
          status: "ACTIVE",
          pinResetRequested: false,
          failedAttempts: 0,
          lockedUntil: null,
          activatedAt: access.activatedAt ?? new Date(),
        })
        .where(eq(serverAccess.id, access.id));

      await recordAudit(ctx.actor, {
        action: "SERVER_ACCESS_PIN_RESET",
        entityType: "server_access",
        entityId: access.id,
        metadata: { serverId: input.serverId, by: "RESPONSIBLE" },
        ...requestMeta(ctx),
      });

      return { success: true } as const;
    }),
});
