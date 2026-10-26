import { sql } from "drizzle-orm";
import { getDbOrThrow } from "../db";
import { isEarlyConfirmation } from "../../shared/participation";
import { grantPoints } from "./gamification";

export async function rewardEarlyConfirmation(
  parishId: number,
  assignmentId: number
) {
  try {
    const db = await getDbOrThrow();
    const result = await db.execute(
      sql`SELECT a."serverId",extract(epoch FROM ((e.date::date+e."startTime"::time) AT TIME ZONE p.timezone))*1000 AS start,COALESCE(g."earlyConfirmationHours",48) AS hours FROM schedule_assignments a JOIN celebrations e ON e.id=a."celebrationId" JOIN parishes p ON p.id=a."parishId" LEFT JOIN gamification_settings g ON g."parishId"=p.id WHERE a.id=${assignmentId} AND a."parishId"=${parishId} AND e."parishId"=${parishId} AND a.status='CONFIRMED' AND e.status='SCHEDULED' AND NOT EXISTS(SELECT 1 FROM confirmation_conflicts cf WHERE cf."assignmentId"=a.id AND cf."parishId"=a."parishId" AND cf.status='OPEN')`
    );
    const row = result.rows[0] as
      { serverId: number; start: string; hours: number } | undefined;
    if (row && isEarlyConfirmation(Number(row.start), Date.now(), row.hours))
      await grantPoints({
        parishId,
        serverId: row.serverId,
        eventType: "EARLY_CONFIRMATION",
        referenceType: "schedule_assignment",
        referenceId: assignmentId,
      });
  } catch (error) {
    console.error(
      "[Gamificação] Falha ao avaliar confirmação antecipada",
      error
    );
  }
}
