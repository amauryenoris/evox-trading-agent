# Design — Persist Deterministic-Exit SELL Entries to agent_log (Bug 2)

## Architecture Decision

This change lives entirely inside `enforceExitRules()` in `src/lib/claude-agent.ts`, at the single point where a deterministic exit has already been decided and `evaluateClosedTrade()` has already run. No new files, no new exports, no new types. The existing `insertAgentLogEntry()` helper (already imported, already used three times in this file) is called a fourth time, from a fourth site, with a shape adapted from the existing ghost-close call rather than invented fresh. This keeps the fix a pure addition — every other line in the function is untouched, matching SDD.md's own recommendation ("persist per-symbol inside the loop") for this class of gap.

## Data Flow

```
enforceExitRules() — inside the per-position loop, after exitReason is set
  │
  ├─ closePosition(position.symbol)                         ← unchanged
  ├─ exitEntries.push(SELL entry)                            ← unchanged (existing in-memory record)
  ├─ exitReasons.set(...)                                    ← unchanged (Fase 1a plumbing)
  │
  └─ if (ctx):
       try {
         exitPrice, exitTimestamp = ... (from sellOrder or fallback)  ← unchanged
         await evaluateClosedTrade(ctx, exitPrice, exitTimestamp)     ← unchanged (writes trade_evaluations)
         [NEW] await insertAgentLogEntry({ ...mirrors ghost-close shape... })
                 .catch(err => console.error(...))                    ← isolated, non-blocking
         await removeOpenPositionContext(position.symbol)             ← unchanged
       } catch (cleanupErr) {
         console.error(...)   ← unchanged, still does not rethrow
       }

Result: trade_evaluations and agent_log are now written from the same
synchronous block, closing the gap where one could succeed without the other.
```

## Field mapping (new call, mirrored against the ghost-close call at line 1110)

| Field | Ghost-close value (existing, line 1110) | New deterministic-exit value | Source |
|---|---|---|---|
| `id` | `randomUUID()` | `randomUUID()` | same |
| `timestamp` | `sellTimestamp` | `exitTimestamp` | already computed at line 365, same role |
| `symbol` | `ctx.symbol` | `position.symbol` | equivalent (same value in this scope) |
| `decision.action` | `'SELL'` | `'SELL'` | same |
| `decision.quantity` | `ctx.quantity` | `ctx.quantity` | same |
| `decision.reasoning` | ghost-close's synthetic sentence | `exitReason` (the branch's own string, e.g. `"Trailing stop triggered: ..."`, `"Exit rule: ..."`) | existing taxonomy, no new strings invented |
| `decision.confidence` | `1.0` | `1.0` | same |
| `indicators.*` (spread) | `...ctx.indicators` (buy-time snapshot) | `...ind` (this cycle's live indicators for the symbol) | `ind` is the more accurate choice here — it's the same object already used by the untouched `exitEntries.push` (line 342) |
| `indicators.entryPrice` | `ctx.buyPrice` | `ctx.buyPrice` | same |
| `indicators.exitPrice` | `sellPrice` | `exitPrice` | already computed at lines 361-364, same role |
| `indicators.pnlPct` | `pnlPct` | `(exitPrice - ctx.buyPrice) / ctx.buyPrice` | equivalent computation, inlined (no `pnlPct` variable exists at this point in this branch) |
| `indicators.signalType` | `ctx.signalType` | `ctx.signalType` | same |
| `indicators.daysOpen` | `daysOpen` | `daysOpen` | same variable, already in scope (line 195) |
| `indicators.closedBy` | `'alpaca_gtc'` | `'deterministic_exit'` | distinguishes the two write paths for any future consumer |
| `portfolioSnapshot` | `{ equity: account.equity, cash: account.cash, positionCount: positions.length }` | identical | same |
| `orderExecuted` | `true` | `true` | same |
| `error` | `'ghost_close'` | `undefined` | matches the convention already used by the untouched `exitEntries.push` (line 345), and satisfies FR-06 |

The `indicators` field is typed as `TechnicalIndicators` on `AgentLogEntry`; the ghost-close call already works around this with `as unknown as TechnicalIndicators` to attach the extra `entryPrice`/`exitPrice`/`pnlPct`/`signalType`/`daysOpen`/`closedBy` fields. The new call reuses the identical cast for the identical reason — this is an established pattern in this file, not a new one.

## Why all four deterministic exit types reach this call

`exitReason` is a single `let` variable, set by exactly one of: the profit-target check, the time-stop check, the MEAN_REVERSION z-score check, the trend/EMA50 check, the EMA Reclaim check, or the trailing-stop block — each guarded by `if (!exitReason && ...)`, so only the first to fire wins. Every one of these branches falls through to the same unconditional `if (!exitReason) { ...continue }` guard, then the same `closePosition()` → `exitEntries.push()` → `if (ctx) { ... }` block. There is no per-exit-type branching past that point today, and this fix does not add any — the new call sits in that single shared block, so it is structurally unreachable to skip for one exit type while reaching another.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Add `insertAgentLogEntry()` call inside the shared `if (ctx)` block, after `evaluateClosedTrade()` (this spec) | One insertion point covers all four exit types; mirrors existing ghost-close pattern; isolated failure handling | None significant | **Chosen** |
| Call `insertAgentLogEntry()` for every item in `exitEntries` at the point of `return { decisions: exitEntries, ... }` | Single call site, very close to existing `exitEntries.push` | Uses the less-accurate `timestamp`/`position.current_price` already baked into `exitEntries.push`; also fires for `ctx === null` legacy positions where `evaluateClosedTrade` never ran, creating a new inconsistency between `agent_log` and `trade_evaluations` | Rejected — breaks the parity this fix is meant to establish |
| Fix in a caller (`scripts/run-cycle.ts`, `run-cycle.ts`, or the cron route) by writing the returned `decisions` array to `agent_log` there | Would also fix any *other* future caller-discarded-data class of bug | Explicitly forbidden by scope (C-02); three call sites to change instead of one; still leaves the underlying asymmetry (inline `trade_evaluations` write vs. deferred `agent_log` write) intact for any future caller that forgets to persist `decisions` | Rejected — out of scope, and doesn't address root cause |
| Add a generic `appendAgentLogEntries(decisions)` bulk-write helper as SDD.md's "Known Limitations" note implies, called once at the end of `runAgentCycle()` | Would also cover the still-unpersisted BUY/HOLD/REJECT decisions from the main analysis loop (lines 1282+), which have the same structural gap | Much larger surface — touches every decision type, not just deterministic exits; SDD.md's own risk note about this (`Fix: persist per-symbol inside the loop`) argues against a single end-of-cycle batch write for the same reason it's currently broken (a mid-cycle crash loses everything); real scope creep beyond "Bug 2" | Rejected for this spec — worth flagging as a separate future spec, not bundled here |

## Impact on Existing Files

### Required changes

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Add one `insertAgentLogEntry()` call (with its own `.catch()`) inside the existing `if (ctx) { try { ... } }` block (lines 359-376), positioned after `evaluateClosedTrade()` and before `removeOpenPositionContext()`. No other lines in this file change. |

### Not touched

| File | Reason |
|------|--------|
| `scripts/run-cycle.ts` | Forbidden by scope (C-02); not needed — fix lives upstream of this caller |
| `src/lib/run-cycle.ts` | Forbidden by scope (C-02); not needed |
| `src/app/api/cron/run/route.ts` | Forbidden by scope (C-02); not needed |
| `src/lib/db.ts` | `insertAgentLogEntry()` already exists and needs no changes |
| `src/lib/risk-manager.ts`, `indicators.ts`, `learning.ts` | Not involved |
| `src/components/dashboard/AgentReasoningLog.tsx` | Confirmed (STEP 0) to already render the new row type correctly with no changes — reads by `action`, not `error` |
| `src/lib/types.ts` | No new fields or types needed — reuses `AgentLogEntry` as-is with the same `as unknown as TechnicalIndicators` cast already established for enrichment fields |

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is a Protected Zone file. The user has explicitly authorized this specific, scoped modification in this session. The change is confined to:
- One new `insertAgentLogEntry()` call and its `.catch()` handler, inserted inside the existing `if (ctx) { try { ... } }` block.

No exit conditions, thresholds, ordering, `closePosition()` behavior, the trailing-stop floor computation, or `evaluateClosedTrade()` are touched.

## Database Changes

None. `agent_log` already has every column this write needs (verified against the existing ghost-close insert, which writes the same shape).

## Open Questions

- None blocking. One item noted for awareness, not requiring a decision before implementation: after this fix ships, a genuine deterministic exit will produce two `agent_log` rows until the separate ghost-close duplicate-insert bug (C-05, out of scope) is fixed — the new correct row (`error: undefined`, accurate reasoning) and the pre-existing spurious `ghost_close` row from `detectClosedPositions()` finding the position "missing from Alpaca" later in the same cycle. This is expected and was flagged in the originating prompt; no action needed here.
