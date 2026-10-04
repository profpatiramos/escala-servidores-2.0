/**
 * Constantes e enums do domínio ESCALA SERVIDORES 2.0.
 * Compartilhado entre backend e frontend. Fonte única de verdade dos valores permitidos.
 */

// ---------------------------------------------------------------------------
// Papéis e atores
// ---------------------------------------------------------------------------
export const PARISH_ROLES = ["PARISH_ADMIN", "COORDINATOR", "PRIEST", "RESPONSIBLE"] as const;
export type ParishRoleName = (typeof PARISH_ROLES)[number];

export const ALL_ROLES = [
  "SUPER_ADMIN",
  "PARISH_ADMIN",
  "COORDINATOR",
  "PRIEST",
  "RESPONSIBLE",
  "SERVER",
] as const;
export type RoleName = (typeof ALL_ROLES)[number];

export const ROLE_LABELS: Record<RoleName, string> = {
  SUPER_ADMIN: "Administrador da plataforma",
  PARISH_ADMIN: "Administrador da paróquia",
  COORDINATOR: "Coordenador",
  PRIEST: "Padre",
  RESPONSIBLE: "Responsável",
  SERVER: "Servidor",
};

export const ACTOR_TYPES = ["USER", "SERVER"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

// ---------------------------------------------------------------------------
// Status gerais
// ---------------------------------------------------------------------------
export const PARISH_STATUS = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const;
export type ParishStatus = (typeof PARISH_STATUS)[number];

export const USER_STATUS = ["ACTIVE", "INACTIVE", "BLOCKED"] as const;
export type UserStatus = (typeof USER_STATUS)[number];

export const MEMBERSHIP_STATUS = ["ACTIVE", "INACTIVE"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUS)[number];

// ---------------------------------------------------------------------------
// Servidores
// ---------------------------------------------------------------------------
export const SERVER_STATUS = ["ACTIVE", "IN_FORMATION", "INACTIVE"] as const;
export type ServerStatus = (typeof SERVER_STATUS)[number];

export const SERVER_STATUS_LABELS: Record<ServerStatus, string> = {
  ACTIVE: "Ativo",
  IN_FORMATION: "Em formação",
  INACTIVE: "Inativo",
};

export const SERVER_ACCESS_STATUS = [
  "NOT_CREATED",
  "PENDING_ACTIVATION",
  "ACTIVE",
  "BLOCKED",
  "REVOKED",
] as const;
export type ServerAccessStatus = (typeof SERVER_ACCESS_STATUS)[number];

export const SERVER_ACCESS_STATUS_LABELS: Record<ServerAccessStatus, string> = {
  NOT_CREATED: "Sem acesso",
  PENDING_ACTIVATION: "Aguardando ativação",
  ACTIVE: "Ativo",
  BLOCKED: "Bloqueado",
  REVOKED: "Revogado",
};

export const RELATIONSHIP_TYPES = [
  "MOTHER",
  "FATHER",
  "GUARDIAN",
  "GRANDPARENT",
  "OTHER",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  MOTHER: "Mãe",
  FATHER: "Pai",
  GUARDIAN: "Responsável legal",
  GRANDPARENT: "Avô / Avó",
  OTHER: "Outro",
};

export const FAMILY_LINK_STATUS = ["ACTIVE", "ENDED"] as const;
export type FamilyLinkStatus = (typeof FAMILY_LINK_STATUS)[number];

// ---------------------------------------------------------------------------
// Funções litúrgicas e habilitações
// ---------------------------------------------------------------------------
export const QUALIFICATION_STATUS = ["NOT_QUALIFIED", "IN_TRAINING", "QUALIFIED"] as const;
export type QualificationStatus = (typeof QUALIFICATION_STATUS)[number];

export const QUALIFICATION_LABELS: Record<QualificationStatus, string> = {
  NOT_QUALIFIED: "Não habilitado",
  IN_TRAINING: "Em treinamento",
  QUALIFIED: "Habilitado",
};

export const FORMATION_STATUS = ["IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type FormationStatus = (typeof FORMATION_STATUS)[number];

export const FORMATION_STATUS_LABELS: Record<FormationStatus, string> = {
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

/** Funções litúrgicas sugeridas ao criar uma nova paróquia. */
export const DEFAULT_LITURGICAL_ROLES = [
  { name: "Turíbulo", description: "Conduz o turíbulo durante a celebração.", minAge: 12 },
  { name: "Naveta", description: "Conduz a naveta com o incenso.", minAge: 10 },
  { name: "Cruz", description: "Conduz a cruz processional.", minAge: 12 },
  { name: "Velas", description: "Conduz as velas (ceroferário).", minAge: 8 },
  { name: "Missal", description: "Conduz e apresenta o missal.", minAge: 10 },
  { name: "Campainha", description: "Responsável pela campainha.", minAge: 8 },
] as const;

// ---------------------------------------------------------------------------
// Disponibilidade
// ---------------------------------------------------------------------------
export const AVAILABILITY_SCOPES = ["SERVER", "FAMILY"] as const;
export type AvailabilityScope = (typeof AVAILABILITY_SCOPES)[number];

export const AVAILABILITY_SCOPE_LABELS: Record<AvailabilityScope, string> = {
  SERVER: "Disponibilidade do servidor",
  FAMILY: "Disponibilidade da família",
};

export const AVAILABILITY_TYPES = ["AVAILABLE", "PREFERRED", "UNAVAILABLE"] as const;
export type AvailabilityType = (typeof AVAILABILITY_TYPES)[number];

export const AVAILABILITY_TYPE_LABELS: Record<AvailabilityType, string> = {
  AVAILABLE: "Disponível",
  PREFERRED: "Preferência",
  UNAVAILABLE: "Indisponível",
};

export const EXCEPTION_TYPES = ["UNAVAILABLE", "EXCEPTIONALLY_AVAILABLE"] as const;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];

export const EXCEPTION_TYPE_LABELS: Record<ExceptionType, string> = {
  UNAVAILABLE: "Indisponível nesta data",
  EXCEPTIONALLY_AVAILABLE: "Disponível excepcionalmente",
};

export const DAY_PERIODS = ["MORNING", "AFTERNOON", "EVENING"] as const;
export type DayPeriod = (typeof DAY_PERIODS)[number];

export const DAY_PERIOD_LABELS: Record<DayPeriod, string> = {
  MORNING: "Manhã",
  AFTERNOON: "Tarde",
  EVENING: "Noite",
};

export const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

export const WEEKDAY_SHORT_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

/** Número mínimo de preferências quando a paróquia exige o preenchimento. */
export const MIN_SCHEDULE_PREFERENCES = 2;

// ---------------------------------------------------------------------------
// Celebrações e escalas
// ---------------------------------------------------------------------------
export const CELEBRATION_TYPES = [
  "SUNDAY_MASS",
  "WEEKDAY_MASS",
  "SOLEMNITY",
  "PROCESSION",
  "WEDDING",
  "FUNERAL",
  "ADORATION",
  "OTHER",
] as const;
export type CelebrationType = (typeof CELEBRATION_TYPES)[number];

export const CELEBRATION_TYPE_LABELS: Record<CelebrationType, string> = {
  SUNDAY_MASS: "Missa dominical",
  WEEKDAY_MASS: "Missa de semana",
  SOLEMNITY: "Solenidade",
  PROCESSION: "Procissão",
  WEDDING: "Casamento",
  FUNERAL: "Exéquias",
  ADORATION: "Adoração",
  OTHER: "Outra celebração",
};

export const CELEBRATION_STATUS = ["SCHEDULED", "CANCELLED", "DONE"] as const;
export type CelebrationStatus = (typeof CELEBRATION_STATUS)[number];

export const CELEBRATION_STATUS_LABELS: Record<CelebrationStatus, string> = {
  SCHEDULED: "Programada",
  CANCELLED: "Cancelada",
  DONE: "Realizada",
};

export const SCHEDULE_STATUS = [
  "DRAFT",
  "PROPOSED",
  "UNDER_REVIEW",
  "PUBLISHED",
  "CANCELLED",
  "ARCHIVED",
] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUS)[number];

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  DRAFT: "Rascunho",
  PROPOSED: "Proposta",
  UNDER_REVIEW: "Em revisão",
  PUBLISHED: "Publicada",
  CANCELLED: "Cancelada",
  ARCHIVED: "Encerrada",
};

export const SCHEDULE_SOURCES = ["MANUAL", "AI"] as const;
export type ScheduleSource = (typeof SCHEDULE_SOURCES)[number];

export const ASSIGNMENT_SOURCES = ["MANUAL", "AI_PROPOSED", "AI_ADJUSTED"] as const;
export type AssignmentSource = (typeof ASSIGNMENT_SOURCES)[number];

export const ASSIGNMENT_SOURCE_LABELS: Record<AssignmentSource, string> = {
  MANUAL: "Atribuição manual",
  AI_PROPOSED: "Sugerida pela IA",
  AI_ADJUSTED: "Sugerida pela IA e ajustada",
};

export const ASSIGNMENT_STATUS = [
  "PENDING",
  "CONFIRMED",
  "DECLINED",
  "REPLACED",
  "CANCELLED",
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUS)[number];

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  PENDING: "Aguardando confirmação",
  CONFIRMED: "Confirmada",
  DECLINED: "Recusada",
  REPLACED: "Substituída",
  CANCELLED: "Cancelada",
};

export const CONFIRMATION_STATUS = ["CONFIRMED", "DECLINED"] as const;
export type ConfirmationStatus = (typeof CONFIRMATION_STATUS)[number];

export const CONFIRMATION_STATUS_LABELS: Record<ConfirmationStatus, string> = {
  CONFIRMED: "Presença confirmada",
  DECLINED: "Não poderá participar",
};

export const CONFLICT_STATUS = ["OPEN", "RESOLVED"] as const;
export type ConflictStatus = (typeof CONFLICT_STATUS)[number];

export const SUBSTITUTION_STATUS = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type SubstitutionStatus = (typeof SUBSTITUTION_STATUS)[number];

export const SUBSTITUTION_STATUS_LABELS: Record<SubstitutionStatus, string> = {
  PENDING: "Aguardando análise",
  APPROVED: "Aprovada",
  REJECTED: "Recusada",
  CANCELLED: "Cancelada",
};

export const ATTENDANCE_STATUS = [
  "PRESENT",
  "COMMUNICATED_ABSENCE",
  "JUSTIFIED_ABSENCE",
  "UNJUSTIFIED_ABSENCE",
  "PENDING_REVIEW",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[number];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Presente",
  COMMUNICATED_ABSENCE: "Ausência comunicada",
  JUSTIFIED_ABSENCE: "Ausência justificada",
  UNJUSTIFIED_ABSENCE: "Ausência não justificada",
  PENDING_REVIEW: "Pendente de análise",
};

// ---------------------------------------------------------------------------
// Eventos e voluntariado
// ---------------------------------------------------------------------------
export const EVENT_TYPES = [
  "VOLUNTEERING",
  "FELLOWSHIP",
  "RETREAT_FORMATION",
  "MEETING",
  "OTHER",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  VOLUNTEERING: "Voluntariado",
  FELLOWSHIP: "Confraternização",
  RETREAT_FORMATION: "Retiro ou formação",
  MEETING: "Encontro",
  OTHER: "Outro",
};

export const EVENT_STATUS = ["DRAFT", "PUBLISHED", "CLOSED", "CANCELLED", "ARCHIVED"] as const;
export type EventStatus = (typeof EVENT_STATUS)[number];

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicado",
  CLOSED: "Inscrições encerradas",
  CANCELLED: "Cancelado",
  ARCHIVED: "Arquivado",
};

export const PARTICIPATION_RESPONSES = [
  "INTERESTED",
  "REGISTERED",
  "CONFIRMED",
  "DECLINED",
  "CANCELLED",
  "NO_SHOW",
] as const;
export type ParticipationResponse = (typeof PARTICIPATION_RESPONSES)[number];

export const PARTICIPATION_RESPONSE_LABELS: Record<ParticipationResponse, string> = {
  INTERESTED: "Tenho interesse",
  REGISTERED: "Inscrito",
  CONFIRMED: "Participação confirmada",
  DECLINED: "Não vou participar",
  CANCELLED: "Inscrição cancelada",
  NO_SHOW: "Não compareceu",
};

export const INTEREST_STATUS = ["INTERESTED", "WITHDRAWN"] as const;
export type InterestStatus = (typeof INTEREST_STATUS)[number];

export const SHIFT_ASSIGNMENT_STATUS = ["ASSIGNED", "CONFIRMED", "DECLINED", "CANCELLED"] as const;
export type ShiftAssignmentStatus = (typeof SHIFT_ASSIGNMENT_STATUS)[number];

export const SHIFT_ASSIGNMENT_STATUS_LABELS: Record<ShiftAssignmentStatus, string> = {
  ASSIGNED: "Escalado",
  CONFIRMED: "Confirmado",
  DECLINED: "Recusado",
  CANCELLED: "Cancelado",
};

export const GENERIC_STATUS = ["ACTIVE", "INACTIVE"] as const;
export type GenericStatus = (typeof GENERIC_STATUS)[number];

// ---------------------------------------------------------------------------
// Gamificação
// ---------------------------------------------------------------------------
export const POINT_EVENT_TYPES = [
  "PARTICIPATION_DONE",
  "EARLY_CONFIRMATION",
  "SUBSTITUTION_ACCEPTED",
  "EARLY_UNAVAILABILITY_NOTICE",
  "EVENT_PARTICIPATION",
  "VOLUNTEER_SHIFT_DONE",
  "FORMATION_COMPLETED",
  "JUSTIFIED_ABSENCE",
  "UNJUSTIFIED_ABSENCE",
  "MANUAL_ADJUSTMENT",
] as const;
export type PointEventType = (typeof POINT_EVENT_TYPES)[number];

export const POINT_EVENT_LABELS: Record<PointEventType, string> = {
  PARTICIPATION_DONE: "Participação em celebração",
  EARLY_CONFIRMATION: "Confirmação antecipada",
  SUBSTITUTION_ACCEPTED: "Aceitou substituir",
  EARLY_UNAVAILABILITY_NOTICE: "Avisou indisponibilidade com antecedência",
  EVENT_PARTICIPATION: "Participação em evento",
  VOLUNTEER_SHIFT_DONE: "Turno de voluntariado cumprido",
  FORMATION_COMPLETED: "Formação concluída",
  JUSTIFIED_ABSENCE: "Ausência justificada",
  UNJUSTIFIED_ABSENCE: "Ausência não justificada",
  MANUAL_ADJUSTMENT: "Ajuste registrado pela coordenação",
};

/** Valores default das regras de pontuação criados junto com a paróquia. */
export const DEFAULT_POINT_RULES: Array<{
  eventType: PointEventType;
  points: number;
  enabled: boolean;
  description: string;
}> = [
  {
    eventType: "PARTICIPATION_DONE",
    points: 10,
    enabled: true,
    description: "Presença registrada em celebração.",
  },
  {
    eventType: "EARLY_CONFIRMATION",
    points: 2,
    enabled: true,
    description: "Confirmou a presença com antecedência.",
  },
  {
    eventType: "SUBSTITUTION_ACCEPTED",
    points: 5,
    enabled: true,
    description: "Aceitou substituir outro servidor.",
  },
  {
    eventType: "EARLY_UNAVAILABILITY_NOTICE",
    points: 2,
    enabled: true,
    description: "Comunicou indisponibilidade com antecedência.",
  },
  {
    eventType: "EVENT_PARTICIPATION",
    points: 5,
    enabled: true,
    description: "Participou de um evento da paróquia.",
  },
  {
    eventType: "VOLUNTEER_SHIFT_DONE",
    points: 5,
    enabled: true,
    description: "Cumpriu um turno de voluntariado.",
  },
  {
    eventType: "FORMATION_COMPLETED",
    points: 10,
    enabled: true,
    description: "Concluiu uma formação.",
  },
  {
    eventType: "JUSTIFIED_ABSENCE",
    points: 0,
    enabled: true,
    description: "Ausência justificada não altera a pontuação.",
  },
  {
    eventType: "UNJUSTIFIED_ABSENCE",
    points: -10,
    enabled: false,
    description: "Ausência sem justificativa. Desabilitado por padrão.",
  },
  {
    eventType: "MANUAL_ADJUSTMENT",
    points: 0,
    enabled: true,
    description: "Ajuste manual da coordenação, sempre com motivo registrado.",
  },
];

export const ACHIEVEMENT_SOURCES = ["AUTOMATIC", "MANUAL"] as const;
export type AchievementSource = (typeof ACHIEVEMENT_SOURCES)[number];

export const ACHIEVEMENT_CRITERIA_KINDS = [
  "FIRST_PARTICIPATION",
  "PARTICIPATION_COUNT",
  "CONSECUTIVE_CONFIRMATIONS",
  "VOLUNTEER_COUNT",
  "FORMATION_COUNT",
  "MANUAL_ONLY",
] as const;
export type AchievementCriteriaKind = (typeof ACHIEVEMENT_CRITERIA_KINDS)[number];

/** Conquistas padrão criadas junto com a paróquia. */
export const DEFAULT_ACHIEVEMENTS: Array<{
  name: string;
  description: string;
  criteriaKind: AchievementCriteriaKind;
  threshold: number;
}> = [
  {
    name: "Primeira participação",
    description: "Sua primeira presença registrada em uma celebração.",
    criteriaKind: "FIRST_PARTICIPATION",
    threshold: 1,
  },
  {
    name: "Participação consistente",
    description: "Dez presenças registradas em celebrações.",
    criteriaKind: "PARTICIPATION_COUNT",
    threshold: 10,
  },
  {
    name: "Presença constante",
    description: "Trinta presenças registradas em celebrações.",
    criteriaKind: "PARTICIPATION_COUNT",
    threshold: 30,
  },
  {
    name: "Voluntário da comunidade",
    description: "Participou de três turnos de voluntariado.",
    criteriaKind: "VOLUNTEER_COUNT",
    threshold: 3,
  },
  {
    name: "Em formação contínua",
    description: "Concluiu duas formações.",
    criteriaKind: "FORMATION_COUNT",
    threshold: 2,
  },
];

// ---------------------------------------------------------------------------
// Inteligência artificial
// ---------------------------------------------------------------------------
export const AI_RUN_STATUS = ["RUNNING", "COMPLETED", "FAILED", "INFEASIBLE"] as const;
export type AiRunStatus = (typeof AI_RUN_STATUS)[number];

export const AI_RUN_STATUS_LABELS: Record<AiRunStatus, string> = {
  RUNNING: "Gerando proposta",
  COMPLETED: "Proposta gerada",
  FAILED: "Não foi possível gerar",
  INFEASIBLE: "Proposta incompleta",
};

export const AI_PRIORITY_MODES = [
  "BALANCED",
  "PREFERENCES",
  "AVAILABILITY",
  "FAMILY_NEEDS",
] as const;
export type AiPriorityMode = (typeof AI_PRIORITY_MODES)[number];

export const AI_PRIORITY_MODE_LABELS: Record<AiPriorityMode, string> = {
  BALANCED: "Equilibrar participações",
  PREFERENCES: "Priorizar preferências",
  AVAILABILITY: "Priorizar disponibilidade",
  FAMILY_NEEDS: "Priorizar necessidades da família",
};

export const AI_PRIORITY_MODE_DESCRIPTIONS: Record<AiPriorityMode, string> = {
  BALANCED: "Distribui as oportunidades entre todos os servidores.",
  PREFERENCES: "Tenta atender ao máximo as preferências de horário e função.",
  AVAILABILITY: "Escolhe primeiro quem tem disponibilidade mais folgada.",
  FAMILY_NEEDS: "Respeita ao máximo os horários que a família consegue levar.",
};

export const CONFLICT_SEVERITY = ["WARNING", "BLOCKING"] as const;
export type ConflictSeverity = (typeof CONFLICT_SEVERITY)[number];

// ---------------------------------------------------------------------------
// Validações de escala
// ---------------------------------------------------------------------------
export const VALIDATION_CODES = [
  "SERVER_INACTIVE",
  "SERVER_OTHER_PARISH",
  "SERVER_NOT_QUALIFIED",
  "SERVER_ON_VACATION",
  "SERVER_UNAVAILABLE",
  "SERVER_FAMILY_UNAVAILABLE",
  "SERVER_TIME_CONFLICT",
  "DUPLICATE_ASSIGNMENT",
  "ROLE_MIN_AGE",
  "SLOT_NOT_FILLED",
  "PREFERENCE_NOT_MET",
  "OVER_CAPACITY",
] as const;
export type ValidationCode = (typeof VALIDATION_CODES)[number];

// ---------------------------------------------------------------------------
// Notificações
// ---------------------------------------------------------------------------
export const NOTIFICATION_TYPES = [
  "SCHEDULE_PUBLISHED",
  "SCHEDULE_CHANGED",
  "CONFIRMATION_PENDING",
  "SUBSTITUTION_REQUESTED",
  "SUBSTITUTION_RESOLVED",
  "EVENT_PUBLISHED",
  "SHIFT_ASSIGNED",
  "ACCESS_ACTIVATED",
  "PIN_RESET",
  "ACHIEVEMENT_GRANTED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_STATUS = ["PENDING", "SENT", "READ", "FAILED"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUS)[number];

// ---------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------
export const AUDIT_ACTIONS = [
  "PARISH_CREATED",
  "PARISH_UPDATED",
  "PARISH_STATUS_CHANGED",
  "MEMBER_CREATED",
  "MEMBER_UPDATED",
  "MEMBER_REMOVED",
  "RESPONSIBLE_CREATED",
  "RESPONSIBLE_UPDATED",
  "SERVER_CREATED",
  "SERVER_UPDATED",
  "SERVER_STATUS_CHANGED",
  "FAMILY_LINK_CREATED",
  "FAMILY_LINK_ENDED",
  "SERVER_ACCESS_CREATED",
  "SERVER_ACCESS_ACTIVATED",
  "SERVER_ACCESS_PIN_RESET",
  "SERVER_ACCESS_BLOCKED",
  "SERVER_ACCESS_UNBLOCKED",
  "SERVER_ACCESS_REVOKED",
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "ROLE_CREATED",
  "ROLE_UPDATED",
  "QUALIFICATION_UPDATED",
  "QUALIFICATION_REMOVED",
  "FORMATION_CREATED",
  "FORMATION_UPDATED",
  "AVAILABILITY_UPDATED",
  "AVAILABILITY_EXCEPTION_CREATED",
  "AVAILABILITY_EXCEPTION_REMOVED",
  "VACATION_CREATED",
  "VACATION_REMOVED",
  "PREFERENCE_UPDATED",
  "CELEBRATION_CREATED",
  "CELEBRATION_UPDATED",
  "CELEBRATION_CANCELLED",
  "SCHEDULE_CREATED",
  "SCHEDULE_UPDATED",
  "SCHEDULE_PUBLISHED",
  "SCHEDULE_CANCELLED",
  "SCHEDULE_ARCHIVED",
  "ASSIGNMENT_CREATED",
  "ASSIGNMENT_REMOVED",
  "ASSIGNMENT_REPLACED",
  "CONFIRMATION_RECORDED",
  "CONFIRMATION_CONFLICT_OPENED",
  "CONFIRMATION_CONFLICT_RESOLVED",
  "SUBSTITUTION_REQUESTED",
  "SUBSTITUTION_APPROVED",
  "SUBSTITUTION_REJECTED",
  "SUBSTITUTION_CANCELLED",
  "ATTENDANCE_RECORDED",
  "EVENT_CREATED",
  "EVENT_UPDATED",
  "EVENT_PUBLISHED",
  "EVENT_CANCELLED",
  "PARTICIPATION_RECORDED",
  "VOLUNTEER_INTEREST_RECORDED",
  "SHIFT_ASSIGNMENT_CREATED",
  "SHIFT_ASSIGNMENT_CANCELLED",
  "POINTS_GRANTED",
  "POINTS_ADJUSTED",
  "POINTS_REVERSED",
  "ACHIEVEMENT_GRANTED",
  "GAMIFICATION_SETTINGS_UPDATED",
  "AI_RUN_REQUESTED",
  "AI_PROPOSAL_APPLIED",
  "AI_PROPOSAL_DISCARDED",
  "REPORT_EXPORTED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// ---------------------------------------------------------------------------
// Parâmetros de segurança
// ---------------------------------------------------------------------------
export const SECURITY = {
  /** Tentativas de PIN inválido antes do bloqueio temporário. */
  maxPinAttempts: 5,
  /** Duração do bloqueio de acesso do servidor, em minutos. */
  pinLockMinutes: 15,
  /** Tentativas de senha inválida antes do bloqueio temporário. */
  maxPasswordAttempts: 5,
  /** Duração do bloqueio de conta administrativa, em minutos. */
  passwordLockMinutes: 15,
  /** Validade da sessão, em dias. */
  sessionDays: 14,
  /** Comprimento exato do PIN. */
  pinLength: 6,
  /** Comprimento mínimo da senha administrativa. */
  minPasswordLength: 8,
  /** Idade a partir da qual o servidor deixa de ser considerado menor. */
  adultAge: 18,
  /** Quantidade mínima de preferências de horário exigida pela especificação. */
  minPreferences: 2,
} as const;

// ---------------------------------------------------------------------------
// Utilitários de domínio
// ---------------------------------------------------------------------------

/** Calcula a idade em anos a partir da data de nascimento. Nunca persistir o resultado. */
export function calculateAge(birthDate: Date | string, reference: Date = new Date()): number {
  // PostgreSQL date is a calendar date; parsing YYYY-MM-DD as UTC shifts it
  // to the previous day in Brazil. Keep the supplied calendar components.
  const [year, month, day] = typeof birthDate === "string"
    ? birthDate.slice(0, 10).split("-").map(Number)
    : [birthDate.getFullYear(), birthDate.getMonth() + 1, birthDate.getDate()];
  let age = reference.getFullYear() - year;
  const monthDiff = reference.getMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && reference.getDate() < day)) {
    age -= 1;
  }
  return age;
}

/** Indica se o servidor é menor de idade na data de referência. */
export function isMinor(birthDate: Date | string, reference: Date = new Date()): boolean {
  return calculateAge(birthDate, reference) < SECURITY.adultAge;
}

/** Converte "HH:MM" ou "HH:MM:SS" em minutos desde a meia-noite. */
export function timeToMinutes(time: string): number {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

/** Formata minutos desde a meia-noite como "HH:MM". */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Verifica se dois intervalos de tempo se sobrepõem. */
export function timeRangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(startB) < timeToMinutes(endA);
}

/** Verifica se um intervalo contém completamente outro intervalo. */
export function timeRangeContains(
  outerStart: string,
  outerEnd: string,
  innerStart: string,
  innerEnd: string,
): boolean {
  return (
    timeToMinutes(outerStart) <= timeToMinutes(innerStart) &&
    timeToMinutes(outerEnd) >= timeToMinutes(innerEnd)
  );
}

/** Determina o período do dia a partir de um horário. */
export function periodFromTime(time: string): DayPeriod {
  const minutes = timeToMinutes(time);
  if (minutes < 12 * 60) return "MORNING";
  if (minutes < 18 * 60) return "AFTERNOON";
  return "EVENING";
}

/** Normaliza uma data para "YYYY-MM-DD" sem influência de fuso horário. */
export function toDateKey(date: Date | string): string {
  if (typeof date === "string") return date.slice(0, 10);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Retorna o dia da semana (0 = domingo) de uma data no formato "YYYY-MM-DD". */
export function weekdayFromDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.slice(0, 10).split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).getDay();
}
