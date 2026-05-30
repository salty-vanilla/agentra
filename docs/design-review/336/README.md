# Agentra Frontend — AI Design Review (Issue #336)

> **Evaluation baseline:** [`DESIGN.md`](../../../DESIGN.md) — the source of truth for Agentra
> frontend visual direction. Every finding below references the relevant `DESIGN.md`
> section.
>
> **Method:** Real rendered screens captured with a headless Chromium browser driving
> the Next.js app in **mock API mode** (`NEXT_PUBLIC_API_MODE=mock`, MSW). Interactions
> (thread selection, dialog/drawer/popover opening, search, message send) were performed
> against the live UI — this is not a code-only review. Capture is reproducible via
> [`apps/frontend/scripts/design-review-capture.mjs`](../../../apps/frontend/scripts/design-review-capture.mjs).
>
> **Date:** 2026-05-30 · **Depends on:** #333 (DESIGN.md), #334 (tokens), #335 (component alignment) — all merged.
>
> **Scope guard:** Per the issue, this is a **review-and-report** task. No broad UI
> refactors were made. The only code added is the capture script + this report.

---

## 1. Summary

The stone-based token migration (#334) and component alignment (#335) have landed well.
The product reads as **calm, monochrome-first, and operational** exactly as `DESIGN.md`
§1 intends: flat stone surfaces, no decorative gradients, restrained radius, opaque
bordered cards/drawers/dialogs, and **semantic color reserved for state** (success green,
error/destructive red, warning amber, cancelled muted). Chat error/cancelled/warning
states, the observability KPI hierarchy, monochrome charts with a single accent, and the
trace-detail drawer are all on-direction.

The headline problem is **responsiveness of the admin area**: the admin sidebar does not
collapse on narrow viewports, which breaks every `/admin/*` screen below ~768px. A second
recurring issue is **left-aligned numeric table columns**, which contradicts the
scan-ability rules `DESIGN.md` calls out for the admin/observability workhorse tables. A
third is **inconsistent JA/EN labelling** on admin surfaces, which works against the
"approachable for non-engineers" goal.

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 1 |
| Medium | 3 |
| Low | 4 |

No Critical issues. One High issue (admin responsiveness) is the only one that materially
breaks a use case; everything else is polish or consistency.

---

## 2. Screenshot list

All images in [`./screenshots/`](./screenshots), captured at desktop **1440×900** and
narrow **390×844** (`deviceScaleFactor: 2`).

### Chat / AI surfaces (desktop)

| # | File | Screen / state |
|---|---|---|
| 1 | `chat-01-home-empty.png` | Chat home — empty / welcome, prompt cards, composer |
| 2 | `chat-02-conversation.png` | Chat thread — user + assistant message, action bar |
| 3 | `chat-03-agent-activity.png` | Agent-activity thread — observability summary variations |
| 4 | `chat-04-observability-detail.png` | **Popover** — Observability/agent-activity detail (trace, tools, agents) |
| 5 | `chat-05-error-states.png` | Error / cancelled / warning message states |
| 6 | `chat-06-artifact.png` | Artifact link card (`presentation.pptx`, PPTX • 1.2 MB) |

### Admin / Observability (desktop)

| # | File | Screen / state |
|---|---|---|
| 7 | `admin-01-home.png` | Admin Console home — section cards |
| 8 | `admin-02-observability-overview.png` | Observability dashboard — KPI cards + charts |
| 9 | `admin-03-observability-traces.png` | Traces table |
| 10 | `admin-04-trace-detail-drawer.png` | **Drawer** — Trace detail (DetailRows + timeline) |
| 11 | `admin-05-observability-users.png` | Observability — per-user usage table |
| 12 | `admin-06-users.png` | Admin Users — table + SearchToolbar + role filter |
| 13 | `admin-07-user-detail-drawer.png` | **Drawer** — User detail (DetailRows + actions) |
| 14 | `admin-08-invite-dialog.png` | **Dialog** — Invite User |
| 15 | `admin-09-users-search-empty.png` | **Empty state** — no users match the filter |

### Narrow width (390px)

| # | File | Screen / state |
|---|---|---|
| 16 | `narrow-01-chat-home.png` | Chat home — sidebar collapsed to toggle (correct) |
| 17 | `narrow-02-admin-home.png` | Admin home — **sidebar does not collapse** |
| 18 | `narrow-03-admin-users.png` | Admin Users — **table truncated, columns clipped** |
| 19 | `narrow-04-admin-observability.png` | Observability — **KPI labels/tabs clipped** |

**States covered:** default, empty (filter no-match), error / cancelled / warning (chat),
long-ish multi-line content (error message body, KPI cards). **Loading** states were not
reliably capturable in mock mode (MSW resolves near-instantly) — see
[§5 Method limitations](#5-method-limitations).

---

## 3. Findings

Each finding is tagged with a **category**: `DESIGN.md violation`, `usability`,
`accessibility`, or `implementation inconsistency`.

### HIGH

#### H-1 · Admin sidebar does not collapse on narrow viewports
- **Category:** DESIGN.md violation (§11) + usability + component inconsistency
- **Evidence:** `narrow-02-admin-home.png`, `narrow-03-admin-users.png`, `narrow-04-admin-observability.png`
- **Where:** `apps/frontend/app/admin/layout.tsx` (static `<AdminSidebar/>` + `<main>`),
  `apps/frontend/components/admin/admin-sidebar.tsx:78` (`<aside className="w-56 shrink-0 border-r …">`)
- **What:** The admin shell renders a fixed-width `w-56` (224px) sidebar with `shrink-0`
  and no responsive variant. At 390px it consumes ~57% of the viewport, leaving the data
  tables ~166px. Consequences observed:
  - Users table shows only a clipped **Email** column; User ID / Sub / Role / Status /
    Created / Last Seen / Requests are pushed off-screen with **no horizontal-scroll
    affordance**.
  - Observability KPI card labels and values truncate ("Reque", "Total Token", "Avg
    Durati", "P95 Durati"); the tab strip clips ("Overview / Users / A…").
  - The role-filter segment clips ("Use…").
- **Why it matters:** `DESIGN.md` §11 explicitly requires "Sidebar and admin navigation
  collapse to drawers/sheets on small screens" and "Tables degrade gracefully (horizontal
  scroll or stacked rows) rather than truncating critical columns." The **chat** workspace
  already does this correctly (`SidebarProvider` + `SidebarTrigger`, see
  `narrow-01-chat-home.png`), so this is also a consistency gap between the two shells.
- **Suggested fix:** Adopt the same `components/ui/sidebar` primitive (offcanvas/sheet on
  mobile + trigger) used by the chat workspace for the admin shell, and ensure `DataTable`
  has an `overflow-x-auto` wrapper. Tracked as proposed follow-up **F-1**.

### MEDIUM

#### M-1 · Numeric table columns are left-aligned
- **Category:** DESIGN.md violation (§9) + scan-ability/usability
- **Evidence:** `admin-03-observability-traces.png`, `admin-05-observability-users.png`, `admin-06-users.png`
- **What:** Duration, Tokens, Tools, Agents, Skills (Traces); Requests, Tokens, Avg
  Duration, Error Rate (Observability Users); Requests (Admin Users) are all **left-aligned**.
- **Why it matters:** `DESIGN.md` §9 is explicit: "use monospace/tabular numerals … align
  columns; **right-align numerics**." These tables are the admin/observability workhorse
  surface where column alignment drives scan-ability. Left-aligned numbers of varying
  width make magnitude comparison harder.
- **Suggested fix:** Right-align numeric columns (`text-right` on header + cell) and
  confirm tabular figures are applied. Proposed follow-up **F-2**.

#### M-2 · Inconsistent JA / EN labelling on admin surfaces
- **Category:** implementation inconsistency + usability (non-engineer friendliness, §1)
- **Evidence:** `admin-07-user-detail-drawer.png`, `admin-08-invite-dialog.png`, `admin-09-users-search-empty.png`
- **What:** Chrome and structural labels are English ("Invite User", "User Detail", "View
  traces", "No users match the filter.", column headers), while action labels and the
  entire invite dialog are Japanese ("Admin に昇格", "無効化", "招待メールを再送",
  "ユーザーを招待", "メールアドレス", "招待する"). The chat surface is JA-leaning; admin is
  mixed within the same view.
- **Why it matters:** The app ships `<html lang="ja">` and `DESIGN.md` §1 targets
  "approachable for non-engineers." A single screen flipping between languages reads as
  unfinished and raises cognitive load. `DESIGN.md` §5 also covers JA/EN typography
  expectations that presuppose a deliberate language strategy.
- **Suggested fix:** Decide a primary admin UI language (or introduce i18n) and apply it
  consistently per surface. Proposed follow-up **F-3**.

#### M-3 · High-severity metric values carry no semantic emphasis
- **Category:** DESIGN.md violation (§9 "State via semantic …") + usability
- **Evidence:** `admin-05-observability-users.png` (Error Rate `33.3%`), `admin-02-observability-overview.png`
- **What:** Error Rate values render in the same neutral foreground regardless of
  magnitude — `0.0%`, `8.3%`, and `33.3%` are visually identical. A 33% tool/error rate is
  a state worth surfacing.
- **Why it matters:** `DESIGN.md` §9/§2 reserve hue for state and define warning/error
  tiers; an at-a-glance "this user/agent is failing" signal is exactly the operational
  read these tables exist for.
- **Suggested fix:** Apply the warning/error text tier above defined thresholds (e.g.
  amber ≥ ~10%, destructive ≥ ~25%). Keep it subtle (tier-1 text color, not fills).
  Proposed follow-up **F-2** (bundle with table polish).

### LOW

#### L-1 · Empty state does not offer a next action
- **Category:** DESIGN.md violation (§10) — minor
- **Evidence:** `admin-09-users-search-empty.png`
- **What:** "No users match the filter." states what's missing but not the next step.
  §10 asks empty states to "explain what's missing **and the next action**."
- **Suggested fix:** Add a "Clear filter" affordance / hint in the empty cell.

#### L-2 · Disabled "Coming Soon" cards/nav — verify contrast
- **Category:** accessibility (§12) — to verify
- **Evidence:** `admin-01-home.png` (opacity-60 cards), `admin-sidebar.tsx` (opacity-50 nav)
- **What:** Disabled sections use `opacity-50`/`opacity-60` over muted-foreground. §12
  flags `muted-foreground` contrast specifically. Disabled controls are exempt from WCAG
  contrast minimums, but the **"Coming Soon" badge** text is informational, not a control,
  so its contrast should be checked against AA (≥ 4.5:1).
- **Suggested fix:** Measure the badge text contrast; raise if below AA.

#### L-3 · Chat user-message surface uses a faint colored tint
- **Category:** implementation inconsistency (§8) — minor/subjective
- **Evidence:** `chat-02-conversation.png`, `chat-05-error-states.png`
- **What:** User bubbles use a faint tinted surface to distinguish from assistant text.
  §8 endorses "subtle surface" for this, so it is within direction — flagged only to
  confirm the tint derives from a stone/neutral token (not a leftover brand hue) and to
  keep it consistent in dark mode (#337).

#### L-4 · Dark mode not verified
- **Category:** method note (§2, §13) — out of scope here
- **What:** All evidence is **light theme**. `DESIGN.md` §2/§13 make dark mode a
  first-class target but explicitly defer implementation/verification to **#337**. Re-run
  this capture in both themes once #337 lands.

---

## 4. On-direction highlights (no action needed)

These confirm the migration is working and should be preserved:

- **Stone monochrome-first** surfaces, no decorative gradients, opaque bordered cards —
  `admin-01`, `chat-01`. (§1, §6)
- **Semantic state tiers** correct and restrained: error (red + 再送信), cancelled (muted),
  warning (amber banner) — `chat-05`. (§2, §10)
- **Restrained radius** and opaque bordered **Dialog/Drawer/Popover** with subtle
  elevation, no blur-heavy chrome — `admin-04`, `admin-07`, `admin-08`, `chat-04`. (§3, §7)
- **KPI hierarchy via weight/size**, monochrome charts with a single accent, always an
  axis/empty affordance — `admin-02`. (§5, §9)
- **Trace-detail drawer** = dense `DetailRow` pairs + a structured tool/agent timeline with
  status icons — `admin-04`. Strong operational read. (§9)
- **Agent activity shown structurally** (status icon + tool list + durations + agents),
  not via spectacle — `chat-04`. (§8)
- **Visible focus ring** on inputs — `admin-09`. (§12)
- **Chat shell is correctly responsive** (collapsing sidebar + toggle) — `narrow-01`. (§11)

---

## 5. Method limitations

- **Loading states** were not captured: mock (MSW) responses resolve near-instantly, so
  skeleton/`Loader2Icon` states flash by. These exist in code (`components/ui/skeleton.tsx`,
  `DataTable` loading state) and are exercised in Storybook (#306) / Vitest+MSW (#265). A
  follow-up could capture them via a Storybook story with an artificial MSW delay
  (`parameters.msw.handlers`) per `DESIGN.md` §14 — proposed as **F-4**.
- **Network/API error states** for admin tables (e.g. 500 on `/admin/traces`) were not
  injected; only chat-level persisted error/cancelled states were exercised. Worth adding
  an MSW error-handler pass in a follow-up.
- **Citations / evidence display:** there is no dedicated inline-citation component yet;
  the closest "evidence" surface is the observability/agent-activity popover
  (`chat-04`), which is what was reviewed. If a distinct citation UI is planned, it should
  get its own review pass.
- **Dark mode:** deferred to #337 (see L-4).

---

## 6. Suggested follow-up issues

> Per the issue constraints, follow-up changes are kept **out of this issue**. Proposed
> here for separate tracking.

| ID | Title | Severity | Area |
|---|---|---|---|
| **F-1** | Make the admin shell responsive (collapsing sidebar + horizontally-scrollable tables) | High | `app/admin/layout.tsx`, `components/admin/admin-sidebar.tsx`, `components/ui/data-table` |
| **F-2** | Right-align numeric table columns + apply semantic tier to high error-rate values | Medium | `traces-tab`, `users-tab` (observability), `admin-users-page` |
| **F-3** | Resolve JA/EN labelling inconsistency on admin surfaces (pick a language or add i18n) | Medium | `components/admin/*` |
| **F-4** | Capture loading + API-error states for admin tables via Storybook/MSW delay & error handlers | Low | `apps/frontend` Storybook + visual evidence |
| **F-5** | Add "Clear filter" affordance to empty table states; verify "Coming Soon" badge contrast | Low | `data-table` empty state, `admin/page.tsx`, `admin-sidebar.tsx` |

---

## 7. Reproduce

```bash
# From the worktree root, in mock mode (no backend/AWS needed)
cd apps/frontend
NEXT_PUBLIC_API_MODE=mock pnpm dev            # terminal 1 (serves 127.0.0.1:3000)
node scripts/design-review-capture.mjs        # terminal 2 (writes screenshots)
```

Screenshots are written to `docs/design-review/336/screenshots/`.
