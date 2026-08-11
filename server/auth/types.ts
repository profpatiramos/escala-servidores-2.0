/**
 * Tipos do contexto de autenticação e autorização.
 *
 * O princípio central é a cadeia: identidade → paróquia → papel → recurso → ação.
 * Nenhuma procedure recebe `parishId` do cliente para decidir escopo: o escopo é
 * sempre derivado do contexto autenticado no servidor.
 */
import type { RoleName } from "@shared/domain";
import type { AltarServer, User } from "../../drizzle/schema";

/** Ator autenticado do tipo usuário (OAuth ou e-mail/senha). */
export type UserActor = {
  type: "USER";
  user: User;
  /** Paróquia ativa da sessão. Nulo apenas para SUPER_ADMIN sem paróquia selecionada. */
  parishId: number | null;
  role: RoleName;
  /** Identificador do registro de responsável, quando o papel é RESPONSIBLE. */
  responsibleId: number | null;
  sessionId: number;
};

/** Ator autenticado do tipo servidor (acesso por ID + PIN). */
export type ServerActor = {
  type: "SERVER";
  server: AltarServer;
  parishId: number;
  role: "SERVER";
  sessionId: number;
};

export type Actor = UserActor | ServerActor;

/** Identificação resumida do ator, usada em auditoria e notificações. */
export type ActorIdentity = {
  actorUserId: number | null;
  actorServerId: number | null;
  actorRole: RoleName;
  actorLabel: string;
  parishId: number | null;
};

/** Extrai a identidade auditável de um ator. */
export function toActorIdentity(actor: Actor): ActorIdentity {
  if (actor.type === "SERVER") {
    return {
      actorUserId: null,
      actorServerId: actor.server.id,
      actorRole: "SERVER",
      actorLabel: actor.server.name,
      parishId: actor.parishId,
    };
  }
  return {
    actorUserId: actor.user.id,
    actorServerId: null,
    actorRole: actor.role,
    actorLabel: actor.user.name ?? actor.user.email ?? `Usuário ${actor.user.id}`,
    parishId: actor.parishId,
  };
}

/** Papéis com poder de gestão operacional dentro da paróquia. */
export const MANAGEMENT_ROLES: RoleName[] = ["SUPER_ADMIN", "PARISH_ADMIN", "COORDINATOR"];

/** Verifica se o ator possui um dos papéis informados. */
export function hasRole(actor: Actor, roles: readonly RoleName[]): boolean {
  return roles.includes(actor.role);
}

/** Indica se o ator pode gerenciar dados operacionais da paróquia. */
export function isManager(actor: Actor): boolean {
  return hasRole(actor, MANAGEMENT_ROLES);
}
