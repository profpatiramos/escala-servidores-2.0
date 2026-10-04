/** Validate connection structure without printing credentials. */
export function normalizeDatabaseUrl(raw: string | undefined): string {
  if (!raw) throw new Error("DATABASE_URL ausente.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL inválida.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    url.pathname.length < 2
  )
    throw new Error("DATABASE_URL inválida.");
  if (
    url.searchParams.get("sslmode") === "req" ||
    url.hostname.endsWith(".neon.tech")
  )
    url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
