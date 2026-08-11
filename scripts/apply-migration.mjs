import "dotenv/config";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL é obrigatório.");
}

console.log("Este projeto usa PostgreSQL. Gere e aplique migrations com:");
console.log("  pnpm db:generate");
console.log("  pnpm db:migrate");
