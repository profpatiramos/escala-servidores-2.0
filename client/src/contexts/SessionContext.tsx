/**
 * Contexto da sessão própria da aplicação.
 *
 * Não confundir com `useAuth` do template (Manus OAuth): aqui a identidade vem
 * de `access.session`, que atende tanto o login por e-mail/senha quanto o acesso
 * por ID + PIN dos servidores e menores.
 */
import { createContext, useContext, type ReactNode } from "react";

import { trpc } from "@/lib/trpc";

export type RoleName =
  | "SUPER_ADMIN"
  | "PARISH_ADMIN"
  | "COORDINATOR"
  | "RESPONSIBLE"
  | "SERVER";

export type SessionData = {
  actorType: "USER" | "SERVER";
  role: RoleName;
  parishId: number | null;
  parishName: string | null;
  displayName: string;
  serverId: number | null;
  userId: number | null;
  responsibleId: number | null;
  email: string | null;
  mustChangePassword: boolean;
  pinResetRequested: boolean;
};

type SessionContextValue = {
  session: SessionData | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Papéis com poder de gestão operacional. */
  isManager: boolean;
  refetch: () => void;
};

const SessionContext = createContext<SessionContextValue>({
  session: null,
  isLoading: true,
  isAuthenticated: false,
  isManager: false,
  refetch: () => {},
});

const MANAGEMENT_ROLES: RoleName[] = ["SUPER_ADMIN", "PARISH_ADMIN", "COORDINATOR"];

export function SessionProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, refetch } = trpc.access.session.useQuery(undefined, {
    retry: false,
    // A sessão é a base de toda navegação: revalidar ao voltar para a aba evita
    // que o usuário continue vendo telas de um papel que já expirou.
    refetchOnWindowFocus: true,
  });

  const session = (data ?? null) as SessionData | null;

  return (
    <SessionContext.Provider
      value={{
        session,
        isLoading,
        isAuthenticated: session !== null,
        isManager: session !== null && MANAGEMENT_ROLES.includes(session.role),
        refetch: () => void refetch(),
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
