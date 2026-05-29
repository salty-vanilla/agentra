# Modal / Drawer Performance Diagnosis

Diagnostic investigation for [#325](https://github.com/) — "Dialog / Drawer / Sheet
interactions feel heavy, especially around Admin screens."

This report is **evidence collection only**. No production behavior was changed.
All comparison experiments were applied at test time via CSS/JS injection from
Playwright (`apps/frontend/e2e/helpers/modal-performance.ts`); the production
`Dialog`/`Sheet` components were not modified.

## Environment & commands

| Item | Value |
|------|-------|
| Mode | `NEXT_PUBLIC_API_MODE=mock` (MSW browser worker, no AWS/backend) |
| Runner | Playwright `modal-performance` project (`apps/frontend/playwright.config.ts`) |
| Browser | Desktop Chrome (Chromium), headless |
| Iterations | 5 open/close cycles per (flow × experiment) |
| Machine | local dev (`pnpm dev` on `127.0.0.1:3000`) |

```bash
pnpm install
pnpm prepare:workspace
pnpm --filter @agentra/frontend playwright:install        # first run only
pnpm --filter @agentra/frontend e2e:mock:modal-performance
```

Raw data: `apps/frontend/test-results/modal-performance-results.json`.
Per-run screenshots / traces are attached to the Playwright HTML report.

## TL;DR

The perceived "もっさり" (sluggishness) is **not** how long the modal takes to appear
— that is ~40 ms everywhere. It is **dropped frames whenever something repaints while
a Dialog/Sheet is open**, caused by the **`backdrop-filter` blur on the overlays**.

`backdrop-filter` re-blurs the full-screen backdrop on **every repainted frame** — not
only during the open animation, but also on each post-open interaction (button hover
transitions, typing/caret). So:

- **Opening**: 5–10 dropped frames per open (worst ~40–50 ms).
- **Operating on the open dialog**: hovering its buttons drops **22–23 frames**; typing
  drops 7. (This is the "表示しきった後も操作するともっさり" case.)

Turning blur **off** (animations kept) drops all of these to **0–1 frames** (worst
~10–17 ms). This is why a "static" dialog still feels heavy: it is only static between
actions — every hover/keystroke triggers a repaint that re-pays the blur cost.

**Smallest safe fix:** remove the backdrop blur from the two overlays
(`components/ui/dialog.tsx`, `components/ui/sheet.tsx`). Animations and the dim overlay
stay; jank goes.

## What is measured

Two distinct things, because they are different problems:

1. **Latency — action → shell visible**: from the click that opens the modal/drawer
   until its title/heading is in the DOM and laid out. For the Trace Detail drawer we
   also time **action → content visible** (the `Timeline` section, which only renders
   after the `useQuery` detail fetch resolves).
2. **Smoothness — frame rate during motion**: a requestAnimationFrame probe samples
   frame-to-frame deltas during (a) the **open** animation + settle window, (b) a
   **post-open interaction** on the fully-shown modal (typing into the Invite field;
   hovering action buttons on the drawers/Delete dialog), and (c) **scrolling** the
   drawer body. We report dropped frames (>16.7 ms = missed a 60 fps frame), stutters
   (>50 ms) and the worst frame. `long-animation-frame` (LoAF) entries are also
   collected (best-effort).

> **Why latency alone was misleading.** Radix mounts the `Dialog`/`Sheet` content
> immediately on open; Playwright considers it "visible" as soon as it has a bounding
> box. The slide/fade animation (~150–200 ms) animates `transform`/`opacity` but does
> **not** delay visibility, so the latency metric is ~40 ms and *blind to* the blur.
> The cost of the blur shows up only in the per-frame rendering during motion and
> interaction, which is exactly what the smoothness probe captures — and what users feel.

## Tested routes & flows

1. **User Detail Drawer** — `/admin/users` → click first user cell → `User Detail` (Sheet, no fetch).
2. **Invite User Dialog** — `/admin/users` → `Invite User` → `ユーザーを招待` (Dialog, no fetch).
3. **Trace Detail Drawer** — `/admin/observability?tab=traces` → click a trace row (a different row each iteration to keep the react-query fetch fresh) → `Trace Detail` (Sheet, **fetches on open**).
4. **Delete Confirmation Dialog** — `/` → thread row actions menu → `Delete` → `Delete Thread` (Dialog). The open is a two-step interaction (open dropdown, then click Delete).

## Baseline timings (action → shell visible, ms)

| Flow | min | median | max |
|------|----:|-------:|----:|
| User Detail Drawer | 39 | 45 | 66 |
| Invite User Dialog | 33 | 39 | 54 |
| Trace Detail Drawer | 39 | 43 | 55 |
| Delete Confirmation Dialog | 105 | 110 | 121 |

Trace Detail, additional **action → content visible** (post-fetch): **min 322 / median 327 / max 340 ms**.

## Comparison experiments (median ms; Δ vs baseline)

| Flow | baseline | no-backdrop-blur | no-animations | minimal-drawer-content |
|------|---------:|-----------------:|--------------:|-----------------------:|
| User Detail Drawer | 45 | 40 (−5) | 42 (−3) | 36 (−9) |
| Invite User Dialog | 39 | 49 (+10) | 44 (+5) | 38 (−1) |
| Trace Detail Drawer (shell) | 43 | 45 (+2) | 42 (−1) | 45 (+2) |
| Delete Confirmation Dialog | 110 | 103 (−7) | 88 (−22) | 107 (−3) |

Trace Detail **content** (post-fetch) is unaffected by the experiments:
baseline 327, no-backdrop-blur 328, no-animations 325 ms.

Experiment definitions (injected CSS, diagnostic only):
- **no-backdrop-blur** — `backdrop-filter: none` on `[data-slot$="-overlay"]`.
- **no-animations** — `animation:none; transition:none` globally.
- **minimal-drawer-content** — hide drawer/dialog body, keep header/title/close.

## Smoothness — the actual "もっさり"

Frame sampling. Lower dropped/worst-frame = smoother. (Headless Chromium samples rAF
above 60 Hz, so read **dropped frames / worst frame**, not raw fps.) Dropped = frames
slower than a 60 fps budget (>16.7 ms). Representative run:

### Opening (open animation + ~450 ms settle)

| Flow | baseline | no-backdrop-blur | no-animations |
|------|---------:|-----------------:|--------------:|
| User Detail Drawer | **5 drop / 48 ms** | 1 / 18 ms | 0 / 10 ms |
| Invite User Dialog | **5 drop / 50 ms** | 2 / 17 ms | 0 / 10 ms |
| Trace Detail Drawer | **6 drop / 43 ms** | 1 / 23 ms | 0 / 17 ms |
| Delete Confirmation Dialog | **6 drop / 51 ms** | 3 / 17 ms | 3 / 18 ms |

### Operating on the fully-shown modal (typing / hovering controls)

| Flow (interaction) | baseline | no-backdrop-blur | no-animations |
|--------------------|---------:|-----------------:|--------------:|
| User Detail Drawer (hover buttons) | **22 drop / 41 ms** | 0 / 10 ms | 1 / 17 ms |
| Invite User Dialog (type email) | **7 drop / 32 ms** | 0 / 10 ms | 0 / 15 ms |
| Trace Detail Drawer (hover copy btns) | 0 / 14 ms | 0 / 9 ms | 1 / 18 ms |
| Delete Confirmation Dialog (hover buttons) | **23 drop / 42 ms** | 0 / 10 ms | 2 / 17 ms |

The result is consistent across every flow and **both** phases: with blur on, opening
drops 5–6 frames and *interacting* drops up to 22–23 frames (hover transitions) or 7
(typing). **Turning blur OFF (animations still on) drops everything to 0–1 frames.**

Why interaction matters: `backdrop-filter` recomputes on every repainted frame. A hovered
button animates its background (a `transition`), and typing repaints the caret/text —
each such frame forces a full-screen re-blur. So the dialog feels heavy not only while it
appears but every time you touch it. (The Trace Detail copy buttons barely repaint, so
that row shows little — it confirms the cost scales with how much repainting the
interaction causes.)

Disabling animations also reduces the numbers (fewer animated frames to re-blur), but
removing the blur is the clean fix that keeps the transitions and still yields 0–1 dropped
frames. `long-animation-frame` counts track the same pattern (baseline 6–12 delayed frames
per run vs 1–3 with blur off).

## Console & long-task observations

- **Long tasks** (`PerformanceObserver` `longtask`, supported in this environment):
  each page run shows a single ~180–210 ms long task plus an occasional 50–90 ms
  task. These appear **once per page load**, not per open — they line up with
  initial Next.js hydration / MSW worker init, not with the modal interaction.
  The per-open shell times (~40 ms for User/Invite/Trace) sit below the 50 ms
  long-task threshold.
- **Console** — admin Sheets/Dialogs emit `Warning: Missing Description or
  aria-describedby={undefined} for {DialogContent}` (Radix a11y warning), twice
  per open (10 over 5 iterations). The Delete dialog supplies a
  `DialogDescription`, so it emits **0** warnings. No console errors in any flow.
  This is an accessibility gap, not a performance cost.

## Likely bottleneck ranking

1. **Backdrop-filter blur on the overlays → dropped frames on every repaint (the
   "もっさり").** The dominant cause of perceived heaviness, in **both** phases:
   opening drops 5–6 frames (~40–50 ms worst), and *interacting* on the fully-shown
   modal drops up to 22–23 frames (button hover) or 7 (typing), because each repaint
   re-blurs the full-screen backdrop. Removing the blur (animations kept) restores
   smoothness everywhere (0–1 dropped, ~10–17 ms). This affects every Dialog/Sheet and
   matches "Dialog が表示されるときも、表示された後に操作してももっさり".
2. **Trace Detail drawer content fetch + render (~280 ms latency).** A separate
   issue: the shell appears in ~43 ms, but the body (`Timeline`) only after ~327 ms,
   driven by `useQuery(adminTraceDetailQueryOptions(traceId))` fetch-on-open. The
   only flow that fetches on open; larger against a real backend.
3. **Multi-step / dropdown-driven opens (Delete dialog, ~110 ms latency).** The
   measured action includes opening the `DropdownMenu` then clicking `Delete`.
4. **Open animations themselves — fine.** With blur off but animations on, motion is
   smooth (0–1 dropped frames). The animation is not the problem; the per-frame blur
   it triggers is. Keep the animations.
5. **Virtual table layout / React re-render — not implicated.** Shells open in ~40 ms
   regardless of `minimal-drawer-content`; the admin tables are already virtualized.

> Correction to a first-pass note: an earlier latency-only measurement suggested
> "blur is not a bottleneck." That was measuring time-to-visible, which blur does not
> affect. The frame-rate probe shows blur **is** the primary cause of the sluggish
> motion. Always measure runtime frames for "feels janky" complaints, not just latency.

## Recommended smallest safe fix

**Remove the backdrop blur from the Dialog and Sheet overlays.** Two-line change,
keeps the dim overlay and the open animation, eliminates the per-frame full-screen
blur that drops frames:

- `components/ui/dialog.tsx` (DialogOverlay) — drop `supports-backdrop-filter:backdrop-blur-[1px]`.
- `components/ui/sheet.tsx` (SheetOverlay) — drop `supports-backdrop-filter:backdrop-blur-xs`.

This is the highest-leverage, lowest-risk change and directly targets the #1 finding.
Re-running `e2e:mock:modal-performance` after the change should show baseline dropping
to 0–1 dropped frames per open (i.e. matching today's `no-backdrop-blur` column).

Secondary (separate, optional): **prefetch the trace detail on row hover/focus**
(`queryClient.prefetchQuery(adminTraceDetailQueryOptions(traceId))` in `traces-tab.tsx`)
to cut the Trace Detail content latency (#2). No visual change; degrades gracefully.

> Note: measurements are in **mock mode** (render/compositing cost + MSW round-trips,
> not real backend latency). The blur/jank finding is rendering-bound and so transfers
> directly to production; the Trace Detail latency will be larger with a real backend.

## Suggested follow-up issues

1. **Remove backdrop blur on Dialog/Sheet overlays** (the fix above) — implement +
   verify dropped frames per open fall to ~0 in this harness. *(If the team wants to
   keep a frosted look, gate the blur behind `prefers-reduced-motion`/a setting, or
   apply a static blur to the panel instead of an animated backdrop.)*
2. **Prefetch trace detail on hover/focus** — cut Trace Detail content latency.
3. **Add `Description`/`aria-describedby` to admin Sheets & the Invite dialog** —
   removes the recurring Radix a11y warning (10 per flow). Accessibility, not perf.
4. **Re-measure against a real/staging backend** to quantify Trace Detail fetch latency.
