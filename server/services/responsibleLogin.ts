import { and, eq, sql } from "drizzle-orm";
import { users, parishMembers, responsibles } from "../../drizzle/schema";
import { SECURITY } from "../../shared/domain";
import { hashSecret, validatePasswordStrength } from "../auth/crypto";
import { getDbOrThrow } from "../db";
import { badRequest, notFound } from "../trpc";

export async function enableResponsibleLogin(input: {
  parishId: number;
  responsibleId: number;
  email: string;
  temporaryPassword: string;
  coordinator?: boolean;
}) {
  const strength = validatePasswordStrength(
    input.temporaryPassword,
    SECURITY.minPasswordLength
  );
  if (!strength.valid) throw badRequest(strength.message!);
  const email = input.email.trim().toLowerCase();
  const db = await getDbOrThrow();
  return db.transaction(async tx => {
    const [responsible] = await tx
      .select()
      .from(responsibles)
      .where(
        and(
          eq(responsibles.id, input.responsibleId),
          eq(responsibles.parishId, input.parishId)
        )
      )
      .limit(1)
      .for("update");
    if (!responsible) throw notFound("Responsável");
    if (responsible.status !== "ACTIVE")
      throw badRequest(
        "Ative o cadastro do responsável antes de habilitar o login."
      );
    if (responsible.userId)
      throw badRequest(
        "Este responsável já possui login. Para recuperar o acesso, utilize Esqueci minha senha."
      );
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    if (existing)
      throw badRequest(
        "Este e-mail já está associado a uma conta. Use outro e-mail ou recupere o acesso da conta existente."
      );
    const [created] = await tx
      .insert(users)
      .values({
        name: responsible.name,
        email,
        phone: responsible.phone,
        passwordHash: await hashSecret(input.temporaryPassword),
        loginMethod: "password",
        status: "ACTIVE",
        mustChangePassword: true,
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });
    if (!created)
      throw badRequest(
        "Este e-mail já está associado a uma conta. Atualize a página e confira os dados."
      );
    await tx.insert(parishMembers).values({
      parishId: input.parishId,
      userId: created.id,
      role: "RESPONSIBLE",
      status: "ACTIVE",
    });
    if (input.coordinator)
      await tx.insert(parishMembers).values({
        parishId: input.parishId,
        userId: created.id,
        role: "COORDINATOR",
        status: "ACTIVE",
      });
    await tx
      .update(responsibles)
      .set({ userId: created.id, email })
      .where(
        and(
          eq(responsibles.id, input.responsibleId),
          eq(responsibles.parishId, input.parishId)
        )
      );
    return { success: true as const };
  });
}

/** Adds/removes only coordination; keeps the responsible account and family links. */
export async function setResponsibleCoordination(input: {
  parishId: number;
  responsibleId: number;
  enabled: boolean;
}) {
  const db = await getDbOrThrow();
  return db.transaction(async tx => {
    const [responsible] = await tx
      .select()
      .from(responsibles)
      .where(
        and(
          eq(responsibles.id, input.responsibleId),
          eq(responsibles.parishId, input.parishId)
        )
      )
      .limit(1)
      .for("update");
    if (!responsible) throw notFound("Responsável");
    if (!responsible.userId)
      throw badRequest(
        "Habilite o login do responsável antes de definir o acesso à coordenação."
      );
    if (input.enabled) {
      if (responsible.status !== "ACTIVE")
        throw badRequest(
          "Ative o cadastro do responsável antes de habilitar a coordenação."
        );
      const [user] = await tx
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, responsible.userId))
        .limit(1);
      if (!user || user.status !== "ACTIVE")
        throw badRequest("A conta de acesso do responsável não está ativa.");
      await tx
        .insert(parishMembers)
        .values({
          parishId: input.parishId,
          userId: responsible.userId,
          role: "COORDINATOR",
          status: "ACTIVE",
        })
        .onConflictDoUpdate({
          target: [
            parishMembers.parishId,
            parishMembers.userId,
            parishMembers.role,
          ],
          set: { status: "ACTIVE" },
        });
    } else {
      await tx
        .update(parishMembers)
        .set({ status: "INACTIVE" })
        .where(
          and(
            eq(parishMembers.parishId, input.parishId),
            eq(parishMembers.userId, responsible.userId),
            eq(parishMembers.role, "COORDINATOR")
          )
        );
    }
    return { success: true as const };
  });
}
