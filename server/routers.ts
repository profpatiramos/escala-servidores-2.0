/**
 * Router raiz da aplicação ESCALA SERVIDORES 2.0.
 * Cada domínio funcional vive em `server/routers/<feature>.ts`.
 */
import { COOKIE_NAME } from "@shared/const";

import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { authRouter } from "./routers/auth";
import { parishesRouter } from "./routers/parishes";
import { peopleRouter } from "./routers/people";
import { availabilityRouter } from "./routers/availability";
import { schedulesRouter } from "./routers/schedules";
import { confirmationsRouter } from "./routers/confirmations";
import { eventsRouter } from "./routers/events";
import { gamificationRouter } from "./routers/gamification";
import { aiRouter } from "./routers/ai";
import { notificationsRouter } from "./routers/notifications";
import { reportsRouter } from "./routers/reports";

export const appRouter = router({
  system: systemRouter,

  /** Sessão do Manus OAuth (usada pelo administrador da plataforma). */
  auth: router({
    me: publicProcedure.query(({ ctx }) => {
      if (!ctx.user) return null;
      const { passwordHash, ...safeUser } = ctx.user;
      return safeUser;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  /** Autenticação própria da aplicação: e-mail/senha e ID+PIN. */
  access: authRouter,

  /** Paróquias, configurações operacionais e membros. */
  parishes: parishesRouter,

  /** Responsáveis, servidores, vínculos familiares e credenciais de acesso. */
  people: peopleRouter,

  /** Funções, habilitações, formações, disponibilidade, férias e preferências. */
  availability: availabilityRouter,

  /** Celebrações, escalas e fluxo de publicação. */
  schedules: schedulesRouter,

  /** Confirmações, conflitos, substituições e presença. */
  confirmations: confirmationsRouter,

  /** Eventos, tarefas, turnos e voluntariado. */
  events: eventsRouter,

  /** Pontos, conquistas, ranking e configurações de gamificação. */
  gamification: gamificationRouter,

  /** Assistente de IA de escalas. Gera propostas; nunca publica. */
  ai: aiRouter,

  /** Central de notificações in-app. */
  notifications: notificationsRouter,

  /** Relatórios operacionais e trilha de auditoria. */
  reports: reportsRouter,
});

export type AppRouter = typeof appRouter;
