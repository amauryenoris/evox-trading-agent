# Design — Outlier Guard on the 1-Minute High + Split `applyProfitFloor`

## Architecture Decision

The guard lives entirely inside `peak-high.ts`, behind the existing `getPeakHighSinceLastCheck` function: bar filtering (zero volume, close×1.01 cap) happens in `maxRegularSessionHigh`, and the per-check jump cap is applied to its result inside `getPeakHighSinceLastCheck`, which gains an optional fourth argument `{ storedHigh, entry }`. `claude-agent.ts` keeps importing only that one function (the exit-rules test mocks the module with a single-function factory, so a new export would break existing tests) and only changes the call site to pass the two values it already has. The `sell_now` branch of `applyProfitFloor` moves to a small helper; no logic changes. Both constants live in `peak-high.ts`.

## Data Flow

1. `enforceExitRules` (MR only) calls `getPeakHighSinceLastCheck(symbol, buyTimestamp, now, { storedHigh: ctx.highSinceEntry ?? currentPrice, entry })`.
2. One `1Min` SIP bars request (unchanged).
3. `maxRegularSessionHigh`: drop non-regular-session bars, drop bars with zero / non-finite volume or non-finite high/close, cap each remaining high at `close × 1.01`, take the maximum.
4. Jump guard: if `candidate > storedHigh + 0.10 × entry`, warn and return `storedHigh + 0.10 × entry`.
5. Caller: `highSinceEntry = max(stored, peak)`, then `max(…, currentPrice)` exactly as today.
6. Failure at step 2 → `null` → unchanged fallback.

## DECISION (O-1 = B, reject; O-2/O-3/O-4 = recommended defaults, confirmed by Amaury)

Bars above `storedHigh + 10 pp × entry` are dropped individually; the maximum of the remaining valid bars is still used. The sections below record why the literal cap was not used.

## Known Design Flaw in the Brief's Rule (c) — needs a decision (O-1)

The bars request looks back up to 18 h, so the same bad bar is re-read at every check until it ages out. With rule (c) as written, each check compares the bar against the **already-raised** stored high, so a bad print is capped at `stored + 10 pp` again and again:

| Check | Stored high | Bad print (+30 pp over entry) | Result |
|-------|-------------|-------------------------------|--------|
| 1 | +6 pp | +30 pp | capped → +16 pp |
| 2 (1 h later) | +16 pp | same bar still in window | capped → +26 pp |
| 3 | +26 pp | same bar | +30 pp (reaches the bad print) |

So the guard only delays the floor reaching the bad print by a couple of hourly checks; MEDIUM-1 is not fixed. The brief's test list ("sequences across several checks") will show this. Options:

| Option | Behavior | Pros | Cons | Decision |
|--------|----------|------|------|----------|
| A. As written (cap, per check) | +10 pp per check | Matches the brief literally | Bad print still reaches the floor in ~3 checks | Not recommended |
| B. Reject instead of cap | Candidate above `stored + 10 pp` is ignored for that check (warn), stored high unchanged | A repeated bad bar never moves the high; real moves are still caught by the current-price sample, which is outside the guard | Loses the intrabar excursion of a genuine >10 pp spike until price confirms it | **Recommended** |
| C. Cap, but shorten the lookback to the check cadence (~70 min intraday, 18 h only for the first check of the day) | Same bar is read once or twice | Keeps the cap semantics | Cadence assumption (manual runs, missed crons) can open gaps; larger change to FR-56 of the earlier spec | Alternative |
| D. Cap relative to a base that also includes the current price | Does not stop the repeat ratchet | — | Same flaw | Rejected |

Until O-1 is answered, implementation of FR-08, FR-17 and the "sequences across several checks" test is blocked. All other requirements can proceed.

Other effects Amaury should know:
- Rule (b) also trims **real** intrabar highs more than 1% above the bar's close (a spike that reverses within the minute). The floor is then slightly lower than the true high, which is the safer direction.
- Rule (a) drops zero-volume bars, which should not exist in SIP minute bars; it is a defensive check.
- When `ctx.highSinceEntry` is null the stored base is the current price, so a position without history is capped at current + 10 pp.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Guard inside `getPeakHighSinceLastCheck` with an optional 4th argument | Existing call sites and the test mock keep working; no new export | Function takes a small options object | **Chosen** |
| New exported `capPeakHigh` called from `claude-agent.ts` | Cleaner separation | The existing exit-rules test mocks `../peak-high` with one function; a second import would be `undefined` and break tests that must pass unchanged | Rejected |
| Constants in `config.ts` | Central | Protected Zone, forbidden here | Rejected |
| Extract only the `sell_now` branch | Smallest change that gets under 50 lines | — | **Chosen** |
| Split `applyProfitFloor` into several helpers | Shorter still | More churn than the review item asks for | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| src/lib/peak-high.ts | MODIFY | `PEAK_CLOSE_CAP_RATIO`, `PEAK_MAX_JUMP_PP`; bar filter and cap in `maxRegularSessionHigh`; jump guard + warn in `getPeakHighSinceLastCheck` (optional 4th arg) |
| src/lib/claude-agent.ts ⚠️ | MODIFY (Protected) | Pass `{ storedHigh, entry }` at the one call site; extract the `sell_now` branch of `applyProfitFloor` into a helper |
| src/lib/__tests__/peak-high.test.ts | MODIFY | Add guard tests; existing cases stay valid (fixture bars have close = high and volume 1000) |
| src/lib/__tests__/mr-profit-floor-exit-rules.test.ts | UNCHANGED | Must pass as is |

## Protected Zone Impact

- ⚠️ `src/lib/claude-agent.ts` — a one-line call-site change and a behavior-preserving extraction of the `sell_now` branch. Requires Amaury confirmation before implementation.
- `src/lib/peak-high.ts` is not on the CLAUDE.md list; it is named in the brief.
- Not touched: `config.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`, `db.ts`, `types.ts`.

## Database Changes

None.

## Open Questions

- **O-1 (BLOCKER for FR-08 / FR-17):** how to handle a bad bar that stays in the 18 h window — Option A (as written, known to ratchet +10 pp per check), B (reject; recommended) or C (shorten the window)? If B, FR-08 and FR-09 change to "ignore the candidate for this check and warn".
- **O-2:** the jump limit uses `entry` from `avg_entry_price` (fallback `buyPrice`), consistent with the earlier O-3 answer. Confirm.
- **O-3:** when no high is stored, the stored base is the current price. Confirm.
- **O-4:** the warning is emitted on every check while the bad bar is in the window (repeated warns, up to ~one per hour). Acceptable, or log once per symbol per day?
