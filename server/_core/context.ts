import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { SESSION_COOKIE } from "@shared/const";
import { resolveActorFromToken } from "../auth/service";
import type { Actor } from "../auth/types";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /**
   * Ator autenticado do domínio ESCALA SERVIDORES.
   * Resolvido a partir do cookie de sessão próprio (e-mail/senha ou ID+PIN),
   * ou derivado da sessão Manus OAuth para o administrador da plataforma.
   */
  actor: Actor | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let actor: Actor | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // Sessão própria da aplicação (login por e-mail/senha ou por ID + PIN).
  try {
    const token = readSessionToken(opts.req);
    if (token) {
      actor = await resolveActorFromToken(token);
    }
  } catch (error) {
    actor = null;
  }

  // O usuário autenticado via Manus OAuth (dono do projeto) atua como SUPER_ADMIN.
  if (!actor && user) {
    try {
      const { resolveUserScope } = await import("../auth/service");
      const scope = await resolveUserScope(user.id);
      actor = {
        type: "USER",
        user,
        parishId: scope.parishId,
        role: scope.role,
        responsibleId: scope.responsibleId,
        sessionId: 0,
      };
    } catch {
      actor = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    actor,
  };
}

/** Lê o token da sessão própria a partir do cookie da aplicação. */
function readSessionToken(req: CreateExpressContextOptions["req"]): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === SESSION_COOKIE) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}
