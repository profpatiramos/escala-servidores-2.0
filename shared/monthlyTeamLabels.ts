export function reconcileMonthlyTeamLabel(
  notes: string | null,
  color: "GREEN" | "BLUE" | null
) {
  const match = notes?.match(/^Escala mensal\. (Equipe (verde|azul)\.|Quinto fim de semana: escolher equipe manualmente\.)/i);
  if (!notes || !match) return null;
  const before = match[2]?.toLowerCase() ?? "manual";
  const after = color === "GREEN" ? "verde" : color === "BLUE" ? "azul" : "manual";
  if (before === after) return null;
  const label = after === "manual" ? "Quinto fim de semana: escolher equipe manualmente." : `Equipe ${after}.`;
  return { before, after, notes: `Escala mensal. ${label}${notes.slice(match[0].length)}` };
}
