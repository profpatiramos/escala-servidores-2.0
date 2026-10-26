import { and, eq, inArray, sql } from "drizzle-orm";
import {
  substitutionRequests,
  scheduleAssignments,
} from "../../drizzle/schema";
import type { Actor } from "../auth/types";
import { getDbOrThrow } from "../db";
import { badRequest, notFound } from "../trpc";
import { validateAssignments } from "./scheduleValidation";
import { grantPoints, type GrantResult } from "./gamification";
import { recordAudit } from "./audit";
import { enqueueNotification } from "./notifications";

export async function approveSubstitution(params: {
  parishId: number;
  requestId: number;
  replacementServerId: number;
  reviewNotes?: string | null;
  actor: Actor;
}) {
  const db = await getDbOrThrow();
  const userId = params.actor.type === "USER" ? params.actor.user.id : null;
  const result = await db.transaction(async tx => {
    const [request] = await tx
      .select()
      .from(substitutionRequests)
      .where(
        and(
          eq(substitutionRequests.id, params.requestId),
          eq(substitutionRequests.parishId, params.parishId)
        )
      )
      .limit(1)
      .for("update");
    if (!request) throw notFound("Solicitação");
    if (
      request.status === "APPROVED" &&
      request.replacementServerId === params.replacementServerId
    ) {
      const [replacement] = await tx
        .select({ id: scheduleAssignments.id })
        .from(scheduleAssignments)
        .where(
          and(
            eq(scheduleAssignments.parishId, params.parishId),
            eq(scheduleAssignments.replacesAssignmentId, request.assignmentId),
            eq(scheduleAssignments.serverId, params.replacementServerId)
          )
        )
        .limit(1);
      if (!replacement) throw notFound("Alocação substituta");
      return {
        approved: true as const,
        validation: { valid: true, blocking: [], warnings: [] },
        newAssignmentId: replacement.id,
        replayed: true,
      };
    }
    if (request.status !== "PENDING")
      throw badRequest("Esta solicitação já foi analisada.");
    const [original] = await tx
      .select()
      .from(scheduleAssignments)
      .where(
        and(
          eq(scheduleAssignments.id, request.assignmentId),
          eq(scheduleAssignments.parishId, params.parishId)
        )
      )
      .limit(1)
      .for("update");
    if (!original) throw notFound("Alocação");
    if (!["PENDING", "CONFIRMED", "DECLINED"].includes(original.status))
      throw badRequest("Esta alocação não permite substituição.");
    if (original.serverId === params.replacementServerId)
      throw badRequest("O substituto deve ser diferente do servidor original.");
    // Serialize approvals for the same celebration, including different requests.
    // The general validator checks other celebrations, not existing rows in this one.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${params.parishId},${original.celebrationId})`
    );
    const [alreadyAssigned] = await tx
      .select({ id: scheduleAssignments.id })
      .from(scheduleAssignments)
      .where(
        and(
          eq(scheduleAssignments.parishId, params.parishId),
          eq(scheduleAssignments.celebrationId, original.celebrationId),
          eq(scheduleAssignments.serverId, params.replacementServerId),
          inArray(scheduleAssignments.status, ["PENDING", "CONFIRMED"])
        )
      )
      .limit(1);
    if (alreadyAssigned)
      throw badRequest("Este servidor já está escalado nesta celebração.");
    const open = await tx.execute(
      sql`SELECT e.id FROM celebrations e JOIN schedules s ON s."celebrationId"=e.id JOIN parishes p ON p.id=e."parishId" WHERE e.id=${original.celebrationId} AND e."parishId"=${params.parishId} AND s."parishId"=${params.parishId} AND s.status='PUBLISHED' AND e.status='SCHEDULED' AND ((e.date::date+e."startTime"::time) AT TIME ZONE p.timezone)>CURRENT_TIMESTAMP`
    );
    if (!open.rows.length)
      throw badRequest("A celebração não está disponível para substituição.");
    const validation = await validateAssignments({
      parishId: params.parishId,
      celebrationId: original.celebrationId,
      assignments: [
        {
          serverId: params.replacementServerId,
          parishRoleId: original.parishRoleId,
        },
      ],
    });
    if (!validation.valid)
      return {
        approved: false as const,
        validation,
        newAssignmentId: null,
        replayed: false,
      };
    const [replacement] = await tx
      .insert(scheduleAssignments)
      .values({
        parishId: params.parishId,
        scheduleId: original.scheduleId,
        celebrationId: original.celebrationId,
        serverId: params.replacementServerId,
        parishRoleId: original.parishRoleId,
        status: "PENDING",
        assignmentSource: original.assignmentSource,
        replacesAssignmentId: original.id,
        notes: `Substituição da alocação #${original.id}`,
        assignedByUserId: userId,
      })
      .returning({ id: scheduleAssignments.id });
    await tx
      .update(scheduleAssignments)
      .set({ status: "REPLACED", replacedByAssignmentId: replacement.id })
      .where(eq(scheduleAssignments.id, original.id));
    await tx
      .update(substitutionRequests)
      .set({
        status: "APPROVED",
        replacementServerId: params.replacementServerId,
        reviewedByUserId: userId,
        reviewNotes: params.reviewNotes ?? null,
        resolvedAt: new Date(),
      })
      .where(eq(substitutionRequests.id, request.id));
    return {
      approved: true as const,
      validation,
      newAssignmentId: replacement.id,
      replayed: false,
    };
  });
  let points: GrantResult | null = null;
  if (result.approved) {
    points = await grantPoints({
      parishId: params.parishId,
      serverId: params.replacementServerId,
      eventType: "SUBSTITUTION_ACCEPTED",
      referenceType: "substitution_request",
      referenceId: params.requestId,
      createdByUserId: userId,
    });
    if (!result.replayed) {
      await recordAudit(params.actor, {
        action: "SUBSTITUTION_APPROVED",
        entityType: "assignment",
        entityId: result.newAssignmentId,
        metadata: {
          requestId: params.requestId,
          replacementServerId: params.replacementServerId,
        },
      });
      await enqueueNotification({
        parishId: params.parishId,
        serverId: params.replacementServerId,
        type: "SUBSTITUTION_RESOLVED",
        title: "Substituição aprovada",
        body: "Você foi escalado como substituto. Confirme a participação na sua escala.",
        referenceType: "assignment",
        referenceId: result.newAssignmentId,
      });
    }
  }
  return { ...result, points };
}
