import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { Client } from "pg";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";
import { closeDb } from "../server/db";
import { SESSION_COOKIE } from "../shared/const";
import { repair } from "./database";

async function main() {
  const u = new URL(process.env.DATABASE_URL!);
  if (
    !["localhost", "127.0.0.1"].includes(u.hostname) ||
    !u.pathname.includes("escala_")
  )
    throw new Error("Este teste exige um banco local de teste.");
  const client = new Client({ connectionString: u.toString() });
  await client.connect();
  const suffix = randomBytes(6).toString("hex");
  const password = randomBytes(24).toString("base64url") + "Aa9!";
  const email = `admin-${suffix}@example.test`;
  try {
    const child = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/create-platform-admin.ts"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          SUPER_ADMIN_EMAIL: email,
          SUPER_ADMIN_NAME: "Administrador de teste",
          SUPER_ADMIN_PASSWORD: password,
        },
      }
    );
    assert.equal(child.status, 0, "CLI admin:create deve concluir");
    const [admin] = (
      await client.query(
        'SELECT "isPlatformAdmin",status FROM users WHERE email=$1',
        [email]
      )
    ).rows;
    assert.equal(admin.isPlatformAdmin, true);
    let cookie = "";
    let options: any;
    const req: any = { headers: {}, protocol: "http", ip: "127.0.0.1" };
    const res: any = {
      cookie(name: string, value: string, opt: any) {
        assert.equal(name, SESSION_COOKIE);
        cookie = value;
        options = opt;
      },
      clearCookie() {},
    };
    const anon = appRouter.createCaller({ req, res, user: null, actor: null });
    await assert.rejects(() => anon.parishes.list());
    await assert.rejects(() =>
      anon.access.loginWithPassword({ email, password: "senha errada" })
    );
    const login = await anon.access.loginWithPassword({ email, password });
    assert.equal(login.role, "SUPER_ADMIN");
    assert.equal(options.httpOnly, true);
    assert.equal(options.sameSite, "lax");
    assert.equal(options.secure, false);
    req.headers.cookie = `${SESSION_COOKIE}=${cookie}`;
    const context = await createContext({ req, res } as Parameters<
      typeof createContext
    >[0]);
    const root = appRouter.createCaller(context);
    assert.equal((await root.access.session())?.role, "SUPER_ADMIN");
    const parish = await root.parishes.create({
      name: `Paróquia Teste ${suffix}`,
      adminName: "Administrador paroquial",
      adminEmail: `parish-${suffix}@example.test`,
      adminPassword: password,
    });
    assert.ok(
      (await root.parishes.list()).some(
        p => p.id === parish.id && p.status === "INACTIVE"
      )
    );
    await assert.rejects(() =>
      anon.access.loginWithPassword({
        email: `parish-${suffix}@example.test`,
        password,
      })
    );
    await root.parishes.setStatus({ parishId: parish.id, status: "ACTIVE" });
    const parishLogin = await anon.access.loginWithPassword({
      email: `parish-${suffix}@example.test`,
      password,
    });
    assert.equal(parishLogin.role, "PARISH_ADMIN");
    assert.equal(parishLogin.mustChangePassword, true);
    const parishReq: any = {
      ...req,
      headers: { cookie: `${SESSION_COOKIE}=${cookie}` },
    };
    const parishContext = await createContext({
      req: parishReq,
      res,
    } as Parameters<typeof createContext>[0]);
    const parishCaller = appRouter.createCaller(parishContext);
    assert.equal((await parishCaller.parishes.current()).id, parish.id);
    await assert.rejects(() => parishCaller.parishes.list());
    await parishCaller.access.changePassword({
      currentPassword: password,
      newPassword: password + "b",
    });
    await parishCaller.access.logout();
    const revoked = await createContext({ req: parishReq, res } as Parameters<
      typeof createContext
    >[0]);
    assert.equal(revoked.actor, null);
    const totalBefore = (
      await client.query("SELECT count(*)::int n FROM parishes")
    ).rows[0].n;
    await client.query(
      "ALTER TABLE point_rules ADD CONSTRAINT test_provision_failure CHECK (points=99999) NOT VALID"
    );
    try {
      await assert.rejects(() =>
        root.parishes.create({
          name: `Rollback ${suffix}`,
          adminName: "Teste",
          adminEmail: `rollback-${suffix}@example.test`,
          adminPassword: password,
        })
      );
      assert.equal(
        (await client.query("SELECT count(*)::int n FROM parishes")).rows[0].n,
        totalBefore,
        "Falha de provisionamento deve reverter toda a paróquia"
      );
    } finally {
      await client.query(
        "ALTER TABLE point_rules DROP CONSTRAINT test_provision_failure"
      );
    }
    await client.query(
      `CREATE TYPE public.test_legacy_${suffix} AS ENUM ('ACTIVE','INACTIVE','SUSPENDED')`
    );
    await client.query(
      `ALTER TABLE parishes ALTER COLUMN status DROP DEFAULT; ALTER TABLE parishes ALTER COLUMN status TYPE test_legacy_${suffix} USING status::text::test_legacy_${suffix}`
    );
    const repaired = await repair(client);
    assert.equal(repaired.convertedEnums, 1);
    assert.equal(
      (await client.query("SELECT count(*)::int n FROM parishes")).rows[0].n,
      totalBefore
    );
    const again = await repair(client);
    assert.equal(again.convertedEnums, 0);
    const report = {
      passed: true,
      checks: [
        "admin:create/isPlatformAdmin",
        "senha errada recusada",
        "login SUPER_ADMIN",
        "cookie HTTP local",
        "contexto e sessão SUPER_ADMIN",
        "API /admin",
        "paróquia com defaults",
        "admin paroquial",
        "paróquia inativa bloqueada",
        "RBAC",
        "troca de senha",
        "logout/revogação",
        "rollback do provisionamento",
        "conversão de enum legado com dados preservados",
        "recuperação idempotente",
      ],
    };
    fs.writeFileSync(
      "audit/integration-local.json",
      JSON.stringify(report, null, 2)
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.end();
    await closeDb();
  }
}
main().catch(() => {
  console.error("Falha na integração local; verifique asserções e schema.");
  process.exitCode = 1;
});
