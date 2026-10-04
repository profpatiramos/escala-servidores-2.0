import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { rootCertificates } from "node:tls";
import { Client } from "pg";
import { normalizeDatabaseUrl } from "../server/database-config";

const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
const literal = (s: string) => "'" + s.replaceAll("'", "''") + "'";
const folder = path.resolve("drizzle/migrations");
const journal = JSON.parse(
  fs.readFileSync(path.join(folder, "meta/_journal.json"), "utf8")
);
const first = journal.entries[0];
const snapshot = JSON.parse(
  fs.readFileSync(path.join(folder, "meta/0000_snapshot.json"), "utf8")
);
const sql = fs.readFileSync(path.join(folder, first.tag + ".sql"), "utf8");
const hash = createHash("sha256").update(sql).digest("hex");
const expectedTables = Object.values(snapshot.tables) as any[];
const expectedEnums = Object.values(snapshot.enums) as any[];

export function databaseUrl(raw = process.env.DATABASE_URL): string {
  return normalizeDatabaseUrl(raw);
}

export function backup(url: string): string {
  const u = new URL(url);
  const directory = path.resolve(process.env.BACKUP_DIR || "../backups");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(
    directory,
    `escala-${new Date().toISOString().replaceAll(":", "-")}.dump`
  );
  const ca = path.join(directory, "root-certificates.pem");
  fs.writeFileSync(ca, rootCertificates.join("\n"));
  const exe =
    process.env.PG_DUMP ||
    (process.platform === "win32"
      ? "C:/Program Files/PostgreSQL/18/bin/pg_dump.exe"
      : "pg_dump");
  const result = spawnSync(exe, ["--format=custom", "--file", file], {
    encoding: "utf8",
    env: {
      ...process.env,
      PGHOST: u.hostname,
      PGPORT: u.port || "5432",
      PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
      PGUSER: decodeURIComponent(u.username),
      PGPASSWORD: decodeURIComponent(u.password),
      PGSSLMODE: u.hostname.endsWith(".neon.tech")
        ? "verify-full"
        : u.searchParams.get("sslmode") || "prefer",
      PGSSLROOTCERT: ca,
    },
  });
  if (result.status !== 0 || !fs.existsSync(file) || !fs.statSync(file).size)
    throw new Error(
      "Backup falhou; nenhuma recuperação foi aplicada. Confira PG_DUMP e acesso ao banco."
    );
  console.log("Backup:", file);
  return file;
}

export async function inspect(client: Client) {
  const tables = (
    await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
    )
  ).rows.map(r => r.table_name as string);
  const columns = (
    await client.query(
      "SELECT c.relname AS table_name,a.attname AS column_name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null,a.attidentity AS identity,pg_get_expr(d.adbin,d.adrelid) AS default FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum"
    )
  ).rows;
  const enums = (
    await client.query(
      "SELECT t.typname, json_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' GROUP BY t.typname"
    )
  ).rows;
  const constraints = (
    await client.query(
      "SELECT c.relname AS table_name,con.conname,pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'"
    )
  ).rows;
  const indexes = (
    await client.query(
      "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public'"
    )
  ).rows;
  return { tables, columns, enums, constraints, indexes };
}

function normalizedType(s: string) {
  return s
    .replaceAll("character varying", "varchar")
    .replace("timestamp without time zone", "timestamp")
    .replace("time without time zone", "time")
    .replaceAll('"', "")
    .replace(/^public\./, "");
}

function canonical(s: string) {
  return s
    .replaceAll('"', "")
    .replaceAll("public.", "")
    .replace(/\s+/g, "")
    .toLowerCase();
}
function defaultValue(value: unknown) {
  return value == null
    ? ""
    : String(value)
        .replace(/::[\w\s."]+$/, "")
        .replace(/^\((.*)\)$/, "$1");
}

export function schemaDrift(
  actual: Awaited<ReturnType<typeof inspect>>
): string[] {
  const differences: string[] = [];
  for (const e of expectedEnums) {
    const a = actual.enums.find(a => a.typname === e.name);
    if (!a || JSON.stringify(a.labels) !== JSON.stringify(e.values))
      differences.push(`enum:${e.name}`);
  }
  for (const t of expectedTables) {
    if (!actual.tables.includes(t.name)) {
      differences.push(`table:${t.name}`);
      continue;
    }
    for (const c of Object.values(t.columns) as any[]) {
      const a = actual.columns.find(
        a => a.table_name === t.name && a.column_name === c.name
      );
      if (
        !a ||
        normalizedType(a.type) !== normalizedType(c.type) ||
        a.not_null !== c.notNull ||
        a.identity !==
          (c.identity?.type === "always" ? "a" : c.identity ? "d" : "") ||
        defaultValue(a.default) !== defaultValue(c.default)
      )
        differences.push(`column:${t.name}.${c.name}`);
      if (
        c.primaryKey &&
        !actual.constraints.some(
          k =>
            k.table_name === t.name &&
            canonical(k.definition) === canonical(`PRIMARY KEY (${c.name})`)
        )
      )
        differences.push(`pk:${t.name}.${c.name}`);
    }
    for (const index of Object.values(t.indexes) as any[]) {
      const a = actual.indexes.find(a => a.indexname === index.name);
      const expected = `CREATE ${index.isUnique ? "UNIQUE " : ""}INDEX ${index.name} ON ${t.name} USING ${index.method} (${index.columns.map((c: any) => c.expression).join(",")})`;
      if (!a || canonical(a.indexdef) !== canonical(expected))
        differences.push(`index:${index.name}`);
    }
    for (const fk of Object.values(t.foreignKeys) as any[]) {
      const a = actual.constraints.find(
        a => a.table_name === t.name && a.conname === fk.name
      );
      const expected =
        `FOREIGN KEY (${fk.columnsFrom.join(",")}) REFERENCES ${fk.tableTo}(${fk.columnsTo.join(",")})` +
        (fk.onUpdate !== "no action" ? ` ON UPDATE ${fk.onUpdate}` : "") +
        (fk.onDelete !== "no action" ? ` ON DELETE ${fk.onDelete}` : "");
      if (!a || canonical(a.definition) !== canonical(expected))
        differences.push(`fk:${fk.name}`);
    }
  }
  return differences;
}

export async function repair(client: Client) {
  await client.query("BEGIN");
  try {
    await client.query(
      "SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'; SELECT pg_advisory_xact_lock(76429183)"
    );
    const before = await inspect(client);
    // Never infer a destructive change from an unknown schema or journal.
    const logExists = (
      await client.query(
        "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present"
      )
    ).rows[0].present;
    if (logExists) {
      const records = (
        await client.query(
          "SELECT hash,created_at FROM drizzle.__drizzle_migrations"
        )
      ).rows;
      if (records.some(r => r.hash !== hash))
        throw new Error(
          "Histórico de migrations desconhecido. Reconcilie-o antes de recuperar."
        );
    }
    for (const e of expectedEnums) {
      const existing = before.enums.find(r => r.typname === e.name);
      if (
        existing &&
        JSON.stringify(existing.labels) !== JSON.stringify(e.values)
      )
        throw new Error(
          `Valores divergentes no enum ${e.name}; recuperação interrompida.`
        );
    }
    const conversions: string[] = [];
    for (const t of expectedTables.filter(t =>
      before.tables.includes(t.name)
    )) {
      const actual = before.columns.filter(c => c.table_name === t.name);
      const expected = Object.values(t.columns) as any[];
      if (actual.length !== expected.length)
        throw new Error(
          `Colunas divergentes em ${t.name}; nenhuma alteração aplicada.`
        );
      for (const c of expected) {
        const a = actual.find(a => a.column_name === c.name);
        if (!a || a.not_null !== c.notNull || !!a.identity !== !!c.identity)
          throw new Error(`Estrutura divergente em ${t.name}.${c.name}.`);
        if (normalizedType(a.type) !== normalizedType(c.type)) {
          const e = expectedEnums.find(e => e.name === c.type);
          if (!e || !before.enums.some(e => e.typname === a.type))
            throw new Error(`Tipo incompatível em ${t.name}.${c.name}.`);
          const qtable = `public.${quote(t.name)}`,
            qcol = quote(c.name),
            qtype = `public.${quote(e.name)}`;
          const invalid = await client.query(
            `SELECT count(*)::int AS n FROM ${qtable} WHERE ${qcol} IS NOT NULL AND ${qcol}::text NOT IN (${e.values.map(literal).join(",")})`
          );
          if (invalid.rows[0].n)
            throw new Error(`Valores incompatíveis em ${t.name}.${c.name}.`);
          conversions.push(
            `ALTER TABLE ${qtable} ALTER COLUMN ${qcol} DROP DEFAULT; ALTER TABLE ${qtable} ALTER COLUMN ${qcol} TYPE ${qtype} USING ${qcol}::text::${qtype};` +
              (c.default !== undefined
                ? ` ALTER TABLE ${qtable} ALTER COLUMN ${qcol} SET DEFAULT ${c.default}::${qtype};`
                : "")
          );
        }
      }
    }
    const parts = sql
      .split("--> statement-breakpoint")
      .map(s => s.trim())
      .filter(Boolean);
    for (const part of parts.filter(s => s.startsWith("CREATE TYPE"))) {
      const name = part.match(/CREATE TYPE "public"\."([^"]+)"/)?.[1];
      if (!name) throw new Error("SQL de enum não reconhecido.");
      if (!before.enums.some(e => e.typname === name)) await client.query(part);
    }
    for (const change of conversions) await client.query(change);
    for (const part of parts.filter(s => s.startsWith("CREATE TABLE"))) {
      const name = part.match(/CREATE TABLE "([^"]+)"/)?.[1];
      if (!name) throw new Error("SQL de tabela não reconhecido.");
      if (!before.tables.includes(name)) await client.query(part);
    }
    for (const part of parts.filter(
      s => !s.startsWith("CREATE TYPE") && !s.startsWith("CREATE TABLE")
    )) {
      const constraint = part.match(
        /ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)"/
      );
      const index = part.match(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/);
      if (
        constraint &&
        before.constraints.some(
          c => c.table_name === constraint[1] && c.conname === constraint[2]
        )
      )
        continue;
      if (index && before.indexes.some(i => i.indexname === index[1])) continue;
      if (!constraint && !index)
        throw new Error("SQL não reconhecido; recuperação interrompida.");
      await client.query(part);
    }
    await client.query(
      "CREATE SCHEMA IF NOT EXISTS drizzle; CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)"
    );
    await client.query(
      "INSERT INTO drizzle.__drizzle_migrations(hash,created_at) SELECT $1,$2 WHERE NOT EXISTS(SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash=$1)",
      [hash, first.when]
    );
    const after = await inspect(client);
    const drift = schemaDrift(after);
    if (drift.length)
      throw new Error(
        `Estrutura divergente: ${drift.slice(0, 5).join(", ")}. Nenhuma alteração confirmada.`
      );
    await client.query("COMMIT");
    return { before, after, convertedEnums: conversions.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const command = process.argv[2];
  if (!["audit", "backup", "repair"].includes(command))
    throw new Error("Use audit, backup ou repair.");
  const url = databaseUrl();
  if (command === "backup") {
    backup(url);
    return;
  }
  if (command === "repair") backup(url);
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 15000,
  });
  try {
    await client.connect();
    const result =
      command === "repair" ? await repair(client) : await inspect(client);
    fs.mkdirSync("audit", { recursive: true });
    const file = `audit/database-${command}.json`;
    fs.writeFileSync(file, JSON.stringify(result, null, 2));
    const actual =
      command === "repair"
        ? (result as Awaited<ReturnType<typeof repair>>).after
        : (result as Awaited<ReturnType<typeof inspect>>);
    const drift = schemaDrift(actual);
    fs.writeFileSync(
      "audit/schema-validation.json",
      JSON.stringify(
        { tables: actual.tables.length, enums: actual.enums.length, drift },
        null,
        2
      )
    );
    if (drift.length)
      throw new Error(
        `Schema divergente (${drift.length}); confira audit/schema-validation.json.`
      );
    console.log("Verificação concluída:", file);
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith("database.ts"))
  main().catch(error => {
    // Driver messages can include row data and credentials; only controlled messages are shown.
    console.error(
      "Operação interrompida:",
      error instanceof Error && !("code" in error)
        ? error.message
        : "Falha PostgreSQL; consulte a estrutura e os dados antes de tentar novamente."
    );
    process.exitCode = 1;
  });
