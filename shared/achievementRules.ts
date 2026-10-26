export const RETIRED_DEFAULT_ACHIEVEMENTS = [
  "Primeira participação",
  "Participação consistente",
  "Presença constante",
  "Voluntário da comunidade",
  "Em formação contínua",
];
export const MANUAL_ACHIEVEMENTS = [
  "Quem acolhe, ensina",
  "Servir além do altar",
];
export type AchievementFacts = {
  participations: number;
  substitutions: number;
  responses: number;
  special: number;
  anniversary: boolean;
};
/** null leaves custom/legacy criteria to their existing evaluator. */
export function approvedAchievementReached(
  name: string,
  facts: AchievementFacts
): boolean | null {
  switch (name) {
    case "Pode contar comigo":
      return facts.participations >= 5;
    case "Mão amiga":
      return facts.substitutions >= 1;
    case "Comunicação responsável":
      return facts.responses >= 5;
    case "Presença especial":
      return facts.special >= 1;
    case "Nossa caminhada":
      return facts.anniversary;
    case "Quem acolhe, ensina":
    case "Servir além do altar":
      return false;
    default:
      return null;
  }
}
