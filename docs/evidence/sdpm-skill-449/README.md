# #449 — sdpm-skill engine ephemeral smoke

> Epic #442 / depends on #444, #445, #446, #448. Validates the `sdpm-skill`
> Presentation Author Engine end-to-end before any shared dev/stg exposure.

## Status

- ✅ **Deployed-stack E2E on real AgentCore — PASS.** `PRESENTATION_AUTHOR_ENGINE=sdpm-skill`
  was deployed to the ephemeral `dev-deckprev` slide runtime (ap-northeast-1) and
  the engine generated a real 3-slide Japanese deck. See the [Live run](#live-deployed-run-completed)
  section: real PPTX ([`live/sdpm-agentcore-deck.pptx`](./live/sdpm-agentcore-deck.pptx)),
  video of the Workspace Preview rendering it ([`live/sdpm-workspace-preview-live.mp4`](./live/sdpm-workspace-preview-live.mp4)),
  the workspace files, and the AgentCore result.
- ✅ **Production-image validation — PASS.** The vendored SDPM skill + the
  runtime `requirements.txt` built into a `python:3.11-slim-bookworm` image and
  `pptx_builder.py generate` produced a valid 2-slide PPTX. See
  [`docker-generate-log.txt`](./docker-generate-log.txt) and
  [`sdpm-docker-deck.pptx`](./sdpm-docker-deck.pptx).
- ✅ **Engine path validation (local, real skill) — PASS** (#448 gated test).

## Live deployed run (completed)

**2026-06-13, ap-northeast-1, stage `dev-deckprev`** (reused the existing
ephemeral agentcore stage; only the slide runtime was redeployed with
`-c deckPreviewEnabled=true -c presentationAuthorEngine=sdpm-skill`).

- Invoked the deployed slide runtime directly (`bedrock-agentcore invoke-agent-runtime`,
  non-streaming) with a Japanese 3-slide prompt. Result
  ([`live/agentcore-result.json`](./live/agentcore-result.json)):
  `engine: "sdpm-skill"`, `success: true`, `slideOrder: [slide-1,slide-2,slide-3]`,
  PPTX artifact, **zero warnings**.
- The SDPM engine wrote the full Deck Workspace to S3 `decks/{deckId}/`:
  `deck.json`, `specs/{brief,outline}.md`, semantic `slides/{cover,features,summary}.json`,
  positional `slides/slide-{1,2,3}.compose.json`, `preview/defs.json`, and the PPTX.
  The outline shows the SDPM authoring quality (semantic slugs + 1-slide-1-message
  in Japanese) — see [`live/outline.md`](./live/outline.md).
- The BFF `getDeckSnapshot` projection (#446, fixed below) merged the semantic
  workspace slides to the positional compose slides **by index** into 3 slides.
- The Agentra **WorkspacePreviewPanel** (#447) rendered the real deck from the
  live S3 compose/defs: header `3/3 スライド`, spec links, and the 3 authored
  slides (`SDPM スキル紹介` / `SDPM の主な特徴` / `まとめ`). Video:
  [`live/sdpm-workspace-preview-live.mp4`](./live/sdpm-workspace-preview-live.mp4),
  still: [`live/story-live-rendered.png`](./live/story-live-rendered.png).
- The chat-path (frontend → BFF → main runtime → slide tool) **completed the
  generation** but the deck was not attached to the message `artifactManifest`,
  and the AgentCore streaming connection drops during the long (~100s) slide tool
  call. Both are filed as follow-ups below; the engine itself is fully validated
  via the direct invoke + snapshot + UI render above.

### Bug found and fixed during the live run

The live snapshot exposed that the workspace projection listed **6** slides
(`cover/features/summary` skeleton + `slide-1/2/3` ready) instead of 3. Root
cause: positional compose slugs were appended as separate entries instead of
joined to the semantic slugs by index. Fixed in
`packages/shared/src/deck-snapshot.ts` (`buildWorkspaceSnapshot` now joins by
1-based index; status is "ready" when a compose exists at that position) with a
regression test. This is exactly the kind of integration defect #449 exists to
catch.

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

## Follow-ups discovered (live run)

- **Chat-path deck attachment:** a deck generated through the full chat
  (main runtime → `create_slide_presentation` → slide runtime) completed but was
  not attached to the assistant message's `artifactManifest.deck`. The router's
  deck capture likely needs the same handling for the sdpm-skill result shape.
  → file a follow-up issue.
- **AgentCore streaming idle during long tool calls:** the BFF→main-runtime SSE
  reports `aborted` while the agent is inside the ~100s slide tool call (no bytes
  flowing). Simple chats stream fine. Needs a keepalive/relay strategy for long
  tool calls. → file a follow-up issue.
- **dev-deckprev slide runtime is currently on `sdpm-skill`.** Revert by
  redeploying without `-c presentationAuthorEngine=...`, or destroy the stage.

## Follow-ups discovered (image validation)

- The runtime venv must be on `PATH` for `python3` to resolve to the SDPM deps
  (the production Dockerfile already sets `ENV PATH="$VIRTUAL_ENV/bin:$PATH"`;
  the existing deck-render scripts rely on the same, so this is consistent).
- Japanese glyph fidelity in compose/preview SVG under `fonts-noto-cjk` should be
  eyeballed during scenario 2 (tracked as a check, not a blocker).
- `references/` (SDPM design guides, 608K) were intentionally not vendored;
  revisit if authoring quality needs them.
