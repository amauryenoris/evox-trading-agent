# Requirements — Persist Deterministic-Exit SELL Entries to agent_log (Bug 2)

## STEP 0 — Pre-implementation findings

Verified live against `src/lib/claude-agent.ts` in this session (read in full, not inferred from names).

### Confirmed structural gap

`insertAgentLogEntry` (imported at **line 31** from `./db`) is called at exactly **three** locations in the entire codebase:

| Line | Branch | Writes a SELL row? |
|------|--------|---------------------|
| 179 | `enforceExitRules()` — skip when no kalman indicators cached | No (HOLD) |
| 321 | `enforceExitRules()` — "no exit triggered" per-cycle check | No (HOLD) |
| 1110 | `detectClosedPositions()` ghost-close loop | **Yes** — the only current SELL write path |

The deterministic-exit branch inside `enforceExitRules()` — where `exitReason` has already been set by one of the four rule checks (profit target, time stop, MEAN_REVERSION z-score exit, trend/EMA50 exit, EMA Reclaim exit, or the trailing-stop block) — builds an `AgentLogEntry` via `exitEntries.push({...})` at **lines 337-346**, but never calls `insertAgentLogEntry`. That object only ever becomes part of the in-memory `decisions` array returned up the call chain.

Confirmed (by reading, not by name) that none of the three current callers of this return value persist it to `agent_log`:
- `scripts/run-cycle.ts:14-16` (the script the hourly GitHub Actions cron actually runs, `npm run cycle`) — calls `runAgentCycle()`, then only `console.log(JSON.stringify(result, ...))`.
- `src/lib/run-cycle.ts:38` (backs `npm run exit-only`) — `const { decisions: _exitDecisions } = await enforceExitRules(...)` — destructured into an intentionally-unused variable, discarded.
- `src/app/api/cron/run/route.ts:14-15` — `NextResponse.json({ success: true, ...result })` — returned as an HTTP response body only, never persisted.

Meanwhile `trade_evaluations` is written synchronously and unconditionally on the same code path, one step later in the same function, via `evaluateClosedTrade(ctx, exitPrice, exitTimestamp)` at **line 367** (inside the `if (ctx) { try { ... } }` block at **lines 359-376**). This asymmetry — one write inline and unconditional, the other deferred to a caller that never persists it — is the confirmed root cause of the missing SELL rows (see prior diagnostic session, trade UUUU id `af08985c`).

`SDD.md:264-267` ("Known Limitations & Risk Notes → Persistence risk") documents a related but not-identical claim: that decisions are persisted "only after the full symbol loop completes, via `appendAgentLogEntries`." No function named `appendAgentLogEntries` exists anywhere in the current codebase (confirmed by search) — this appears to describe an earlier or intended design that was never implemented for the deterministic-exit path. SDD.md's own suggested fix — "persist per-symbol inside the loop" — is the direction this spec takes, so the documented intent is honored even though the mechanism described no longer matches the code.

### Existing ghost-close SELL shape (the pattern to mirror), lines 1110-1137

```ts
await insertAgentLogEntry({
  id: randomUUID(),
  timestamp: sellTimestamp,
  symbol: ctx.symbol,
  decision: {
    action: 'SELL',
    symbol: ctx.symbol,
    quantity: ctx.quantity,
    reasoning: `Position closed by Alpaca automatically (stop loss or external order). Entry: $${ctx.buyPrice.toFixed(2)} Exit: $${sellPrice.toFixed(2)} P&L: ${pnlPct > 0 ? '+' : ''}${(pnlPct * 100).toFixed(2)}% Signal type: ${ctx.signalType} Days open: ${daysOpen}`,
    confidence: 1.0,
  },
  indicators: {
    ...ctx.indicators,
    entryPrice: ctx.buyPrice,
    exitPrice: sellPrice,
    pnlPct,
    signalType: ctx.signalType,
    daysOpen,
    closedBy: 'alpaca_gtc',
  } as unknown as TechnicalIndicators,
  portfolioSnapshot: {
    equity: account.equity,
    cash: account.cash,
    positionCount: positions.length,
  },
  orderExecuted: true,
  error: 'ghost_close',
}).catch((err) => console.error(`[GHOST-CLOSE] Failed to insert agent_log for ${ctx.symbol}:`, err))
```

Error handling pattern: a `.catch()` chained directly onto the `insertAgentLogEntry(...)` call — logged, never rethrown, never blocks the rest of that loop iteration.

### Existing exitEntries.push shape (unchanged, for reference), lines 337-346

```ts
exitEntries.push({
  id: randomUUID(),
  timestamp,
  symbol: position.symbol,
  decision: { action: 'SELL', symbol: position.symbol, quantity: 0, reasoning: exitReason, confidence: 1.0 },
  indicators: ind,
  portfolioSnapshot: { equity: position.market_value, cash: '0', positionCount: positions.length },
  orderExecuted: true,
  error: undefined,
})
```

### Variables already in scope at the proposed insertion point (lines 359-376)

Verified available without new computation: `position.symbol`, `ctx.buyPrice`, `ctx.quantity`, `ctx.signalType`, `daysOpen` (computed at line 195: `getTradingDaysOpen(ctx.buyTimestamp)`), `ind` (this position's `TechnicalIndicators` from the cache), `account.equity`, `account.cash`, `positions.length`, `exitReason` (the per-branch string — already the existing taxonomy, no new one needed), and — from lines 361-365 — `exitPrice` and `exitTimestamp` (the real order-fill price/time, more accurate than the cycle-start `timestamp` or stale `position.current_price` used in the untouched `exitEntries.push`).

### Consumer check — no code path assumes SELL rows only come from ghost-close

Searched `src/components/dashboard/` and `src/lib/db.ts` for any filter on `error = 'ghost_close'` or equivalent gating logic:
- `AgentReasoningLog.tsx:detectKind()` (line 86) routes to `SELL_EXECUTED` on `entry.decision.action === 'SELL'` alone — no dependency on the `error` field.
- `AgentReasoningLog.tsx:parseEntry()` (line 71) sets `p.ghostClose` via a regex test (`/ghost.?close|alpaca\s*gtc/i`) against the combined reasoning+error text, used only to show an optional "Closed by Alpaca GTC" badge (line 338-343) — absent for non-ghost rows, not a filter.
- `parseEntry()` (lines 73-76) already recognizes "profit target", "trailing stop", "EMA50", and "time stop" substrings in `reasoning` to label `parsed.exitRule` — this logic predates this fix and has been effectively dead code for real deterministic exits until now, since no such row has ever existed in `agent_log`. It requires no changes to display the new rows correctly.
- `src/lib/db.ts:getAgentLogPrioritized()` (line 100) filters by `action = 'SELL'`, not by `error` — will pick up the new rows automatically.

No breaking assumption found. This is a pre-implementation research finding, not a requirement — no consumer code needs to change.

---

## Functional Requirements

FR-01: The system shall write one `agent_log` row via `insertAgentLogEntry()` for every deterministic exit (profit target, 20-day time stop, MEAN_REVERSION z-score reversion, trend/EMA50 exit, EMA Reclaim exit, or trailing-stop trigger) that has an associated `OpenPositionContext` (`ctx` is non-null).

FR-02: The system shall populate the new row's `decision.reasoning` field with the exact `exitReason` string already computed by the branch that fired, without introducing a new exit-reason taxonomy.

FR-03: The system shall populate the new row's `timestamp` field with `exitTimestamp` (the real order-fill time already computed at line 365), not the cycle-start `timestamp`.

FR-04: The system shall populate the new row's `indicators.exitPrice` field with `exitPrice` (the real order-fill price already computed at lines 361-364).

FR-05: The system shall populate the new row's `decision.quantity`, `indicators.entryPrice`, `indicators.signalType`, and `indicators.daysOpen` fields from `ctx.quantity`, `ctx.buyPrice`, `ctx.signalType`, and `daysOpen` respectively, mirroring the field names already used by the existing ghost-close insert at line 1110.

FR-06: The system shall set the new row's `error` field to a value other than `'ghost_close'`, so downstream consumers that key off that literal (if any exist in the future) can distinguish a deterministic exit from an Alpaca-driven ghost close.

FR-07: The system shall place the new `insertAgentLogEntry()` call after the existing `evaluateClosedTrade()` call and before `removeOpenPositionContext()`, inside the existing `if (ctx) { try { ... } }` block (lines 359-376).

FR-08: The system shall attach a dedicated `.catch()` handler directly to the new `insertAgentLogEntry()` call, logging any failure via `console.error`, mirroring the ghost-close call's error-handling pattern — a failure of this write shall not prevent `removeOpenPositionContext()` from running.

FR-09: The system shall leave the existing `exitEntries.push({...})` object (lines 337-346) unmodified — it continues to be returned to callers exactly as today.

## Non-Functional Requirements

NFR-01: `npx tsc --noEmit` shall pass with zero new errors after the change.

NFR-02: `npm run build` shall pass with zero errors after the change.

NFR-03: No exit condition, threshold, ordering, the trailing-stop floor computation (lines ~275-291), `closePosition()`, or `evaluateClosedTrade()` shall change as a result of this fix — it is additive logging only.

## Constraints

C-01: This feature modifies `src/lib/claude-agent.ts`, a Protected Zone file. The user has explicitly authorized this specific, scoped modification in this session (see AUTHORIZATION note in the originating prompt) — standard confirm-before-touching still applies to anything beyond this scope.

C-02: No changes to `scripts/run-cycle.ts`, `src/lib/run-cycle.ts`, or `src/app/api/cron/run/route.ts` — the fix lives entirely at the point the exit is decided, inside `claude-agent.ts`.

C-03: No changes to `risk-manager.ts`, `indicators.ts`, `learning.ts`, or `db.ts`.

C-04: No new database columns, tables, or RLS policy changes.

C-05: The separate, already-identified ghost-close duplicate-insert issue (where `detectClosedPositions()` can log a spurious second `ghost_close` row for a position already correctly closed by the deterministic-exit path) is explicitly out of scope. This fix does not resolve it and may make its presence more visible (a genuine deterministic exit will now show two `agent_log` rows post-fix: the new correct one, and the pre-existing spurious ghost-close one, until that separate issue is fixed).

C-06: Positions with `ctx === null` (legacy positions carrying no `OpenPositionContext`, i.e. `signal_type === null`) continue to receive no `agent_log` SELL row and no `trade_evaluations` row from this path, matching current behavior for `trade_evaluations`. This is a pre-existing boundary, not introduced or worsened by this fix.

## Out of Scope

- Fixing the ghost-close duplicate-insert bug (tracked separately).
- Any change to `run-cycle.ts` (either file), the cron API route, or any other caller of `enforceExitRules()` / `runAgentCycle()`.
- Any change to the trailing-stop floor logic or the separate Bug 1 (floor-at-buyPrice violation) — that is a distinct, already-diagnosed issue with its own fix.
- Dashboard/UI changes — confirmed unnecessary; existing `AgentReasoningLog.tsx` renders the new row type correctly with no modification.
- Backfilling historical missing `agent_log` SELL rows for past trades.
