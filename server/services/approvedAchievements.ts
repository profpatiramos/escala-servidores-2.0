import { and, eq, inArray, sql } from "drizzle-orm";
import {
  achievements,
  gamificationSettings,
  serverAchievements,
} from "../../drizzle/schema";
import { DEFAULT_ACHIEVEMENTS } from "../../shared/domain";
import {
  approvedAchievementReached,
  type AchievementFacts,
  RETIRED_DEFAULT_ACHIEVEMENTS,
} from "../../shared/achievementRules";
import { getDbOrThrow } from "../db";

export async function installApprovedAchievements(parishId: number) {
  const db = await getDbOrThrow();
  await db.transaction(async tx => {
    await tx
      .update(achievements)
      .set({ status: "INACTIVE" })
      .where(
        and(
          eq(achievements.parishId, parishId),
          inArray(achievements.name, RETIRED_DEFAULT_ACHIEVEMENTS)
        )
      );
    for (const definition of DEFAULT_ACHIEVEMENTS)
      await tx
        .insert(achievements)
        .values({ parishId, ...definition, status: "ACTIVE" })
        .onConflictDoUpdate({
          target: [achievements.parishId, achievements.name],
          set: { ...definition, status: "ACTIVE" },
        });
  });
}

export async function evaluateApprovedAchievements(
  parishId: number,
  serverId: number
) {
  const db = await getDbOrThrow();
  const [settings] = await db
    .select({ enabled: gamificationSettings.enabled })
    .from(gamificationSettings)
    .where(eq(gamificationSettings.parishId, parishId))
    .limit(1);
  if (!settings?.enabled) return;
  const catalog = await db
    .select()
    .from(achievements)
    .where(
      and(
        eq(achievements.parishId, parishId),
        eq(achievements.status, "ACTIVE"),
        inArray(
          achievements.name,
          DEFAULT_ACHIEVEMENTS.map(a => a.name)
        )
      )
    );
  if (!catalog.length) return;
  // Each count uses distinct activities, rather than points: reversals and zero-point rules cannot inflate progress.
  const result = await db.execute(sql`
    SELECT
      (SELECT count(DISTINCT a."celebrationId")::int FROM attendance_records r JOIN schedule_assignments a ON a.id=r."assignmentId" WHERE r."parishId"=${parishId} AND a."parishId"=${parishId} AND a."serverId"=${serverId} AND r.status='PRESENT') AS participations,
      (SELECT count(DISTINCT x.id)::int FROM substitution_requests x JOIN schedule_assignments original ON original.id=x."assignmentId" JOIN schedule_assignments replacement ON replacement."celebrationId"=original."celebrationId" AND replacement."serverId"=${serverId} AND replacement."parishId"=${parishId} JOIN attendance_records r ON r."assignmentId"=replacement.id AND r."parishId"=${parishId} AND r.status='PRESENT' WHERE x."parishId"=${parishId} AND original."parishId"=${parishId} AND x.status='APPROVED' AND x."replacementServerId"=${serverId}) AS substitutions,
      (SELECT count(DISTINCT a.id)::int FROM confirmations c JOIN schedule_assignments a ON a.id=c."assignmentId" JOIN celebrations e ON e.id=a."celebrationId" JOIN parishes p ON p.id=e."parishId" LEFT JOIN gamification_settings g ON g."parishId"=p.id WHERE c."parishId"=${parishId} AND a."parishId"=${parishId} AND e."parishId"=${parishId} AND a."serverId"=${serverId} AND c."respondedAt" <= ((e.date::date + e."startTime"::time) AT TIME ZONE p.timezone) - make_interval(hours=>COALESCE(g."earlyConfirmationHours",24))) AS responses,
      (SELECT count(DISTINCT e.id)::int FROM attendance_records r JOIN schedule_assignments a ON a.id=r."assignmentId" JOIN celebrations e ON e.id=a."celebrationId" WHERE r."parishId"=${parishId} AND a."parishId"=${parishId} AND e."parishId"=${parishId} AND a."serverId"=${serverId} AND r.status='PRESENT' AND e."celebrationType"='SOLEMNITY') AS special,
      COALESCE((SELECT s."joinedAt" <= ((CURRENT_TIMESTAMP AT TIME ZONE p.timezone)::date - interval '1 year') FROM altar_servers s JOIN parishes p ON p.id=s."parishId" WHERE s."parishId"=${parishId} AND s.id=${serverId}),false) AS anniversary
  `);
  const facts = result.rows[0] as unknown as AchievementFacts;
  if (!facts) return;
  for (const achievement of catalog)
    if (approvedAchievementReached(achievement.name, facts))
      await db
        .insert(serverAchievements)
        .values({
          parishId,
          serverId,
          achievementId: achievement.id,
          source: "AUTOMATIC",
          reason: "Critério verificado nos registros da pastoral.",
        })
        .onConflictDoNothing();
}
