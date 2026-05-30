# Dark mode

Status: **implemented** (issue #337). Dark mode is a first-class design target per
[`DESIGN.md`](../../../DESIGN.md) and is now reachable, persisted, and verified.

## How it works

- **Tokens.** Light and dark are both defined as OKLCH stone tokens in
  [`app/globals.css`](../app/globals.css). The dark token block (`.dark { … }`) matches
  the target values proposed in `DESIGN.md` (near-black stone background, slightly
  elevated `card`/`popover` surfaces, low-chroma neutrals, subtle `1px` borders via
  `oklch(1 0 0 / 10%)`). Dark mode is **not** an inversion of light — surfaces, borders,
  and muted text are tuned independently.
- **Activation.** [`components/theme-provider.tsx`](../components/theme-provider.tsx)
  wraps the app with `next-themes` using `attribute="class"`, so the provider toggles the
  `.dark` class on `<html>`. `defaultTheme="system"` with `enableSystem` means a first
  visit follows the OS preference; an explicit choice is persisted in `localStorage`.
  `<html suppressHydrationWarning>` avoids the SSR class-vs-client mismatch warning.
- **Semantic color.** Status colors (success / warning / info / destructive) already
  carry explicit `dark:` variants (e.g. `text-green-700 dark:text-green-300`) following
  the three-tier model in `DESIGN.md`. They stay visible but restrained in dark mode —
  no neon, subtle `/10`–`/15` backgrounds.

## Decision: ship a visible theme toggle now

The issue asked whether to add a user-facing toggle now or rely solely on the `.dark`
class / system preference. **We ship a visible toggle now.**

Rationale:

- Before this change, `.dark` tokens existed but nothing ever applied the class — dark
  mode was effectively unreachable and unverifiable. System-only support would still
  leave users on a fixed-preference OS unable to opt in.
- Dark mode is a first-class design target, so giving it a first-class, discoverable
  control is consistent with that intent.
- `next-themes` is the battle-tested standard for this in Next.js: it handles SSR flash,
  system preference, and persistence without hand-rolled logic.

The control is [`components/theme-toggle.tsx`](../components/theme-toggle.tsx) — a
Light / Dark / System dropdown (lucide `Sun`/`Moon`/`Monitor`). It is placed in:

- the chat workspace header (next to the backend/health status), and
- the admin console sidebar footer.

Keyboard focus and `aria-label` are preserved; the trigger swaps Sun/Moon purely via the
`.dark` class so it never causes a hydration mismatch.

## Verification

`e2e/visual-evidence.test.ts` captures the required surfaces in **both** themes at
**desktop and narrow** widths (the theme is pinned deterministically via `localStorage`
plus Playwright `colorScheme`):

- chat home, assistant message with agent activity, chat home (narrow)
- admin users table, admin user detail drawer

Run it with:

```bash
pnpm --filter @agentra/frontend test:e2e:mock:visual-evidence
```

Unit coverage for the toggle lives in
[`components/__tests__/theme-toggle.test.tsx`](../components/__tests__/theme-toggle.test.tsx).
