import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import {
  altarServers,
  familyLinks,
  responsibles,
  serverAccess,
} from "../../drizzle/schema";
import { importPersonSchema, personKey } from "../../shared/peopleImport";
import { generateAccessId } from "../auth/crypto";
import { getDbOrThrow } from "../db";
import { coordinatorProcedure, router, requestMeta, badRequest } from "../trpc";
import { recordAudit } from "../services/audit";

export const peopleImportRouter = router({
  save: coordinatorProcedure
    .input(z.object({ rows: z.array(importPersonSchema).min(1).max(300) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDbOrThrow();
      const result = await db.transaction(async tx => {
        // Serializes imports for this parish, including retries and double clicks.
        await tx.execute(
          sql`select pg_advisory_xact_lock(72341, ${ctx.parishId})`
        );
        const existing = await tx
          .select()
          .from(altarServers)
          .where(eq(altarServers.parishId, ctx.parishId));
        const keys = new Set(
          existing.map(row => personKey(row.name, row.birthDate))
        );
        const contacts = await tx
          .select()
          .from(responsibles)
          .where(eq(responsibles.parishId, ctx.parishId));
        let created = 0,
          skipped = 0,
          relatives = 0;
        for (const row of input.rows) {
          const key = personKey(row.name, row.birthDate);
          if (keys.has(key)) {
            skipped++;
            continue;
          }
          let contactId: number | null = null;
          if (row.responsibleName) {
            // Never merge families merely because their names match.
            const matches = contacts.filter(
              c =>
                c.status === "ACTIVE" &&
                c.name.trim().toLowerCase() ===
                  row.responsibleName.toLowerCase() &&
                ((row.responsibleEmail &&
                  c.email?.toLowerCase() ===
                    row.responsibleEmail.toLowerCase()) ||
                  (row.responsiblePhone && c.phone === row.responsiblePhone))
            );
            if (matches.length > 1)
              throw badRequest(
                "Há responsáveis duplicados com os mesmos contatos. Revise o cadastro antes de importar."
              );
            if (matches[0]) contactId = matches[0].id;
            else {
              const [contact] = await tx
                .insert(responsibles)
                .values({
                  parishId: ctx.parishId,
                  name: row.responsibleName,
                  email: row.responsibleEmail.toLowerCase() || null,
                  phone: row.responsiblePhone || null,
                  status: "ACTIVE",
                })
                .returning();
              contacts.push(contact);
              contactId = contact.id;
              relatives++;
            }
          }
          const [server] = await tx
            .insert(altarServers)
            .values({
              parishId: ctx.parishId,
              name: row.name,
              birthDate: row.birthDate,
              fatherName: row.fatherName || null,
              motherName: row.motherName || null,
              status: "IN_FORMATION",
            })
            .returning();
          if (contactId)
            await tx
              .insert(familyLinks)
              .values({
                parishId: ctx.parishId,
                responsibleId: contactId,
                serverId: server.id,
                relationshipType: "GUARDIAN",
                isPrimary: true,
                status: "ACTIVE",
                createdByUserId:
                  ctx.actor.type === "USER" ? ctx.actor.user.id : null,
              });
          await tx
            .insert(serverAccess)
            .values({
              parishId: ctx.parishId,
              serverId: server.id,
              accessId: generateAccessId(),
              status: "PENDING_ACTIVATION",
            });
          keys.add(key);
          created++;
        }
        return { created, skipped, relatives };
      });
      await recordAudit(ctx.actor, {
        action: "SERVER_CREATED",
        entityType: "people_import",
        metadata: result,
        ...requestMeta(ctx),
      });
      return result;
    }),
});
