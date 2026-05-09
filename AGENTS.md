# Agentra Working Notes

- Run `pnpm install` after cloning; the root `prepare` script installs Lefthook automatically.
- `pre-commit` runs `pnpm biome check .`.
- `pre-push` runs `pnpm typecheck`.
- Fix hook failures before committing or pushing so the repo stays green for everyone.
