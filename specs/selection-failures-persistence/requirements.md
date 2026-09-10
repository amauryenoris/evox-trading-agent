# Requirements — Selection Failures Persistence (CHANGE 3 of 3)

## Background

CHANGE 1 (merged) raised `SELECTION_MAX_TOKENS` to 8000. CHANGE 2 (merged)
added `SelectionStepError` (exported from `stock-selector.ts`, `step:
'claude_call' | 'json_parse' | 'db_write'`, a `detail` string, and an
optional `stopReason`) and updated `claude-agent.ts`'s selection-fallback
`catch` block (`src/lib/claude-agent.ts:1161-1174`, verified current) to log
a distinct `console.warn` per step, with a separate `else` branch for
non-`SelectionStepError` failures (logged as `step=screener_fetch`).

Today that information only exists in the GH Actions console — there is no
table to query it from. `selection_history` is purpose-built for successful
decisions (every column assumes a completed selection), so a new table is
the right fit rather than forcing nullable failure rows into it. This CHANGE
persists the same step + detail information CHANGE 2 already logs, into a
new `selection_failures` table, closing the gap that required manually
digging through workflow run logs to diagnose the 2026-09-04 to 09-08
incident.

## User-Approved Design Decisions (given, not re-litigated)

1. New table name: `selection_failures`.
2. Columns: `id` (bigint identity PK, matching `daily_bars`'s convention),
   `failure_step` (text — one of `'screener_fetch' | 'claude_call' |
   'json_parse' | 'db_write'`), `failure_detail` (text — the same string
   already logged by CHANGE 2, including the `'max_tokens'` / `stop_reason`
   annotation when present), `created_at` (timestamptz, `DEFAULT now()`).
3. RLS: enabled, zero policies — same convention as `daily_bars` and
   `position_health_snapshots` (service-role-only writes via `db.ts`).

---

## Functional Requirements

FR-01: The system shall provide a `selection_failures` table with columns `id`, `failure_step`, `failure_detail`, and `created_at`, created via a new Supabase migration.

FR-02: The system shall enable Row Level Security on `selection_failures` with zero policies, matching the `daily_bars` / `position_health_snapshots` convention.

FR-03: The system shall provide a `src/lib/db.ts` function that inserts a `failure_step` and `failure_detail` value into `selection_failures`.

FR-04: The system shall persist a `selection_failures` row when the dynamic stock-selection fallback in `claude-agent.ts` is triggered, for all four failure steps (`screener_fetch`, `claude_call`, `json_parse`, `db_write`).

FR-05: The system shall persist the same `failure_step` and `failure_detail` values already logged to the console by CHANGE 2 for a given failure — including the `'max_tokens'` / `stop_reason` annotation when present — not a separately recomputed value.

FR-06: The system shall continue falling back to the static `TRADING_WATCHLIST` when the `selection_failures` insert itself fails, without that insert failure propagating out of the existing `catch` block.

FR-07: The system shall not expose any new read, query, or dashboard surface for `selection_failures` data.

---

## Non-Functional Requirements

NFR-01: The migration shall be idempotent (`CREATE TABLE IF NOT EXISTS`), consistent with existing migrations in `supabase/migrations/`.

NFR-02: `npx tsc --noEmit` and `npm run build` shall both pass after the change.

NFR-03: The change shall not alter `selection_history`'s schema, its write path, or any of `SelectionStepError`'s existing fields.

---

## Constraints

C-01: This feature touches `src/lib/claude-agent.ts` (Protected Zone). Per house rule, this requires Amaury's fresh, explicit, in-conversation confirmation at implementation time, independent of any prior spec approval or third-party authorization referenced in the request.

C-02: This feature adds a new DB migration, which `CLAUDE.md`'s Protected Zone list ("Any DB migration") also requires Amaury's fresh, explicit, in-conversation confirmation for, separately from C-01.

C-03: The system must not modify `SelectionStepError`'s definition or `SELECTION_MAX_TOKENS`.

C-04: The system must not modify `selection_history`'s schema or write path.

C-05: The system must not add any read/query tooling, API route, or dashboard component for `selection_failures`.

C-06: The system must not change CHANGE 2's existing `console.warn` log lines or the fallback watchlist's value/behavior — only add the new persistence call.

## Out of Scope

- Any dashboard "gate audit" tab or other UI to consume `selection_failures`.
- Retention, cleanup, or archival policy for `selection_failures` rows.
- Re-litigating CHANGE 1 or CHANGE 2's already-merged design.
- Any change to `selection_history`, `selection_evaluations`, or their existing read paths.
