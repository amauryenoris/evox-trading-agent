# Requirements — Add trailing_stop_order_id Tracking (Data Layer Only)

## STEP 0 — Pre-implementation findings

Verified live in this session against `types.ts`, `db.ts`, `supabase/migrations/`, and the test suite. All context provided in the originating prompt is accurate and confirmed — no drift found.

### Migration naming convention (confirmed)

`supabase/migrations/` uses `YYYYMMDDHHMMSS_snake_case_description.sql`, one statement (or a couple of tightly related ones) per file. Most recent example, `20260722182652_add_pattern_key_to_pattern_library.sql`, in full:
```sql
ALTER TABLE pattern_library ADD COLUMN IF NOT EXISTS pattern_key text;
CREATE INDEX IF NOT EXISTS idx_pattern_library_pattern_key ON pattern_library (pattern_key);
```
This is the closest precedent — a single `ADD COLUMN IF NOT EXISTS` on an existing table, no index needed here since this field isn't queried/filtered on (it's read/written per-symbol via the existing `symbol` primary key path, same as `stop_order_id` today which also has no dedicated index).

### `saveOpenPositionContext()` local variable name (confirmed, not assumed)

`db.ts:156`: `export async function saveOpenPositionContext(ctx: OpenPositionContext): Promise<void>` — the parameter is literally named `ctx`. The existing line for the sibling field is `db.ts:166`: `stop_order_id: ctx.stopOrderId ?? null,`. The new line follows this exact pattern with no name substitution needed: `trailing_stop_order_id: ctx.trailingStopOrderId ?? null,`.

### `updatePositionContext()` current write object (confirmed unchanged), `db.ts:203-216`

```ts
export async function updatePositionContext(
  symbol: string,
  updates: Partial<OpenPositionContext>
): Promise<void> {
  const db = getClient()
  const { error } = await db.from('open_position_contexts')
    .update({
      high_since_entry:   updates.highSinceEntry,
      trailing_stop:      updates.trailingStop,
      trailing_activated: updates.trailingActivated,
    })
    .eq('symbol', symbol)
  if (error) throw new Error(`Failed to update position context for ${symbol}: ${error.message}`)
}
```

### Test-suite risk check (confirmed clear)

Searched all files under `src/lib/__tests__/` for any assertion on `updatePositionContext`'s exact call shape, `OpenPositionContext`'s field count, or an `Object.keys(...).length` / `toHaveProperty` check that could break from adding one more optional field. None found. The two tests that reference `OpenPositionContext`-adjacent concepts (`trailing-stop-exit-reason-guard.test.ts`, `cooldown-stop-loss-ghost-close.test.ts`) replicate exit/cooldown logic inline rather than importing or mocking `db.ts` functions directly, per this project's established test-decoupling convention (documented in `CLAUDE.md` → Test Patterns). No test is expected to break.

### Current `OpenPositionContext`, `types.ts:179-192` (confirmed unchanged)

```ts
export interface OpenPositionContext {
  symbol: string
  buyTimestamp: string
  buyPrice: number
  quantity: number
  indicators: TechnicalIndicators
  claudeReasoning: string
  patternIdsUsed: string[]
  stopOrderId?: string
  signalType?: 'MEAN_REVERSION' | 'TREND' | 'TREND_PULLBACK' | 'TREND_ZLE05' | 'EMA_RECLAIM' | null
  highSinceEntry?: number | null
  trailingStop?: number | null
  trailingActivated?: boolean
}
```

### Live `open_position_contexts` columns (confirmed, 12 today)

`buy_price, buy_timestamp, high_since_entry, indicators, pattern_ids, quantity, reasoning, signal_type, stop_order_id, symbol, trailing_activated, trailing_stop`.

---

## Functional Requirements

FR-01: The system shall add a nullable `text` column named `trailing_stop_order_id` to `open_position_contexts` via a new, timestamp-named migration file in `supabase/migrations/`, using `ADD COLUMN IF NOT EXISTS`.

FR-02: The system shall add a field `trailingStopOrderId?: string | null` to the `OpenPositionContext` interface in `types.ts`, positioned immediately after the existing `stopOrderId?: string` field.

FR-03: The system shall extend `updatePositionContext()`'s `.update({...})` object in `db.ts` to include `trailing_stop_order_id: updates.trailingStopOrderId`, as a fourth field alongside the three existing ones.

FR-04: The system shall extend `saveOpenPositionContext()`'s upsert object in `db.ts` to include `trailing_stop_order_id: ctx.trailingStopOrderId ?? null`, following the exact pattern already used for `stop_order_id`.

FR-05: The system shall leave `stop_order_id` / `stopOrderId` untouched everywhere — it remains the Capa A hard-stop order's dedicated field, fully independent of the new field.

FR-06: See design.md → Open Questions for a scope gap found during research (`mapRowToOpenPositionContext()`'s read path) that the originating prompt's 4-item CHANGE list does not cover, despite the stated Goal of making the field "persisted and read back."

## Non-Functional Requirements

NFR-01: `npx tsc --noEmit` shall pass with zero errors after the change.

NFR-02: `npm run build` shall pass with zero errors after the change.

NFR-03: All existing tests shall pass unmodified.

## Constraints

C-01: `db.ts` is treated with Protected-Zone-equivalent care per project practice this session, though it is not formally listed in `CLAUDE.md`'s Protected Zone. Authorization already established for this Bug 1 series.

C-02: No changes to `claude-agent.ts`, `alpaca.ts`, `risk-manager.ts`, `indicators.ts`, or `learning.ts` in this spec — data layer only.

C-03: No order-submission or order-replacement logic — this spec only makes the field persistable and readable.

C-04: The new column shall be nullable with no default and no `NOT NULL` constraint.

C-05: No existing migration file shall be modified or renamed.

C-06: The three existing fields in `updatePositionContext()`'s write object (`high_since_entry`, `trailing_stop`, `trailing_activated`) shall be written exactly as they are today — only a fourth line is added to the same object.

## Out of Scope

- Populating `trailing_stop_order_id` with a real value anywhere (CHANGE 3 / decision layer).
- Any Alpaca order submission, cancellation, or replacement (CHANGE 2 / alpaca.ts layer).
- Any change to the trailing-stop activation, floor, or recalculation logic in `claude-agent.ts` (~lines 232-317).
- Backfilling the new column for historical/closed positions (they don't exist in `open_position_contexts`, which only tracks currently-open positions).
- `mapRowToOpenPositionContext()` in `db.ts` — see design.md's Open Questions for why this needs one clarification before implementation, despite being a natural read-side companion to this write-side change.
