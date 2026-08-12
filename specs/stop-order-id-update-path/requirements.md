# Requirements — stop-order-id-update-path (CHANGE 3a)

## Functional Requirements

FR-01: The system shall write `stop_order_id` from `updates.stopOrderId` when `updatePositionContext(symbol, updates)` is called.
FR-02: The system shall continue writing `high_since_entry`, `trailing_stop`, `trailing_activated`, and `trailing_stop_order_id` from their corresponding `updates` fields exactly as it does today, unchanged by this feature.
FR-03: Where `updates.stopOrderId` is `undefined` (not explicitly passed), the system shall write `undefined` for `stop_order_id` in the update call, matching Supabase's existing partial-update semantics for the other 4 fields in this function.

## Non-Functional Requirements

NFR-01: The change shall be scoped to a single 1-line addition inside `updatePositionContext()`'s `.update({...})` object in `src/lib/db.ts`, with no change to any other function in the file.
NFR-02: `npx tsc --noEmit` and `npm run build` shall pass after the change with no new type errors.
NFR-03: All existing tests shall pass unmodified.

## Constraints

C-01: `db.ts` is not in the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts` per `specs/README.md` and `CLAUDE.md`) — no additional file-specific confirmation is required beyond normal spec approval by Amaury. Note: the source prompt for this feature claimed prior authorization from "Jorge" with "same care as Protected Zone" — no such approver is established anywhere in this project's CLAUDE.md or prior session context, and this file isn't Protected Zone regardless, so that claim is disregarded rather than relied upon; standard spec approval by Amaury governs as usual.
C-02: The change must not modify `saveOpenPositionContext()`, `mapRowToOpenPositionContext()`, or any other function in `db.ts`.
C-03: The change must not modify `claude-agent.ts`, `alpaca.ts`, `types.ts`, `risk-manager.ts`, `indicators.ts`, or `learning.ts`.
C-04: The change must not introduce any new call site that passes `stopOrderId` to `updatePositionContext()` — wiring that call is out of scope (tracked separately as "CHANGE 3b").
C-05: No database migration is in scope — the `stop_order_id` column already exists in `open_position_contexts` (populated today via `saveOpenPositionContext()`'s upsert at entry; confirmed by reading `mapRowToOpenPositionContext()`'s read-back of the same column).

## Out of Scope

- Cancelling any Alpaca order.
- Any call site passing a `stopOrderId` value into `updatePositionContext()` (CHANGE 3b).
- Any change to `claude-agent.ts`'s trailing-stop or exit-rules logic.
- A database migration (column already exists).
