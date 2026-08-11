import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  foreignKey,
  index,
  int,
  json,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import {
  ACHIEVEMENT_CRITERIA_KINDS,
  ACHIEVEMENT_SOURCES,
  ACTOR_TYPES,
  AI_PRIORITY_MODES,
  AI_RUN_STATUS,
  ALL_ROLES,
  ASSIGNMENT_SOURCES,
  ASSIGNMENT_STATUS,
  ATTENDANCE_STATUS,
  AVAILABILITY_SCOPES,
  AVAILABILITY_TYPES,
  CELEBRATION_STATUS,
  CELEBRATION_TYPES,
  CONFIRMATION_STATUS,
  CONFLICT_SEVERITY,
  CONFLICT_STATUS,
  DAY_PERIODS,
  EVENT_STATUS,
  EVENT_TYPES,
  EXCEPTION_TYPES,
  FAMILY_LINK_STATUS,
  FORMATION_STATUS,
  GENERIC_STATUS,
  INTEREST_STATUS,
  MEMBERSHIP_STATUS,
  NOTIFICATION_STATUS,
  NOTIFICATION_TYPES,
  PARISH_ROLES,
  PARISH_STATUS,
  PARTICIPATION_RESPONSES,
  POINT_EVENT_TYPES,
  QUALIFICATION_STATUS,
  RELATIONSHIP_TYPES,
  SCHEDULE_SOURCES,
  SCHEDULE_STATUS,
  SERVER_ACCESS_STATUS,
  SERVER_STATUS,
  SHIFT_ASSIGNMENT_STATUS,
  SUBSTITUTION_STATUS,
  USER_STATUS,
} from "../shared/domain";

const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
const massTypeEnum = pgEnum("mass_type", ["domingo", "sabado", "semana", "especial"]);
const deliveryChannelEnum = pgEnum("delivery_channel", ["EMAIL", "SELF_SERVICE"]);
const accessCodePurposeEnum = pgEnum("access_code_purpose", ["ACTIVATION", "PIN_RESET"]);

/** Helper de enum tipado a partir das constantes compartilhadas. */
const enumTypeName = (name: string, values: readonly string[]) => {
  const source = `${name}:${values.join("|")}`;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${name.replace(/[^a-zA-Z0-9_]+/g, "_").toLowerCase()}_${(hash >>> 0).toString(16)}`;
};

const enumCol = <T extends readonly [string, ...string[]]>(name: string, values: T) =>
  pgEnum(enumTypeName(name, values), values);

// ===========================================================================
// NÚCLEO: usuários da plataforma e OAuth (tabela exigida pelo template)
// ===========================================================================

/**
 * Identidade de autenticação. Suporta duas origens:
 * - Manus OAuth (openId preenchido) — usado pelo administrador da plataforma.
 * - E-mail + senha (email/passwordHash preenchidos) — administradores de paróquia,
 *   coordenadores e responsáveis.
 * Servidores NÃO usam esta tabela para autenticar; usam `serverAccess` (ID + PIN).
 */
export const users = pgTable(
  "users",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    /** Identificador do Manus OAuth. Nulo para contas criadas com e-mail e senha. */
    openId: varchar("openId", { length: 64 }).unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    /** Hash scrypt no formato `scrypt$N$r$p$salt$hash`. Nunca exposto pela API. */
    passwordHash: varchar("passwordHash", { length: 255 }),
    phone: varchar("phone", { length: 32 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    /** Papel do template (compatibilidade com DashboardLayout e adminProcedure). */
    role: userRoleEnum.default("user").notNull(),
    /** Verdadeiro apenas para SUPER_ADMIN da plataforma. */
    isPlatformAdmin: boolean("isPlatformAdmin").default(false).notNull(),
    status: enumCol("status", USER_STATUS).default("ACTIVE").notNull(),
    failedLoginAttempts: int("failedLoginAttempts").default(0).notNull(),
    lockedUntil: timestamp("lockedUntil"),
    mustChangePassword: boolean("mustChangePassword").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
    statusIdx: index("users_status_idx").on(table.status),
  }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ===========================================================================
// PARÓQUIAS E VÍNCULOS
// ===========================================================================

/** Unidade de isolamento (tenant). Todo dado operacional referencia uma paróquia. */
export const parishes = pgTable(
  "parishes",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    name: varchar("name", { length: 180 }).notNull(),
    legalName: varchar("legalName", { length: 220 }),
    slug: varchar("slug", { length: 80 }).notNull(),
    city: varchar("city", { length: 120 }),
    state: varchar("state", { length: 60 }),
    address: text("address"),
    phone: varchar("phone", { length: 32 }),
    email: varchar("email", { length: 320 }),
    timezone: varchar("timezone", { length: 64 }).default("America/Sao_Paulo").notNull(),
    status: enumCol("status", PARISH_STATUS).default("ACTIVE").notNull(),
    /** Configurações operacionais da paróquia (ex.: requireMinPreferences). */
    settings: json("settings"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    slugIdx: uniqueIndex("parishes_slug_idx").on(table.slug),
    statusIdx: index("parishes_status_idx").on(table.status),
  }),
);

/** Vínculo entre um usuário e uma paróquia, com o papel exercido. */
export const parishMembers = pgTable(
  "parish_members",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    userId: int("userId").notNull(),
    role: enumCol("role", PARISH_ROLES).notNull(),
    status: enumCol("status", MEMBERSHIP_STATUS).default("ACTIVE").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    uniqueMembership: uniqueIndex("parish_members_unique_idx").on(
      table.parishId,
      table.userId,
      table.role,
    ),
    parishIdx: index("parish_members_parish_idx").on(table.parishId),
    userIdx: index("parish_members_user_idx").on(table.userId),
    parishFk: foreignKey({
      columns: [table.parishId],
      foreignColumns: [parishes.id],
      name: "parish_members_parish_fk",
    }),
    userFk: foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "parish_members_user_fk",
    }),
  }),
);

/** Sessões emitidas. Cobre atores USER (e-mail/senha ou OAuth) e SERVER (ID + PIN). */
export const sessions = pgTable(
  "sessions",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    actorType: enumCol("actorType", ACTOR_TYPES).notNull(),
    userId: int("userId"),
    serverId: int("serverId"),
    /** Hash SHA-256 do token de sessão. O token puro nunca é persistido. */
    tokenHash: varchar("tokenHash", { length: 128 }).notNull(),
    /** Paróquia ativa da sessão. Sempre definida no servidor. */
    parishId: int("parishId"),
    /** Papel ativo da sessão. */
    activeRole: enumCol("activeRole", ALL_ROLES).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    revokedAt: timestamp("revokedAt"),
    ip: varchar("ip", { length: 64 }),
    userAgent: varchar("userAgent", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    tokenIdx: uniqueIndex("sessions_token_idx").on(table.tokenHash),
    userIdx: index("sessions_user_idx").on(table.userId),
    serverIdx: index("sessions_server_idx").on(table.serverId),
    expiresIdx: index("sessions_expires_idx").on(table.expiresAt),
  }),
);

/** Tokens de uso único para redefinição de senha administrativa. */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    userId: int("userId").notNull(),
    tokenHash: varchar("tokenHash", { length: 128 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    usedAt: timestamp("usedAt"),
    /**
     * Canal usado para entregar o token ao usuário. `SELF_SERVICE` indica que o
     * código foi exibido diretamente a quem solicitou; `EMAIL` indica envio.
     */
    deliveryChannel: deliveryChannelEnum
      .default("SELF_SERVICE")
      .notNull(),
    /** Registrado quando a entrega pelo canal escolhido é confirmada. */
    deliveredAt: timestamp("deliveredAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    tokenIdx: uniqueIndex("password_reset_token_idx").on(table.tokenHash),
    userIdx: index("password_reset_user_idx").on(table.userId),
  }),
);

// ===========================================================================
// PESSOAS: responsáveis e servidores
// ===========================================================================

/** Responsável pastoral por um ou mais servidores. */
export const responsibles = pgTable(
  "responsibles",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    /** Identidade de acesso do responsável. */
    userId: int("userId"),
    name: varchar("name", { length: 180 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    email: varchar("email", { length: 320 }),
    notes: text("notes"),
    status: enumCol("status", GENERIC_STATUS).default("ACTIVE").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    parishIdx: index("responsibles_parish_idx").on(table.parishId),
    userIdx: index("responsibles_user_idx").on(table.userId),
    statusIdx: index("responsibles_status_idx").on(table.status),
    parishFk: foreignKey({
      columns: [table.parishId],
      foreignColumns: [parishes.id],
      name: "responsibles_parish_fk",
    }),
  }),
);

/**
 * Servidor do altar. A idade NUNCA é armazenada: é sempre derivada de `birthDate`.
 * Exclusão é lógica, via `status = INACTIVE`.
 */
export const altarServers = pgTable(
  "altar_servers",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    birthDate: date("birthDate", { mode: "string" }).notNull(),
    heightCm: int("heightCm"),
    fatherName: varchar("fatherName", { length: 180 }),
    motherName: varchar("motherName", { length: 180 }),
    status: enumCol("status", SERVER_STATUS).default("IN_FORMATION").notNull(),
    /** Observações estritamente necessárias à organização pastoral. */
    notes: text("notes"),
    joinedAt: date("joinedAt", { mode: "string" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    parishIdx: index("altar_servers_parish_idx").on(table.parishId),
    statusIdx: index("altar_servers_status_idx").on(table.status),
    nameIdx: index("altar_servers_name_idx").on(table.name),
    parishFk: foreignKey({
      columns: [table.parishId],
      foreignColumns: [parishes.id],
      name: "altar_servers_parish_fk",
    }),
  }),
);

/**
 * Credencial operacional do servidor: ID de acesso + PIN.
 * O PIN é armazenado exclusivamente como hash e nunca é retornado pela API.
 */
export const serverAccess = pgTable(
  "server_access",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    serverId: int("serverId").notNull(),
    /** Identificador de acesso não previsível, exibível ao responsável e à coordenação. */
    accessId: varchar("accessId", { length: 32 }).notNull(),
    /** Hash scrypt do PIN. Nunca exposto, nunca logado. */
    pinHash: varchar("pinHash", { length: 255 }),
    status: enumCol("status", SERVER_ACCESS_STATUS).default("PENDING_ACTIVATION").notNull(),
    failedAttempts: int("failedAttempts").default(0).notNull(),
    lockedUntil: timestamp("lockedUntil"),
    /** Marca que o responsável precisa definir um novo PIN no próximo acesso. */
    pinResetRequested: boolean("pinResetRequested").default(false).notNull(),
    activatedAt: timestamp("activatedAt"),
    activatedByUserId: int("activatedByUserId"),
    lastLoginAt: timestamp("lastLoginAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    accessIdIdx: uniqueIndex("server_access_accessid_idx").on(table.accessId),
    serverIdx: uniqueIndex("server_access_server_idx").on(table.serverId),
    parishIdx: index("server_access_parish_idx").on(table.parishId),
    serverFk: foreignKey({
      columns: [table.serverId],
      foreignColumns: [altarServers.id],
      name: "server_access_server_fk",
    }),
  }),
);

/**
 * Vínculo entre responsável e servidor (1 responsável : N servidores).
 * Cada servidor possui exatamente um vínculo primário ativo.
 */
export const familyLinks = pgTable(
  "family_links",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    responsibleId: int("responsibleId").notNull(),
    serverId: int("serverId").notNull(),
    relationshipType: enumCol("relationshipType", RELATIONSHIP_TYPES).default("GUARDIAN").notNull(),
    isPrimary: boolean("isPrimary").default(true).notNull(),
    status: enumCol("status", FAMILY_LINK_STATUS).default("ACTIVE").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    createdByUserId: int("createdByUserId"),
    endedAt: timestamp("endedAt"),
    endedByUserId: int("endedByUserId"),
  },
  table => ({
    parishIdx: index("family_links_parish_idx").on(table.parishId),
    responsibleIdx: index("family_links_responsible_idx").on(table.responsibleId),
    serverIdx: index("family_links_server_idx").on(table.serverId),
    statusIdx: index("family_links_status_idx").on(table.status),
    /** Impede vínculo duplicado entre o mesmo responsável e o mesmo servidor. */
    uniquePair: uniqueIndex("family_links_pair_idx").on(table.responsibleId, table.serverId),
    responsibleFk: foreignKey({
      columns: [table.responsibleId],
      foreignColumns: [responsibles.id],
      name: "family_links_responsible_fk",
    }),
    serverFk: foreignKey({
      columns: [table.serverId],
      foreignColumns: [altarServers.id],
      name: "family_links_server_fk",
    }),
  }),
);

/**
 * Código de uso único para ativação de acesso ou redefinição de PIN.
 *
 * Emitido pela coordenação ou pelo responsável e entregue fora da aplicação.
 * Substitui qualquer fluxo público baseado apenas em dados pessoais, que seriam
 * facilmente adivinháveis no caso de menores de idade.
 */
export const accessActivationCodes = pgTable(
  "access_activation_codes",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    serverId: int("serverId").notNull(),
    /** Hash SHA-256 do código. O código puro só existe no momento da emissão. */
    codeHash: varchar("codeHash", { length: 128 }).notNull(),
    /** ACTIVATION para o primeiro PIN, PIN_RESET para redefinição. */
    purpose: accessCodePurposeEnum.notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    usedAt: timestamp("usedAt"),
    issuedByUserId: int("issuedByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    codeIdx: uniqueIndex("access_activation_code_idx").on(table.codeHash),
    serverIdx: index("access_activation_server_idx").on(table.serverId),
    parishIdx: index("access_activation_parish_idx").on(table.parishId),
    serverFk: foreignKey({
      columns: [table.serverId],
      foreignColumns: [altarServers.id],
      name: "access_activation_server_fk",
    }),
  }),
);

// ===========================================================================
// FUNÇÕES LITÚRGICAS, HABILITAÇÕES E FORMAÇÕES
// ===========================================================================

/** Função litúrgica configurável por paróquia (turíbulo, naveta, cruz, velas...). */
export const parishRoles = pgTable(
  "parish_roles",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    minAge: int("minAge"),
    requiresQualification: boolean("requiresQualification").default(true).notNull(),
    displayOrder: int("displayOrder").default(0).notNull(),
    status: enumCol("status", GENERIC_STATUS).default("ACTIVE").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    parishNameIdx: uniqueIndex("parish_roles_name_idx").on(table.parishId, table.name),
    parishIdx: index("parish_roles_parish_idx").on(table.parishId),
    parishFk: foreignKey({
      columns: [table.parishId],
      foreignColumns: [parishes.id],
      name: "parish_roles_parish_fk",
    }),
  }),
);

/** Habilitação de um servidor para uma função litúrgica. */
export const serverRoles = pgTable(
  "server_roles",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    serverId: int("serverId").notNull(),
    parishRoleId: int("parishRoleId").notNull(),
    qualificationStatus: enumCol("qualificationStatus", QUALIFICATION_STATUS)
      .default("IN_TRAINING")
      .notNull(),
    qualifiedAt: date("qualifiedAt", { mode: "string" }),
    validUntil: date("validUntil", { mode: "string" }),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    uniqueServerRole: uniqueIndex("server_roles_unique_idx").on(table.serverId, table.parishRoleId),
    parishIdx: index("server_roles_parish_idx").on(table.parishId),
    roleIdx: index("server_roles_role_idx").on(table.parishRoleId),
    serverFk: foreignKey({
      columns: [table.serverId],
      foreignColumns: [altarServers.id],
      name: "server_roles_server_fk",
    }),
    roleFk: foreignKey({
      columns: [table.parishRoleId],
      foreignColumns: [parishRoles.id],
      name: "server_roles_role_fk",
    }),
  }),
);

/** Formação realizada ou em andamento pelo servidor. */
export const formations = pgTable(
  "formations",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    serverId: int("serverId").notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    description: text("description"),
    parishRoleId: int("parishRoleId"),
    status: enumCol("status", FORMATION_STATUS).default("IN_PROGRESS").notNull(),
    startedAt: date("startedAt", { mode: "string" }),
    completedAt: date("completedAt", { mode: "string" }),
    registeredByUserId: int("registeredByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    parishIdx: index("formations_parish_idx").on(table.parishId),
    serverIdx: index("formations_server_idx").on(table.serverId),
    serverFk: foreignKey({
      columns: [table.serverId],
      foreignColumns: [altarServers.id],
      name: "formations_server_fk",
    }),
  }),
);

// ===========================================================================
// DISPONIBILIDADE
// ===========================================================================

/**
 * Disponibilidade recorrente semanal.
 * `scope = SERVER` é a disponibilidade do próprio servidor.
 * `scope = FAMILY` é a disponibilidade logística da família (restrição obrigatória).
 */
export const availabilities = pgTable(
  "availabilities",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    serverId: int("serverId").notNull(),
    scope: enumCol("scope", AVAILABILITY_SCOPES).default("SERVER").notNull(),
    /** 0 = domingo ... 6 = sábado. */
    weekday: int("weekday").notNull(),
    startTime: time("startTime").notNull(),
    endTime: time("endTime").notNull(),
    availabilityType: enumCol("availabilityType", AVAILABILITY_TYPES).default("AVAILABLE").notNull(),
    effectiveFrom: date("effectiveFrom", { mode: "string" }),
    effectiveUntil: date("effectiveUntil", { mode: "string" }),
    notes: text("notes"),
    status: enumCol("status", GENERIC_STATUS).default("ACTIVE").notNull(),
    createdByUserId: int("createdByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    parishIdx: index("availabilities_parish_idx").on(table.parishId),
    serverIdx: index("availabilities_server_idx").on(table.serverId, table.scope),
    weekdayIdx: index("availabilities_weekday_idx").on(table.weekday),
    serverFk: foreignKey({
      columns: [table.serverId],
      foreignColumns: [altarServers.id],
      name: "availabilities_server_fk",
    }),
  }),
);

/** Exceção pontual de disponibilidade em uma data específica. */
export const availabilityExceptions = pgTable(
  "availability_exceptions",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    serverId: int("serverId").notNull(),
    scope: enumCol("scope", AVAILABILITY_SCOPES).default("SERVER").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    /** Nulo significa o dia inteiro. */
    startTime: time("startTime"),
    endTime: time("endTime"),
    exceptionType: enumCol("exceptionType", EXCEPTION_TYPES).default("UNAVAILABLE").notNull(),
    reason: text("reason"),
    createdByUserId: int("createdByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    parishIdx: index("availability_exceptions_parish_idx").on(table.parishId),
    serverDateIdx: index("availability_exceptions_server_date_idx").on(table.serverId, table.date),
    serverFk: foreignKey({
      columns: [table.serverId],
      foreignColumns: [altarServers.id],
      name: "availability_exceptions_server_fk",
    }),
  }),
);

/** Férias do servidor. Restrição obrigatória com data de saída e retorno. */
export const vacations = pgTable(
  "vacations",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    serverId: int("serverId").notNull(),
    startDate: date("startDate", { mode: "string" }).notNull(),
    endDate: date("endDate", { mode: "string" }).notNull(),
    reason: text("reason"),
    createdByUserId: int("createdByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    parishIdx: index("vacations_parish_idx").on(table.parishId),
    serverIdx: index("vacations_server_idx").on(table.serverId),
    rangeIdx: index("vacations_range_idx").on(table.startDate, table.endDate),
    serverFk: foreignKey({
      columns: [table.serverId],
      foreignColumns: [altarServers.id],
      name: "vacations_server_fk",
    }),
  }),
);

/** Preferência de escala, usada como critério de otimização (nunca como restrição). */
export const schedulePreferences = pgTable(
  "schedule_preferences",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    serverId: int("serverId").notNull(),
    weekday: int("weekday"),
    period: enumCol("period", DAY_PERIODS),
    parishRoleId: int("parishRoleId"),
    /** 1 indica a preferência de maior prioridade. */
    priority: int("priority").default(1).notNull(),
    status: enumCol("status", GENERIC_STATUS).default("ACTIVE").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    parishIdx: index("schedule_preferences_parish_idx").on(table.parishId),
    serverIdx: index("schedule_preferences_server_idx").on(table.serverId),
    serverFk: foreignKey({
      columns: [table.serverId],
      foreignColumns: [altarServers.id],
      name: "schedule_preferences_server_fk",
    }),
  }),
);

// ===========================================================================
// CELEBRAÇÕES E ESCALAS
// ===========================================================================

/** Celebração litúrgica ou atividade equivalente que demanda servidores. */
export const celebrations = pgTable(
  "celebrations",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    celebrationType: enumCol("celebrationType", CELEBRATION_TYPES).default("SUNDAY_MASS").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    startTime: time("startTime").notNull(),
    endTime: time("endTime").notNull(),
    location: varchar("location", { length: 180 }),
    notes: text("notes"),
    status: enumCol("status", CELEBRATION_STATUS).default("SCHEDULED").notNull(),
    createdByUserId: int("createdByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    parishDateIdx: index("celebrations_parish_date_idx").on(table.parishId, table.date),
    statusIdx: index("celebrations_status_idx").on(table.status),
    parishFk: foreignKey({
      columns: [table.parishId],
      foreignColumns: [parishes.id],
      name: "celebrations_parish_fk",
    }),
  }),
);

/** Quantidade de servidores necessária por função em uma celebração. */
export const celebrationRoleNeeds = pgTable(
  "celebration_role_needs",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    celebrationId: int("celebrationId").notNull(),
    parishRoleId: int("parishRoleId").notNull(),
    quantity: int("quantity").default(1).notNull(),
    requirements: text("requirements"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    uniqueNeed: uniqueIndex("celebration_role_needs_unique_idx").on(
      table.celebrationId,
      table.parishRoleId,
    ),
    parishIdx: index("celebration_role_needs_parish_idx").on(table.parishId),
    celebrationFk: foreignKey({
      columns: [table.celebrationId],
      foreignColumns: [celebrations.id],
      name: "celebration_role_needs_celebration_fk",
    }),
    roleFk: foreignKey({
      columns: [table.parishRoleId],
      foreignColumns: [parishRoles.id],
      name: "celebration_role_needs_role_fk",
    }),
  }),
);

/** Escala de uma celebração. Segue o fluxo de status até a publicação. */
export const schedules = pgTable(
  "schedules",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    celebrationId: int("celebrationId").notNull(),
    periodStart: date("periodStart", { mode: "string" }),
    periodEnd: date("periodEnd", { mode: "string" }),
    status: enumCol("status", SCHEDULE_STATUS).default("DRAFT").notNull(),
    source: enumCol("source", SCHEDULE_SOURCES).default("MANUAL").notNull(),
    aiRunId: int("aiRunId"),
    generatedByUserId: int("generatedByUserId"),
    approvedByUserId: int("approvedByUserId"),
    approvedAt: timestamp("approvedAt"),
    publishedAt: timestamp("publishedAt"),
    /** Controle de concorrência otimista e histórico de republicações. */
    version: int("version").default(1).notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    celebrationIdx: uniqueIndex("schedules_celebration_idx").on(table.celebrationId),
    parishIdx: index("schedules_parish_idx").on(table.parishId),
    statusIdx: index("schedules_status_idx").on(table.status),
    celebrationFk: foreignKey({
      columns: [table.celebrationId],
      foreignColumns: [celebrations.id],
      name: "schedules_celebration_fk",
    }),
  }),
);

/** Atribuição de um servidor a uma função dentro de uma escala. */
export const scheduleAssignments = pgTable(
  "schedule_assignments",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    scheduleId: int("scheduleId").notNull(),
    celebrationId: int("celebrationId").notNull(),
    serverId: int("serverId").notNull(),
    parishRoleId: int("parishRoleId").notNull(),
    status: enumCol("status", ASSIGNMENT_STATUS).default("PENDING").notNull(),
    assignmentSource: enumCol("assignmentSource", ASSIGNMENT_SOURCES).default("MANUAL").notNull(),
    /** Atribuição que substituiu esta, quando houve substituição. */
    replacedByAssignmentId: int("replacedByAssignmentId"),
    /** Atribuição original, quando esta é o resultado de uma substituição. */
    replacesAssignmentId: int("replacesAssignmentId"),
    notes: text("notes"),
    assignedByUserId: int("assignedByUserId"),
    assignedAt: timestamp("assignedAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    parishIdx: index("schedule_assignments_parish_idx").on(table.parishId),
    scheduleIdx: index("schedule_assignments_schedule_idx").on(table.scheduleId),
    serverIdx: index("schedule_assignments_server_idx").on(table.serverId),
    celebrationIdx: index("schedule_assignments_celebration_idx").on(table.celebrationId),
    statusIdx: index("schedule_assignments_status_idx").on(table.status),
    /**
     * Impede que o mesmo servidor seja atribuído duas vezes à mesma função na mesma
     * escala. Atribuições substituídas recebem `status = REPLACED`, o que mantém o
     * histórico; a checagem de duplicidade ativa é reforçada na camada de serviço.
     */
    uniqueAssignment: uniqueIndex("schedule_assignments_unique_idx").on(
      table.scheduleId,
      table.serverId,
      table.parishRoleId,
      table.assignedAt,
    ),
    scheduleFk: foreignKey({
      columns: [table.scheduleId],
      foreignColumns: [schedules.id],
      name: "schedule_assignments_schedule_fk",
    }),
    serverFk: foreignKey({
      columns: [table.serverId],
      foreignColumns: [altarServers.id],
      name: "schedule_assignments_server_fk",
    }),
    roleFk: foreignKey({
      columns: [table.parishRoleId],
      foreignColumns: [parishRoles.id],
      name: "schedule_assignments_role_fk",
    }),
  }),
);

/** Histórico append-only de confirmações. Nunca sobrescrito. */
export const confirmations = pgTable(
  "confirmations",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    assignmentId: int("assignmentId").notNull(),
    respondedByUserId: int("respondedByUserId"),
    respondedByServerId: int("respondedByServerId"),
    actorRole: enumCol("actorRole", ALL_ROLES).notNull(),
    status: enumCol("status", CONFIRMATION_STATUS).notNull(),
    reason: text("reason"),
    respondedAt: timestamp("respondedAt").defaultNow().notNull(),
  },
  table => ({
    parishIdx: index("confirmations_parish_idx").on(table.parishId),
    assignmentIdx: index("confirmations_assignment_idx").on(table.assignmentId),
    assignmentFk: foreignKey({
      columns: [table.assignmentId],
      foreignColumns: [scheduleAssignments.id],
      name: "confirmations_assignment_fk",
    }),
  }),
);

/** Conflito entre a resposta do responsável e a do servidor sobre a mesma atribuição. */
export const confirmationConflicts = pgTable(
  "confirmation_conflicts",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    assignmentId: int("assignmentId").notNull(),
    status: enumCol("status", CONFLICT_STATUS).default("OPEN").notNull(),
    detail: text("detail"),
    resolution: text("resolution"),
    resolvedByUserId: int("resolvedByUserId"),
    resolvedAt: timestamp("resolvedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    parishIdx: index("confirmation_conflicts_parish_idx").on(table.parishId),
    assignmentIdx: index("confirmation_conflicts_assignment_idx").on(table.assignmentId),
    statusIdx: index("confirmation_conflicts_status_idx").on(table.status),
    assignmentFk: foreignKey({
      columns: [table.assignmentId],
      foreignColumns: [scheduleAssignments.id],
      name: "confirmation_conflicts_assignment_fk",
    }),
  }),
);

/** Solicitação de substituição de um servidor escalado. */
export const substitutionRequests = pgTable(
  "substitution_requests",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    assignmentId: int("assignmentId").notNull(),
    requestedByUserId: int("requestedByUserId"),
    requestedByServerId: int("requestedByServerId"),
    reason: text("reason"),
    status: enumCol("status", SUBSTITUTION_STATUS).default("PENDING").notNull(),
    /** Substituto sugerido pelo solicitante ou definido na análise. */
    replacementServerId: int("replacementServerId"),
    reviewedByUserId: int("reviewedByUserId"),
    reviewNotes: text("reviewNotes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    resolvedAt: timestamp("resolvedAt"),
  },
  table => ({
    parishIdx: index("substitution_requests_parish_idx").on(table.parishId),
    assignmentIdx: index("substitution_requests_assignment_idx").on(table.assignmentId),
    statusIdx: index("substitution_requests_status_idx").on(table.status),
    assignmentFk: foreignKey({
      columns: [table.assignmentId],
      foreignColumns: [scheduleAssignments.id],
      name: "substitution_requests_assignment_fk",
    }),
  }),
);

/** Registro de presença ou ausência após a celebração. */
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    assignmentId: int("assignmentId").notNull(),
    status: enumCol("status", ATTENDANCE_STATUS).default("PENDING_REVIEW").notNull(),
    justification: text("justification"),
    registeredByUserId: int("registeredByUserId"),
    registeredAt: timestamp("registeredAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    assignmentIdx: uniqueIndex("attendance_records_assignment_idx").on(table.assignmentId),
    parishIdx: index("attendance_records_parish_idx").on(table.parishId),
    statusIdx: index("attendance_records_status_idx").on(table.status),
    assignmentFk: foreignKey({
      columns: [table.assignmentId],
      foreignColumns: [scheduleAssignments.id],
      name: "attendance_records_assignment_fk",
    }),
  }),
);

// ===========================================================================
// EVENTOS E VOLUNTARIADO
// ===========================================================================

/** Evento da paróquia: voluntariado, confraternização, retiro, encontro. */
export const events = pgTable(
  "events",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    description: text("description"),
    eventType: enumCol("eventType", EVENT_TYPES).default("FELLOWSHIP").notNull(),
    startAt: timestamp("startAt").notNull(),
    endAt: timestamp("endAt"),
    location: varchar("location", { length: 180 }),
    organizerNote: text("organizerNote"),
    registrationOpensAt: timestamp("registrationOpensAt"),
    registrationClosesAt: timestamp("registrationClosesAt"),
    participantLimit: int("participantLimit"),
    allowCompanions: boolean("allowCompanions").default(false).notNull(),
    maxCompanions: int("maxCompanions").default(0).notNull(),
    hasVolunteering: boolean("hasVolunteering").default(false).notNull(),
    status: enumCol("status", EVENT_STATUS).default("DRAFT").notNull(),
    createdByUserId: int("createdByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    parishIdx: index("events_parish_idx").on(table.parishId),
    startIdx: index("events_start_idx").on(table.startAt),
    statusIdx: index("events_status_idx").on(table.status),
    parishFk: foreignKey({
      columns: [table.parishId],
      foreignColumns: [parishes.id],
      name: "events_parish_fk",
    }),
  }),
);

/** Participação em evento. Acompanhantes registrados apenas como quantidade. */
export const eventParticipations = pgTable(
  "event_participations",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    eventId: int("eventId").notNull(),
    serverId: int("serverId"),
    responsibleId: int("responsibleId"),
    response: enumCol("response", PARTICIPATION_RESPONSES).default("REGISTERED").notNull(),
    companionsCount: int("companionsCount").default(0).notNull(),
    note: text("note"),
    respondedByUserId: int("respondedByUserId"),
    respondedByServerId: int("respondedByServerId"),
    respondedAt: timestamp("respondedAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    parishIdx: index("event_participations_parish_idx").on(table.parishId),
    eventServerIdx: uniqueIndex("event_participations_event_server_idx").on(
      table.eventId,
      table.serverId,
    ),
    eventIdx: index("event_participations_event_idx").on(table.eventId),
    /** Impede inscrição duplicada do mesmo responsável no mesmo evento. */
    eventResponsibleIdx: uniqueIndex("event_participations_event_responsible_idx").on(
      table.eventId,
      table.responsibleId,
    ),
    eventFk: foreignKey({
      columns: [table.eventId],
      foreignColumns: [events.id],
      name: "event_participations_event_fk",
    }),
  }),
);

/** Tarefa/atividade dentro de um evento (ex.: cozinha, recepção, limpeza). */
export const eventTasks = pgTable(
  "event_tasks",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    eventId: int("eventId").notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    description: text("description"),
    requirements: text("requirements"),
    status: enumCol("status", GENERIC_STATUS).default("ACTIVE").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    parishIdx: index("event_tasks_parish_idx").on(table.parishId),
    eventIdx: index("event_tasks_event_idx").on(table.eventId),
    eventFk: foreignKey({
      columns: [table.eventId],
      foreignColumns: [events.id],
      name: "event_tasks_event_fk",
    }),
  }),
);

/** Turno de uma tarefa de evento, com número de vagas. */
export const eventShifts = pgTable(
  "event_shifts",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    eventId: int("eventId").notNull(),
    eventTaskId: int("eventTaskId").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    startTime: time("startTime").notNull(),
    endTime: time("endTime").notNull(),
    slots: int("slots").default(1).notNull(),
    notes: text("notes"),
    status: enumCol("status", GENERIC_STATUS).default("ACTIVE").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    parishIdx: index("event_shifts_parish_idx").on(table.parishId),
    taskIdx: index("event_shifts_task_idx").on(table.eventTaskId),
    eventIdx: index("event_shifts_event_idx").on(table.eventId),
    taskFk: foreignKey({
      columns: [table.eventTaskId],
      foreignColumns: [eventTasks.id],
      name: "event_shifts_task_fk",
    }),
    eventFk: foreignKey({
      columns: [table.eventId],
      foreignColumns: [events.id],
      name: "event_shifts_event_fk",
    }),
  }),
);

/** Manifestação de interesse em voluntariado. Não é alocação nem obrigação. */
export const volunteerInterests = pgTable(
  "volunteer_interests",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    eventId: int("eventId").notNull(),
    eventShiftId: int("eventShiftId"),
    eventTaskId: int("eventTaskId"),
    serverId: int("serverId"),
    responsibleId: int("responsibleId"),
    availabilityNote: text("availabilityNote"),
    status: enumCol("status", INTEREST_STATUS).default("INTERESTED").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    parishIdx: index("volunteer_interests_parish_idx").on(table.parishId),
    shiftIdx: index("volunteer_interests_shift_idx").on(table.eventShiftId),
    serverIdx: index("volunteer_interests_server_idx").on(table.serverId),
    /** Impede manifestação de interesse duplicada do mesmo servidor no mesmo turno. */
    uniqueShiftServer: uniqueIndex("volunteer_interests_shift_server_idx").on(
      table.eventShiftId,
      table.serverId,
    ),
    eventFk: foreignKey({
      columns: [table.eventId],
      foreignColumns: [events.id],
      name: "volunteer_interests_event_fk",
    }),
  }),
);

/** Alocação efetiva de um voluntário em um turno, sempre validada por humano. */
export const eventShiftAssignments = pgTable(
  "event_shift_assignments",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    eventId: int("eventId").notNull(),
    eventShiftId: int("eventShiftId").notNull(),
    serverId: int("serverId"),
    responsibleId: int("responsibleId"),
    source: enumCol("source", SCHEDULE_SOURCES).default("MANUAL").notNull(),
    status: enumCol("status", SHIFT_ASSIGNMENT_STATUS).default("ASSIGNED").notNull(),
    approvedByUserId: int("approvedByUserId"),
    assignedAt: timestamp("assignedAt").defaultNow().notNull(),
    confirmedAt: timestamp("confirmedAt"),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    parishIdx: index("event_shift_assignments_parish_idx").on(table.parishId),
    shiftIdx: index("event_shift_assignments_shift_idx").on(table.eventShiftId),
    serverIdx: index("event_shift_assignments_server_idx").on(table.serverId),
    /** Impede alocação duplicada do mesmo servidor no mesmo turno. */
    uniqueShiftServer: uniqueIndex("event_shift_assignments_shift_server_idx").on(
      table.eventShiftId,
      table.serverId,
    ),
    shiftFk: foreignKey({
      columns: [table.eventShiftId],
      foreignColumns: [eventShifts.id],
      name: "event_shift_assignments_shift_fk",
    }),
  }),
);

// ===========================================================================
// GAMIFICAÇÃO
// ===========================================================================

/** Configuração de gamificação da paróquia. Penalidades e ranking de menores off por padrão. */
export const gamificationSettings = pgTable(
  "gamification_settings",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    /** Penalização por ausência: desabilitada por padrão. */
    penaltiesEnabled: boolean("penaltiesEnabled").default(false).notNull(),
    rankingEnabled: boolean("rankingEnabled").default(false).notNull(),
    /** Ranking de menores: desabilitado por padrão. */
    minorsRankingEnabled: boolean("minorsRankingEnabled").default(false).notNull(),
    historyEnabled: boolean("historyEnabled").default(true).notNull(),
    /** Horas de antecedência para considerar a confirmação como antecipada. */
    earlyConfirmationHours: int("earlyConfirmationHours").default(48).notNull(),
    updatedByUserId: int("updatedByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    parishIdx: uniqueIndex("gamification_settings_parish_idx").on(table.parishId),
    parishFk: foreignKey({
      columns: [table.parishId],
      foreignColumns: [parishes.id],
      name: "gamification_settings_parish_fk",
    }),
  }),
);

/** Regra de pontuação configurável por paróquia. */
export const pointRules = pgTable(
  "point_rules",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    eventType: enumCol("eventType", POINT_EVENT_TYPES).notNull(),
    points: int("points").default(0).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    description: text("description"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    uniqueRule: uniqueIndex("point_rules_unique_idx").on(table.parishId, table.eventType),
    parishFk: foreignKey({
      columns: [table.parishId],
      foreignColumns: [parishes.id],
      name: "point_rules_parish_fk",
    }),
  }),
);

/**
 * Transação de pontos. Append-only e idempotente por referência.
 * O saldo do servidor é SEMPRE derivado da soma destas transações.
 */
export const pointTransactions = pgTable(
  "point_transactions",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    serverId: int("serverId").notNull(),
    eventType: enumCol("eventType", POINT_EVENT_TYPES).notNull(),
    pointsDelta: int("pointsDelta").notNull(),
    referenceType: varchar("referenceType", { length: 60 }).notNull(),
    referenceId: int("referenceId"),
    /** Chave de idempotência derivada de tipo + referência + ator. */
    idempotencyKey: varchar("idempotencyKey", { length: 180 }).notNull(),
    reason: text("reason"),
    createdByUserId: int("createdByUserId"),
    isReversal: boolean("isReversal").default(false).notNull(),
    reversesTransactionId: int("reversesTransactionId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    idempotencyIdx: uniqueIndex("point_transactions_idempotency_idx").on(table.idempotencyKey),
    parishIdx: index("point_transactions_parish_idx").on(table.parishId),
    serverIdx: index("point_transactions_server_idx").on(table.serverId),
    createdIdx: index("point_transactions_created_idx").on(table.createdAt),
    serverFk: foreignKey({
      columns: [table.serverId],
      foreignColumns: [altarServers.id],
      name: "point_transactions_server_fk",
    }),
  }),
);

/** Catálogo de conquistas da paróquia. */
export const achievements = pgTable(
  "achievements",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    name: varchar("name", { length: 140 }).notNull(),
    description: text("description"),
    criteriaKind: enumCol("criteriaKind", ACHIEVEMENT_CRITERIA_KINDS).default("MANUAL_ONLY").notNull(),
    threshold: int("threshold").default(1).notNull(),
    status: enumCol("status", GENERIC_STATUS).default("ACTIVE").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  table => ({
    uniqueName: uniqueIndex("achievements_unique_idx").on(table.parishId, table.name),
    parishFk: foreignKey({
      columns: [table.parishId],
      foreignColumns: [parishes.id],
      name: "achievements_parish_fk",
    }),
  }),
);

/** Conquista concedida a um servidor. */
export const serverAchievements = pgTable(
  "server_achievements",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    serverId: int("serverId").notNull(),
    achievementId: int("achievementId").notNull(),
    source: enumCol("source", ACHIEVEMENT_SOURCES).default("AUTOMATIC").notNull(),
    reason: text("reason"),
    grantedByUserId: int("grantedByUserId"),
    grantedAt: timestamp("grantedAt").defaultNow().notNull(),
  },
  table => ({
    uniqueGrant: uniqueIndex("server_achievements_unique_idx").on(
      table.serverId,
      table.achievementId,
    ),
    parishIdx: index("server_achievements_parish_idx").on(table.parishId),
    serverFk: foreignKey({
      columns: [table.serverId],
      foreignColumns: [altarServers.id],
      name: "server_achievements_server_fk",
    }),
    achievementFk: foreignKey({
      columns: [table.achievementId],
      foreignColumns: [achievements.id],
      name: "server_achievements_achievement_fk",
    }),
  }),
);

// ===========================================================================
// INTELIGÊNCIA ARTIFICIAL
// ===========================================================================

/** Execução do assistente de escala. Rastreável e auditável. */
export const aiScheduleRuns = pgTable(
  "ai_schedule_runs",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    requestedByUserId: int("requestedByUserId").notNull(),
    periodStart: date("periodStart", { mode: "string" }).notNull(),
    periodEnd: date("periodEnd", { mode: "string" }).notNull(),
    status: enumCol("status", AI_RUN_STATUS).default("RUNNING").notNull(),
    priorityMode: enumCol("priorityMode", AI_PRIORITY_MODES).default("BALANCED").notNull(),
    modelIdentifier: varchar("modelIdentifier", { length: 120 }),
    engineVersion: varchar("engineVersion", { length: 40 }),
    /** Snapshot pseudonimizado enviado ao modelo. Sem PIN, contatos ou nomes de pais. */
    inputSnapshot: json("inputSnapshot"),
    /** Restrições humanas: servidores fixados e bloqueados. */
    constraints: json("constraints"),
    /** Indicadores de qualidade da proposta. */
    metrics: json("metrics"),
    /** Justificativa textual global apresentada ao coordenador. */
    summary: text("summary"),
    errorMessage: text("errorMessage"),
    appliedAt: timestamp("appliedAt"),
    appliedByUserId: int("appliedByUserId"),
    discardedAt: timestamp("discardedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => ({
    parishIdx: index("ai_schedule_runs_parish_idx").on(table.parishId),
    statusIdx: index("ai_schedule_runs_status_idx").on(table.status),
    periodIdx: index("ai_schedule_runs_period_idx").on(table.periodStart, table.periodEnd),
    parishFk: foreignKey({
      columns: [table.parishId],
      foreignColumns: [parishes.id],
      name: "ai_schedule_runs_parish_fk",
    }),
  }),
);

/** Item da proposta gerada pela IA. Imutável: nunca alterado por edição humana. */
export const aiScheduleProposals = pgTable(
  "ai_schedule_proposals",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    runId: int("runId").notNull(),
    celebrationId: int("celebrationId").notNull(),
    parishRoleId: int("parishRoleId").notNull(),
    serverId: int("serverId"),
    slotIndex: int("slotIndex").default(0).notNull(),
    justification: text("justification"),
    /** Indicador de confiança de 0 a 100. */
    confidence: int("confidence"),
    isUnfilled: boolean("isUnfilled").default(false).notNull(),
    conflictReason: text("conflictReason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    parishIdx: index("ai_schedule_proposals_parish_idx").on(table.parishId),
    runIdx: index("ai_schedule_proposals_run_idx").on(table.runId),
    celebrationIdx: index("ai_schedule_proposals_celebration_idx").on(table.celebrationId),
    runFk: foreignKey({
      columns: [table.runId],
      foreignColumns: [aiScheduleRuns.id],
      name: "ai_schedule_proposals_run_fk",
    }),
  }),
);

/** Conflito ou alerta detectado na proposta da IA. */
export const aiProposalConflicts = pgTable(
  "ai_proposal_conflicts",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    runId: int("runId").notNull(),
    celebrationId: int("celebrationId"),
    parishRoleId: int("parishRoleId"),
    severity: enumCol("severity", CONFLICT_SEVERITY).default("WARNING").notNull(),
    code: varchar("code", { length: 60 }),
    message: text("message").notNull(),
    suggestion: text("suggestion"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    runIdx: index("ai_proposal_conflicts_run_idx").on(table.runId),
    parishIdx: index("ai_proposal_conflicts_parish_idx").on(table.parishId),
    runFk: foreignKey({
      columns: [table.runId],
      foreignColumns: [aiScheduleRuns.id],
      name: "ai_proposal_conflicts_run_fk",
    }),
  }),
);

// ===========================================================================
// NOTIFICAÇÕES E AUDITORIA
// ===========================================================================

/** Notificação in-app. Falha de envio nunca invalida a operação principal. */
export const notifications = pgTable(
  "notifications",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId").notNull(),
    userId: int("userId"),
    serverId: int("serverId"),
    type: enumCol("type", NOTIFICATION_TYPES).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body"),
    status: enumCol("status", NOTIFICATION_STATUS).default("PENDING").notNull(),
    referenceType: varchar("referenceType", { length: 60 }),
    referenceId: int("referenceId"),
    /** Rota interna para ação direta. */
    actionPath: varchar("actionPath", { length: 200 }),
    sentAt: timestamp("sentAt"),
    readAt: timestamp("readAt"),
    failureReason: text("failureReason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    parishIdx: index("notifications_parish_idx").on(table.parishId),
    userIdx: index("notifications_user_idx").on(table.userId),
    serverIdx: index("notifications_server_idx").on(table.serverId),
    statusIdx: index("notifications_status_idx").on(table.status),
    parishFk: foreignKey({
      columns: [table.parishId],
      foreignColumns: [parishes.id],
      name: "notifications_parish_fk",
    }),
  }),
);

/** Trilha de auditoria append-only. Nunca contém PIN, senhas ou segredos. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: int("id").generatedAlwaysAsIdentity().primaryKey(),
    parishId: int("parishId"),
    actorUserId: int("actorUserId"),
    actorServerId: int("actorServerId"),
    actorRole: enumCol("actorRole", ALL_ROLES),
    actorLabel: varchar("actorLabel", { length: 180 }),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entityType", { length: 60 }),
    entityId: int("entityId"),
    /** Metadados higienizados. Segredos são removidos antes da gravação. */
    metadata: json("metadata"),
    result: varchar("result", { length: 20 }).default("SUCCESS").notNull(),
    ip: varchar("ip", { length: 64 }),
    userAgent: varchar("userAgent", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    parishIdx: index("audit_logs_parish_idx").on(table.parishId),
    actorIdx: index("audit_logs_actor_idx").on(table.actorUserId),
    actionIdx: index("audit_logs_action_idx").on(table.action),
    createdIdx: index("audit_logs_created_idx").on(table.createdAt),
  }),
);

// ===========================================================================
// TIPOS INFERIDOS
// ===========================================================================

export type Parish = typeof parishes.$inferSelect;
export type InsertParish = typeof parishes.$inferInsert;
export type ParishMember = typeof parishMembers.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Responsible = typeof responsibles.$inferSelect;
export type AltarServer = typeof altarServers.$inferSelect;
export type ServerAccess = typeof serverAccess.$inferSelect;
export type FamilyLink = typeof familyLinks.$inferSelect;
export type ParishRole = typeof parishRoles.$inferSelect;
export type ServerRole = typeof serverRoles.$inferSelect;
export type Formation = typeof formations.$inferSelect;
export type Availability = typeof availabilities.$inferSelect;
export type AvailabilityException = typeof availabilityExceptions.$inferSelect;
export type Vacation = typeof vacations.$inferSelect;
export type SchedulePreference = typeof schedulePreferences.$inferSelect;
export type Celebration = typeof celebrations.$inferSelect;
export type CelebrationRoleNeed = typeof celebrationRoleNeeds.$inferSelect;
export type Schedule = typeof schedules.$inferSelect;
export type ScheduleAssignment = typeof scheduleAssignments.$inferSelect;
export type Confirmation = typeof confirmations.$inferSelect;
export type ConfirmationConflict = typeof confirmationConflicts.$inferSelect;
export type SubstitutionRequest = typeof substitutionRequests.$inferSelect;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type ParishEvent = typeof events.$inferSelect;
export type EventParticipation = typeof eventParticipations.$inferSelect;
export type EventTask = typeof eventTasks.$inferSelect;
export type EventShift = typeof eventShifts.$inferSelect;
export type VolunteerInterest = typeof volunteerInterests.$inferSelect;
export type EventShiftAssignment = typeof eventShiftAssignments.$inferSelect;
export type GamificationSettings = typeof gamificationSettings.$inferSelect;
export type PointRule = typeof pointRules.$inferSelect;
export type PointTransaction = typeof pointTransactions.$inferSelect;
export type Achievement = typeof achievements.$inferSelect;
export type ServerAchievement = typeof serverAchievements.$inferSelect;
export type AiScheduleRun = typeof aiScheduleRuns.$inferSelect;
export type AiScheduleProposal = typeof aiScheduleProposals.$inferSelect;
export type AiProposalConflict = typeof aiProposalConflicts.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;

// ===========================================================================
// RELACIONAMENTOS (para queries relacionais do Drizzle)
// ===========================================================================

export const parishRelations = relations(parishes, ({ many }) => ({
  members: many(parishMembers),
  servers: many(altarServers),
  responsibles: many(responsibles),
  roles: many(parishRoles),
  celebrations: many(celebrations),
  events: many(events),
}));

export const altarServerRelations = relations(altarServers, ({ one, many }) => ({
  parish: one(parishes, { fields: [altarServers.parishId], references: [parishes.id] }),
  access: one(serverAccess, { fields: [altarServers.id], references: [serverAccess.serverId] }),
  familyLinks: many(familyLinks),
  roles: many(serverRoles),
  availabilities: many(availabilities),
  assignments: many(scheduleAssignments),
}));

export const responsibleRelations = relations(responsibles, ({ one, many }) => ({
  parish: one(parishes, { fields: [responsibles.parishId], references: [parishes.id] }),
  user: one(users, { fields: [responsibles.userId], references: [users.id] }),
  familyLinks: many(familyLinks),
}));

export const familyLinkRelations = relations(familyLinks, ({ one }) => ({
  responsible: one(responsibles, {
    fields: [familyLinks.responsibleId],
    references: [responsibles.id],
  }),
  server: one(altarServers, { fields: [familyLinks.serverId], references: [altarServers.id] }),
}));

export const celebrationRelations = relations(celebrations, ({ one, many }) => ({
  parish: one(parishes, { fields: [celebrations.parishId], references: [parishes.id] }),
  needs: many(celebrationRoleNeeds),
  schedule: one(schedules, { fields: [celebrations.id], references: [schedules.celebrationId] }),
}));

export const scheduleRelations = relations(schedules, ({ one, many }) => ({
  celebration: one(celebrations, {
    fields: [schedules.celebrationId],
    references: [celebrations.id],
  }),
  assignments: many(scheduleAssignments),
}));

export const scheduleAssignmentRelations = relations(scheduleAssignments, ({ one, many }) => ({
  schedule: one(schedules, { fields: [scheduleAssignments.scheduleId], references: [schedules.id] }),
  celebration: one(celebrations, {
    fields: [scheduleAssignments.celebrationId],
    references: [celebrations.id],
  }),
  server: one(altarServers, {
    fields: [scheduleAssignments.serverId],
    references: [altarServers.id],
  }),
  role: one(parishRoles, {
    fields: [scheduleAssignments.parishRoleId],
    references: [parishRoles.id],
  }),
  confirmations: many(confirmations),
  attendance: one(attendanceRecords, {
    fields: [scheduleAssignments.id],
    references: [attendanceRecords.assignmentId],
  }),
}));

export const eventRelations = relations(events, ({ one, many }) => ({
  parish: one(parishes, { fields: [events.parishId], references: [parishes.id] }),
  participations: many(eventParticipations),
  tasks: many(eventTasks),
  shifts: many(eventShifts),
}));

export const eventShiftRelations = relations(eventShifts, ({ one, many }) => ({
  event: one(events, { fields: [eventShifts.eventId], references: [events.id] }),
  task: one(eventTasks, { fields: [eventShifts.eventTaskId], references: [eventTasks.id] }),
  interests: many(volunteerInterests),
  assignments: many(eventShiftAssignments),
}));
