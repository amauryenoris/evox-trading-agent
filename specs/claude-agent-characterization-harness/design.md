# Design — CHANGE 0: characterization harness for runAgentCycle (tests only)

## Architecture Decision

`runAgentCycle` (2,787-line file, no test executes it today) is driven end to end inside Vitest with every boundary mocked by module path, the same style the four existing tests that import `../claude-agent` already use (`vi.mock('../alpaca')`, `../db`, `../learning`, `../peak-high`). Each scenario sets the mocked inputs (account, positions, bars/indicators, quotes, scripted Claude reply, risk verdict), runs the cycle once, and compares a **normalized record** of everything that crossed a boundary against a golden file recorded from the current code. The harness lives in new files only: scenarios in `src/lib/__tests__/claude-agent.characterization.test.ts`, helpers and fixtures in a new folder `src/lib/__tests__/support/claude-agent/` (no `*.test.ts` names there), goldens in `src/lib/__tests__/__golden__/claude-agent/*.json`. The one config edit adds `src/lib/claude-agent.ts` to `coverage.include`.

## What `runAgentCycle` touches (from `claude-agent.ts` imports and the STEP 0 report)

| Boundary | Module | Double |
|---|---|---|
| Broker | `./alpaca` (`getAccount`, `getPositions`, `getClock`, `getBars`, `getQuote`, `submitLimitOrder`, `submitStopOrder`, `submitStopLimitOrder`, `getOrder`, `getOrders`, `getLatestSellOrder`, `closePosition`, `cancelOrder`, `getNextTradingDay`, `getMarketMovers`, `getMacroNews`, `getNewsForSymbols`, `normalizeTimestampPrecision`) | `vi.fn` per export, recorded in the call log; `normalizeTimestampPrecision` keeps its real behaviour via `importActual` |
| Claude | `@anthropic-ai/sdk` default export | class whose `messages.create` returns a scripted JSON reply (or throws, for scenario j); the request body is recorded |
| Indicators | `./indicators` (`calculateAllIndicators`) | returns a crafted `TechnicalIndicators` per symbol: the lever that selects the setup |
| DB / logs / learning | `./db`, `./db-cooldowns`, `./agent-log`, `./learning` | recorders returning empty or scripted rows; `appendAgentLogEntries` captures the persisted decisions |
| Selection / news / watchlist / risk | `./stock-selector`, `./news-intelligence`, `./watchlist-monitor`, `./risk-manager`, `./market-daily-briefing`, `./sector-rotation` | scripted returns (risk manager returns allow or a rejection reason) |
| Already-pure modules | `./position-sizing`, `./protective-stop`, `./sma5-exit`, `./earnings-window`, `./earnings-gate-context`, `./learning-context`, `./state-fingerprint`, `./peak-high`, `./macro-bars-staleness` | real, except where noted (earnings calendar read goes through a mocked `db` helper) |
| Config | `./config` | mocked with explicit constants (pinned) |
| Time / ids | `Date`, `crypto.randomUUID`, `TZ` | `vi.useFakeTimers` + `setSystemTime`; counter UUIDs; `TZ` set in the test setup |

The exact list of mocked modules is confirmed in task T-02 by running the smallest scenario (i) and adding doubles until it passes. If a boundary cannot be doubled without editing production code (for example the dynamic `import('./db')` at line 2412 resolving differently from the static one), the work stops and reports (FR-24).

## Pinned configuration

- **Trading constants** (`config.ts`): replaced via `vi.mock('../config')` with explicit values copied into the test setup, so a later change to the real constants cannot move the golden silently.
- **z-score sizing override**: `Z_SIZING_OVERRIDE_ENABLED` is a module constant read inside `computeBuyQuantity`, and the caller does not pass `zOverrideEnabled`. The harness mocks `../position-sizing` so that `computeBuyQuantity` delegates to the real implementation with `zOverrideEnabled` set to a fixed value. Recommended pinned value: **false** (the owner's decision in the previous CHANGE; also the value the working tree has now). Scenario (a) uses a z-score at or below -2.0 so the pinned value shows up in the recorded quantity.
- **Environment**: fake keys and fixed `RISK_PCT=0.01`, `STOP_LOSS_PCT=0.05`, `MAX_POSITIONS=5`, `MAX_POSITION_SIZE=0.10`, restored after each test.

## Normalized record and golden format

One JSON object per scenario, compared with `toMatchFileSnapshot`:

```
{
  decisions:  [{ symbol, action, signalType, error }],
  orders:     [{ symbol, side, qty, type }],
  agentLog:   [{ symbol, action, reasoningPrefix, error, snapshot }],   // snapshot includes `earnings`
  contexts:   [{ op: save|update|remove, symbol, fields }],
  callLog:    [ordered boundary calls: name + normalized args],
  prompt:     "<exact string>" (scenarios a and b only)
}
```

Normalization replaces timestamps and generated ids with stable placeholders; counter UUIDs make the ids stable already. Golden files are generated once from the current code (first run writes them locally, the run in CI fails if one is missing, FR-33). They are never regenerated to make a test pass.

## Scenarios

| # | Scenario | Locks in |
|---|---|---|
| a | MEAN_REVERSION BUY, filled, z <= -2.0 | setup detection -> Claude prompt (golden) -> gates -> sizing with the pinned override -> IOC order -> stop order -> context save -> log row |
| b | TREND_PULLBACK_3DAY BUY | highest-priority signal classification, 3DAY prompt context, its own buy path |
| c | HOLD by MR_RANGING_ADX_GATE | pre-Claude gate, no Claude call, log row with the gate code |
| d | HOLD by spread gate | post-Claude execution gate, no order |
| e | HOLD by EARNINGS_BLOCK | earnings gate reading the cache, `earnings` snapshot field |
| f | Risk-manager rejection | gate 5 handling: HOLD with the manager's reason, no order |
| g | Exit SELL by exit rules (z-score rule or profit target) | `enforceExitRules` path inside the cycle, close call, cooldown write, context removal |
| h | Rotation close | rotation closes a position through the legacy classifier; **quirk**: no context removal or cooldown, `positions` spliced |
| i | No candidates and no open positions (market-closed early return as a variant if cheap) | early exits, persisted output shape |
| j | Claude API error (and, if cheap, broker order error) | per-symbol catch -> HOLD "Analysis failed", IOC not filled handling |

The STEP 0 list also named a ranking scenario (two candidates, winner and outranked) and an IOC zero-fill scenario; both lock in code that the request's list does not reach (ranking phase P17, `IOC_NOT_FILLED`). They are proposed as additions if the 650-900 line budget allows (design O-2), per FR-23.

## Quirks to capture as-is (each with a comment in the test)

1. `entryLogId` is a fresh UUID unrelated to the agent_log entry id, so the watchlist link never matches (`claude-agent.ts` ~2482, 2674, 2582).
2. Rotation closes a position without removing its context or writing a cooldown, and `openPositionSymbols` / `slotsAvailable` are not refreshed after the `positions.splice` (~1848); the close shows up as a ghost close next cycle.
3. Any further oddity found while recording goldens (for example the `[BUY SIZING]` log values, the two buy paths differing, the stale `slotsAvailable`) is listed in the report, not fixed.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Mock by module path and golden files (chosen) | Same style as existing tests; survives a later file move; reviewable diffs | Needs many doubles | Chosen |
| Inline snapshots in the test file | One file | Large literals inflate the line count; harder to review | Rejected |
| Record real API responses | Realistic | Network, secrets, non-deterministic | Rejected |
| Test sub-functions only | Easier | Does not prove the wiring that a split can break | Rejected |
| Mutation check by editing `claude-agent.ts` | Proves the harness bites | Forbidden by the Protected Zone rule | Rejected, replaced by an input-perturbation check (O-5) |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/__tests__/claude-agent.characterization.test.ts` | CREATE | Scenarios and assertions |
| `src/lib/__tests__/support/claude-agent/*.ts` | CREATE | Mock factories, builders (account, positions, indicators), clock/uuid setup, normalizer |
| `src/lib/__tests__/__golden__/claude-agent/*.json` | CREATE | One golden per scenario |
| `vitest.config.ts` | MODIFY | `coverage.include`: add `'src/lib/claude-agent.ts'` (one line) |
| `.tmp/claude-agent-characterization-report.md` | CREATE | Deliverable (gitignored) |

## Protected Zone Impact

None — this feature does not require Protected Zone changes. `claude-agent.ts` is executed by the tests but never edited. `vitest.config.ts` is not on the Protected list.

## Database Changes

None. All database access is mocked; no migration, no query against Supabase.

## Open Questions

- **O-1** Pinned z-override value. Default: `false`. The previous CHANGE (flag off) is still uncommitted in the working tree; pinning makes the golden independent of whether it is committed first.
- **O-2** Scenarios beyond the ten in the request: ranking with two candidates (winner plus outranked) and IOC zero-fill. Default: add them only if the size stays inside roughly 900 lines; otherwise list them in the report as not built.
- **O-3** Prompt golden. The request lists decisions, orders, log rows, contexts and snapshot, not the prompt; the STEP 0 plan did include it. Default: capture the exact prompt in scenarios (a) and (b) (it directly protects the first planned move, `prompt-builder`). Say if you want it left out.
- **O-4** Golden storage: `toMatchFileSnapshot` JSON files under `__golden__/claude-agent/`. Default accepted unless you prefer inline snapshots. Regenerating a golden (`-u`) is allowed only as a deliberate, reviewed act, never to make a failing run pass.
- **O-5** The STEP 0 acceptance idea of deleting one gate line in `claude-agent.ts` to prove the harness fails is a source edit and is forbidden here. Default: prove sensitivity by perturbing a mocked input (for example flipping a gate-relevant indicator or the risk verdict) and by altering a golden copy in the scratchpad, both without touching production code. Say if you want a different check.
- **O-6** If the cycle reads clock-dependent values from the mocked Alpaca clock and the system clock inconsistently, the two will be set to the same fixed instant. If a path still reads real time, the scenario is reported as non-deterministic and stopped (FR-24), not worked around in production code.
