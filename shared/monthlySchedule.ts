import { z } from "zod";

export const MONTHLY_SLOTS = [
  {
    id: "SAT19",
    label: "Sábado · 19h",
    weekday: 6,
    startTime: "19:00",
    endTime: "20:15",
  },
  {
    id: "SUN08",
    label: "Domingo · 8h",
    weekday: 0,
    startTime: "08:00",
    endTime: "09:15",
  },
  {
    id: "SUN10",
    label: "Domingo · 10h",
    weekday: 0,
    startTime: "10:00",
    endTime: "11:15",
  },
  {
    id: "SUN19",
    label: "Domingo · 19h",
    weekday: 0,
    startTime: "19:00",
    endTime: "20:15",
  },
] as const;
export const monthlyConfigSchema = z
  .object({
    fifth: z.enum(["MANUAL", "GREEN", "BLUE"]).default("MANUAL"),
    teams: z
      .array(
        z
          .object({
            slot: z.enum(["SAT19", "SUN08", "SUN10", "SUN19"]),
            color: z.enum(["GREEN", "BLUE"]),
            members: z
              .array(
                z.object({
                  serverId: z.number().int().positive(),
                  parishRoleId: z.number().int().positive(),
                })
              )
              .max(50),
          })
          .refine(
            team =>
              new Set(team.members.map(m => m.serverId)).size ===
              team.members.length,
            "Um servidor não pode aparecer duas vezes na mesma equipe."
          )
      )
      .length(8),
  })
  .refine(
    config => new Set(config.teams.map(t => `${t.slot}:${t.color}`)).size === 8,
    "Informe as oito equipes sem repetições."
  );
export type MonthlyConfig = z.infer<typeof monthlyConfigSchema>;
export const emptyMonthlyConfig = (): MonthlyConfig => ({
  fifth: "MANUAL",
  teams: MONTHLY_SLOTS.flatMap(slot =>
    (["GREEN", "BLUE"] as const).map(color => ({
      slot: slot.id,
      color,
      members: [],
    }))
  ),
});

export function monthlyPlan(
  year: number,
  month: number,
  fifth: MonthlyConfig["fifth"]
) {
  if (
    !Number.isInteger(year) ||
    year < 2020 ||
    year > 2100 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  )
    throw new Error("Mês inválido.");
  const result: {
    date: string;
    slot: (typeof MONTHLY_SLOTS)[number];
    occurrence: number;
    color: "GREEN" | "BLUE" | null;
  }[] = [];
  const counts = new Map<number, number>();
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let day = 1; day <= lastDay; day++) {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) continue;
    const occurrence = (counts.get(weekday) ?? 0) + 1;
    counts.set(weekday, occurrence);
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    for (const slot of MONTHLY_SLOTS.filter(s => s.weekday === weekday)) {
      const color =
        occurrence === 5
          ? fifth === "MANUAL"
            ? null
            : fifth
          : slot.id === "SUN10"
            ? occurrence <= 2
              ? "GREEN"
              : "BLUE"
            : occurrence % 2
              ? "GREEN"
              : "BLUE";
      result.push({ date, slot, occurrence, color });
    }
  }
  return result;
}
