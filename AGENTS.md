# Agentra Working Notes

- Run `pnpm install` after cloning; the root `prepare` script installs Lefthook automatically.
- Treat quality gates as shared rules for Codex and humans, not optional suggestions.
- `pre-commit` runs `pnpm biome check .` and `pre-push` runs `pnpm typecheck`.
- GitHub Actions `CI` runs `pnpm biome check .`, `pnpm typecheck`, and `pnpm test`; bypassing local hooks is not enough to merge.
- Use the workflow `edit -> lint -> typecheck -> commit -> push -> CI green -> merge`.
- If any hook or CI check fails, fix it before finishing the task or handing the branch off.
