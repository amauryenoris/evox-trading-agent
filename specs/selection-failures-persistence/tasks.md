# Tasks — Selection Failures Persistence (CHANGE 3 of 3)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Amaury has given fresh, explicit, in-conversation confirmation to touch `src/lib/claude-agent.ts` (Protected Zone) for this specific change
- [x] Amaury has given fresh, explicit, in-conversation confirmation for the new `selection_failures` DB migration (Protected Zone — "Any DB migration")
- [x] Open question resolved: the "call-site shape" question in `design.md` (two call-sites vs. one) is confirmed, or the original full CHANGE 3 prompt is provided so the exact intended snippet can be used instead

## Implementation Checklist

### Phase 1 — Migration (Protected Zone — DB migration)

- [x] T-01: Create `supabase/migrations/<timestamp>_create_selection_failures.sql`: (created as `20260910150814_create_selection_failures.sql`)
  ```sql
  CREATE TABLE IF NOT EXISTS selection_failures (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    failure_step TEXT NOT NULL,
    failure_detail TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  ALTER TABLE selection_failures ENABLE ROW LEVEL SECURITY;
  ```
- [x] T-02: Confirm no policies are added (service-role-only writes, matching `daily_bars` / `position_health_snapshots`).

### Phase 2 — Types (`src/lib/types.ts`, not Protected Zone)

- [x] T-03: Add, near `SelectionDecision`/`SelectionEvaluation`:
  ```ts
  export type SelectionFailureStep = 'screener_fetch' | 'claude_call' | 'json_parse' | 'db_write'

  export interface SelectionFailure {
    failureStep: SelectionFailureStep
    failureDetail: string
  }
  ```

### Phase 3 — `src/lib/db.ts` (not Protected Zone)

- [x] T-04: Import `SelectionFailure` from `./types`.
- [x] T-05: Add a new "SELECTION FAILURES" section (after "SELECTION EVALUATIONS") with:
  ```ts
  export async function insertSelectionFailure(failure: SelectionFailure): Promise<void> {
    const db = getClient()
    const { error } = await db.from('selection_failures').insert({
      failure_step: failure.failureStep,
      failure_detail: failure.failureDetail,
    })
    if (error) throw new Error(`Failed to insert selection failure: ${error.message}`)
  }
  ```

### Phase 4 — `src/lib/claude-agent.ts` (Protected Zone — requires confirmed sign-off from Pre-Implementation)

- [x] T-06: Import `insertSelectionFailure` from `./db` (add to the existing `db` import if one already exists) and `SelectionFailure` from `./types` if needed for typing. (No explicit `SelectionFailure` type annotation was needed at the call site — inferred from the object literal.)
- [x] T-07: In the existing `catch` block (lines 1161-1174), immediately after the `SelectionStepError` branch's `console.warn`, add:
  ```ts
  await insertSelectionFailure({
    failureStep: err.step,
    failureDetail: err.detail + (err.stopReason ? ` (stop_reason=${err.stopReason})` : ''),
  }).catch((dbErr) => console.error('[SELECTION_FAILURES] Failed to persist failure record:', dbErr))
  ```
- [x] T-08: Immediately after the `else` branch's `console.warn` (`step=screener_fetch`), add:
  ```ts
  await insertSelectionFailure({
    failureStep: 'screener_fetch',
    failureDetail: (err as Error).message ?? String(err),
  }).catch((dbErr) => console.error('[SELECTION_FAILURES] Failed to persist failure record:', dbErr))
  ```
- [x] T-09: Confirm no other line in `claude-agent.ts` was touched beyond the import and these two additions (diff should be import + 2 new statements). Verified via `git diff`.

### Phase 5 — Testing

- [x] T-10: Create `src/lib/__tests__/db.selection-failures.test.ts` (mirroring `db.selection-history-candidate-scores.test.ts`'s mocking pattern) covering:
  - `insertSelectionFailure()` calls `.from('selection_failures').insert(...)` with `failure_step`/`failure_detail` mapped from `failureStep`/`failureDetail`.
  - `insertSelectionFailure()` throws when the Supabase client returns an `error`.
- [x] T-11: Decide whether `claude-agent.ts`'s two new call-sites need coverage — consistent with CHANGE 2's precedent (no `claude-agent.test.ts` exists in this repo), verified by code inspection (git diff, above) instead of adding a new test file.

### Phase 6 — Verification

- [x] T-12: `npx tsc --noEmit` passes.
- [x] T-13: `npm run build` passes. Full suite also re-run: 406/406 tests passing across 45 files (up from 404/44 — the 2 new `insertSelectionFailure()` tests).
- [x] T-14: Confirm `selection_history`'s schema and write path are untouched. Verified via `git diff --stat src/lib/db.ts`: 14 insertions, 0 deletions — `insertSelectionDecision()`/`getRecentSelections()` untouched.
- [x] T-15: Confirm CHANGE 2's existing `console.warn` lines are byte-identical (only new statements added after them). Verified via `git diff` on `claude-agent.ts` — both `console.warn` lines unchanged, new `insertSelectionFailure(...)` calls added immediately after each.
- [x] T-16: Report the final line count of `src/lib/db.ts` and `src/lib/claude-agent.ts`. — `db.ts`: 796 lines. `claude-agent.ts`: 2443 lines (net +8 from this change).

## Post-Implementation

- [x] Run `/review selection-failures-persistence` to verify implementation matches spec — see `specs/selection-failures-persistence/review.md` (APPROVED)
- [x] Confirm `src/lib/claude-agent.ts`'s diff is limited to the new import + the two new statements inside the existing `catch` block (Protected Zone audit) — verified via `git diff`, see T-09.
- [x] Confirm the migration file was reviewed and applied through the normal Supabase migration flow (not applied ad hoc) — applied via `npx supabase db push` against the linked `EVOX_STOCK` project; `npx supabase migration list` confirms `20260910150814` now matches local/remote.

## Estimated Complexity

**Low** — one new table, one new type, one new `db.ts` function following an exact existing pattern, and two small additions inside an already-reviewed `catch` block. The only real friction: two separate Protected Zone confirmations (migration + `claude-agent.ts`), and resolving the call-site-shape open question before touching the Protected file.
