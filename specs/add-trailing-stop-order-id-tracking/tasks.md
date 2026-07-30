# Tasks — Add trailing_stop_order_id Tracking (Data Layer Only)

## Pre-Implementation

- [ x] Amaury has reviewed and approved this spec
- [ x] Protected-Zone-equivalent care confirmed for `db.ts` (authorization already in effect this session for the Bug 1 series)
- [x ] **Open Question resolved**: whether `mapRowToOpenPositionContext()` (T-05 below) is in scope for this CHANGE — see design.md → Open Questions. Implementation must not proceed past T-04 until this is answered.

## Implementation Checklist

### Phase 1 — Migration

- [x] T-01: Create `supabase/migrations/<timestamp>_add_trailing_stop_order_id_to_open_position_contexts.sql` (timestamp in the existing `YYYYMMDDHHMMSS` convention, later than the current newest migration file) containing exactly:
  ```sql
  ALTER TABLE open_position_contexts
  ADD COLUMN IF NOT EXISTS trailing_stop_order_id text;
  ```
  No index, no default, no `NOT NULL`.

### Phase 2 — Type

- [x] T-02: In `src/lib/types.ts`, add `trailingStopOrderId?: string | null` to the `OpenPositionContext` interface (`types.ts:179-192`), immediately after the existing `stopOrderId?: string` line.

### Phase 3 — db.ts write paths

- [x] T-03: In `src/lib/db.ts`, `updatePositionContext()` (`db.ts:203-216`): add `trailing_stop_order_id: updates.trailingStopOrderId,` as a 4th line inside the existing `.update({...})` object, alongside the 3 existing fields. Do not alter how those 3 are written.
- [x] T-04: In `src/lib/db.ts`, `saveOpenPositionContext()` (`db.ts:156-173`): add `trailing_stop_order_id: ctx.trailingStopOrderId ?? null,` to the upsert object, immediately after the existing `stop_order_id: ctx.stopOrderId ?? null,` line — confirmed local variable name is `ctx` (function signature: `saveOpenPositionContext(ctx: OpenPositionContext)`).

### Phase 4 — Read path (conditional — see Pre-Implementation gate)

- [x] T-05: **Only if the Open Question is resolved in favor of including it**: in `src/lib/db.ts`, `mapRowToOpenPositionContext()` (`db.ts:175-190`), add `trailingStopOrderId: (row.trailing_stop_order_id as string | null) ?? undefined,` following the exact pattern of the adjacent `stopOrderId` mapping line. If the Open Question is resolved the other way, skip this task and note explicitly in the completion report that the field is write-only as of this CHANGE. Resolved: included (user confirmed via clarifying question).

### Phase 5 — Verification

- [x] T-06: **BLOCKED — migration not applied.** Ran a read-only query against `open_position_contexts`: still 12 columns, `trailing_stop_order_id` NOT present. This session has no Supabase CLI, no direct Postgres connection string, and the MCP Supabase connector doesn't have this project accessible (confirmed in an earlier diagnostic) — there is no available channel to execute DDL against the live database. The migration file (T-01) is written and ready; it must be applied manually (Supabase Studio SQL editor, or `supabase db push` with proper CLI credentials) before the code changes in T-03/T-04/T-05 will work against production — see completion report.
- [x] T-07: Run `npx tsc --noEmit` — zero errors.
- [x] T-08: Run `npm run build` — zero errors.
- [x] T-09: Ran the full existing test suite (29 files, 297 tests) — all passed. Also ran the 6 files specifically flagged in requirements.md STEP 0 individually first (64/64 passed) before the full-suite run.
- [x] T-10: Confirm `updatePositionContext()`'s write object has exactly 4 fields (3 original + 1 new) — no more, no less. Confirmed via diff.
- [x] T-11: Confirm `stop_order_id`/`stopOrderId` is unchanged everywhere (byte-for-byte, outside the one new adjacent line added in T-04 and, if applicable, T-05). Confirmed via diff — both existing lines untouched, new lines added immediately adjacent.
- [x] T-12: State explicitly whether any file beyond the migration, `types.ts`, and `db.ts` changed (expected: no). Confirmed via `git status --porcelain`: only these 3 (plus the new spec folder) changed. The pre-existing, unrelated `specs/gate-constants-hoist/review.md` modification predates this session's work.

## Post-Implementation

- [ ] Run `/review add-trailing-stop-order-id-tracking` to verify implementation matches spec
- [x] Confirm this is additive-only — no existing field's write/read behavior altered beyond the one new field (confirmed via diff, T-10/T-11)

## Estimated Complexity

**Low** — Additive schema + type + two small write-object extensions, following an already-established sibling-field pattern (`stop_order_id`/`stopOrderId`) exactly. The only source of friction is the Open Question about `mapRowToOpenPositionContext()`, which is small in itself but must be resolved before Phase 4 to avoid silently shipping a write-only field that contradicts this spec's own stated Goal.
