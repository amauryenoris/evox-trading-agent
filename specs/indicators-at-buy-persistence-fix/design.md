# Design — Persist effectiveThreshold, newsAdjustment, sectorRotation into indicatorsAtBuy

## Architecture Decision

This is a targeted extension of two existing object-construction blocks inside `runAgentCycle()` in `claude-agent.ts` — no new architecture, no new module. `indicatorsAtBuy` and `bestIndicatorsAtBuy` are already the established mechanism for attaching cycle/decision-derived metadata (`spx_*`, `state_fingerprint`, `tp_*`, `zle05_*`) onto the object persisted via `saveOpenPositionContext()`. This change adds four more keys to that same mechanism at both of its call sites, following the file's own established idiom.

## Data Flow

1. **Call site 1** (immediate-buy path, `claude-agent.ts:2011-2053`): `effectiveThreshold`/`newsAdjustment` (per-symbol loop variables, declared at `1462-1463`) and `sectorRotation`/`sectorRotationContext` (cycle-scoped, declared at `1021-1022`) are all directly in scope for the exact symbol being bought. Four plain assignments are added onto `indicatorsAtBuy`, alongside the existing `spx_*`/`state_fingerprint` assignments (`2015-2027`), before the `saveOpenPositionContext()` call at `2043`.
2. **Call site 2** (ranking/best-candidate path, `claude-agent.ts:2186-2245`): this runs *after* the entire per-symbol loop has completed and a winner (`best`) has been picked from `ranked` (`2137-2145`). At this point, the loop-scoped `effectiveThreshold`/`newsAdjustment` variables (`1462-1463`) hold whichever symbol was processed *last* in the loop — not necessarily `best.symbol`. The correct per-candidate value is `best.entry.indicators.effectiveThreshold`/`.newsAdjustment`, because `entry.indicators` was set to `indicatorsWithLearning` (`2081-2096`) — which bakes in the correct `effectiveThreshold`/`newsAdjustment` for that exact symbol — *before* `entry` was pushed into `buyQueue` (`2108`) and later sorted into `ranked`/`best`. `sectorRotation`/`sectorRotationContext`, being cycle-invariant, are referenced directly from the outer scope at this call site too — always correct regardless of which candidate won.
3. Four assignments are added onto `bestIndicatorsAtBuy`, alongside the existing `spx_*`/`state_fingerprint` assignments (`2190-2211`), before the `saveOpenPositionContext()` call at `2235`.
4. From there, no further plumbing is needed: `saveOpenPositionContext()` (`db.ts:156-174`) persists `ctx.indicators` verbatim, and `getOpenPositionContexts()`/`mapRowToOpenPositionContext()` (`db.ts:176-198`) reads it back with a raw passthrough cast (confirmed in the prior diagnostic — no whitelist-drop at this stage). The fields will be durably readable from `open_position_contexts` immediately after this change; whether they survive into `trade_evaluations` on read is the separate Prompt 2/2 concern (write-side passthrough there is already confirmed fine per the prior diagnostic — only the `getTradeEvaluations()` *read* mapper drops them).

## A confirmed type-mechanics detail (STEP 0 finding, not in the originating prompt's literal instructions)

`best` is drawn from `buyQueue: Array<{ ..., entry: AgentLogEntry, ... }>` (`claude-agent.ts:1295-1305`). `AgentLogEntry.indicators` is declared `TechnicalIndicators` (`types.ts:159-164`) — a strict interface that does **not** include `effectiveThreshold`/`newsAdjustment`. `entry.indicators` is assigned `indicatorsWithLearning` inside an object-literal (`claude-agent.ts:2091-2096`); because that value comes from a separately-declared `const` rather than an inline literal, TypeScript's excess-property check does not block the assignment — but the *static type* of `entry.indicators` (and therefore `best.entry.indicators`) remains exactly `TechnicalIndicators`. **Reading `best.entry.indicators.effectiveThreshold` as literally proposed in the originating prompt will not compile under `tsc --noEmit`** without a cast at the point of use — e.g. `(best.entry.indicators as TechnicalIndicators & Record<string, unknown>).effectiveThreshold`, mirroring the exact cast pattern already applied to `indicatorsAtBuy`/`bestIndicatorsAtBuy` themselves (`2013`, `2188`). This does not change the Goal or the CHANGE section's intent — the correct *value* is confirmed present and correct at runtime — it only means the implementation step must include this cast, which NFR-01 makes an explicit requirement rather than leaving it implicit.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Plain key assignment on both objects, per-candidate source for effectiveThreshold/newsAdjustment at call site 2 (as specified) | Matches existing file idiom exactly; correctness proven per-candidate | Requires a cast at the read point (see above) | **Chosen** |
| Add `effectiveThreshold`/`newsAdjustment` as fields on the `buyQueue` array type itself, populated at push time | Would avoid needing to reach through `entry.indicators` and its type mismatch | Touches the `buyQueue` type declaration and its push-time construction — explicitly forbidden by this spec's "DO NOT CHANGE" list (`buyQueue` type / `indicatorsWithLearning` construction) | Rejected — out of scope per the originating request |
| Reference the loop-scoped `effectiveThreshold`/`newsAdjustment` variables directly at call site 2 (naive/simplest) | Zero extra plumbing | **Incorrect** — captures the last-processed symbol's value, not `best`'s; confirmed by the diagnostic and by NFR-02's required test | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY (Protected Zone — pre-authorized) | Add 4 plain-key assignments at call site 1 (`~2018`, after existing `spx_*` block) and 4 at call site 2 (`~2193`, after existing `spx_*` block), with a cast at call site 2's read of `best.entry.indicators` |
| `src/lib/__tests__/indicators-at-buy-context-fields.test.ts` (or similarly named) | CREATE | Tests proving both call sites assign all four fields correctly, including the call-site-2 stale-variable trap |

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is touched. Pre-authorized — the originating request states explicitly this change is authorized by Amaury, mirroring the same authorization already used for the sector-rotation and news-intelligence fixes earlier in this workstream.

## Database Changes

None. No schema change, no migration — the destination columns (`open_position_contexts.indicators`) are already untyped `jsonb` and already carry other ad-hoc keys (`spx_price`, `state_fingerprint`, `tp_*`, `zle05_*`) with no column-level change required.

## Open Questions

None. The one implementation-relevant ambiguity (the `tsc` cast requirement at call site 2) has been resolved above as a confirmed fact, not a decision requiring Amaury's input — it follows directly from the already-established cast pattern in the same file.
