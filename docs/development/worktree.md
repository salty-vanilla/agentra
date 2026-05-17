# Worktree workflow (GTR + Codex App bridge)

Agentra runs Claude Code, Codex CLI, and the Codex App side-by-side on parallel `git worktree`s. To keep `.env`, `direnv`, `pnpm install`, and per-worktree state from drifting between those tools, we drive worktree creation through [`git-worktree-runner`](https://github.com/coderabbitai/git-worktree-runner) (GTR) and have the Codex App's Local Environment call the same setup script.

```
git gtr new ──┐
              ├──► scripts/worktree/setup.sh
Codex App ────┘
```

## One-time setup

1. **Install GTR via devbox (recommended)**:
   ```bash
   devbox shell             # enter the reproducible dev shell
   devbox run gtr:install   # clone GTR into .devbox/tools/ and link it
   git gtr doctor           # verify
   ```
   `gtr:install` clones `git-worktree-runner` into `.devbox/tools/` (gitignored) and symlinks `git-gtr` into `.devbox/bin/`. Re-run `devbox run gtr:update` to update.

   **Alternative — Homebrew**:
   ```bash
   brew tap coderabbitai/tap
   brew install git-gtr
   git gtr doctor
   ```
2. **Trust this repo's `.gtrconfig`** (required for the `postCreate` / `preRemove` hooks):
   ```bash
   git gtr trust
   ```
3. Make sure `direnv` and `pnpm` are on your PATH. The repo's `devbox.json` already declares both — `devbox shell` is the easiest way to get them.

## Create a worktree

`.gtrconfig` does not set a shared default editor or AI tool — pass them explicitly so the repo stays neutral between Claude Code and Codex:

```bash
# Plain worktree (no editor, no AI)
git gtr new 227-gtr-worktree-setup

# Launch with Claude Code
git gtr new 227-gtr-worktree-setup --ai claude

# Launch with Codex CLI
git gtr new 227-gtr-worktree-setup --ai codex

# Open an editor too (any editor that's on your PATH)
git gtr new 227-gtr-worktree-setup --editor code   # or cursor, etc.
```

Personal defaults can be set with local/global git config if you want them; keeping them out of `.gtrconfig` avoids biasing the shared repo workflow.

Use the issue number as the prefix (`<N>-<slug>`) so the generated `AGENTRA_STAGE` becomes `dev-<N>` — that matches the rest of the issue/branch/worktree naming convention in [`CLAUDE.md`](../../CLAUDE.md).

## What setup.sh does

`scripts/worktree/setup.sh` is idempotent. On every invocation it:

1. Copies `<source>/.env.local` (preferred) or `<source>/.env` into the worktree **only if the target doesn't exist** — your worktree's env file is never overwritten.
2. Writes a fresh `.env.worktree` with derived per-worktree values (see table below).
3. Creates `.artifacts/` and `.tmp/`.
4. Runs `direnv allow .` when `direnv` is available.
5. Runs `corepack enable` and `pnpm install --frozen-lockfile`.

If `direnv` is missing the script logs a warning and skips the allow step; if `pnpm` is missing it exits with a clear error pointing at `corepack enable` / `npm i -g pnpm@10.9.0`.

## Env files and load order

`/.envrc` loads files in this order (later wins):

```bash
dotenv_if_exists .env
dotenv_if_exists .env.local
dotenv_if_exists .env.worktree
source_env_if_exists .envrc.local
```

| File | Owner | Source | Tracked |
|---|---|---|---|
| `.env.example` | repo | template only | yes |
| `.env` | dev (optional) | copied from source tree if no `.env.local` exists | no |
| `.env.local` | dev | copied from source tree at worktree creation | no |
| `.env.worktree` | generated | written by `setup.sh` on every run | no |
| `.envrc.local` | dev (per machine) | machine-local direnv override | no |

### Generated `.env.worktree`

`setup.sh` derives these from the worktree directory name (`basename`):

| Variable | Example (`.worktrees/227-gtr-worktree-setup`) |
|---|---|
| `AGENTRA_WORKTREE_NAME` | `227-gtr-worktree-setup` |
| `AGENTRA_STAGE` | `dev-227` |
| `AGENTRA_ARTIFACT_DIR` | `<abs>/.worktrees/227-gtr-worktree-setup/.artifacts` |
| `AGENTRA_TMP_DIR` | `<abs>/.worktrees/227-gtr-worktree-setup/.tmp` |
| `AGENTRA_LOG_PREFIX` | `227-gtr-worktree-setup` |

`AGENTRA_STAGE` is derived to satisfy the CDK constraint `^[a-z0-9-]+$` with a 16-character maximum (`infra/cdk/bin/agentra-cdk.ts` `validateStage`):

- If the worktree dir starts with digits (the issue number), they are used: `227-some-task` → `dev-227`.
- Otherwise, the first 12 characters of the safe slug are used.

## Codex App bridge

The Codex App creates its own worktrees and does not invoke GTR. To make those worktrees behave identically:

1. Open **Codex App → Settings → Local Environments → New**.
2. Set the setup steps to a single line:
   ```bash
   bash scripts/worktree/setup.sh
   ```
3. Save. The new Local Environment can now be selected when starting a Worktree thread.

When present, `setup.sh` uses `CODEX_SOURCE_TREE_PATH` and `CODEX_WORKTREE_PATH`; otherwise it falls back to regular git worktree resolution via `git rev-parse --git-common-dir`. We have observed Codex App exposing these variables, but they are not part of an official documented contract, so the script doesn't depend on them.

Verify inside the Codex App's integrated terminal:

```bash
ls -la .env.local .envrc .env.worktree
direnv status
pnpm --version
```

## Cleanup

`git gtr rm <name>` (or `git gtr rm <name> --yes`) calls `scripts/worktree/cleanup.sh` before removing the worktree. The cleanup script:

- Refuses to run unless its target path contains `.worktrees/` — it cannot accidentally wipe the main checkout.
- Removes only `.artifacts/`, `.tmp/`, and `.env.worktree`. It never touches `.env` or `.env.local`.

If you need to clean a worktree manually:

```bash
bash scripts/worktree/cleanup.sh .worktrees/<N>-<slug>
git worktree remove .worktrees/<N>-<slug>
git branch -d "fix/#<N>-<slug>"
```

## Troubleshooting

- **`git gtr trust` rejects `.gtrconfig`** — re-run `git gtr trust` from the repo root after `git pull` if `.gtrconfig` changed; trust is keyed on the file's content hash.
- **`direnv: error .envrc is blocked`** — run `direnv allow .` once inside the worktree, or re-run `setup.sh`.
- **`AGENTRA_STAGE` too long for CDK** — rename the worktree (`git gtr mv …`) so the leading-digit prefix or the first 12 chars stay within the 16-char limit. `setup.sh` has a paranoid truncation guard but readable names are better.
- **Stale `.env.worktree` in the source checkout** — `.env.worktree` is gitignored; if one leaked into your main checkout, just `rm .env.worktree`.
- **`pnpm install` fails with `ERR_PNPM_PEER_DEP_ISSUES`** — confirm the source tree's `pnpm-lock.yaml` is up to date; new worktrees use `--frozen-lockfile`.

## See also

- [`CLAUDE.md`](../../CLAUDE.md) — Issue-Driven Parallel Development workflow.
- [`.codex/config.toml`](../../.codex/config.toml) — Codex CLI / Codex App project config.
- GTR upstream: <https://github.com/coderabbitai/git-worktree-runner>
- Codex App worktrees: <https://developers.openai.com/codex/app/worktrees>
- Codex App Local Environments: <https://developers.openai.com/codex/app/local-environments>
