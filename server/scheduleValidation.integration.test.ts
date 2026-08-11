/**
 * Testes de integração da validação de escalas.
 *
 * Diferente dos testes de regras puras, aqui exercitamos `validateAssignments`
 * de ponta a ponta: ela consulta celebração, servidores, habilitações, funções,
 * contexto de disponibilidade e alocações do mesmo dia, e então decide.
 *
 * Esta é a função mais crítica do sistema. Ela é a única fonte de verdade tanto
 * para a montagem manual quanto para o assistente de IA — um falso negativo aqui
 * coloca uma criança sem habilitação no altar, e um falso positivo trava uma
 * escala legítima na véspera da celebração.
 *
 * O duplo de banco abaixo devolve linhas fixas por tabela, o que nos permite
 * montar cenários completos sem depender de um banco real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Celebração-alvo: domingo, 10h às 11h. */
const CELEBRATION = {
  id: 900,
  parishId: 1,
  date: "2026-03-15", // domingo
  startTime: "10:00:00",
  endTime: "11:00:00",
  title: "Missa Dominical",
  status: "SCHEDULED",
};

/** Celebração concorrente no mesmo dia e horário sobreposto. */
const OVERLAPPING_CELEBRATION = {
  id: 901,
  parishId: 1,
  date: "2026-03-15",
  startTime: "10:30:00",
  endTime: "11:30:00",
  title: "Missa das Crianças",
  status: "SCHEDULED",
};

/**
 * Servidores do cenário. As datas de nascimento são fixas para que a idade
 * calculada na data da celebração seja determinística.
 */
const SERVERS = [
  { id: 1, parishId: 1, name: "Ana", birthDate: "2012-01-10", status: "ACTIVE" }, // 14 anos
  { id: 2, parishId: 1, name: "Bruno", birthDate: "2018-06-01", status: "ACTIVE" }, // 7 anos
  { id: 3, parishId: 1, name: "Carla", birthDate: "2005-02-20", status: "INACTIVE" }, // inativa
  { id: 4, parishId: 1, name: "Davi", birthDate: "2004-09-09", status: "ACTIVE" }, // 21 anos
];

/** Funções litúrgicas. Turíbulo exige habilitação e 12 anos. */
const ROLES = [
  { id: 10, parishId: 1, name: "Turíbulo", minAge: 12, requiresQualification: true, status: "ACTIVE" },
  { id: 11, parishId: 1, name: "Vela", minAge: null, requiresQualification: false, status: "ACTIVE" },
];

/** Habilitações. Ana está habilitada no turíbulo; Davi tem habilitação vencida. */
const QUALIFICATIONS = [
  { serverId: 1, parishRoleId: 10, qualificationStatus: "QUALIFIED", validUntil: null },
  { serverId: 4, parishRoleId: 10, qualificationStatus: "QUALIFIED", validUntil: "2026-01-31" },
];

/** Necessidades declaradas: 1 turíbulo e 2 velas. */
const NEEDS = [
  { parishRoleId: 10, quantity: 1, roleName: "Turíbulo" },
  { parishRoleId: 11, quantity: 2, roleName: "Vela" },
];

/**
 * Estado mutável do cenário. Cada teste ajusta apenas o que precisa,
 * mantendo o resto no default "tudo liberado".
 */
type Scenario = {
  vacations: Record<string, unknown>[];
  exceptions: Record<string, unknown>[];
  recurring: Record<string, unknown>[];
  preferences: Record<string, unknown>[];
  sameDayAssignments: Record<string, unknown>[];
  needs: Record<string, unknown>[];
  celebrationExists: boolean;
};

let scenario: Scenario;

function resetScenario() {
  scenario = {
    vacations: [],
    exceptions: [],
    recurring: [],
    preferences: [],
    sameDayAssignments: [],
    needs: NEEDS,
    celebrationExists: true,
  };
}

/** Descobre o nome da tabela pelos símbolos internos do Drizzle. */
function tableName(table: unknown): string {
  for (const symbol of Object.getOwnPropertySymbols(table as object)) {
    if (String(symbol).includes("Name")) {
      const value = (table as Record<symbol, unknown>)[symbol];
      if (typeof value === "string") return value;
    }
  }
  return "";
}

/**
 * Duplo de banco por tabela. A validação sempre consulta o mesmo conjunto de
 * tabelas com filtros já conhecidos, então devolver as linhas do cenário por
 * nome de tabela é suficiente e mantém o teste legível.
 */
const fakeDb = {
  select(_fields?: unknown) {
    let current = "";
    const builder = {
      from(table: unknown) {
        current = tableName(table);
        return builder;
      },
      innerJoin() {
        return builder;
      },
      where(_condition?: unknown) {
        const rows = (() => {
          switch (current) {
            case "celebrations":
              return scenario.celebrationExists ? [CELEBRATION] : [];
            case "altar_servers":
              return SERVERS;
            case "server_roles":
              return QUALIFICATIONS;
            case "parish_roles":
              return ROLES;
            case "availabilities":
              return scenario.recurring;
            case "availability_exceptions":
              return scenario.exceptions;
            case "vacations":
              return scenario.vacations;
            case "schedule_preferences":
              return scenario.preferences;
            case "schedule_assignments":
              return scenario.sameDayAssignments;
            case "celebration_role_needs":
              return scenario.needs;
            default:
              return [];
          }
        })() as Record<string, unknown>[];

        return {
          limit: () => Promise.resolve(rows),
          then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
        };
      },
    };
    return builder;
  },
};

vi.mock("./db", () => ({
  getDb: async () => fakeDb,
  getDbOrThrow: async () => fakeDb,
}));

type ValidateFn = (params: {
  parishId: number;
  celebrationId: number;
  assignments: { serverId: number; parishRoleId: number }[];
  checkStaffing?: boolean;
}) => Promise<{
  valid: boolean;
  blocking: { code: string; serverId: number | null; message: string }[];
  warnings: { code: string; serverId: number | null; message: string }[];
}>;

let validateAssignments: ValidateFn;

/** Atalho para validar contra a celebração-alvo. */
function validate(
  assignments: { serverId: number; parishRoleId: number }[],
  checkStaffing = false,
) {
  return validateAssignments({
    parishId: 1,
    celebrationId: CELEBRATION.id,
    assignments,
    checkStaffing,
  });
}

beforeEach(async () => {
  resetScenario();
  const mod = await import("./services/scheduleValidation");
  validateAssignments = mod.validateAssignments as ValidateFn;
});

describe("alocação válida", () => {
  it("aprova servidor ativo, habilitado e com idade suficiente", async () => {
    const result = await validate([{ serverId: 1, parishRoleId: 10 }]);
    expect(result.valid).toBe(true);
    expect(result.blocking).toHaveLength(0);
  });

  it("aprova função sem exigência de habilitação nem idade mínima", async () => {
    const result = await validate([{ serverId: 2, parishRoleId: 11 }]);
    expect(result.valid).toBe(true);
  });
});

describe("restrições que impedem a publicação", () => {
  it("bloqueia servidor inativo", async () => {
    const result = await validate([{ serverId: 3, parishRoleId: 11 }]);
    expect(result.valid).toBe(false);
    expect(result.blocking[0]?.code).toBe("SERVER_INACTIVE");
  });

  it("bloqueia servidor sem habilitação para função que a exige", async () => {
    // Bruno não tem registro de habilitação no turíbulo.
    const result = await validate([{ serverId: 2, parishRoleId: 10 }]);
    expect(result.valid).toBe(false);
    expect(result.blocking.map(b => b.code)).toContain("SERVER_NOT_QUALIFIED");
  });

  it("bloqueia servidor abaixo da idade mínima da função", async () => {
    // Bruno tem 7 anos; o turíbulo exige 12. A checagem de habilitação vem
    // antes, então damos a ele a habilitação via cenário para isolar a idade.
    QUALIFICATIONS.push({
      serverId: 2,
      parishRoleId: 10,
      qualificationStatus: "QUALIFIED",
      validUntil: null,
    });
    try {
      const result = await validate([{ serverId: 2, parishRoleId: 10 }]);
      expect(result.valid).toBe(false);
      expect(result.blocking.map(b => b.code)).toContain("SERVER_BELOW_MIN_AGE");
    } finally {
      QUALIFICATIONS.pop();
    }
  });

  it("bloqueia servidor em férias na data da celebração", async () => {
    scenario.vacations = [
      {
        id: 1,
        parishId: 1,
        serverId: 1,
        startDate: "2026-03-10",
        endDate: "2026-03-20",
        reason: "Viagem em família",
      },
    ];
    const result = await validate([{ serverId: 1, parishRoleId: 10 }]);
    expect(result.valid).toBe(false);
    expect(result.blocking[0]?.code).toBe("SERVER_ON_VACATION");
  });

  it("bloqueia servidor com exceção de indisponibilidade na data", async () => {
    scenario.exceptions = [
      {
        id: 1,
        parishId: 1,
        serverId: 1,
        date: CELEBRATION.date,
        exceptionType: "UNAVAILABLE",
        startTime: null,
        endTime: null,
        reason: "Prova na escola",
      },
    ];
    const result = await validate([{ serverId: 1, parishRoleId: 10 }]);
    expect(result.valid).toBe(false);
    expect(result.blocking[0]?.code).toBe("SERVER_UNAVAILABLE");
  });

  it("bloqueia quando a restrição da família não cobre o horário", async () => {
    // A família só autoriza participação à tarde; a celebração é às 10h.
    scenario.recurring = [
      {
        id: 1,
        parishId: 1,
        serverId: 1,
        scope: "FAMILY",
        weekday: 0, // domingo
        startTime: "14:00:00",
        endTime: "18:00:00",
        availabilityType: "AVAILABLE",
        status: "ACTIVE",
        effectiveFrom: null,
        effectiveUntil: null,
      },
    ];
    const result = await validate([{ serverId: 1, parishRoleId: 10 }]);
    expect(result.valid).toBe(false);
    expect(result.blocking[0]?.code).toBe("SERVER_FAMILY_UNAVAILABLE");
  });

  it("bloqueia o mesmo servidor em duas funções na mesma celebração", async () => {
    const result = await validate([
      { serverId: 1, parishRoleId: 10 },
      { serverId: 1, parishRoleId: 11 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.blocking.map(b => b.code)).toContain("SERVER_DOUBLE_BOOKED");
  });

  it("bloqueia alocação duplicada exata na mesma função", async () => {
    const result = await validate([
      { serverId: 1, parishRoleId: 10 },
      { serverId: 1, parishRoleId: 10 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.blocking.map(b => b.code)).toContain("DUPLICATE_ASSIGNMENT");
  });

  it("bloqueia servidor já escalado em outra celebração no mesmo horário", async () => {
    scenario.sameDayAssignments = [
      {
        serverId: 1,
        celebrationId: OVERLAPPING_CELEBRATION.id,
        celebrationTitle: OVERLAPPING_CELEBRATION.title,
        startTime: OVERLAPPING_CELEBRATION.startTime,
        endTime: OVERLAPPING_CELEBRATION.endTime,
      },
    ];
    const result = await validate([{ serverId: 1, parishRoleId: 10 }]);
    expect(result.valid).toBe(false);
    expect(result.blocking.map(b => b.code)).toContain("SERVER_DOUBLE_BOOKED");
    expect(result.blocking[0]?.message).toContain("Missa das Crianças");
  });

  it("NÃO bloqueia quando a outra celebração do dia não sobrepõe o horário", async () => {
    scenario.sameDayAssignments = [
      {
        serverId: 1,
        celebrationId: 902,
        celebrationTitle: "Missa da Noite",
        startTime: "19:00:00",
        endTime: "20:00:00",
      },
    ];
    const result = await validate([{ serverId: 1, parishRoleId: 10 }]);
    expect(result.valid).toBe(true);
  });

  it("bloqueia quando a celebração não existe na paróquia", async () => {
    scenario.celebrationExists = false;
    const result = await validate([{ serverId: 1, parishRoleId: 10 }]);
    expect(result.valid).toBe(false);
    expect(result.blocking[0]?.message).toMatch(/não encontrada/i);
  });
});

describe("avisos que não impedem a publicação", () => {
  it("avisa habilitação vencida sem bloquear", async () => {
    // Davi está habilitado, mas a validade expirou antes da celebração.
    const result = await validate([{ serverId: 4, parishRoleId: 10 }]);
    expect(result.valid).toBe(true);
    expect(result.warnings.map(w => w.code)).toContain("QUALIFICATION_EXPIRED");
  });

  it("avisa vagas em aberto quando a cobertura é verificada", async () => {
    const result = await validate([{ serverId: 1, parishRoleId: 10 }], true);
    // Turíbulo completo (1 de 1), velas em aberto (0 de 2).
    expect(result.warnings.map(w => w.code)).toContain("ROLE_UNDERSTAFFED");
    expect(result.valid).toBe(true);
  });

  it("avisa excesso de servidores em relação às vagas previstas", async () => {
    const result = await validate(
      [
        { serverId: 1, parishRoleId: 10 },
        { serverId: 4, parishRoleId: 10 },
      ],
      true,
    );
    expect(result.warnings.map(w => w.code)).toContain("ROLE_OVERSTAFFED");
  });

  it("reporta vagas em aberto mesmo com escala completamente vazia", async () => {
    const result = await validate([], true);
    expect(result.warnings.filter(w => w.code === "ROLE_UNDERSTAFFED")).toHaveLength(2);
    // Escala vazia não é inválida: é apenas incompleta, e o coordenador decide.
    expect(result.valid).toBe(true);
  });
});

describe("acumulação de violações", () => {
  it("reporta violações de vários servidores em uma única passada", async () => {
    const result = await validate([
      { serverId: 3, parishRoleId: 11 }, // inativa
      { serverId: 2, parishRoleId: 10 }, // sem habilitação
      { serverId: 1, parishRoleId: 10 }, // válida
    ]);
    expect(result.valid).toBe(false);
    const codes = result.blocking.map(b => b.code);
    expect(codes).toContain("SERVER_INACTIVE");
    expect(codes).toContain("SERVER_NOT_QUALIFIED");
    // A alocação válida não gera violação.
    expect(result.blocking.some(b => b.serverId === 1)).toBe(false);
  });

  it("mantém uma violação por alocação problemática, sem duplicar", async () => {
    scenario.vacations = [
      {
        id: 1,
        parishId: 1,
        serverId: 1,
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        reason: "Férias escolares",
      },
    ];
    const result = await validate([{ serverId: 1, parishRoleId: 10 }]);
    expect(result.blocking).toHaveLength(1);
  });
});
