/**
 * Assistente de IA para geração de escalas.
 *
 * Três invariantes não negociáveis:
 *
 * 1. **A IA nunca publica.** O resultado é sempre uma proposta em tabela
 *    separada (`ai_schedule_proposals`). Publicar exige um coordenador humano
 *    aplicar a proposta e depois publicar a escala explicitamente.
 * 2. **A IA não pode violar restrições.** Toda sugestão passa pelo mesmo
 *    `validateAssignments` usado na montagem manual. Sugestão que viole
 *    restrição bloqueante é descartada e a vaga fica em aberto, com o motivo
 *    registrado. É melhor entregar escala incompleta e honesta do que completa
 *    e inválida.
 * 3. **Dados pseudonimizados.** O snapshot enviado ao modelo usa apenas
 *    identificadores internos, idade e disponibilidade. Nunca nome, contato,
 *    nome dos pais, endereço ou PIN — o modelo não precisa saber quem é a
 *    criança para distribuir turnos.
 */
import { invokeLLM } from "../_core/llm";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import {
  aiProposalConflicts,
  aiScheduleProposals,
  aiScheduleRuns,
  celebrationRoleNeeds,
  celebrations,
  parishRoles,
  scheduleAssignments,
} from "../../drizzle/schema";
import { getDbOrThrow } from "../db";
import { listEligibleServers, validateAssignments } from "./scheduleValidation";
import type { AiPriorityMode } from "@shared/domain";

/** Versão do motor. Muda quando a heurística ou o contrato do prompt muda. */
const ENGINE_VERSION = "1.0.0";

/** Slot a preencher: uma vaga de uma função em uma celebração. */
type Slot = {
  celebrationId: number;
  celebrationDate: string;
  celebrationTime: string;
  celebrationTitle: string;
  parishRoleId: number;
  roleName: string;
  slotIndex: number;
};

/** Sugestão consolidada para um slot. */
type Suggestion = {
  slot: Slot;
  serverId: number | null;
  justification: string;
  confidence: number;
  conflictReason: string | null;
};

export type GenerationResult = {
  runId: number;
  status: "COMPLETED" | "INFEASIBLE" | "FAILED";
  filledSlots: number;
  unfilledSlots: number;
  summary: string;
};

/**
 * Gera uma proposta de escala para o período.
 * Retorna sempre uma proposta revisável — nunca aplica nada.
 */
export async function generateProposal(params: {
  parishId: number;
  requestedByUserId: number;
  periodStart: string;
  periodEnd: string;
  priorityMode: AiPriorityMode;
  /** Servidores fixados pelo coordenador: a IA deve mantê-los onde indicado. */
  pinnedAssignments?: Array<{ celebrationId: number; parishRoleId: number; serverId: number }>;
  /** Servidores que o coordenador excluiu desta rodada. */
  blockedServerIds?: number[];
}): Promise<GenerationResult> {
  const db = await getDbOrThrow();

  // Registra a rodada antes de qualquer processamento: se falhar no meio, o
  // coordenador ainda vê que houve tentativa e o motivo.
  const [createdRun] = await db
    .insert(aiScheduleRuns)
    .values({
    parishId: params.parishId,
    requestedByUserId: params.requestedByUserId,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    status: "RUNNING",
    priorityMode: params.priorityMode,
    engineVersion: ENGINE_VERSION,
    constraints: {
      pinned: params.pinnedAssignments ?? [],
      blockedServerIds: params.blockedServerIds ?? [],
    },
    })
    .returning({ id: aiScheduleRuns.id });

  const runId = createdRun?.id;
  if (!runId) {
    throw new Error("Não foi possível registrar a rodada de geração da escala.");
  }

  try {
    const slots = await collectSlots({
      parishId: params.parishId,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
    });

    if (slots.length === 0) {
      await db
        .update(aiScheduleRuns)
        .set({
          status: "INFEASIBLE",
          completedAt: new Date(),
          summary:
            "Não há celebrações com funções pendentes neste período. Cadastre as celebrações e as funções necessárias antes de gerar a escala.",
        })
        .where(eq(aiScheduleRuns.id, runId));

      return {
        runId,
        status: "INFEASIBLE",
        filledSlots: 0,
        unfilledSlots: 0,
        summary: "Nenhuma vaga a preencher no período informado.",
      };
    }

    const blocked = new Set(params.blockedServerIds ?? []);
    const pinnedMap = new Map<string, number>();
    for (const pin of params.pinnedAssignments ?? []) {
      pinnedMap.set(`${pin.celebrationId}:${pin.parishRoleId}`, pin.serverId);
    }

    // Elegibilidade por slot vem do mesmo serviço usado na montagem manual.
    const eligibilityBySlot = new Map<
      string,
      Array<{ serverId: number; age: number; preferenceScore: number; recentAssignments: number }>
    >();

    for (const slot of slots) {
      const key = `${slot.celebrationId}:${slot.parishRoleId}`;
      if (eligibilityBySlot.has(key)) continue;

      const eligible = await listEligibleServers({
        parishId: params.parishId,
        celebrationId: slot.celebrationId,
        parishRoleId: slot.parishRoleId,
      });

      eligibilityBySlot.set(
        key,
        eligible
          .filter(candidate => !blocked.has(candidate.serverId))
          .map(candidate => ({
            serverId: candidate.serverId,
            age: candidate.age,
            preferenceScore: candidate.preferenceScore,
            recentAssignments: candidate.recentAssignments,
          })),
      );
    }

    // Snapshot pseudonimizado. Guardado para auditoria do que o modelo viu.
    const snapshot = {
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      priorityMode: params.priorityMode,
      slots: slots.map(slot => ({
        slotKey: `${slot.celebrationId}:${slot.parishRoleId}:${slot.slotIndex}`,
        date: slot.celebrationDate,
        time: slot.celebrationTime,
        role: slot.roleName,
        eligible: (eligibilityBySlot.get(`${slot.celebrationId}:${slot.parishRoleId}`) ?? []).map(
          candidate => ({
            id: candidate.serverId,
            age: candidate.age,
            preference: candidate.preferenceScore,
            recent: candidate.recentAssignments,
          }),
        ),
      })),
    };

    // A distribuição base é determinística. O modelo entra depois, apenas para
    // redigir a justificativa pastoral — decisão de alocação não é delegada a
    // um sistema probabilístico.
    const suggestions = distributeSlots({
      slots,
      eligibilityBySlot,
      pinnedMap,
      priorityMode: params.priorityMode,
    });

    // Cada sugestão é revalidada contra as restrições reais, agrupada por
    // celebração. Sugestão inválida é rebaixada para vaga em aberto.
    const validated = await revalidateSuggestions({
      parishId: params.parishId,
      suggestions,
    });

    const filled = validated.filter(s => s.serverId !== null);
    const unfilled = validated.filter(s => s.serverId === null);

    // Persiste a proposta item por item.
    for (const suggestion of validated) {
      await db.insert(aiScheduleProposals).values({
        parishId: params.parishId,
        runId,
        celebrationId: suggestion.slot.celebrationId,
        parishRoleId: suggestion.slot.parishRoleId,
        serverId: suggestion.serverId,
        slotIndex: suggestion.slot.slotIndex,
        justification: suggestion.justification,
        confidence: suggestion.confidence,
        isUnfilled: suggestion.serverId === null,
        conflictReason: suggestion.conflictReason,
      });
    }

    // Vagas em aberto são registradas como conflito para o coordenador agir.
    for (const item of unfilled) {
      await db.insert(aiProposalConflicts).values({
        parishId: params.parishId,
        runId,
        celebrationId: item.slot.celebrationId,
        parishRoleId: item.slot.parishRoleId,
        severity: "BLOCKING",
        code: "UNFILLED_SLOT",
        message: `Vaga de ${item.slot.roleName} em ${formatDate(item.slot.celebrationDate)} não pôde ser preenchida.`,
        suggestion:
          item.conflictReason ??
          "Verifique disponibilidades, férias e habilitações dos servidores para esta função.",
      });
    }

    const summary = await buildSummary({
      snapshot,
      filledCount: filled.length,
      unfilledCount: unfilled.length,
      priorityMode: params.priorityMode,
    });

    const status = filled.length === 0 ? "INFEASIBLE" : "COMPLETED";

    await db
      .update(aiScheduleRuns)
      .set({
        status,
        inputSnapshot: snapshot,
        metrics: {
          totalSlots: validated.length,
          filledSlots: filled.length,
          unfilledSlots: unfilled.length,
          distinctServers: new Set(filled.map(f => f.serverId)).size,
        },
        summary,
        modelIdentifier: summary.startsWith("[heurística]") ? null : "llm",
        completedAt: new Date(),
      })
      .where(eq(aiScheduleRuns.id, runId));

    return {
      runId,
      status,
      filledSlots: filled.length,
      unfilledSlots: unfilled.length,
      summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    await db
      .update(aiScheduleRuns)
      .set({ status: "FAILED", errorMessage: message, completedAt: new Date() })
      .where(eq(aiScheduleRuns.id, runId));

    console.error("[IA Escala] Falha na geração:", error);

    return {
      runId,
      status: "FAILED",
      filledSlots: 0,
      unfilledSlots: 0,
      summary: `A geração falhou: ${message}`,
    };
  }
}

/**
 * Coleta as vagas em aberto no período: cada função necessária de cada
 * celebração, descontando o que já está alocado manualmente.
 */
async function collectSlots(params: {
  parishId: number;
  periodStart: string;
  periodEnd: string;
}): Promise<Slot[]> {
  const db = await getDbOrThrow();

  const rows = await db
    .select({
      celebrationId: celebrations.id,
      date: celebrations.date,
      startTime: celebrations.startTime,
      title: celebrations.title,
      parishRoleId: celebrationRoleNeeds.parishRoleId,
      roleName: parishRoles.name,
      quantity: celebrationRoleNeeds.quantity,
    })
    .from(celebrations)
    .innerJoin(celebrationRoleNeeds, eq(celebrationRoleNeeds.celebrationId, celebrations.id))
    .innerJoin(parishRoles, eq(parishRoles.id, celebrationRoleNeeds.parishRoleId))
    .where(
      and(
        eq(celebrations.parishId, params.parishId),
        eq(celebrations.status, "SCHEDULED"),
        gte(celebrations.date, params.periodStart),
        lte(celebrations.date, params.periodEnd),
      ),
    )
    .orderBy(asc(celebrations.date), asc(celebrations.startTime), asc(parishRoles.name));

  if (rows.length === 0) return [];

  // Alocações que já existem: a IA não sobrescreve trabalho humano.
  const celebrationIds = Array.from(new Set(rows.map(r => r.celebrationId)));
  const existing = await db
    .select({
      celebrationId: scheduleAssignments.celebrationId,
      parishRoleId: scheduleAssignments.parishRoleId,
      total: sql<number>`COUNT(*)`,
    })
    .from(scheduleAssignments)
    .where(
      and(
        eq(scheduleAssignments.parishId, params.parishId),
        inArray(scheduleAssignments.celebrationId, celebrationIds),
        inArray(scheduleAssignments.status, ["PENDING", "CONFIRMED"]),
      ),
    )
    .groupBy(scheduleAssignments.celebrationId, scheduleAssignments.parishRoleId);

  const occupied = new Map<string, number>();
  for (const row of existing) {
    occupied.set(`${row.celebrationId}:${row.parishRoleId}`, Number(row.total));
  }

  const slots: Slot[] = [];
  for (const row of rows) {
    const key = `${row.celebrationId}:${row.parishRoleId}`;
    const alreadyFilled = occupied.get(key) ?? 0;
    const remaining = row.quantity - alreadyFilled;

    for (let index = 0; index < remaining; index += 1) {
      slots.push({
        celebrationId: row.celebrationId,
        celebrationDate: row.date,
        celebrationTime: row.startTime,
        celebrationTitle: row.title,
        parishRoleId: row.parishRoleId,
        roleName: row.roleName,
        slotIndex: alreadyFilled + index,
      });
    }
  }

  return slots;
}

/**
 * Distribuição determinística das vagas.
 *
 * O critério de desempate depende do modo de prioridade escolhido pelo
 * coordenador, mas em todos os modos o servidor já usado no período perde
 * posição — sem isso, os mesmos poucos voluntários assumiriam tudo.
 */
function distributeSlots(params: {
  slots: Slot[];
  eligibilityBySlot: Map<
    string,
    Array<{ serverId: number; age: number; preferenceScore: number; recentAssignments: number }>
  >;
  pinnedMap: Map<string, number>;
  priorityMode: AiPriorityMode;
}): Suggestion[] {
  const suggestions: Suggestion[] = [];

  /** Quantas vezes cada servidor já foi usado nesta rodada. */
  const usageCount = new Map<number, number>();
  /** Impede o mesmo servidor em duas funções da mesma celebração. */
  const usedInCelebration = new Map<number, Set<number>>();

  for (const slot of params.slots) {
    const key = `${slot.celebrationId}:${slot.parishRoleId}`;
    const candidates = params.eligibilityBySlot.get(key) ?? [];
    const celebrationUsed =
      usedInCelebration.get(slot.celebrationId) ?? new Set<number>();

    // Fixação humana tem precedência absoluta sobre a heurística.
    const pinned = params.pinnedMap.get(key);
    if (pinned !== undefined && !celebrationUsed.has(pinned)) {
      celebrationUsed.add(pinned);
      usedInCelebration.set(slot.celebrationId, celebrationUsed);
      usageCount.set(pinned, (usageCount.get(pinned) ?? 0) + 1);
      params.pinnedMap.delete(key);

      suggestions.push({
        slot,
        serverId: pinned,
        justification: "Servidor fixado pela coordenação para esta função.",
        confidence: 100,
        conflictReason: null,
      });
      continue;
    }

    const available = candidates.filter(candidate => !celebrationUsed.has(candidate.serverId));

    if (available.length === 0) {
      suggestions.push({
        slot,
        serverId: null,
        justification: "Nenhum servidor elegível e disponível para esta vaga.",
        confidence: 0,
        conflictReason:
          candidates.length === 0
            ? "Nenhum servidor habilitado e disponível para esta função nesta data."
            : "Os servidores elegíveis já estão alocados nesta mesma celebração.",
      });
      continue;
    }

    const ranked = [...available].sort((a, b) => {
      const usageA = usageCount.get(a.serverId) ?? 0;
      const usageB = usageCount.get(b.serverId) ?? 0;

      switch (params.priorityMode) {
        case "PREFERENCES":
          if (b.preferenceScore !== a.preferenceScore) {
            return b.preferenceScore - a.preferenceScore;
          }
          if (usageA !== usageB) return usageA - usageB;
          break;
        case "AVAILABILITY":
          // Menos escalas recentes indica agenda mais folgada.
          if (a.recentAssignments !== b.recentAssignments) {
            return a.recentAssignments - b.recentAssignments;
          }
          if (usageA !== usageB) return usageA - usageB;
          break;
        case "FAMILY_NEEDS":
          // Preferência de horário reflete o que a família consegue levar.
          if (b.preferenceScore !== a.preferenceScore) {
            return b.preferenceScore - a.preferenceScore;
          }
          if (a.recentAssignments !== b.recentAssignments) {
            return a.recentAssignments - b.recentAssignments;
          }
          break;
        case "BALANCED":
        default:
          if (usageA !== usageB) return usageA - usageB;
          if (a.recentAssignments !== b.recentAssignments) {
            return a.recentAssignments - b.recentAssignments;
          }
          if (b.preferenceScore !== a.preferenceScore) {
            return b.preferenceScore - a.preferenceScore;
          }
          break;
      }

      return a.serverId - b.serverId;
    });

    const chosen = ranked[0];
    celebrationUsed.add(chosen.serverId);
    usedInCelebration.set(slot.celebrationId, celebrationUsed);
    usageCount.set(chosen.serverId, (usageCount.get(chosen.serverId) ?? 0) + 1);

    suggestions.push({
      slot,
      serverId: chosen.serverId,
      justification: buildJustification({
        priorityMode: params.priorityMode,
        preferenceScore: chosen.preferenceScore,
        recentAssignments: chosen.recentAssignments,
        usageInRun: usageCount.get(chosen.serverId) ?? 1,
      }),
      confidence: computeConfidence({
        candidatePool: available.length,
        preferenceScore: chosen.preferenceScore,
      }),
      conflictReason: null,
    });
  }

  return suggestions;
}

/**
 * Revalida cada sugestão contra as restrições reais.
 *
 * Este passo é o que garante que a IA não possa propor algo que a validação
 * manual rejeitaria. Sugestão com violação bloqueante vira vaga em aberto.
 */
async function revalidateSuggestions(params: {
  parishId: number;
  suggestions: Suggestion[];
}): Promise<Suggestion[]> {
  const byCelebration = new Map<number, Suggestion[]>();
  for (const suggestion of params.suggestions) {
    const list = byCelebration.get(suggestion.slot.celebrationId) ?? [];
    list.push(suggestion);
    byCelebration.set(suggestion.slot.celebrationId, list);
  }

  const result: Suggestion[] = [];

  for (const [celebrationId, group] of Array.from(byCelebration.entries())) {
    const filled = group.filter(s => s.serverId !== null);

    if (filled.length === 0) {
      result.push(...group);
      continue;
    }

    const validation = await validateAssignments({
      parishId: params.parishId,
      celebrationId,
      assignments: filled.map(s => ({
        serverId: s.serverId as number,
        parishRoleId: s.slot.parishRoleId,
      })),
      checkStaffing: false,
    });

    // Índice de violações bloqueantes por servidor e função.
    const blockingByServer = new Map<string, string>();
    for (const issue of validation.blocking) {
      if (issue.serverId === null) continue;
      blockingByServer.set(`${issue.serverId}:${issue.parishRoleId ?? "any"}`, issue.message);
    }

    for (const suggestion of group) {
      if (suggestion.serverId === null) {
        result.push(suggestion);
        continue;
      }

      const specific = blockingByServer.get(`${suggestion.serverId}:${suggestion.slot.parishRoleId}`);
      const generic = blockingByServer.get(`${suggestion.serverId}:any`);
      const violation = specific ?? generic;

      if (violation) {
        // Rebaixa para vaga em aberto: escala incompleta e honesta é melhor
        // que escala completa e inválida.
        result.push({
          ...suggestion,
          serverId: null,
          confidence: 0,
          justification: "Sugestão descartada na validação de restrições.",
          conflictReason: violation,
        });
        continue;
      }

      result.push(suggestion);
    }
  }

  return result;
}

/** Justificativa determinística por alocação, em linguagem acessível. */
function buildJustification(params: {
  priorityMode: AiPriorityMode;
  preferenceScore: number;
  recentAssignments: number;
  usageInRun: number;
}): string {
  const parts: string[] = [];

  if (params.preferenceScore > 0) {
    parts.push("o horário está entre as preferências informadas");
  }
  if (params.recentAssignments === 0) {
    parts.push("não participou de escalas no período recente");
  } else {
    parts.push(`participou de ${params.recentAssignments} escala(s) recentemente`);
  }
  if (params.usageInRun > 1) {
    parts.push(`recebeu ${params.usageInRun} vagas nesta proposta`);
  }

  const modeText: Record<AiPriorityMode, string> = {
    BALANCED: "Distribuição equilibrada",
    PREFERENCES: "Prioridade às preferências",
    AVAILABILITY: "Prioridade à disponibilidade",
    FAMILY_NEEDS: "Prioridade às necessidades da família",
  };

  return `${modeText[params.priorityMode]}: ${parts.join("; ")}.`;
}

/**
 * Confiança da sugestão. Pool pequeno significa pouca margem de escolha, o que
 * merece atenção do coordenador mesmo quando a alocação é válida.
 */
function computeConfidence(params: { candidatePool: number; preferenceScore: number }): number {
  let score = 60;
  if (params.candidatePool >= 5) score += 20;
  else if (params.candidatePool >= 3) score += 10;
  if (params.preferenceScore > 0) score += 15;
  return Math.min(100, score);
}

/**
 * Resumo textual da proposta, redigido pelo modelo.
 * Se o modelo falhar, cai para um resumo determinístico — a proposta não deixa
 * de existir por causa de indisponibilidade da IA.
 */
async function buildSummary(params: {
  snapshot: unknown;
  filledCount: number;
  unfilledCount: number;
  priorityMode: AiPriorityMode;
}): Promise<string> {
  const fallback =
    `[heurística] Proposta gerada com ${params.filledCount} vaga(s) preenchida(s) e ` +
    `${params.unfilledCount} vaga(s) em aberto. Revise antes de publicar.`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "Você redige resumos curtos para coordenadores de pastoral de servidores do altar, em português do Brasil. " +
            "Escreva no máximo 3 frases, em tom pastoral, claro e sem jargão técnico. " +
            "Nunca afirme que a escala está publicada ou definitiva: ela é uma proposta que depende de revisão humana. " +
            "Não invente nomes de pessoas.",
        },
        {
          role: "user",
          content:
            `Modo de prioridade: ${params.priorityMode}. ` +
            `Vagas preenchidas: ${params.filledCount}. Vagas em aberto: ${params.unfilledCount}. ` +
            "Escreva um resumo orientando o coordenador sobre o que revisar.",
        },
      ],
    });

    const content = response?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim().length > 0) {
      return content.trim();
    }
    return fallback;
  } catch (error) {
    console.warn("[IA Escala] Resumo textual indisponível, usando fallback:", error);
    return fallback;
  }
}

function formatDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
