import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Writable } from "node:stream";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { users } from "../drizzle/schema";
import { hashSecret, validatePasswordStrength } from "../server/auth/crypto";
import { closeDb, getDbOrThrow } from "../server/db";
import { SECURITY } from "../shared/domain";

/**
 * Cria ou atualiza a conta SUPER_ADMIN inicial.
 *
 * Pode ser executado de forma interativa:
 *   pnpm admin:create
 *
 * Ou sem prompts, útil em ambiente de teste/deploy:
 *   SUPER_ADMIN_EMAIL=... SUPER_ADMIN_NAME=... SUPER_ADMIN_PASSWORD=... pnpm admin:create
 *
 * A autorização real NÃO depende do campo legado users.role: o login resolve
 * SUPER_ADMIN exclusivamente a partir de isPlatformAdmin=true.
 */
async function main() {
  const envEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const envName = process.env.SUPER_ADMIN_NAME?.trim();
  const envPassword = process.env.SUPER_ADMIN_PASSWORD;
  const needsPrompt = !envEmail || !envName || !envPassword;
  let muted = false;
  const promptOutput = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) output.write(chunk);
      callback();
    },
  });
  const rl = needsPrompt
    ? createInterface({ input, output: promptOutput, terminal: true })
    : null;

  try {
    const email =
      envEmail ??
      (await rl!.question("E-mail do administrador da plataforma: "))
        .trim()
        .toLowerCase();
    const name = envName ?? (await rl!.question("Nome: ")).trim();
    let password = envPassword;
    if (!password) {
      output.write("Senha (oculta): ");
      muted = true;
      try {
        password = await rl!.question("");
      } finally {
        muted = false;
        output.write("\n");
      }
    }

    if (!email || !name || !password) {
      throw new Error("E-mail, nome e senha são obrigatórios.");
    }
    if (!z.email().safeParse(email).success)
      throw new Error("E-mail inválido.");

    const strength = validatePasswordStrength(
      password,
      SECURITY.minPasswordLength
    );
    if (!strength.valid) {
      throw new Error(strength.message ?? "Senha inválida.");
    }

    const db = await getDbOrThrow();
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    const passwordHash = await hashSecret(password);

    const values = {
      name,
      email: normalizedEmail,
      passwordHash,
      loginMethod: "password",
      // Campo legado mantido para compatibilidade com o template antigo.
      role: "admin" as const,
      // Esta é a fonte de verdade do papel SUPER_ADMIN no sistema atual.
      isPlatformAdmin: true,
      status: "ACTIVE" as const,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
    };

    if (existing[0]) {
      if (!process.argv.includes("--update"))
        throw new Error(
          "Conta já existe. Use --update apenas se deseja promover a conta e substituir sua senha."
        );
      await db.update(users).set(values).where(eq(users.id, existing[0].id));
      const { revokeUserSessions } = await import("../server/auth/service");
      await revokeUserSessions(existing[0].id);
      console.log(`SUPER_ADMIN atualizado com sucesso: ${normalizedEmail}`);
      console.log(`Acesso: /acesso  |  Área: /admin`);
      return;
    }

    await db.insert(users).values(values);
    console.log(`SUPER_ADMIN criado com sucesso: ${normalizedEmail}`);
    console.log(`Acesso: /acesso  |  Área: /admin`);
  } finally {
    rl?.close();
    await closeDb();
  }
}

main().catch(error => {
  console.error(
    "Não foi possível configurar o SUPER_ADMIN:",
    error instanceof Error && !("code" in error)
      ? error.message
      : "Falha PostgreSQL; verifique schema e conexão."
  );
  process.exitCode = 1;
});
