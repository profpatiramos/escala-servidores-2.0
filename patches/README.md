# Patches

No active pnpm patches are required at this stage.

The previous `wouter@3.7.1` patch was removed because the project declares
`wouter` 3.3.x and no application code references the patched route registry.
Keeping an unmatched patch causes `pnpm install` to fail with
`ERR_PNPM_PATCH_NOT_APPLIED`.
