# pnpm install fix

The project previously had a legacy `package.json#pnpm` block that referenced a removed
wouter patch. That caused `ERR_PNPM_PATCH_NOT_APPLIED` / `ENOENT` during install.

This RC removes the legacy `pnpm` block entirely and keeps the required transitive
dependency override in the canonical `pnpm-workspace.yaml`.

After replacing the project files locally:

1. Delete the old `node_modules` folder if it exists.
2. Run `pnpm install`.
3. If installation succeeds, stop and run `pnpm check` only after confirmation.
