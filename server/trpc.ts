/**
 * Procedures tRPC do domínio, com RBAC e isolamento multi-tenant.
 *
 * Cadeia de autorização aplicada em toda requisição:
 *   identidade → paróquia → papel → recurso → ação
 *
 * O escopo vem da sessão. Apenas SUPER_ADMIN pode selecionar outra paróquia;
 * essa seleção é validada no servidor antes de qualquer leitura ou escrita.
 */
import {
  MANAGEMENT_ROLES,
  type Actor,
  type ServerActor,
  type UserActor,
} from "./auth/types";
import type { RoleName } from "@shared/domain";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { parishes } from "../drizzle/schema";
import { getDbOrThrow } from "./db";

import { publicProcedure, router } from "./_core/trpc";

export { router, publicProcedure };

/** Extrai o IP e o user agent da requisição para auditoria. */
export function requestMeta(ctx: {
  req: { ip?: string; headers: Record<string, unknown> };
}) {
  const forwarded = ctx.req.headers["x-forwarded-for"];
  const ip =
    (typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim()
      : undefined) ??
    ctx.req.ip ??
    null;
  const userAgent =
    (ctx.req.headers["user-agent"] as string | undefined) ?? null;
  return { ip, userAgent };
}

/** Exige um ator autenticado (usuário ou servidor). */
export const authedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.actor) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Faça login para continuar.",
    });
  }
  return next({ ctx: { ...ctx, actor: ctx.actor as Actor } });
});

/** Exige um ator autenticado com paróquia ativa definida no contexto. */
export const parishProcedure = authedProcedure.use(async ({ ctx, next }) => {
  let parishId = ctx.actor.parishId;
  // Only the authenticated platform administrator may choose a tenant.
  // Every other role keeps the scope established by its server-side session.
  const selected = ctx.req.headers["x-platform-parish-id"];
  if (ctx.actor.role === "SUPER_ADMIN" && selected !== undefined) {
    if (
      typeof selected !== "string" ||
      !/^[1-9]\d*$/.test(selected) ||
      !Number.isSafeInteger(Number(selected))
    ) {
      throw badRequest("Paróquia selecionada inválida.");
    }
    const db = await getDbOrThrow();
    const [parish] = await db
      .select({ id: parishes.id })
      .from(parishes)
      .where(eq(parishes.id, Number(selected)))
      .limit(1);
    if (!parish) throw notFound("Paróquia");
    parishId = parish.id;
  }
  if (parishId === null || parishId === undefined) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Selecione uma paróquia para continuar.",
    });
  }
  return next({ ctx: { ...ctx, actor: { ...ctx.actor, parishId }, parishId } });
});

/** Constrói uma procedure restrita a papéis específicos, com paróquia obrigatória. */
export function roleProcedure(...roles: RoleName[]) {
  return parishProcedure.use(({ ctx, next }) => {
    if (!roles.includes(ctx.actor.role)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Você não tem permissão para executar esta ação.",
      });
    }
    return next({ ctx });
  });
}

/** Procedure para gestão operacional: administrador da paróquia e coordenador. */
export const coordinatorProcedure = roleProcedure(
  "SUPER_ADMIN",
  "PARISH_ADMIN",
  "COORDINATOR"
);

/** Procedure exclusiva do administrador da paróquia. */
export const parishAdminProcedure = roleProcedure(
  "SUPER_ADMIN",
  "PARISH_ADMIN"
);

/** Procedure exclusiva do administrador da plataforma. */
export const platformAdminProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.actor.role !== "SUPER_ADMIN") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Ação restrita à administração da plataforma.",
    });
  }
  return next({ ctx: { ...ctx, actor: ctx.actor as UserActor } });
});

/** Procedure para o responsável autenticado. */
export const responsibleProcedure = roleProcedure("RESPONSIBLE").use(
  ({ ctx, next }) => {
    const actor = ctx.actor as UserActor;
    if (!actor.responsibleId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Seu cadastro de responsável não foi localizado. Procure a coordenação.",
      });
    }
    return next({ ctx: { ...ctx, actor, responsibleId: actor.responsibleId } });
  }
);

/** Procedure para o servidor autenticado por ID e PIN. */
export const serverProcedure = roleProcedure("SERVER").use(({ ctx, next }) => {
  return next({ ctx: { ...ctx, actor: ctx.actor as ServerActor } });
});

/** Indica se o ator tem poder de gestão. */
export function actorIsManager(actor: Actor): boolean {
  return MANAGEMENT_ROLES.includes(actor.role);
}

/** Lança erro padronizado de recurso não encontrado dentro do tenant. */
export function notFound(entity: string): TRPCError {
  return new TRPCError({
    code: "NOT_FOUND",
    message: `${entity} não encontrado.`,
  });
}

/** Lança erro padronizado de regra de negócio violada. */
export function badRequest(message: string): TRPCError {
  return new TRPCError({ code: "BAD_REQUEST", message });
}

/** Lança erro padronizado de permissão insuficiente. */
export function forbidden(
  message = "Você não tem permissão para executar esta ação."
): TRPCError {
  return new TRPCError({ code: "FORBIDDEN", message });
}
