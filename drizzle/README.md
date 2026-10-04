# Drizzle migrations — PostgreSQL

The corrected release includes a PostgreSQL baseline under `migrations/`. See `../LEIA-ME_ENTREGA.md`. On an empty database, apply the committed migrations with `pnpm db:migrate`. On an existing partial installation, use the audited recovery workflow with mandatory backup; do not apply the initial CREATE TABLE migration blindly and do not use push.

This directory is intentionally kept free of the historical MySQL/TiDB migrations.

Generate the PostgreSQL migrations from the current schema with:

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
```

The historical MySQL/TiDB migrations are archived under `legacy-mysql-migrations/` and must never be applied to the PostgreSQL database.
