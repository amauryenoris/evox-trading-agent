# Design — CHANGE 0d-2: characterization harness, remaining setups, partial fills, stop-submit failure and the branches left over from 0d-1 (tests only)

## Architecture Decision

Same approach as 0d-1: new scenarios in `claude-agent.characterization.test.ts`, minimal optional scripting in `world.ts` (and one pass-through hook in `mocks.ts`), new goldens recorded once and read against the code. Every new option defaults to today's behaviour, so the 39 existing goldens stay byte-identical. `claude-agent.ts` is read only. The code paths below were read at HEAD `bfc1f7f`.

## What the harness cannot do yet (found by reading `world.ts` and `mocks.ts`)

| Boundary | Today | Needed by | New option (default = today) |
|----------|-------|-----------|------------------------------|
| `submitLimitOrder` fill | `fill: 'full' \| 'zero'` per symbol: all or nothing | (ae) (af) | `fillPlan: Record<symbol, Array<{ filled: number } \| { unfilled: number }>>`, one entry per limit order of the symbol; no entry -> current behaviour |
| `getQuote` | static `quotes[symbol]` | (af-1) drift, (ae) | `quoteSequence: Record<symbol, Quote[]>`, one per call, then the static quote |
| `getPeakHighSinceLastCheck` | `mocks.ts` stub returns `null` | (ak) | `peakHighs: Record<symbol, number>`; the stub returns it, else `null` |
| `closePosition` | never fails | (an-1) | `closeErrors: Record<symbol, string>` |
| `getAllOpenPositionContexts` | never fails | (an-2) | `contextReadFailures: number`: the first N calls throw |
| `toExitReason` | real (`exit-cooldown.ts`) | (am) | `mocks.ts`: `vi.mock('../../../exit-cooldown')` passing through to the real function unless `exitReasonOverrides[symbol]` is set. See Q-1 |
| `makeOrder` | private to `world.ts` | (al-1) | exported, unchanged |

Unchanged: the recorded call shapes, the id counter and every current default.

## Scenario map (code paths at HEAD `bfc1f7f`)

| ID | Setup of the world | Code path (`claude-agent.ts`) | Golden pins | Extra assertions |
|----|--------------------|-------------------------------|-------------|------------------|
| aa | Watchlist `AAA`, uptrend (price > EMA50 > EMA200), z about -0.5, EMA50 slope rising, ADX 25, MACD histogram 0.5; no MR, no 3DAY | Setup `:1581-1600`, classification `:1719-1729`, buy `:2033-2150` | `claude.create`, `submitLimitOrder`, `submitStopOrder`, saved context with `signalType` `TREND_PULLBACK`, `tp_population_bucket` | `[TREND_PULLBACK_STATS]` via log spy; `.prompt.txt` |
| ab | z about +0.5, ADX 20, histogram 0.5 | `:1623-1633`, `:2127-2130` | Same with `TREND_ZLE05`, `zle05_population_bucket` | `.prompt.txt` |
| ac | EMA50 cross: price above EMA50 by more than 0.2%, previous close at or below previous EMA50, z < 0, no uptrend structure | `:1654-1665`, `:1686`; `position-sizing.ts:79-80` | Quantity equal to the base size x 0.75 (rounded), context `signalType` `EMA_RECLAIM` | `.prompt.txt` |
| ad-1 | As (aa) with MACD histogram <= -2.0 | `:1603` (counter), no-setup HOLD `:1805-1818` | HOLD, no `claude.create`, no order, `error` null | `[TREND_PULLBACK_BLOCKED_MACD]` via log spy |
| ad-2 | As (ab) with ADX 10 and histogram 0.1 | `:1772-1787` | HOLD, error `TREND_QUALITY_FAIL: adx=10.0 slope=ok` (exact text read from the run), no `claude.create` | — |
| ad-3 | EMA cross detected, distance <= 0.2% | `:1750-1769` | HOLD, error `EMA_RECLAIM_NEAR: conditions not met`, no `claude.create` | — |
| ae | MR candidate; `fillPlan` first order partly filled, second filled; `quoteSequence` keeps the ask inside the drift | `executeIocWithRemainderRetry` `:851-905`, `:2062-2084` | Two `submitLimitOrder`, weighted average price, `fillAttempts` in the context, `submitStopOrder` for the filled total, BUY decision with the filled quantity | — |
| af-1 | Same, second quote ask above `limit x 1.002` | gate `:869-884` | One limit order, stop for the partial quantity, `requestedQty` greater than the quantity | `[IOC_RETRY] ... gate check failed` and `IOC_PARTIAL_FILL` via log spy |
| af-2 | Partial fill leaving a remainder worth less than 300 USD | same gate | Same shape | same |
| ag | `stopErrors` for the symbol (two attempts, 3 s timer drained by `pump`) | `:2084-2088`, save `:2139` | BUY executed, `error` `STOP_SUBMIT_FAILED: <reason>`, context saved with `stopOrderId` undefined, two `submitStopOrder` | QUIRK: unprotected position, error text only |
| ah | Watchlist of three: a blacklisted symbol (`SQQQ`), a held symbol, a symbol absent from the indicator cache | `:1393-1431` | No orders, no Claude call; HOLD `Skipped: no indicators available in cache` for the third | — |
| ai | `TREND_PULLBACK` context, `trailingActivated` true, `trailingStop` 104, high 108, price 103.9 | `:262-345` (stop update), `:360-372` (exit) | Sell with reason "Trailing stop triggered: ...", `cooldown.upsert TRAILING_STOP`; the order replacement that precedes the exit is pinned as it happens | raw `until` = next trading day |
| aj | Ghost-close with a profit and an `activeCooldowns` row | `:1280-1288` | As (q) without the `upsert` | — |
| ak | MR context with high 102, `peakHighs` 108 | `:269-276`, `applyProfitFloor` | Context patch with `highSinceEntry` 108 and the floor computed from it | — |
| al-1 | Orphan with `filledOrders` holding two buys of the symbol with different `filled_at` | `:142-156` | `saveOpenPositionContext` with `buyTimestamp` = the latest `filled_at` | — |
| al-2 | Orphan with `filledOrders` empty | `:157-160` | `buyTimestamp` = cycle timestamp (masked `<ts>`) | `[RECONCILE] ... no matching filled buy order found` via warn spy |
| am | Held position exiting by profit target with `exitReasonOverrides` -> `UNKNOWN` | `:1338-1346` | Sell happens; no `cooldown.upsert` for the symbol | `[EXIT_COOLDOWN_UNKNOWN_REASON]` via warn spy |
| an-1 | Held position down 6%, `closeErrors` set | `:693-696` | `closePosition` attempted, no `upsert STOP_LOSS` | — |
| an-2 | `contextReadFailures: 1` | `:668-672` | No stop-loss close; the later context read (exit rules) works | `[enforceStopLosses] CRITICAL` via error spy |

Exact numbers (prices, quantities, ADX, MACD) are set when each scenario is built and are checked against the code before they are written into the spec of record (`review.md`). Raw `until` values are asserted in the test body, as in 0d-1, because goldens mask timestamps.

## Expected findings to confirm while building

- Scenario (ad-1): the MACD floor does not produce a distinct HOLD text; the candidate falls to the generic "no setup" HOLD (`:1805-1818`) with `error: undefined`. Pinned as is.
- Scenario (am): every exit-reason string produced by `enforceExitRules` maps to a known `ExitReason`, so `UNKNOWN` cannot occur through the real flow today; the override hook in `mocks.ts` is the only way to reach `:1338-1346` without changing `src/` (Q-1).
- Scenario (ag): the buy path has no equivalent of `logNakedStopAlert`; the only trace is the `error` field of the agent_log entry.
- Scenario (ai): the trailing-stop order replacement runs before the exit is evaluated, so a replacement and a sell can occur in the same pass. If observed, it is recorded as a QUIRK.

## Stability

Fake timers and `pump` drain the 1.5 s order-polling timers and the 3 s stop-retry timers. Order ids come from the world counter, uuids from `world.nextUuid`, timestamps from the frozen clock. `world.reset` runs before each test. Three consecutive runs are compared.

## Coverage plan

Before and after: `npx vitest run --coverage --coverage.include=src/lib/claude-agent.ts src/lib/__tests__/claude-agent.characterization.test.ts` with the JSON reporter and the same summary script as in 0d-1 (statements, branches, uncovered statement starts per region). Regions reported: setup detection (about `:1540-1830`), order execution (`:2040-2150`, `:2226-2290`), `enforceExitRules` (`:93-440`), the protective-order helpers (`:461-621`), ghost-close (`:1196-1290`). Each remaining gap is classified as an error-handling catch or a decision branch.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Optional scripting in `world.ts`, defaults unchanged | One harness; goldens untouched | More options to maintain | Chosen |
| Hook in `mocks.ts` that overrides `toExitReason` for (am) | Reaches an otherwise unreachable branch | The scenario no longer runs the real mapper for that symbol | Chosen, if confirmed (Q-1) |
| Leave (am) as not covered | Keeps every mock real | The branch stays unpinned before a move that touches it | Fallback if Q-1 is declined |
| Pack (ah) into one cycle and one golden | Fewer goldens | Less isolated | Chosen (three independent symbols) |
| Separate golden per near-miss | Isolated | Already one per scenario in (ad) | Chosen |
| Change `claude-agent.ts` to ease a path | Easier | Forbidden | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/__tests__/claude-agent.characterization.test.ts` | MODIFY | New `describe` blocks with scenarios (aa) to (an) |
| `src/lib/__tests__/support/claude-agent/world.ts` | MODIFY | Optional scripting listed above; export `makeOrder` |
| `src/lib/__tests__/support/claude-agent/mocks.ts` | MODIFY | Peak-high hook and the `exit-cooldown` pass-through hook |
| `src/lib/__tests__/support/claude-agent/builders.ts` | MODIFY | Builders for the trend, ZLE05 and EMA-reclaim indicators, if needed |
| `src/lib/__tests__/__golden__/claude-agent/` | CREATE | 19 JSON goldens and 3 prompt snapshots |
| `specs/characterization-harness-0d-2/` | CREATE | requirements, design, tasks; `review.md` at the end |

Not touched: any file outside `src/lib/__tests__/**` and the spec folder; the 39 existing goldens; `specs/docs-5-selector-criteria/tasks.md`.

## Protected Zone Impact

None — this feature does not require Protected Zone changes. `claude-agent.ts` is only read.

## Database Changes

None.

## Risks

- A new option alters an existing record. Mitigation: defaults equal today's, SHA-256 comparison of all 39 goldens, existing 44 tests run first.
- Scenarios that need indicator combinations the builders do not give (trend, ZLE05, EMA reclaim, near-misses). Mitigation: new builders in the style of `mrIndicators`; each is checked against the setup conditions in the code.
- The classification priority (3DAY > MR > PULLBACK > ZLE05 > RECLAIM, `:1719-1729`) may capture a scenario. Mitigation: each indicator set is built so that only the intended setup fires.
- A scenario unreachable without changing `src/`. Mitigation: stop on it, explain, list it as not covered.
- The golden masks dates. Mitigation: raw assertions in the test body.

## Open Questions

- **Q-1 (scenario (am)):** every exit-reason string maps to a known `ExitReason`, so the `UNKNOWN` branch cannot happen through the real flow. Default: add a pass-through hook in `mocks.ts` that forces `UNKNOWN` for one symbol. Confirm, or mark (am) as not covered.
- **Q-2 (prompt snapshots):** the request says "prompt snapshot where the existing buy scenarios have one". Scenarios (a), (b) and (m) have one. Default: (aa), (ab) and (ac) get one each (3 `.prompt.txt` files). Confirm.
- **Q-3 (ad-1 expectation):** the MACD-floor near-miss ends in the generic "no setup" HOLD with no specific text, not in a dedicated HOLD. Default: pin that, plus the log line via spy. Confirm.
- **Q-4 (golden count):** 19 JSON goldens (aa, ab, ac, ad-1, ad-2, ad-3, ae, af-1, af-2, ag, ah, ai, aj, ak, al-1, al-2, am, an-1, an-2) plus 3 prompt snapshots. Confirm.
- **Q-5 (`mocks.ts` edit):** besides `world.ts`, `mocks.ts` is edited (two hooks, pass-through defaults). Confirm this is within "world.ts only with optional scripting".
