# #449 — sdpm-skill engine ephemeral smoke

> Epic #442 / depends on #444, #445, #446, #448. Validates the `sdpm-skill`
> Presentation Author Engine end-to-end before any shared dev/stg exposure.

## Status

- ✅ **Production-image validation (highest-risk integration) — PASS.** The
  vendored SDPM skill + the runtime's `requirements.txt` were built into a
  `python:3.11-slim-bookworm` image (identical to the runtime's python stage)
  and `pptx_builder.py generate` produced a valid 2-slide PPTX. See
  [`docker-generate-log.txt`](./docker-generate-log.txt) and
  [`sdpm-docker-deck.pptx`](./sdpm-docker-deck.pptx).
- ✅ **Engine path validation (local, real skill) — PASS.** `createSdpmSkillAdapter`
  author→materialize→generate was exercised against the real skill in #448's
  gated test (`SDPM_SKILL_DIR` set), producing a real PPTX.
- ⏳ **Deployed-stack E2E (chat → workspace → artifactManifest.deck → DeckPreview)
  — operator step.** The runbook below deploys an ephemeral stage and drives a
  real chat. It is intentionally left as a supervised run because it provisions
  cloud resources (AgentCore runtime container + BFF + frontend) and needs an
  interactive auth session; the engine itself is de-risked by the two passes
  above.

## What was validated in the production image

`docker-generate-log.txt` (captured 2026-06-13):

```
deps import OK: qrcode,pygments,defusedxml,python-pptx,lxml,Pillow
Generated: /out/sdpm-docker-deck.pptx
page01 - (no title)
page02 - (no title)
slide xml count: 2
pptx bytes: 34599
```

This proves the **only new infra** for `sdpm-skill` works in the real image:
- the 3 added Python deps (`qrcode`, `pygments`, `defusedxml`) install and import;
- the vendored skill (`vendor/sdpm-skill`, pinned `de5b13f`, v0.3.8) runs
  `generate` and emits a valid OOXML PPTX in ~0.2s.

Reproduce:
```bash
docker build -f /tmp/sdpm-verify.Dockerfile -t sdpm-verify .   # python stage + vendor + requirements
docker run --rm -v "$PWD/docs/evidence/sdpm-skill-449:/out" sdpm-verify bash -c '
  export PATH=/opt/venv/bin:$PATH
  python3 -c "import qrcode,pygments,defusedxml,pptx,lxml,PIL; print(1)"
  python3 $SDPM_SKILL_DIR/scripts/pptx_builder.py generate <workspace> -o /out/deck.pptx'
```
(`/tmp/sdpm-verify.Dockerfile` = the runtime's python stage + `COPY vendor/sdpm-skill` + `ENV SDPM_SKILL_DIR`.)

## Ephemeral deployed-stack runbook

Enable the engine via env (revertible — unset to return to `agentra-pptxgenjs`):

```
PRESENTATION_AUTHOR_ENGINE=sdpm-skill
PRESENTATION_DECK_PREVIEW_ENABLED=true
# SDPM_SKILL_DIR is baked into the runtime image (Dockerfile).
```

1. Deploy an ephemeral stage (worktree-safe): `/cdk-verify` (or
   `AWS_PROFILE=quick-admin npx cdk deploy <ephemeral-stage>`), building the
   `presentation-author-runtime` image with the env above.
2. Open the ephemeral frontend, sign in, and send a Japanese prompt asking for a
   ~3-slide deck.

### Scenarios / evidence to capture

| # | Scenario | Evidence |
|---|---|---|
| 1 | 最小 deck 生成 | `deck.json`/`specs/brief.md`/`specs/outline.md`/`slides/*.json` present in S3 `decks/{deckId}/`; PPTX artifact downloads |
| 2 | Workspace Preview | brief/outline/slide skeleton visible in the frontend (`WorkspacePreviewPanel`); skeleton → real preview on compose ready |
| 3 | DeckPreview 接続 | `artifactManifest.deck` carries the SDPM DeckResult; reload restores from the snapshot |
| 4 | degrade | force a compose failure → PPTX artifact still returns; unset `PRESENTATION_AUTHOR_ENGINE` → back to agentra-pptxgenjs |

Collect: ephemeral URL / stack / branch, screenshots, `aws s3 ls decks/{deckId}/`,
runtime logs, BFF `GET /threads/:id/decks/:id` snapshot excerpt,
`artifactManifest.deck` excerpt, timings, image size, cleanup result.

### Rollback

Unset `PRESENTATION_AUTHOR_ENGINE` (or set `=agentra-pptxgenjs`) and redeploy;
the runtime returns to the legacy engine with no other change. The SDPM skill is
inert when not selected.

## Follow-ups discovered

- The runtime venv must be on `PATH` for `python3` to resolve to the SDPM deps
  (the production Dockerfile already sets `ENV PATH="$VIRTUAL_ENV/bin:$PATH"`;
  the existing deck-render scripts rely on the same, so this is consistent).
- Japanese glyph fidelity in compose/preview SVG under `fonts-noto-cjk` should be
  eyeballed during scenario 2 (tracked as a check, not a blocker).
- `references/` (SDPM design guides, 608K) were intentionally not vendored;
  revisit if authoring quality needs them.
