# Drizzle migrations — PostgreSQL

This directory is intentionally kept free of the historical MySQL/TiDB migrations.

Generate the PostgreSQL migrations from the current schema with:

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
```

The historical MySQL/TiDB migrations are archived under `legacy-mysql-migrations/` and must never be applied to the PostgreSQL database.
