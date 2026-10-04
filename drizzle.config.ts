import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { normalizeDatabaseUrl } from "./server/database-config";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: normalizeDatabaseUrl(connectionString),
  },
});
