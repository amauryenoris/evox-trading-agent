# Design — stop-order-id-update-path (CHANGE 3a)

## Architecture Decision

This is a single-field extension to `updatePositionContext()`'s existing partial-update object in `src/lib/db.ts` (currently lines 205-219). `updatePositionContext()` is the only write path into `open_position_contexts` used mid-lifecycle (after the initial `saveOpenPositionContext()` upsert at entry); it currently writes 4 of the table's fields. This change adds a 5th, `stop_order_id`, so that a future caller (CHANGE 3b, in `claude-agent.ts`) can null out or update the Capa A hard-stop order reference once it's cancelled and replaced by a trailing stop-limit order — a capability that doesn't exist today because `stopOrderId` is currently write-once (at entry) and never touched again.

## Data Flow

1. (Out of scope, future — CHANGE 3b) Exit-rules loop in `claude-agent.ts` cancels the Capa A order and calls `updatePositionContext(symbol, { stopOrderId: undefined, ... })` or similar.
2. `updatePositionContext()` builds its `.update({...})` object, now including `stop_order_id: updates.stopOrderId`.
3. Supabase writes the row's `stop_order_id` column per Supabase's standard partial-update semantics — a field present in the object (even as `undefined`/`null`) is written; this function's existing 4 fields already work this way, so no new semantics are introduced.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Add `stop_order_id: updates.stopOrderId` to `updatePositionContext()`'s existing `.update({...})` object | One-line change; reuses the established partial-update path and its existing semantics; keeps `stopOrderId` mutation consistent with how `trailingStopOrderId` is already handled by the same function | None material | **Chosen** |
| Add a new dedicated function (e.g. `clearStopOrderId(symbol)`) | Slightly more explicit intent at call sites | Duplicates the update-by-symbol pattern already in `updatePositionContext()`; violates DRY/YAGNI for a single-field change; inconsistent with how `trailingStopOrderId` is handled | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/db.ts` | MODIFY | Add `stop_order_id: updates.stopOrderId` as a 5th line inside `updatePositionContext()`'s `.update({...})` object. No other function in this file changes. |

## Protected Zone Impact

None — `src/lib/db.ts` is not in the Protected Zone. No additional confirmation beyond normal spec approval by Amaury is required. (See requirements.md C-01 regarding the unverified "Jorge" authorization claim in the source prompt — disregarded as inapplicable, not relied upon.)

## Database Changes

None — the `stop_order_id` column already exists on `open_position_contexts` (it is populated today by `saveOpenPositionContext()`'s upsert and read back by `mapRowToOpenPositionContext()`). This change only extends which function can *write* to that existing column mid-lifecycle.

## Open Questions

None.
