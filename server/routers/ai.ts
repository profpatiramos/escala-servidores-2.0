/**
 * Router do assistente de IA de escalas.
 *
 * A regra que governa este arquivo: **a IA nunca publica**. `apply` transfere a
 * proposta para alocações em estado de rascunho e nada mais. A publicação
 * continua sendo uma ação separada, humana e auditada, no router de escalas.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  aiProposalConflicts,
  aiScheduleProposals,
  aiScheduleRuns,
  altarServers,
  celebrations,
  parishRoles,
  scheduleAssignments,
  schedules,
} from "../../drizzle/schema";
import { getDbOrThrow } from "../db";
import { generateProposal } from "../services/aiScheduler";
import { validateAssignments } from "../services/scheduleValidation";
import { recordAudit } from "../services/audit";
import { coordinatorProcedure, requestMeta, router } from "../trpc";
import { AI_PRIORITY_MODES } from "@shared/domain";
import type { Actor } from "../auth/types";

function badRequest(message: string): TRPCError {
  return new TRPCError({ code: "BAD_REQUEST", message });
}

function notFound(entity: string): TRPCError {
  return new TRPCError({ code: "NOT_FOUND", message: `${entity} não encontrado nesta paróquia.` });
}

/** Usuário responsável pela ação. Servidores não acessam este router. */
function actingUserId(actor: Actor): number | null {
  return actor.type === "USER" ? actor.user.id : null;
}

export const aiRouter = router({
  /**
   * Gera uma proposta de escala para o período.
   * Retorna sempre algo revisável — inclusive quando não consegue preencher tudo.
   */
  generate: coordinatorProcedure
    .input(
      z.object({
        periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        priorityMode: z.enum(AI_PRIORITY_MODES).default("BALANCED"),
        pinnedAssignments: z
          .array(
            z.object({
              celebrationId: z.number().int().positive(),
              parishRoleId: z.number().int().positive(),
              serverId: z.number().int().positive(),
            }),
          )
          .optional(),
        blockedServerIds: z.array(z.number().int().positive()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.periodEnd < input.periodStart) {
        throw badRequest("A data final do período não pode ser anterior à inicial.");
      }

      const result = await generateProposal({
        parishId: ctx.parishId,
        requestedByUserId: actingUserId(ctx.actor) ?? 0,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        priorityMode: input.priorityMode,
        pinnedAssignments: input.pinnedAssignments,
        blockedServerIds: input.blockedServerIds,
      });

      await recordAudit(ctx.actor, {
        action: "AI_RUN_REQUESTED",
        entityType: "ai_schedule_run",
        entityId: result.runId,
        metadata: {
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          priorityMode: input.priorityMode,
          status: result.status,
          filledSlots: result.filledSlots,
          unfilledSlots: result.unfilledSlots,
        },
        ...requestMeta(ctx),
      });

      return result;
    }),

  /** Histórico de rodadas da paróquia. */
  listRuns: coordinatorProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDbOrThrow();
      return db
        .select({
          id: aiScheduleRuns.id,
          periodStart: aiScheduleRuns.periodStart,
          periodEnd: aiScheduleRuns.periodEnd,
          status: aiScheduleRuns.status,
          priorityMode: aiScheduleRuns.priorityMode,
          summary: aiScheduleRuns.summary,
          metrics: aiScheduleRuns.metrics,
          appliedAt: aiScheduleRuns.appliedAt,
          discardedAt: aiScheduleRuns.discardedAt,
          createdAt: aiScheduleRuns.createdAt,
        })
        .from(aiScheduleRuns)
        .where(eq(aiScheduleRuns.parishId, ctx.parishId))
        .orderBy(desc(aiScheduleRuns.createdAt))
        .limit(input?.limit ?? 20);
    }),

  /** Detalhe da proposta: itens sugeridos, vagas em aberto e conflitos. */
  getRun: coordinatorProcedure
    .input(z.object({ runId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDbOrThrow();

      const [run] = await db
        .select()
        .from(aiScheduleRuns)
        .where(
          and(eq(aiScheduleRuns.id, input.runId), eq(aiScheduleRuns.parishId, ctx.parishId)),
        )
        .limit(1);
      if (!run) throw notFound("Proposta");

      const items = await db
        .select({
          id: aiScheduleProposals.id,
          celebrationId: aiScheduleProposals.celebrationId,
          celebrationTitle: celebrations.title,
          celebrationDate: celebrations.date,
          celebrationTime: celebrations.startTime,
          parishRoleId: aiScheduleProposals.parishRoleId,
          roleName: parishRoles.name,
          serverId: aiScheduleProposals.serverId,
          serverName: altarServers.name,
          slotIndex: aiScheduleProposals.slotIndex,
          justification: aiScheduleProposals.justification,
          confidence: aiScheduleProposals.confidence,
          isUnfilled: aiScheduleProposals.isUnfilled,
          conflictReason: aiScheduleProposals.conflictReason,
        })
        .from(aiScheduleProposals)
        .innerJoin(celebrations, eq(celebrations.id, aiScheduleProposals.celebrationId))
        .innerJoin(parishRoles, eq(parishRoles.id, aiScheduleProposals.parishRoleId))
        .leftJoin(altarServers, eq(altarServers.id, aiScheduleProposals.serverId))
        // O run já foi validado por paróquia acima. O filtro repetido é defesa em
        // profundidade: se um runId de outra paróquia vazar, a query não retorna nada.
        .where(
          and(
            eq(aiScheduleProposals.runId, input.runId),
            eq(aiScheduleProposals.parishId, ctx.parishId),
          ),
        )
        .orderBy(asc(celebrations.date), asc(celebrations.startTime), asc(parishRoles.name));

      const conflicts = await db
        .select()
        .from(aiProposalConflicts)
        .where(
          and(
            eq(aiProposalConflicts.runId, input.runId),
            eq(aiProposalConflicts.parishId, ctx.parishId),
          ),
        )
        .orderBy(desc(aiProposalConflicts.severity));

      return { run, items, conflicts };
    }),

  /**
   * Aplica a proposta criando alocações em uma escala de rascunho.
   *
   * Nunca publica. O coordenador ainda precisa revisar e publicar
   * explicitamente — inclusive porque a proposta pode conter vagas em aberto.
   *
   * Nome `applyProposal` e não `apply`: `apply` é palavra reservada no tRPC.
   */
  applyProposal: coordinatorProcedure
    .input(
      z.object({
        runId: z.number().int().positive(),
        /** Itens que o coordenador aceitou. Se omitido, aceita todos os preenchidos. */
        acceptedProposalIds: z.array(z.number().int().positive()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();

      const [run] = await db
        .select()
        .from(aiScheduleRuns)
        .where(
          and(eq(aiScheduleRuns.id, input.runId), eq(aiScheduleRuns.parishId, ctx.parishId)),
        )
        .limit(1);
      if (!run) throw notFound("Proposta");

      if (run.appliedAt) throw badRequest("Esta proposta já foi aplicada.");
      if (run.discardedAt) throw badRequest("Esta proposta foi descartada.");
      if (run.status !== "COMPLETED") {
        throw badRequest("Somente propostas concluídas podem ser aplicadas.");
      }

      const proposals = await db
        .select()
        .from(aiScheduleProposals)
        .where(
          and(
            eq(aiScheduleProposals.runId, input.runId),
            eq(aiScheduleProposals.parishId, ctx.parishId),
            eq(aiScheduleProposals.isUnfilled, false),
          ),
        );

      const accepted = input.acceptedProposalIds
        ? proposals.filter(p => input.acceptedProposalIds?.includes(p.id))
        : proposals;

      if (accepted.length === 0) {
        throw badRequest("Nenhuma sugestão selecionada para aplicar.");
      }

      // Revalida contra o estado ATUAL antes de qualquer escrita. Disponibilidade,
      // férias, qualificações e conflitos podem ter mudado desde a geração.
      const acceptedByCelebration = new Map<number, typeof accepted>();
      for (const proposal of accepted) {
        const group = acceptedByCelebration.get(proposal.celebrationId) ?? [];
        group.push(proposal);
        acceptedByCelebration.set(proposal.celebrationId, group);
      }

      for (const [celebrationId, group] of acceptedByCelebration) {
        const validation = await validateAssignments({
          parishId: ctx.parishId,
          celebrationId,
          assignments: group
            .filter(p => p.serverId !== null)
            .map(p => ({ serverId: p.serverId as number, parishRoleId: p.parishRoleId })),
          checkStaffing: false,
        });

        if (!validation.valid) {
          const messages = validation.blocking.slice(0, 5).map(issue => issue.message);
          throw badRequest(
            `A proposta não pode ser aplicada porque a situação atual mudou. ${messages.join(" ")}`,
          );
        }
      }

      // No modelo de dados, cada celebração tem exatamente uma escala. A IA não
      // cria escalas novas: preenche as escalas em rascunho que já existem.
      let created = 0;
      let skipped = 0;
      const touchedScheduleIds = new Set<number>();
      const blockedCelebrations: number[] = [];

      for (const proposal of accepted) {
        if (proposal.serverId === null) continue;

        const [schedule] = await db
          .select({ id: schedules.id, status: schedules.status })
          .from(schedules)
          .where(
            and(
              eq(schedules.parishId, ctx.parishId),
              eq(schedules.celebrationId, proposal.celebrationId),
            ),
          )
          .limit(1);

        if (!schedule) {
          skipped += 1;
          continue;
        }

        // Escala já publicada não é alterada silenciosamente por uma proposta:
        // republicar exige passar pelo fluxo de alteração, que avisa os envolvidos.
        if (schedule.status !== "DRAFT" && schedule.status !== "PROPOSED") {
          skipped += 1;
          if (!blockedCelebrations.includes(proposal.celebrationId)) {
            blockedCelebrations.push(proposal.celebrationId);
          }
          continue;
        }

        // Duplicidade pode surgir se o coordenador alocou manualmente entre a
        // geração e a aplicação. Nesse caso o trabalho humano prevalece.
        const [duplicate] = await db
          .select({ id: scheduleAssignments.id })
          .from(scheduleAssignments)
          .where(
            and(
              eq(scheduleAssignments.parishId, ctx.parishId),
              eq(scheduleAssignments.celebrationId, proposal.celebrationId),
              eq(scheduleAssignments.parishRoleId, proposal.parishRoleId),
              eq(scheduleAssignments.serverId, proposal.serverId),
            ),
          )
          .limit(1);

        if (duplicate) {
          skipped += 1;
          continue;
        }

        await db.insert(scheduleAssignments).values({
          parishId: ctx.parishId,
          scheduleId: schedule.id,
          celebrationId: proposal.celebrationId,
          parishRoleId: proposal.parishRoleId,
          serverId: proposal.serverId,
          status: "PENDING",
          assignmentSource: "AI_PROPOSED",
          notes: proposal.justification,
          assignedByUserId: actingUserId(ctx.actor),
        });

        // Marca a origem e vincula a rodada para rastreabilidade.
        await db
          .update(schedules)
          .set({ source: "AI", aiRunId: run.id })
          .where(eq(schedules.id, schedule.id));

        touchedScheduleIds.add(schedule.id);
        created += 1;
      }

      if (created === 0) {
        throw badRequest(
          blockedCelebrations.length > 0
            ? "As escalas destas celebrações já foram publicadas. Altere-as pelo fluxo de edição para que os envolvidos sejam avisados."
            : "Nenhuma sugestão pôde ser aplicada: as alocações já existem ou as escalas não estão em rascunho.",
        );
      }

      await db
        .update(aiScheduleRuns)
        .set({ appliedAt: new Date(), appliedByUserId: actingUserId(ctx.actor) })
        .where(eq(aiScheduleRuns.id, input.runId));

      await recordAudit(ctx.actor, {
        action: "AI_PROPOSAL_APPLIED",
        entityType: "ai_schedule_run",
        entityId: input.runId,
        metadata: {
          scheduleIds: Array.from(touchedScheduleIds),
          created,
          skipped,
          acceptedCount: accepted.length,
        },
        ...requestMeta(ctx),
      });

      return {
        scheduleIds: Array.from(touchedScheduleIds),
        created,
        skipped,
        /** Sinaliza explicitamente ao frontend que ainda falta publicar. */
        requiresPublication: true,
      } as const;
    }),

  /** Descarta a proposta sem aplicar. Fica no histórico para auditoria. */
  discard: coordinatorProcedure
    .input(z.object({ runId: z.number().int().positive(), reason: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();

      const [run] = await db
        .select({ id: aiScheduleRuns.id, appliedAt: aiScheduleRuns.appliedAt })
        .from(aiScheduleRuns)
        .where(
          and(eq(aiScheduleRuns.id, input.runId), eq(aiScheduleRuns.parishId, ctx.parishId)),
        )
        .limit(1);
      if (!run) throw notFound("Proposta");
      if (run.appliedAt) throw badRequest("Esta proposta já foi aplicada e não pode ser descartada.");

      await db
        .update(aiScheduleRuns)
        .set({ discardedAt: new Date() })
        .where(eq(aiScheduleRuns.id, input.runId));

      await recordAudit(ctx.actor, {
        action: "AI_PROPOSAL_DISCARDED",
        entityType: "ai_schedule_run",
        entityId: input.runId,
        metadata: { reason: input.reason ?? null },
        ...requestMeta(ctx),
      });

      return { success: true } as const;
    }),
});

function formatDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
