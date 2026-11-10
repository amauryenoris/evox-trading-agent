# Design — CHANGE 0d-1: characterization harness, scenarios for exits, stops and ghost-close (tests only)

## Architecture Decision

The existing harness (`src/lib/__tests__/support/claude-agent/`) doubles every boundary of `runAgentCycle` (`mocks.ts`), scripts the world through `world.ts`, freezes the clock at `PINS.nowIso = 2026-11-04T15:30:00Z` and records a masked, key-sorted JSON through `record.ts:buildRecord`. This change adds scenarios (n) to (z5) to `claude-agent.characterization.test.ts` and the minimum scripting options in `world.ts`/`builders.ts` they need. Every new option defaults to today's behaviour, so the 18 existing goldens stay byte-identical. `claude-agent.ts` is read only.

## What the current harness cannot do (found by reading `world.ts`)

| Boundary | Today | Needed by | New world option (default = today) |
|----------|-------|-----------|-------------------------------------|
| `getLatestSellOrder` | always `null` (`world.ts:getLatestSellOrder`) | (n) (o) (p) (q) (r): sell price, order id, fill time | `sellOrders: Record<symbol, {id, filledAvgPrice, filledAt}>` , default `{}` -> `null` |
| `tradeEvaluationExists` | always `false` | (r) | `evaluatedTrades: string[]` of symbols, default `[]` |
| `getOrders` | always `[]` | (z4) existing-sell-order variant; filled-buy lookup | `openOrders`, `filledOrders: Record<symbol, AlpacaOrder[]>`, default empty |
| `cancelOrder`, `submitStopOrder` | never fail | (w) | `cancelError`, `stopError: Record<symbol, string>`, default `{}` |
| `getPeakHighSinceLastCheck` | `null` (`mocks.ts`) | (u) (v) | none needed: the stored `ctx.highSinceEntry` carries the high |

Unchanged: the recorded call shapes (`cancelOrder {orderId}`, `getOrders {status}`, etc.), the id counter, and all current defaults.

## Raw values the goldens mask

`record.ts` replaces every ISO timestamp with `<ts>`, so `cooldown.upsert`'s `until` cannot distinguish `endOfTradingDay` (same-day 21:00Z), `nextTradingDay1` or `nextTradingDay3`. For (n) (o) (p) (q) (z2) (z3) the test body therefore also asserts the raw `until` from `world.calls` (computed from the frozen clock and `world.ts:nextTradingDay`, which skips weekends only): expected `2026-11-04T21:00:00.000Z` (end of day), `2026-11-05T00:00:00.000Z` (next day), `2026-11-09T00:00:00.000Z` (third day). The expected values are read from a first run and checked against `claude-agent.ts:1038-1048` (the cooldown date computation) before they are written.

## Scenario map (code paths at HEAD `78b96f2`, re-read at implementation)

| ID | Setup of the world | Code path | Golden pins | Extra assertions |
|----|--------------------|-----------|-------------|------------------|
| n | Context for `GHO` in `contexts`, absent from `positions`; sell order below buy price | Ghost-close loss `claude-agent.ts:1196-1250`, cooldown write `:1249-1257` | evaluate, outcome, context delete, agent_log `ghost_close`, `cooldown.upsert STOP_LOSS` | raw `until` = third trading day |
| o | As (n) plus an active cooldown row for `GHO` | `existingCooldowns` hoist `:1192-1194`, skip `:1258-1262` | same as (n) without `upsert` | no `cooldown.upsert` |
| p | Profit; `sellOrders.GHO.id === ctx.trailingStopOrderId` | `:1263-1278`, `isConfirmedTrailingStopFill` | `cooldown.upsert TRAILING_STOP` | raw `until` = next trading day |
| q | Profit; sell order id differs | same block, reason `GHOST_CLOSE_PROFIT` | QUIRK: reason not in `ExitReason` | raw `until` = end of day |
| r | As (n) with `evaluatedTrades: ['GHO']` | `:1207-1211` | no `learning.evaluateClosedTrade`, no `selector.recordOutcome`; agent_log still written | — |
| s | (n) plus `GHO` in the watchlist | `closedThisCycle` `:1321`, skip `:1404-1409` | no `claude.create` for `GHO` | — |
| t | `activeCooldowns` row for a watchlist symbol | restore `:1360-1372`, skip `:1404-1409` | no `claude.create` for it | — |
| u | `MEAN_REVERSION` context, `highSinceEntry` >= +5%, current price above the floor | `applyProfitFloor` `:576-621`, `replaceProtectiveOrder` `:487-531` | `cancelOrder` old stop, `submitStopOrder` new stop, context patch, protective-stop snapshot | snapshot fields, no exact dates |
| v | As (u) with price at or below the computed floor | `handleFloorSellNow` `:562-574` | `closePosition`, exit reason profit floor | — |
| w1 | As (u), `cancelError` set | `cancel_failed` `:501-505`, `logNakedStopAlert` | agent_log `trailing_stop_naked`, no new stop | — |
| w2 | As (u), `stopError` set (cancel ok) | `naked` `:519`, retry in `submitStopWithRetry` `:733-752` (3 s timer, drained by `pump`) | agent_log `trailing_stop_naked`, two `submitStopOrder` attempts | — |
| x1 | `TREND_PULLBACK_3DAY` context at its activation threshold | trailing activation `:262-345`, `TRAILING_ACTIVATION_PCT` in `protective-stop.ts:17-24` | `cancelOrder` Capa A, `submitStopLimitOrder`, `trailingStopOrderId` patch | — |
| x2 | `EMA_RECLAIM` context, same | same, other multiplier and threshold | same | — |
| y | Four held positions: `TREND_PULLBACK` and `EMA_RECLAIM` below EMA50, `TREND_ZLE05` at z 1.25 and one with an EMA50 break, `TREND_PULLBACK_3DAY` above SMA5 | exit rules `:212-244` | `closePosition` per exit, cooldown reasons | — |
| z1 | Four positions: normal setup at 9.9% and 10%, `TREND_ZLE05` at 4.9% and 5% | profit target `:203-205`, `getProfitTargetPct` | only the at-target positions sell | — |
| z2a | Context bought 28+ calendar days before the frozen clock | time stop `:210-212` | `closePosition`, no `cooldown.upsert` | — |
| z2b | `buyTimestamp: 'not-a-date'` | guard `:207-209` | no sell | `console.warn` called with the exact text |
| z3 | Held position with price <= buy * 0.95 | `enforceStopLosses` `:664-699` | `closePosition`, `cooldown.upsert STOP_LOSS` | raw `until` = third trading day |
| z4a | Position with no context, `getOrders('open')` empty | orphan reconciliation `:124-190` | stop submitted, `db.saveOpenPositionContext` with `[AUTO-RECONCILED]`, `orphaned_position_reconciled` | — |
| z4b | Same with an open sell order for the symbol | `alreadyProtected` `:128-132` | no stop submitted | — |
| z5 | Held position with `kalman: null` in indicators | skip `:105-116` | agent_log `exit_rules_skip` | — |

Scenarios y and z1 pack several positions into one cycle (all independent, at most 5 positions, no watchlist symbol), each pinned by one golden. All other cases get their own golden. Total: about 22 new goldens.

## Stability

Fake timers are installed by `installHarness`; `pump` drains the 3 s retry timers. Order ids come from the world counter, uuids from `world.nextUuid`, timestamps from the frozen clock. Scenario order inside the file is irrelevant (`world.reset` in `beforeEach`). Three consecutive runs are compared.

## Coverage plan

Before and after: `npx vitest run --coverage --coverage.include=src/lib/claude-agent.ts src/lib/__tests__/claude-agent.characterization.test.ts` (provider v8 is installed, `package.json` has `test:coverage`). The report is read for statements and branches of `claude-agent.ts` and the uncovered lines in `enforceExitRules` (`:93-440`), the profit-floor helpers (`:461-621`), `enforceStopLosses` (`:664-699`) and the ghost-close block (`:1196-1290`). Only the characterization file is run for the numbers, so the delta is attributable to this change.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Extend `world.ts` with optional scripting, defaults unchanged | Keeps one harness; existing goldens untouched | New options to maintain | Chosen |
| New separate harness file for exit scenarios | Isolated | Duplicates mocks and the record format | Rejected |
| Assert only in code, no goldens | Fewer files | Weaker pin; not the harness convention | Rejected |
| One scenario per boundary case in (y) and (z1) | Smaller goldens | About 8 extra goldens for table-like cases | Rejected (packed) |
| Change `claude-agent.ts` to make a path easier to reach | Easier | Forbidden (tests only) | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/__tests__/claude-agent.characterization.test.ts` | MODIFY | New `describe` blocks with scenarios (n) to (z5) |
| `src/lib/__tests__/support/claude-agent/world.ts` | MODIFY | Optional scripting fields with default behaviour unchanged |
| `src/lib/__tests__/support/claude-agent/builders.ts` | MODIFY | New builders only if a scenario needs them |
| `src/lib/__tests__/__golden__/claude-agent/*.json` | CREATE | About 22 new goldens |
| `src/lib/__tests__/support/claude-agent/mocks.ts`, `record.ts`, `harness.ts` | NONE expected | Changed only if a scenario cannot be built otherwise; any such change is listed in the review |
| `specs/characterization-harness-0d-1/` | CREATE | requirements, design, tasks; `review.md` at the end |

Not touched: any file outside `src/lib/__tests__/**` and the spec folder; the 18 existing goldens; `specs/docs-5-selector-criteria/tasks.md`.

## Protected Zone Impact

None — this feature does not require Protected Zone changes. `claude-agent.ts` is only read.

## Database Changes

None.

## Risks

- A new world option accidentally alters an existing record. Mitigation: defaults equal to today, SHA-256 comparison of all 18 goldens, and the 23 existing tests run first.
- A scenario that cannot be reached without changing `src/` (candidates: (z5) if code outside `enforceExitRules` reads `kalman` of a held symbol; (w2) timing of the retry). Mitigation: stop on that scenario, explain it, list it as not covered.
- The golden masks dates, so a wrong cooldown date would pass silently. Mitigation: explicit raw `until` assertions (FR-22).
- Recording a golden and trusting it. Mitigation: FR-48/FR-49, each golden is read against the code and described in the review.
- Order-dependent counters. Mitigation: `world.reset` per test; three runs compared.

## Open Questions

- **Q-1 (harness edits):** `world.ts` and possibly `builders.ts` are edited (tests only, defaults unchanged). The request allows files under `src/lib/__tests__/**`. Confirm.
- **Q-2 (masked dates):** the goldens mask timestamps, so cooldown dates are asserted in the test body from raw `world.calls`. Confirm this addition to "golden only".
- **Q-3 (packing):** (y) and (z1) pack several independent positions into one cycle and one golden each. Confirm, or ask for one golden per case.
- **Q-4 (golden count):** about 22 new goldens (n, o, p, q, r, s, t, u, v, w1, w2, x1, x2, y, z1, z2a, z2b, z3, z4a, z4b, z5). Confirm.
- **Q-5 (coverage run):** coverage before/after uses only the characterization file, with `claude-agent.ts` as the only included file. Confirm.
