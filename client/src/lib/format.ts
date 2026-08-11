/**
 * Formatação para o padrão brasileiro.
 *
 * Datas de calendário chegam do backend como string `YYYY-MM-DD` — de propósito.
 * Convertê-las com `new Date("2026-03-15")` as interpretaria como UTC e, em
 * fuso negativo, exibiria o dia anterior. Por isso o parse é manual.
 */

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  if (!y || !m || !d) return "—";
  return `${d}/${m}/${y}`;
}

export function formatDateLong(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "—";
  const local = new Date(y, m - 1, d);
  return local.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  return value.slice(0, 5);
}

/** Timestamps de negócio são instantes reais: aqui a conversão de fuso é correta. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function calculateAge(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age -= 1;
  return age;
}

export function isMinor(birthDate: string | null | undefined): boolean {
  const age = calculateAge(birthDate);
  return age !== null && age < 18;
}

/** Extrai a mensagem útil de um erro tRPC sem despejar stack na interface. */
export function errorMessage(error: unknown, fallback = "Não foi possível concluir a operação."): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0 && message.length < 300) return message;
  }
  return fallback;
}

