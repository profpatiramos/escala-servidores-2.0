import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { users, sessions } from "../drizzle/schema";
import { closeDb, getDbOrThrow } from "../server/db";
import { backup, databaseUrl } from "./database";

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const current = (
      process.env.SUPER_ADMIN_CURRENT_EMAIL ??
      (await rl.question("E-mail atual do SUPER_ADMIN: "))
    )
      .trim()
      .toLowerCase();
    const next = (
      process.env.SUPER_ADMIN_NEW_EMAIL ??
      (await rl.question("Novo e-mail do SUPER_ADMIN: "))
    )
      .trim()
      .toLowerCase();
    if (
      !z.email().safeParse(current).success ||
      !z.email().safeParse(next).success
    )
      throw new Error("Informe e-mails válidos.");
    if (current === next) throw new Error("O novo e-mail deve ser diferente.");
    backup(databaseUrl());
    const db = await getDbOrThrow();
    await db.transaction(async tx => {
      const [admin] = await tx
        .select()
        .from(users)
        .where(and(eq(users.email, current), eq(users.isPlatformAdmin, true)))
        .limit(1);
      if (!admin) throw new Error("SUPER_ADMIN atual não encontrado.");
      const [target] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, next))
        .limit(1);
      if (target) throw new Error("O novo e-mail já pertence a outra conta.");
      await tx.update(users).set({ email: next }).where(eq(users.id, admin.id));
      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.userId, admin.id));
    });
    console.log(
      "E-mail do SUPER_ADMIN atualizado. Faça login com o novo e-mail e a senha atual."
    );
  } finally {
    rl.close();
    await closeDb();
  }
}
main().catch(error => {
  console.error(
    error instanceof Error && !("code" in error)
      ? error.message
      : "Falha PostgreSQL; nenhuma atualização confirmada."
  );
  process.exitCode = 1;
});
