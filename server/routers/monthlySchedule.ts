import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  altarServers,
  celebrations,
  parishes,
  parishRoles,
} from "../../drizzle/schema";
import {
  emptyMonthlyConfig,
  monthlyConfigSchema,
  monthlyPlan,
} from "../../shared/monthlySchedule";
import { getDbOrThrow } from "../db";
import { badRequest, coordinatorProcedure, router } from "../trpc";
import { schedulesRouter } from "./schedules";
import { recordAudit } from "../services/audit";

export const monthlyScheduleRouter = router({
  config: coordinatorProcedure.query(async ({ ctx }) => {
    const db = await getDbOrThrow();
    const [parish] = await db
      .select({ settings: parishes.settings })
      .from(parishes)
      .where(eq(parishes.id, ctx.parishId))
      .limit(1);
    const settings = parish?.settings as Record<string, unknown> | null;
    const parsed = monthlyConfigSchema.safeParse(settings?.monthlySchedule);
    return parsed.success ? parsed.data : emptyMonthlyConfig();
  }),
  save: coordinatorProcedure
    .input(monthlyConfigSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();
      const serverIds = [
        ...new Set(input.teams.flatMap(t => t.members.map(m => m.serverId))),
      ];
      const roleIds = [
        ...new Set(
          input.teams.flatMap(t => t.members.map(m => m.parishRoleId))
        ),
      ];
      if (serverIds.length) {
        const servers = await db
          .select({ id: altarServers.id })
          .from(altarServers)
          .where(
            and(
              eq(altarServers.parishId, ctx.parishId),
              inArray(altarServers.id, serverIds)
            )
          );
        if (servers.length !== serverIds.length)
          throw badRequest("Servidor não encontrado nesta paróquia.");
      }
      if (roleIds.length) {
        const roles = await db
          .select({ id: parishRoles.id })
          .from(parishRoles)
          .where(
            and(
              eq(parishRoles.parishId, ctx.parishId),
              inArray(parishRoles.id, roleIds)
            )
          );
        if (roles.length !== roleIds.length)
          throw badRequest("Função não encontrada nesta paróquia.");
      }
      await db
        .update(parishes)
        .set({
          settings: sql`jsonb_set(COALESCE(${parishes.settings}::jsonb, '{}'::jsonb), '{monthlySchedule}', ${JSON.stringify(input)}::jsonb)::json`,
        })
        .where(eq(parishes.id, ctx.parishId));
      await recordAudit(ctx.actor, {
        action: "PARISH_UPDATED",
        entityType: "parish",
        entityId: ctx.parishId,
        metadata: { teams: input.teams.length },
      });
      return { success: true };
    }),
  generate: coordinatorProcedure
    .input(
      z.object({
        year: z.number().int().min(2020).max(2100),
        month: z.number().int().min(1).max(12),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();
      const [parish] = await db
        .select({ settings: parishes.settings })
        .from(parishes)
        .where(eq(parishes.id, ctx.parishId))
        .limit(1);
      const settings = parish?.settings as Record<string, unknown> | null;
      const parsed = monthlyConfigSchema.safeParse(settings?.monthlySchedule);
      if (!parsed.success)
        throw badRequest("Salve as equipes antes de gerar o mês.");
      const config = parsed.data;
      const api = schedulesRouter.createCaller(ctx);
      const results: {
        date: string;
        time: string;
        id: number | null;
        message: string;
      }[] = [];
      // Serialize generation for this parish/month; a retry never replaces an existing celebration.
      await db.transaction(async lock => {
        await lock.execute(
          sql`SELECT pg_advisory_xact_lock(${ctx.parishId}, ${input.year * 100 + input.month})`
        );
        for (const item of monthlyPlan(input.year, input.month, config.fifth)) {
          const [existing] = await db
            .select({ id: celebrations.id })
            .from(celebrations)
            .where(
              and(
                eq(celebrations.parishId, ctx.parishId),
                eq(celebrations.date, item.date),
                eq(celebrations.startTime, item.slot.startTime + ":00")
              )
            )
            .limit(1);
          if (existing) {
            results.push({
              date: item.date,
              time: item.slot.startTime,
              id: existing.id,
              message: "Já existente: mantida sem alterações.",
            });
            continue;
          }
          const team = config.teams.find(
            t => t.slot === item.slot.id && t.color === item.color
          );
          const members = team?.members ?? [];
          const quantities = new Map<number, number>();
          members.forEach(m =>
            quantities.set(
              m.parishRoleId,
              (quantities.get(m.parishRoleId) ?? 0) + 1
            )
          );
          let id: number | null = null;
          try {
            const created = await api.celebrations.create({
              title: `Celebração · ${item.slot.label}`,
              celebrationType: "SUNDAY_MASS",
              date: item.date,
              startTime: item.slot.startTime,
              endTime: item.slot.endTime,
              notes: `Escala mensal. ${item.color ? `Equipe ${item.color === "GREEN" ? "verde" : "azul"}.` : "Quinto fim de semana: escolher equipe manualmente."} Conferir tipo de celebração e horários antes de publicar.`,
              needs: [...quantities].map(([parishRoleId, quantity]) => ({
                parishRoleId,
                quantity,
              })),
            });
            id = created.id;
            if (!members.length) {
              results.push({
                date: item.date,
                time: item.slot.startTime,
                id,
                message:
                  "Rascunho sem integrantes: escolha a equipe manualmente.",
              });
              continue;
            }
            const saved = await api.setAssignments({
              celebrationId: id,
              assignments: members,
              acceptWarnings: true,
            });
            results.push({
              date: item.date,
              time: item.slot.startTime,
              id,
              message: saved.saved
                ? `Rascunho gerado.${saved.validation.warnings.length ? " Avisos: " + saved.validation.warnings.map(w => w.message).join(" ") : ""}`
                : "Rascunho sem alocações. Corrija: " +
                  saved.validation.blocking.map(b => b.message).join(" "),
            });
          } catch (error) {
            results.push({
              date: item.date,
              time: item.slot.startTime,
              id,
              message: id
                ? "Rascunho criado, mas a montagem falhou. Abra a celebração para revisar."
                : "Não foi possível criar esta celebração. Tente novamente.",
            });
          }
        }
      });
      return results;
    }),
});
