# Design — Add trailing_stop_order_id Tracking (Data Layer Only)

## Architecture Decision

This lives entirely in the data layer: one new Supabase migration, one new optional field on an existing type (`types.ts`), and two small additions inside two already-existing `db.ts` functions. No new files, no new functions, no new exports beyond the one type field. It mirrors the exact pattern already established for `stop_order_id`/`stopOrderId` (Capa A), keeping the two fields structurally parallel but functionally independent — the whole point being that CHANGE 3 (decision layer) can later track the trailing order's own ID without touching or overwriting the Capa A order's ID.

## Data Flow

```
Migration (new):
  ALTER TABLE open_position_contexts
  ADD COLUMN IF NOT EXISTS trailing_stop_order_id text;
    → every existing row: trailing_stop_order_id = null (13th column)

types.ts:
  OpenPositionContext.trailingStopOrderId?: string | null   ← new, after stopOrderId

db.ts saveOpenPositionContext(ctx) — entry-time upsert:
  ...existing fields...
  stop_order_id: ctx.stopOrderId ?? null,              ← unchanged
  trailing_stop_order_id: ctx.trailingStopOrderId ?? null,  ← NEW, same pattern

db.ts updatePositionContext(symbol, updates) — per-cycle update:
  .update({
    high_since_entry:   updates.highSinceEntry,          ← unchanged
    trailing_stop:      updates.trailingStop,             ← unchanged
    trailing_activated: updates.trailingActivated,        ← unchanged
    trailing_stop_order_id: updates.trailingStopOrderId,  ← NEW, 4th field
  })

db.ts mapRowToOpenPositionContext(row) — read path:
  [NOT in the originating prompt's CHANGE list — see Open Questions]
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Separate `trailing_stop_order_id` field, parallel to `stop_order_id` (this spec) | Keeps Capa A and trailing-stop order tracking fully independent; CHANGE 3 can cancel/replace one without touching the other | One more column | **Chosen** — required per the prior diagnostic's explicit finding that reusing `stopOrderId` would lose track of the Capa A order |
| Reuse `stop_order_id` for whichever order is "currently live" on the position | No schema change | Loses the ability to distinguish "hard floor order" from "trailing order" once both might coexist; directly contradicts the prior diagnostic's stated reason for needing a second field | Rejected — already rejected by the prior diagnostic, not reopened here |
| Store trailing order state as JSON inside the existing `indicators` jsonb column instead of a new typed column | No migration needed | `indicators` is a snapshot-at-buy-time blob, semantically wrong home for live, per-cycle-mutating order state; breaks the existing `stop_order_id` precedent of using a dedicated column | Rejected |

## Impact on Existing Files

### Required changes (per originating prompt's explicit CHANGE list)

| File | Change Type | Description |
|------|------------|-------------|
| `supabase/migrations/<timestamp>_add_trailing_stop_order_id_to_open_position_contexts.sql` | CREATE | `ALTER TABLE open_position_contexts ADD COLUMN IF NOT EXISTS trailing_stop_order_id text;` |
| `src/lib/types.ts` | MODIFY | Add `trailingStopOrderId?: string \| null` to `OpenPositionContext`, right after `stopOrderId?: string` |
| `src/lib/db.ts` | MODIFY | `updatePositionContext()`: add 4th field to `.update({...})`. `saveOpenPositionContext()`: add 1 line to upsert object, using confirmed local name `ctx`. |

### Not touched (per scope)

| File | Reason |
|------|--------|
| `src/lib/claude-agent.ts` | Forbidden by scope (C-02) — decision layer, CHANGE 3 |
| `src/lib/alpaca.ts` | Forbidden by scope (C-02) — order layer, CHANGE 2 |
| `src/lib/risk-manager.ts`, `indicators.ts`, `learning.ts` | Forbidden by scope (C-02), not involved |

## Protected Zone Impact

None of the three files this spec touches (`supabase/migrations/*`, `types.ts`, `db.ts`) are in `CLAUDE.md`'s formal Protected Zone list (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`). `db.ts` is being treated with Protected-Zone-equivalent care per the originating prompt's own framing and this session's established practice for the Bug 1 series — noted for transparency, not because the formal list requires it.

## Database Changes

One new nullable `text` column on `open_position_contexts`: `trailing_stop_order_id`. No index (matches `stop_order_id`, which also has none — neither is filtered/queried on, both are read/written per-row via the `symbol` key). No default, no `NOT NULL`, no data migration/backfill needed (new column, all existing rows correctly become `null`).

## Open Questions

- **`mapRowToOpenPositionContext()` (`db.ts:175-190`) is not in the originating prompt's 4-item CHANGE list, but the read path is incomplete without it.** This function maps a raw Supabase row back into an `OpenPositionContext` object for `getOpenPositionContexts()`/`getAllOpenPositionContexts()` — the same functions `claude-agent.ts`'s trailing-stop block reads `ctx` from every cycle. Right now it explicitly maps 11 of the 12 existing columns (mirroring each one, e.g. `stopOrderId: (row.stop_order_id as string | null) ?? undefined,`); it does not have a catch-all "spread whatever's left" fallback. If `trailing_stop_order_id` is written to the DB (this spec) but never added to this mapping function, every read of `ctx.trailingStopOrderId` anywhere in the app (including CHANGE 3, later) will always come back `undefined` regardless of what's actually stored — silently reproducing the exact "write succeeds, read is dropped" class of bug this whole Bug 1/Bug 2 investigation has been chasing, just at a different layer. The originating prompt's own **Goal** states this field should be "persisted and read back" — which isn't achievable without this one extra line. **This needs Amaury's confirmation before implementation**: either (a) treat adding one mapped field to `mapRowToOpenPositionContext()` as implicitly in-scope for "the data layer" even though the prompt's explicit numbered CHANGE list didn't name it, or (b) explicitly exclude it and accept that this spec only achieves "write," not "read back," deferring the mapper line to CHANGE 3. Recommendation: (a) — it's a one-line, same-pattern, same-function-family addition with zero risk beyond what's already approved, and leaving it out would make this spec fail its own stated Goal. But this is Amaury's call, not assumed here.
