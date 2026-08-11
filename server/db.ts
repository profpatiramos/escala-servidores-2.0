/**
 * Camada de acesso ao banco.
 *
 * Regra de isolamento: TODA consulta a dados operacionais precisa filtrar por
 * `parishId`. Os helpers deste arquivo recebem sempre o `parishId` derivado do
 * contexto autenticado, nunca de entrada do cliente.
 */
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import { InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

type Database = ReturnType<typeof drizzle>;

let _db: Database | null = null;

/** Instancia o Drizzle de forma lazy para permitir tooling sem banco. */
export async function getDb(): Promise<Database | null> {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Falha ao conectar:", error);
      _db = null;
    }
  }
  return _db;
}

/** Igual a `getDb`, mas lança erro quando o banco não está disponível. */
export async function getDbOrThrow(): Promise<Database> {
  const db = await getDb();
  if (!db) {
    throw new Error("Banco de dados indisponível.");
  }
  return db;
}

/**
 * Upsert do usuário vindo do Manus OAuth.
 * O dono do projeto é promovido automaticamente a administrador da plataforma.
 */
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("openId é obrigatório para o upsert do usuário.");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Upsert ignorado: banco indisponível.");
    return;
  }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }

  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  // O dono do projeto é o SUPER_ADMIN da plataforma.
  if (user.openId === ENV.ownerOpenId) {
    values.isPlatformAdmin = true;
    updateSet.isPlatformAdmin = true;
  }

  if (!values.lastSignedIn) {
    values.lastSignedIn = new Date();
  }

  if (Object.keys(updateSet).length === 0) {
    updateSet.lastSignedIn = new Date();
  }

  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Helper de escopo: monta a cláusula que combina o filtro de paróquia com
 * condições adicionais. Garante que nenhuma consulta escape do tenant.
 */
export function scoped<T extends { parishId: unknown }>(
  table: T,
  parishId: number,
  ...conditions: Array<ReturnType<typeof eq> | undefined>
) {
  const parishCondition = eq(table.parishId as never, parishId);
  const extra = conditions.filter(Boolean);
  return extra.length > 0 ? and(parishCondition, ...extra) : parishCondition;
}
