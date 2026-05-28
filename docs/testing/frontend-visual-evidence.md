# Frontend Visual Evidence

This document explains how visual evidence artifacts are generated for UI-changing PRs, where to find them, and how to interpret them.

## What is this?

The `visual-evidence` Playwright project captures screenshots, videos, and traces of key frontend pages and flows in **mock API mode** (no backend required). These artifacts are uploaded to GitHub Actions on every CI run so reviewers can confirm that UI changes render correctly.

This is **not** strict visual regression testing. There are no pixel-diff thresholds or approval gates. The goal is reviewability, not enforcement.

## Artifacts produced

| Artifact | Location | When |
|---|---|---|
| Screenshots (per test) | `test-results/<test-name>/*.png` | Every test |
| Named screenshots (embedded in report) | Playwright HTML report | Every test |
| Videos | `test-results/<test-name>/video.webm` | Every test |
| Traces | `test-results/<test-name>/trace.zip` | Every test |
| HTML report | `playwright-report/index.html` | Every run |

All of the above are uploaded as the `frontend-visual-evidence` GitHub Actions artifact with 14-day retention.

## Pages and flows covered

| Test | Page/flow |
|---|---|
| `home page` | `/` — workspace loads, "New Thread" visible |
| `chat send message flow` | `/` — composer filled, message submitted, submitted message visible |
| `admin users table` | `/admin/users` — user table with mock data |
| `admin user detail drawer` | `/admin/users` — user row clicked, detail sheet open |

> The chat workspace lives at `/`. A separate `/chat` route does not exist yet; update the visual targets once it is added.

## Running locally

```bash
# From the repo root
pnpm test:frontend:visual-evidence

# Or directly from the frontend workspace
pnpm --filter @agentra/frontend test:e2e:mock:visual-evidence
```

Both commands run in `NEXT_PUBLIC_API_MODE=mock`, so no running backend or AWS credentials are needed.

After the run, open the HTML report:

```bash
npx playwright show-report apps/frontend/playwright-report
```

## Inspecting CI artifacts

1. Open the GitHub Actions run for your PR.
2. Scroll to **Artifacts** and download `frontend-visual-evidence`.
3. Unzip and open `playwright-report/index.html` in a browser to see screenshots embedded in the test results.
4. Videos (`.webm`) can be played directly from the extracted zip.
5. To inspect a trace: `npx playwright show-trace path/to/trace.zip`

The trace viewer shows a full action timeline, DOM snapshots, console logs, and network requests — useful for debugging unexpected UI states.

## What to do when a video or trace reveals a UI issue

1. Identify which test shows the regression (name is visible in the HTML report).
2. Open the video to see the full interaction.
3. If the cause is unclear, open the trace: `npx playwright show-trace` shows DOM snapshots at each step.
4. Fix the UI, re-run `pnpm test:frontend:visual-evidence`, and verify the artifacts look correct before pushing.

## Relationship to other test layers

| Layer | Purpose |
|---|---|
| **Vitest unit tests** | Component logic, hooks, utilities |
| **Storybook interaction tests** (#306) | Component-level interaction in isolation |
| **Playwright smoke tests** (#307) | Functional E2E smoke (no screenshot/video) |
| **This: visual evidence** (#322) | Screenshot + video artifacts for PR review |

The smoke tests (project `chromium`) and visual-evidence tests (project `visual-evidence`) share the same `playwright.config.ts` but run independently. Smoke tests are fast and produce no media; visual-evidence tests are slower but produce reviewable artifacts.

## Running only smoke (no visual evidence)

```bash
pnpm smoke:frontend:mock
```

This runs `--project=chromium` only and does not capture screenshots or videos.

## Why not strict visual regression?

Strict pixel-diff testing requires golden snapshots checked into the repository and an approval workflow for intentional visual changes. That overhead is out of scope for this first iteration. The goal here is to make UI regressions *visible* to reviewers, not to automate pass/fail decisions. Strict visual regression can be added as a follow-up once the artifact pipeline is stable.
