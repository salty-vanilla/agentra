# Agentra Working Notes

- Run `pnpm install` after cloning; the root `prepare` script installs Lefthook automatically.
- `pre-commit` runs `pnpm biome check .`.
- `pre-push` runs `pnpm typecheck`.
- GitHub Actions `CI` runs `pnpm biome check .`, `pnpm typecheck`, and `pnpm test`; bypassing local hooks is not enough to merge.
- Fix hook failures before committing or pushing so the repo stays green for everyone.
