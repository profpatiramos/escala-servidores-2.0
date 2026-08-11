/**
 * Validação de escalas.
 *
 * Este módulo é a única fonte de verdade sobre a viabilidade de uma alocação.
 * A escala manual e o assistente de IA usam exatamente as mesmas funções, o que
 * impede a divergência clássica em que a IA propõe algo que a validação manual
 * rejeitaria (ou pior, o contrário).
 *
 * Classificação das violações:
 * - `BLOCKING`  → impede a publicação. Exemplos: servidor inativo, sem
 *                 habilitação, em férias, escalado em duas celebrações no mesmo
 *                 horário, idade abaixo da mínima da função.
 * - `WARNING`   → não impede a publicação, mas é exibido ao coordenador.
 *                 Exemplos: função com vagas em aberto, sobrecarga do servidor.
 */
import { calculateAge, timeRangesOverlap } from "@shared/domain";
import { and, eq, inArray, ne } from "drizzle-orm";

import {
  altarServers,
  celebrationRoleNeeds,
  celebrations,
  parishRoles,
  scheduleAssignments,
  schedules,
  serverRoles,
} from "../../drizzle/schema";
import { getDbOrThrow } from "../db";
import {
  evaluateAvailability,
  loadAvailabilityContext,
  type AvailabilityContext,
} from "./availability";

export type ViolationSeverity = "BLOCKING" | "WARNING";

export type ValidationIssue = {
  severity: ViolationSeverity;
  code:
    | "SERVER_INACTIVE"
    | "SERVER_NOT_QUALIFIED"
    | "SERVER_BELOW_MIN_AGE"
    | "SERVER_ON_VACATION"
    | "SERVER_UNAVAILABLE"
    | "SERVER_FAMILY_UNAVAILABLE"
    | "SERVER_DOUBLE_BOOKED"
    | "DUPLICATE_ASSIGNMENT"
    | "ROLE_UNDERSTAFFED"
    | "ROLE_OVERSTAFFED"
    | "SERVER_OVERLOADED"
    | "QUALIFICATION_EXPIRED";
  message: string;
  serverId: number | null;
  parishRoleId: number | null;
};

export type ValidationResult = {
  valid: boolean;
  blocking: ValidationIssue[];
  warnings: ValidationIssue[];
};

/** Alocação candidata submetida à validação. */
export type CandidateAssignment = {
  serverId: number;
  parishRoleId: number;
};

/** Dados da celebração necessários para validar as alocações. */
type CelebrationContext = {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
};

/**
 * Valida um conjunto de alocações contra uma celebração.
 *
 * `excludeAssignmentIds` permite revalidar uma escala existente ignorando as
 * próprias alocações ao checar conflito de horário — necessário ao editar.
 */
export async function validateAssignments(params: {
  parishId: number;
  celebrationId: number;
  assignments: CandidateAssignment[];
  /** Quando true, vagas em aberto também são reportadas. */
  checkStaffing?: boolean;
  /** Limite de escalas no mês antes de emitir aviso de sobrecarga. */
  overloadThreshold?: number;
}): Promise<ValidationResult> {
  const db = await getDbOrThrow();

  const [celebration] = await db
    .select({
      id: celebrations.id,
      date: celebrations.date,
      startTime: celebrations.startTime,
      endTime: celebrations.endTime,
      title: celebrations.title,
      status: celebrations.status,
    })
    .from(celebrations)
    .where(
      and(eq(celebrations.id, params.celebrationId), eq(celebrations.parishId, params.parishId)),
    )
    .limit(1);

  if (!celebration) {
    return {
      valid: false,
      blocking: [
        {
          severity: "BLOCKING",
          code: "SERVER_INACTIVE",
          message: "Celebração não encontrada nesta paróquia.",
          serverId: null,
          parishRoleId: null,
        },
      ],
      warnings: [],
    };
  }

  const issues: ValidationIssue[] = [];
  const serverIds = Array.from(new Set(params.assignments.map(a => a.serverId)));

  if (serverIds.length === 0) {
    if (params.checkStaffing) {
      issues.push(...(await checkStaffing(params.parishId, celebration.id, params.assignments)));
    }
    return splitIssues(issues);
  }

  // ---- Carregamento em lote de tudo o que a validação precisa ----
  const servers = await db
    .select({
      id: altarServers.id,
      name: altarServers.name,
      birthDate: altarServers.birthDate,
      status: altarServers.status,
    })
    .from(altarServers)
    .where(and(eq(altarServers.parishId, params.parishId), inArray(altarServers.id, serverIds)));

  const serverMap = new Map(servers.map(s => [s.id, s]));

  const qualifications = await db
    .select({
      serverId: serverRoles.serverId,
      parishRoleId: serverRoles.parishRoleId,
      qualificationStatus: serverRoles.qualificationStatus,
      validUntil: serverRoles.validUntil,
    })
    .from(serverRoles)
    .where(and(eq(serverRoles.parishId, params.parishId), inArray(serverRoles.serverId, serverIds)));

  const roleIds = Array.from(new Set(params.assignments.map(a => a.parishRoleId)));
  const roles = await db
    .select({
      id: parishRoles.id,
      name: parishRoles.name,
      minAge: parishRoles.minAge,
      requiresQualification: parishRoles.requiresQualification,
      status: parishRoles.status,
    })
    .from(parishRoles)
    .where(and(eq(parishRoles.parishId, params.parishId), inArray(parishRoles.id, roleIds)));

  const roleMap = new Map(roles.map(r => [r.id, r]));

  const availabilityContext = await loadAvailabilityContext({
    parishId: params.parishId,
    serverIds,
    periodStart: celebration.date,
    periodEnd: celebration.date,
  });

  // Outras celebrações do mesmo dia em que estes servidores já estão escalados.
  const sameDayAssignments = await db
    .select({
      serverId: scheduleAssignments.serverId,
      celebrationId: scheduleAssignments.celebrationId,
      celebrationTitle: celebrations.title,
      startTime: celebrations.startTime,
      endTime: celebrations.endTime,
    })
    .from(scheduleAssignments)
    .innerJoin(celebrations, eq(celebrations.id, scheduleAssignments.celebrationId))
    .where(
      and(
        eq(scheduleAssignments.parishId, params.parishId),
        inArray(scheduleAssignments.serverId, serverIds),
        eq(celebrations.date, celebration.date),
        ne(scheduleAssignments.celebrationId, celebration.id),
        // Alocações substituídas ou canceladas não geram conflito.
        inArray(scheduleAssignments.status, ["PENDING", "CONFIRMED"]),
        ne(celebrations.status, "CANCELLED"),
      ),
    );

  // ---- Duplicidade dentro do próprio conjunto submetido ----
  const seen = new Set<string>();
  for (const assignment of params.assignments) {
    const key = `${assignment.serverId}:${assignment.parishRoleId}`;
    if (seen.has(key)) {
      const server = serverMap.get(assignment.serverId);
      issues.push({
        severity: "BLOCKING",
        code: "DUPLICATE_ASSIGNMENT",
        message: `${server?.name ?? "Servidor"} aparece duas vezes na mesma função.`,
        serverId: assignment.serverId,
        parishRoleId: assignment.parishRoleId,
      });
    }
    seen.add(key);
  }

  // Mesmo servidor em duas funções distintas na mesma celebração.
  const perServerRoles = new Map<number, number[]>();
  for (const assignment of params.assignments) {
    const list = perServerRoles.get(assignment.serverId) ?? [];
    list.push(assignment.parishRoleId);
    perServerRoles.set(assignment.serverId, list);
  }
  for (const [serverId, assignedRoles] of Array.from(perServerRoles.entries())) {
    if (new Set(assignedRoles).size > 1) {
      const server = serverMap.get(serverId);
      issues.push({
        severity: "BLOCKING",
        code: "SERVER_DOUBLE_BOOKED",
        message: `${server?.name ?? "Servidor"} está em mais de uma função nesta mesma celebração.`,
        serverId,
        parishRoleId: null,
      });
    }
  }

  // ---- Validação por alocação ----
  for (const assignment of params.assignments) {
    const server = serverMap.get(assignment.serverId);
    const role = roleMap.get(assignment.parishRoleId);

    if (!server) {
      issues.push({
        severity: "BLOCKING",
        code: "SERVER_INACTIVE",
        message: "Servidor não encontrado nesta paróquia.",
        serverId: assignment.serverId,
        parishRoleId: assignment.parishRoleId,
      });
      continue;
    }

    if (!role) {
      issues.push({
        severity: "BLOCKING",
        code: "SERVER_NOT_QUALIFIED",
        message: "Função não encontrada nesta paróquia.",
        serverId: assignment.serverId,
        parishRoleId: assignment.parishRoleId,
      });
      continue;
    }

    // 1. Servidor precisa estar ativo.
    if (server.status === "INACTIVE") {
      issues.push({
        severity: "BLOCKING",
        code: "SERVER_INACTIVE",
        message: `${server.name} está inativo e não pode ser escalado.`,
        serverId: server.id,
        parishRoleId: role.id,
      });
      continue;
    }

    // 2. Habilitação para a função.
    const qualification = qualifications.find(
      q => q.serverId === server.id && q.parishRoleId === role.id,
    );

    if (role.requiresQualification) {
      if (!qualification || qualification.qualificationStatus !== "QUALIFIED") {
        issues.push({
          severity: "BLOCKING",
          code: "SERVER_NOT_QUALIFIED",
          message: `${server.name} não está habilitado para a função ${role.name}.`,
          serverId: server.id,
          parishRoleId: role.id,
        });
        continue;
      }

      if (qualification.validUntil && qualification.validUntil < celebration.date) {
        issues.push({
          severity: "WARNING",
          code: "QUALIFICATION_EXPIRED",
          message: `A habilitação de ${server.name} para ${role.name} venceu em ${formatDate(qualification.validUntil)}.`,
          serverId: server.id,
          parishRoleId: role.id,
        });
      }
    }

    // 3. Idade mínima da função.
    if (role.minAge !== null) {
      const age = calculateAge(server.birthDate, new Date(`${celebration.date}T12:00:00`));
      if (age < role.minAge) {
        issues.push({
          severity: "BLOCKING",
          code: "SERVER_BELOW_MIN_AGE",
          message: `${server.name} terá ${age} anos na data e a função ${role.name} exige ${role.minAge}.`,
          serverId: server.id,
          parishRoleId: role.id,
        });
        continue;
      }
    }

    // 4. Disponibilidade: férias, exceções, família e recorrência.
    const verdict = evaluateAvailability(availabilityContext, {
      serverId: server.id,
      date: celebration.date,
      startTime: celebration.startTime,
      endTime: celebration.endTime,
    });

    if (!verdict.available) {
      issues.push({
        severity: "BLOCKING",
        code: verdict.code === "AVAILABLE" ? "SERVER_UNAVAILABLE" : verdict.code,
        message: `${server.name}: ${verdict.detail ?? "indisponível neste horário."}`,
        serverId: server.id,
        parishRoleId: role.id,
      });
      continue;
    }

    // 5. Conflito com outra celebração no mesmo horário.
    const conflict = sameDayAssignments.find(
      other =>
        other.serverId === server.id &&
        timeRangesOverlap(
          other.startTime,
          other.endTime,
          celebration.startTime,
          celebration.endTime,
        ),
    );
    if (conflict) {
      issues.push({
        severity: "BLOCKING",
        code: "SERVER_DOUBLE_BOOKED",
        message: `${server.name} já está escalado em "${conflict.celebrationTitle}" no mesmo horário.`,
        serverId: server.id,
        parishRoleId: role.id,
      });
    }
  }

  // ---- Cobertura de vagas ----
  if (params.checkStaffing) {
    issues.push(...(await checkStaffing(params.parishId, celebration.id, params.assignments)));
  }

  return splitIssues(issues);
}

/** Compara as alocações com as necessidades declaradas na celebração. */
async function checkStaffing(
  parishId: number,
  celebrationId: number,
  assignments: CandidateAssignment[],
): Promise<ValidationIssue[]> {
  const db = await getDbOrThrow();
  const issues: ValidationIssue[] = [];

  const needs = await db
    .select({
      parishRoleId: celebrationRoleNeeds.parishRoleId,
      quantity: celebrationRoleNeeds.quantity,
      roleName: parishRoles.name,
    })
    .from(celebrationRoleNeeds)
    .innerJoin(parishRoles, eq(parishRoles.id, celebrationRoleNeeds.parishRoleId))
    .where(
      and(
        eq(celebrationRoleNeeds.parishId, parishId),
        eq(celebrationRoleNeeds.celebrationId, celebrationId),
      ),
    );

  for (const need of needs) {
    const filled = assignments.filter(a => a.parishRoleId === need.parishRoleId).length;

    if (filled < need.quantity) {
      issues.push({
        severity: "WARNING",
        code: "ROLE_UNDERSTAFFED",
        message: `${need.roleName}: ${filled} de ${need.quantity} vagas preenchidas.`,
        serverId: null,
        parishRoleId: need.parishRoleId,
      });
    } else if (filled > need.quantity) {
      issues.push({
        severity: "WARNING",
        code: "ROLE_OVERSTAFFED",
        message: `${need.roleName}: ${filled} servidores para ${need.quantity} vagas previstas.`,
        serverId: null,
        parishRoleId: need.parishRoleId,
      });
    }
  }

  // Alocações em funções que não foram previstas na celebração.
  const neededRoleIds = new Set(needs.map(n => n.parishRoleId));
  const unexpected = Array.from(new Set(assignments.map(a => a.parishRoleId))).filter(
    id => !neededRoleIds.has(id),
  );

  if (unexpected.length > 0 && needs.length > 0) {
    const roles = await db
      .select({ id: parishRoles.id, name: parishRoles.name })
      .from(parishRoles)
      .where(and(eq(parishRoles.parishId, parishId), inArray(parishRoles.id, unexpected)));

    for (const role of roles) {
      issues.push({
        severity: "WARNING",
        code: "ROLE_OVERSTAFFED",
        message: `${role.name} não consta nas necessidades desta celebração.`,
        serverId: null,
        parishRoleId: role.id,
      });
    }
  }

  return issues;
}

function splitIssues(issues: ValidationIssue[]): ValidationResult {
  const blocking = issues.filter(i => i.severity === "BLOCKING");
  const warnings = issues.filter(i => i.severity === "WARNING");
  return { valid: blocking.length === 0, blocking, warnings };
}

function formatDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Lista os servidores elegíveis para uma função em uma celebração, já ordenados
 * por afinidade com as preferências declaradas. Usado pela tela de montagem
 * manual e pelo assistente de IA.
 */
export async function listEligibleServers(params: {
  parishId: number;
  celebrationId: number;
  parishRoleId: number;
}): Promise<
  Array<{
    serverId: number;
    name: string;
    age: number;
    preferenceScore: number;
    recentAssignments: number;
  }>
> {
  const db = await getDbOrThrow();

  const [celebration] = await db
    .select({
      id: celebrations.id,
      date: celebrations.date,
      startTime: celebrations.startTime,
      endTime: celebrations.endTime,
    })
    .from(celebrations)
    .where(
      and(eq(celebrations.id, params.celebrationId), eq(celebrations.parishId, params.parishId)),
    )
    .limit(1);
  if (!celebration) return [];

  const [role] = await db
    .select()
    .from(parishRoles)
    .where(and(eq(parishRoles.id, params.parishRoleId), eq(parishRoles.parishId, params.parishId)))
    .limit(1);
  if (!role) return [];

  // Candidatos: ativos e, quando a função exige, habilitados.
  const candidates = await db
    .select({
      id: altarServers.id,
      name: altarServers.name,
      birthDate: altarServers.birthDate,
      qualificationStatus: serverRoles.qualificationStatus,
    })
    .from(altarServers)
    .leftJoin(
      serverRoles,
      and(
        eq(serverRoles.serverId, altarServers.id),
        eq(serverRoles.parishRoleId, params.parishRoleId),
      ),
    )
    .where(and(eq(altarServers.parishId, params.parishId), ne(altarServers.status, "INACTIVE")));

  const eligible = candidates.filter(candidate => {
    if (role.requiresQualification && candidate.qualificationStatus !== "QUALIFIED") return false;
    if (role.minAge !== null) {
      const age = calculateAge(candidate.birthDate, new Date(`${celebration.date}T12:00:00`));
      if (age < role.minAge) return false;
    }
    return true;
  });

  if (eligible.length === 0) return [];

  const serverIds = eligible.map(c => c.id);

  const availabilityContext = await loadAvailabilityContext({
    parishId: params.parishId,
    serverIds,
    periodStart: celebration.date,
    periodEnd: celebration.date,
  });

  // Carga recente, para equilibrar a distribuição entre os servidores.
  const recent = await db
    .select({ serverId: scheduleAssignments.serverId, celebrationDate: celebrations.date })
    .from(scheduleAssignments)
    .innerJoin(celebrations, eq(celebrations.id, scheduleAssignments.celebrationId))
    .where(
      and(
        eq(scheduleAssignments.parishId, params.parishId),
        inArray(scheduleAssignments.serverId, serverIds),
        inArray(scheduleAssignments.status, ["PENDING", "CONFIRMED"]),
      ),
    );

  const thirtyDaysBefore = shiftDate(celebration.date, -30);
  const loadMap = new Map<number, number>();
  for (const row of recent) {
    if (row.celebrationDate >= thirtyDaysBefore && row.celebrationDate <= celebration.date) {
      loadMap.set(row.serverId, (loadMap.get(row.serverId) ?? 0) + 1);
    }
  }

  const { scorePreferences } = await import("./availability");

  const available = eligible
    .filter(candidate => {
      const verdict = evaluateAvailability(availabilityContext, {
        serverId: candidate.id,
        date: celebration.date,
        startTime: celebration.startTime,
        endTime: celebration.endTime,
      });
      return verdict.available;
    })
    .map(candidate => ({
      serverId: candidate.id,
      name: candidate.name,
      age: calculateAge(candidate.birthDate, new Date(`${celebration.date}T12:00:00`)),
      preferenceScore: scorePreferences(availabilityContext, {
        serverId: candidate.id,
        date: celebration.date,
        startTime: celebration.startTime,
        parishRoleId: params.parishRoleId,
      }),
      recentAssignments: loadMap.get(candidate.id) ?? 0,
    }));

  // Preferência alta primeiro; entre iguais, quem serviu menos recentemente.
  return available.sort((a, b) => {
    if (b.preferenceScore !== a.preferenceScore) return b.preferenceScore - a.preferenceScore;
    if (a.recentAssignments !== b.recentAssignments) return a.recentAssignments - b.recentAssignments;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

/** Desloca uma data no formato AAAA-MM-DD por N dias. */
function shiftDate(date: string, days: number): string {
  const base = new Date(`${date}T12:00:00`);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

export type { AvailabilityContext };
