# Agentra Design Guide

> **Source of truth for Agentra frontend visual direction.**
> Read this before any UI polish work. It is written to be actionable for AI coding
> agents (Claude Code, Codex) and human contributors alike.

## How to use this document

- This is the **visual direction** for `apps/frontend`. It defines the target system:
  product personality, color/spacing/typography/elevation rules, component principles,
  and review expectations.
- **This document is direction, not an automatic refactor mandate.** Writing or updating
  `DESIGN.md` does **not** change tokens or UI. Token and component migration is tracked
  by separate issues (see [Migration & related issues](#migration--related-issues)).
- When this guide and the current code disagree, the guide describes where we are
  **going**; the [migration appendix](#appendix-a--current--target-token-migration-map)
  records the deltas.
- Companion docs (do not duplicate them here):
  - [`AGENTS.md`](AGENTS.md) — canonical agent/repo rules.
  - [`apps/frontend/docs/frontend-architecture.md`](apps/frontend/docs/frontend-architecture.md) — Container/Presenter/Hook split, Storybook as quality gate, UI-state checklist.
  - [`apps/frontend/docs/testing-strategy.md`](apps/frontend/docs/testing-strategy.md) — Vitest / Storybook / Playwright layers, MSW.
  - [`docs/testing/frontend-visual-evidence.md`](docs/testing/frontend-visual-evidence.md) — visual-evidence capture and reporting.

---

## 1. Product personality & visual direction

**Agentra is not a playful chat app and not a developer-only console. It is an AI
operations workspace that should feel calm, trustworthy, precise, and approachable.**

The UI should feel:

- **Calm** — quiet surfaces, no decoration competing with content.
- **Trustworthy** — consistent, predictable, legible at a glance.
- **Operational** — built for doing work and reading state, not for demos.
- **Refined** — restrained radius, considered spacing, no visual noise.
- **Dense but readable** — high information density without crowding.
- **AI-native but not flashy** — agent activity is shown plainly, via structure and
  semantic color, never via spectacle.
- **Approachable for non-engineers** — stone neutrals keep it warm and human; it must
  not read as a raw terminal or admin-only tool.

We borrow the **precision, information density, and restraint of Vercel and
GitHub-style interfaces**, and the **warmth of the shadcn "stone" neutral scale**, so the
product never feels cold or developer-only.

### How this differs from today

The current theme is warm, soft, and mist-like: a beige background with teal/amber
decorative radial gradients, a **teal** primary, large radius (16px base, scaling well
past it), translucent surfaces, and `backdrop-blur` on elevated chrome.

The target is **stone-based and monochrome-first**:

| From (today) | To (target) |
|---|---|
| Warm beige background + teal/amber body gradients | Flat **stone** neutral surfaces, no decorative gradients |
| Teal primary as default chrome | **Stone near-black** primary; color reserved for state |
| Large radius (`--radius: 1rem`, up to `4xl`) | **Restrained radius** (~`0.5rem` base) |
| Translucent cards + `backdrop-blur` | Opaque surfaces, borders + subtle elevation |
| Color used decoratively | **Color only for semantic state or important UI** |

Token-level deltas are enumerated in
[Appendix A](#appendix-a--current--target-token-migration-map).

---

## 2. Color

### Principles

- **Monochrome-first.** Build every screen from stone neutrals
  (`background`, `foreground`, `muted`, `muted-foreground`, `border`). A screen should
  read clearly in grayscale.
- **Color carries meaning, not decoration.** Reserve hue for semantic state (success,
  warning, error, info) and for the single most important action on a surface.
- **Keep the existing architecture.** We keep OKLCH, CSS custom properties, and the
  Tailwind v4 `@theme inline` setup in `apps/frontend/app/globals.css`. This is a
  **palette** change in direction, not a format or tooling change.
- **shadcn "stone" is the baseline, not a straitjacket.** Stone is our starting palette,
  but Agentra **may tune tokens** for Japanese UI legibility, information density, and
  accessibility/contrast targets. Deviations from stock shadcn stone are expected and
  allowed where they serve those goals — document them when made.

### Proposed target tokens

> **These OKLCH values are proposed _target_ tokens for the token migration (see #334
> and later). They are not applied in this issue and must not be edited into
> `globals.css` here.** They give agents concrete numbers to aim at, keyed to the shadcn
> stone scale (https://ui.shadcn.com/colors).

**Light:**

```css
--background:        oklch(1 0 0);
--foreground:        oklch(0.147 0.004 49.25);
--card:              oklch(1 0 0);
--card-foreground:   oklch(0.147 0.004 49.25);
--popover:           oklch(1 0 0);
--popover-foreground:oklch(0.147 0.004 49.25);
--primary:           oklch(0.216 0.006 56.043);   /* stone near-black */
--primary-foreground:oklch(0.985 0.001 106.423);
--secondary:         oklch(0.97 0.001 106.424);
--muted:             oklch(0.97 0.001 106.424);
--muted-foreground:  oklch(0.553 0.013 58.071);
--accent:            oklch(0.97 0.001 106.424);
--border:            oklch(0.923 0.003 48.717);
--input:             oklch(0.923 0.003 48.717);
--ring:              oklch(0.709 0.01 56.259);
--destructive:       oklch(0.577 0.245 27.325);
```

**Dark** (dark mode is a **first-class design target** — see note below):

```css
--background:        oklch(0.147 0.004 49.25);
--foreground:        oklch(0.985 0.001 106.423);
--card:              oklch(0.216 0.006 56.043);
--popover:           oklch(0.216 0.006 56.043);
--primary:           oklch(0.923 0.003 48.717);
--primary-foreground:oklch(0.216 0.006 56.043);
--secondary:         oklch(0.268 0.007 34.298);
--muted:             oklch(0.268 0.007 34.298);
--muted-foreground:  oklch(0.709 0.01 56.259);
--border:            oklch(1 0 0 / 10%);
--input:             oklch(1 0 0 / 15%);
--ring:              oklch(0.553 0.013 58.071);
```

**Rule of thumb for any new neutral token:** neutral hue (~50–60°), chroma ≤ ~0.013.

> **Dark mode is a first-class design target.** Every surface, state, and component in
> this guide must be designed for both themes; the current class-based strategy
> (`@custom-variant dark`) stays. Dark-mode **implementation and verification** is
> tracked by **#337** — design here, verify there.

### Semantic color usage

Reserve hue for state. Use three intensity tiers consistently:

| State | Tier 1 (text/icon) | Tier 2 (subtle bg) | Tier 3 (solid) |
|---|---|---|---|
| Success | green-600 / green-400 (dark) | `bg-*/10` | solid green (rare) |
| Warning | amber-700 / amber-300 | `bg-amber-500/10` | solid amber (rare) |
| Error / destructive | `text-destructive` | `bg-destructive/10` | `bg-destructive` |
| Info (optional) | stone/blue-600 | `bg-*/10` | — |

- Do **not** use the old brand teal as default chrome.
- Subtle backgrounds (`/10`) + a tier-1 icon/text are the default for status; solid fills
  are for primary actions and destructive confirmation only.

---

## 3. Radius

Restrained, not rounded-friendly.

- **Base `--radius` ≈ `0.5rem`** (down from `1rem`).
- Controls (button, input, badge): `sm`–`md`.
- Cards, dialogs, drawers, popovers: `lg`.
- **Retire the decorative `xl`–`4xl` tiers from default surfaces.** Toasts and chrome
  should not use `rounded-2xl`+.

---

## 4. Spacing

- **4px base scale.** Prefer the standard Tailwind spacing steps; avoid arbitrary values.
- Dense but breathable — favor tight, consistent gaps over generous padding.
- **Consistent control heights.** The existing Button heights are the reference:
  `xs h-6`, `sm h-7`, `default h-8`, `lg h-9`. New controls align to these.
- Tables and lists are compact by default; reserve generous spacing for marketing/empty
  states, not operational surfaces.

---

## 5. Typography

- **Latin:** Geist (`next/font`, `--font-sans`); headings share the sans stack.
- **Japanese & mixed JA/EN** (the app ships `<html lang="ja">`):
  - Use a system JA stack fallback; ensure CJK glyphs render with adequate weight.
  - **Line-height** for JA body text should be looser than Latin (~1.7–1.8) for legibility.
  - **Do not apply letter-spacing/tracking to Japanese text** — it harms readability.
  - Keep JA UI labels concise; avoid forced uppercasing (no effect on JA, noisy with EN).
- **Numerals:** use tabular/lining figures for tables, metrics, durations, and token
  counts so columns align.
- Establish a small, restrained heading scale; lean on weight and color (`foreground` vs
  `muted-foreground`) for hierarchy rather than large sizes.

---

## 6. Border, shadow, elevation, blur, gradient

- **Borders + subtle elevation over heavy shadows.** Define structure with 1px stone
  borders; use shadow sparingly and softly for genuinely floating layers (popover,
  dialog).
- **No decorative gradients.** Remove the teal/amber body radials and the warm linear
  gradient; surfaces are flat stone.
- **Minimize blur.** `backdrop-blur` is not a default; avoid it except where a floating
  layer genuinely overlaps scrolling content, and keep it subtle.
- **Opaque over translucent.** Prefer solid surfaces to the current 88–96% opacity cards.

---

## 7. Component principles

Agentra uses **shadcn/ui + class-variance-authority (cva) + Radix** (`components/ui/*`).
Keep that foundation; adjust variant styling toward stone/semantic and restrained radius.

- **Button** — `default` = stone primary; `secondary`/`outline`/`ghost` for the rest;
  `destructive` reserved for irreversible actions; `link` for inline navigation. One
  primary action per surface.
- **Card** — opaque stone surface, 1px border, `lg` radius, minimal shadow.
- **Table** — compact rows, stone borders, tabular numerals, status via badge tier; this
  is the workhorse of admin/observability — optimize for scan-ability.
- **Badge** — semantic tiers; `outline`/`secondary` for neutral metadata, semantic
  variants for state.
- **Tabs** — quiet, underline/segment style; do not compete with content.
- **Dialog / Drawer (Sheet) / Popover** — opaque, bordered, `lg` radius, subtle
  elevation, no blur-heavy chrome.
- **Form / Input** — clear focus ring (`--ring`), visible labels, inline validation using
  the error semantic tier.

---

## 8. AI & chat surfaces

References: `components/assistant-ui/*`.

- **Chat messages** — calm, legible; user vs assistant distinguished by alignment/subtle
  surface, not loud color.
- **Assistant responses** — markdown rendered cleanly; code blocks use a quiet stone
  surface; generous line-height for JA/EN mixed prose.
- **Agent activity** (`ProgressSummaryCard`, `SubAgentProgressCard`,
  `tool-fallback.tsx`) — show progress and tool execution structurally, with status icons
  + semantic color (running/success/error), never decorative animation.
- **Artifacts** (`artifact-card.tsx`) — clear file affordance (icon, name, size,
  download); restrained radius; loading state via the standard spinner.
- **Citations** — unobtrusive inline references; legible, low-chroma, clearly tappable.

---

## 9. Admin / Observability / Trace / Log

References: `components/admin/*` (`traces-tab`, `overview-tab`, detail drawers, etc.).

- **High information density.** These surfaces favor tables and compact cards.
- **Tabular clarity.** Use monospace/tabular numerals for IDs, durations, tokens, costs;
  align columns; right-align numerics.
- **State via semantic badges.** Map status → tier (success `default`/green, error
  `destructive`, pending/other `secondary`) consistently across tabs.
- **Charts** (Recharts via `ChartContainer`/`ChartEmptyState`) use stone neutrals with at
  most one accent; always provide an empty state.
- Detail drawers (Sheet) present read-dense data with `DetailRow` label/value pairs.

---

## 10. States: loading / empty / error / success

Every data surface must design all four states (mirrors the UI-state checklist in
`frontend-architecture.md`). Reuse existing patterns:

- **Loading** — `Skeleton` (`components/ui/skeleton.tsx`), `DataTable` loading state,
  inline `Loader2Icon`.
- **Empty** — `ChartEmptyState`, `DataTable` `emptyMessage`; explain what's missing and
  the next action.
- **Error** — semantic error tier, human-readable message, no leaked internals.
- **Success** — confirm via the success tier / `ProgressSummaryCard` completion, then get
  out of the way.

---

## 11. Responsive behavior

- Mobile-first within reason; operational density is the priority on desktop.
- Sidebar and admin navigation collapse to drawers/sheets on small screens.
- Tables degrade gracefully (horizontal scroll or stacked rows) rather than truncating
  critical columns.
- Adjust spacing/density per breakpoint; never reflow to the point of losing scan-ability.

---

## 12. Accessibility & contrast

- **Target WCAG 2.1 AA.** Pay particular attention to `muted-foreground` on `muted`
  surfaces — verify ≥ 4.5:1 for body text, ≥ 3:1 for large text/UI, in **both** themes.
- **Visible focus.** Always render the `--ring` focus state; never remove outlines.
- **Keyboard navigation** for all interactive elements (Radix gives most of this — keep
  it).
- **Hit targets** sized adequately on touch.
- **Dark-mode parity** is required (verification tracked by #337).

---

## 13. Screenshot evidence for UI PRs

Any PR that changes UI must include visual evidence:

- Attach screenshots in **light + dark** themes and **desktop + mobile** widths.
- Capture is automated via the Playwright **`visual-evidence`** project in
  `apps/frontend/playwright.config.ts` (screenshot/video/trace).
- **Detailed execution and reporting** of visual evidence is delegated to **#336** and the
  existing guide: [`docs/testing/frontend-visual-evidence.md`](docs/testing/frontend-visual-evidence.md).
  This document states the *requirement*; that doc/issue owns the *how*.

---

## 14. Playwright / Storybook / MSW review expectations

See [`apps/frontend/docs/testing-strategy.md`](apps/frontend/docs/testing-strategy.md) for
the full layering. In short:

- **Storybook** — every UI component ships a story; demonstrate all relevant states
  (default, loading, empty, error, long content, mobile).
- **MSW** — drive data-dependent states via per-story handlers (`parameters.msw.handlers`)
  and in Vitest via `setupServer`.
- **Playwright** — `smoke` for critical flows; `visual-evidence` for review artifacts
  before requesting review.

---

## Migration & related issues

This guide is the destination. Execution is tracked separately:

- **#333 (this issue):** create `DESIGN.md` — documentation only, no token/UI changes.
- **#334 and later:** apply the proposed stone target tokens in `globals.css` and tune
  components.
- **#336:** visual-evidence execution and reporting workflow.
- **#337:** dark-mode implementation and verification.

---

## Appendix A — Current → target token migration map

> Direction for future PRs (#334+). **Not applied in this issue.** Current values are
> from `apps/frontend/app/globals.css`.

| Token / aspect | Current | Target |
|---|---|---|
| `--background` (light) | `oklch(0.98 0.012 84.9)` (warm beige) | `oklch(1 0 0)` (stone white) |
| `--foreground` (light) | `oklch(0.22 0.013 43.2)` | `oklch(0.147 0.004 49.25)` (stone) |
| `--primary` (light) | `oklch(0.46 0.105 186.7)` (teal) | `oklch(0.216 0.006 56.043)` (stone near-black) |
| `--accent` (light) | `oklch(0.9 0.032 183.2)` (cyan) | stone `oklch(0.97 0.001 106.424)` |
| `--border` (light) | `oklch(0.87 0.012 72.1)` | `oklch(0.923 0.003 48.717)` |
| `--ring` (light) | `oklch(0.57 0.104 188.5)` (cyan) | `oklch(0.709 0.01 56.259)` (stone) |
| `<body>` background | teal + amber radial gradients over `#f7f2e8→#ece4d6` linear | flat `--background`, **no gradients** |
| `--radius` | `1rem` (16px), scales to `--radius-4xl` | ~`0.5rem`; drop `xl`–`4xl` from default surfaces |
| Elevated surfaces | `backdrop-blur-md/sm`, large shadows, 88–96% opacity | opaque, 1px stone border, subtle shadow, minimal blur |
| Component accents | raw `teal-*` / `amber-*` Tailwind utilities | semantic tiers only (success/warning/error/info) |

Dark-mode token targets are listed in [§2](#proposed-target-tokens); their application is
tracked by **#337**.
