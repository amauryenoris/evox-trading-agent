# Requirements — Health Monitor Dashboard Tab (6th tab)

## Background

`scripts/position-health-check.ts` runs twice daily on trading days
(`.github/workflows/position-health.yml`) and, for every currently-open
position, recomputes its current technical state and compares it against
the entry-time state stored in `open_position_contexts.indicators.
state_fingerprint`, writing one row per position into
`position_health_snapshots` (all rows in one run sharing the same
`snapshot_timestamp`). Observability only — no score, gate, alert, or exit
action. This data currently only exists in Supabase and is never displayed.
This CHANGE adds a 6th, read-only dashboard tab surfacing the most recent
snapshot batch.

## Verified Against Current Code (originally 2026-09-10, re-verified 2026-09-14 — no drift found either time)

- **No existing reader for `position_health_snapshots` anywhere in `src/lib`** (confirmed via search, both dates) — a new `db.ts` function is genuinely needed, not a duplicate of anything.
- **Live schema confirmed via `npx supabase db query --linked`** against `information_schema.columns`: `id` (`uuid`, not null, not in the originating prompt's column list but present as the table's primary key), plus exactly the 15 columns the prompt cited (`symbol`, `position_buy_timestamp`, `snapshot_timestamp` all `text`/not null; the 8 `entry_*`/`current_*_bucket`/`current_spx_regime` columns all nullable `text`; `current_adx`, `current_macd_histogram`, `current_z_score`, `current_price` nullable `double precision`; `days_since_entry` nullable `integer`). No drift from the prompt's Context section beyond the `id` column. `npx supabase migration list` re-checked on 2026-09-14: no new migrations since this spec was drafted, so the schema is unchanged.
- **`scripts/position-health-check.ts`'s insert shape matches the schema exactly** — no drift between what's written and what's live. No commits have touched this script since the spec was drafted (`git log` re-checked).
- **Live data re-checked on 2026-09-14**: the most recent `snapshot_timestamp` batch is from 2026-09-11 (3 days stale as of this re-check) — either no open positions currently exist (the script writes zero rows when `openPositions` is empty) or the twice-daily cron hasn't produced a new batch since then. This is a real, currently-observable instance of the "stale data" case FR-09's empty/notice requirement exists for — worth noting to Amaury as a live data point, not a defect in this spec. It does not change the design: the panel must handle exactly this kind of gap gracefully regardless of cause.
- **`DashboardTabs.tsx`'s `TABS` array already has the `scanner` entry** (5 tabs total, `Buy Scanner` last) exactly as the originating prompt assumed — no drift, the 6th entry can be appended after it.
- **`page.tsx`'s `tabs` object and `ZoneTitle` usage confirmed unchanged** from the Buy Scanner implementation — same additive pattern applies.
- **No existing "entry vs. current" side-by-side comparison UI pattern exists anywhere in the dashboard.** `PositionsTable.tsx` only shows a plain "entry $X" text note, not a structured before/after layout. Per the originating prompt's own fallback instruction, this CHANGE uses a simple two-column (entry / current) layout with muted labels rather than inventing new visual language beyond that.
- **Type design follows `MarketDailyBriefing`'s precedent, not `SelectionDecision`'s**: `MarketDailyBriefing` (a pure read-only, direct-passthrough table type) keeps its fields in the table's own `snake_case` naming with no camelCase mapping layer, whereas `SelectionDecision`/`OpenPositionContext` (types with active writers and richer logic) are mapped to camelCase in `db.ts`. `PositionHealthSnapshot` is read-only/display-only like `MarketDailyBriefing`, so the same precedent applies — the new type keeps the table's `snake_case` field names as-is, consistent with the originating prompt's own sample function (which returns `data` directly with no field-mapping step).

---

## Functional Requirements

FR-01: The system shall display a 6th dashboard tab labeled "Health Monitor" positioned immediately after the "Buy Scanner" tab.

FR-02: The system shall provide a `GET /api/health-monitor` route returning the most recent `position_health_snapshots` batch (rows sharing the single latest `snapshot_timestamp`) and that batch's shared timestamp.

FR-03: Where no snapshot rows exist at all, the route shall return an empty snapshot list and a `null` timestamp.

FR-04: The system shall render, for each position in the most recent batch, its symbol, `current_price`, and `days_since_entry`.

FR-05: The system shall render, for each position, an entry-vs-current comparison of its ADX bucket, MACD bucket, and z-score bucket.

FR-06: The system shall render, for each position, an entry-vs-current comparison of SPX regime.

FR-07: The system shall render, for each position, the raw `current_adx`, `current_macd_histogram`, and `current_z_score` values alongside their bucket labels.

FR-08: The system shall display the batch's shared snapshot timestamp in a visible header, indicating this is a point-in-time snapshot.

FR-09: The system shall show a calm, non-error notice when there are no snapshot rows to display.

FR-10: The system shall render a loading/skeleton state while `/api/health-monitor` is in flight, matching the existing dashboard convention.

FR-11: The system shall not provide any control that writes to, re-triggers, or mutates `position_health_snapshots` or the health-check script.

FR-12: The system shall not render any snapshot batch other than the single most recent one.

---

## Non-Functional Requirements

NFR-01: The new tab's data fetching shall follow the same self-contained client-component pattern used by `PerformanceAnalytics.tsx` and `BuyScannerPanel.tsx` (own `useState`/`useEffect`/API route).

NFR-02: The new panel shall use only `ui.tsx`'s existing exports for shared visual primitives.

NFR-03: `npx tsc --noEmit` and `npm run build` shall both pass after the change.

NFR-04: All existing tests shall continue to pass, and their pass/fail counts shall be reported.

---

## Constraints

C-01: This feature touches no Protected Zone file and requires no special Amaury authorization beyond normal spec approval.

C-02: The system must not modify `position_health_snapshots`' schema, `scripts/position-health-check.ts`, or its GitHub Actions workflow.

C-03: The system must not modify any of the 5 existing tabs' panels or `DashboardTabs.tsx`'s switching logic beyond the one additive `TABS` entry.

C-04: The system must not invent new shared UI primitives in `ui.tsx`.

C-05: The system must not show historical/trend data across multiple snapshot batches — single most-recent batch only.

## Out of Scope

- A historical/trend view across multiple health-check runs (explicitly deferred per the originating prompt).
- A "run check now" button or any manual trigger for `scripts/position-health-check.ts`.
- Cross-referencing `position_health_snapshots` rows with `open_position_contexts` or `PositionsTable` data (e.g. entry price, unrealized P&L) — this tab renders only `position_health_snapshots`' own fields.
- Any change to the 5 existing dashboard tabs beyond the two additive wiring edits.
