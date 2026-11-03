import { parishRoles } from "../../drizzle/schema";
import { getDbOrThrow } from "../db";

export async function ensureUnassignedRole(parishId: number) {
  const db = await getDbOrThrow();
  const [role] = await db.insert(parishRoles).values({
    parishId, name: "Não definida", requiresQualification: false, displayOrder: 999,
  }).onConflictDoUpdate({
    target: [parishRoles.parishId, parishRoles.name],
    set: { requiresQualification: false, minAge: null, status: "ACTIVE" },
  }).returning({ id: parishRoles.id });
  return role.id;
}
