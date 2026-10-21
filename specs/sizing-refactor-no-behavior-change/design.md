# Design — Sizing Refactor With No Behavior Change

## Architecture Decision

The arithmetic leaves `claude-agent.ts` and moves into a new pure module `src/lib/position-sizing.ts` with one function, `computeBuyQuantity(input) → { quantity, breakdown }`, plus the named constants and the `regimeMultiplier` helper. In `claude-agent.ts` the sizing block (`:2454-2473`) keeps its role as the single call site: it reads `RISK_PCT` and `STOP_LOSS_PCT` from the environment exactly as today, passes them with equity, buying power, price, Kalman signal, regime, confidence, z-score and signal type to the pure function, and uses the returned quantity for the existing `[BUY SIZING]` log, `requestedQty`, the immediate order and the ranking queue. `calculateBuyQuantity` and the inline confidence/override/EMA steps disappear from `claude-agent.ts`; the prompt keeps importing `regimeMultiplier` so its text cannot drift.

## Verified Current Structure (nothing assumed)

| Piece | Where | Note |
|-------|-------|------|
| `regimeMultiplier` | `claude-agent.ts:1039-1047` | **also used by the prompt text** (`:903`), so it moves to the module and is re-imported — fail-fast #2 is handled, not triggered |
| `calculateBuyQuantity` | `:1057-1087` | reads `RISK_PCT`/`STOP_LOSS_PCT` from `process.env`; returns the capped base quantity |
| Sizing block | `:2454-2473` | single call site; confidence `:2462-2463`, z override `:2464-2467`, EMA ×0.75 `:2468-2472`, `qty = finalShares` |
| Log | `:2477` | `[BUY SIZING]` prints `baseShares`, `confidence`, `multiplier`, **`adjustedShares`** (the value before the EMA factor), `zScore`, `price`, `regime` |
| Queue / ranking | `:2479-2483`, `:2634`, `:2681` | `buyQueueQty = qty` is stored and `best.qty` is executed later; **there is no second sizing call** — the ranking path reuses the queued quantity, which is what the brief asks to keep |
| Ranking sort | `:2664-2665` | uses its own `zScore <= -2.0` edge test; unrelated to the sizing switch |
| Prompt cap text | `:875, :929` | prints `MAX_POSITION_SIZE`; not used in sizing; out of scope |
| `zScore` at the site | `:1904` | `indicators.kalman?.zScore ?? 0` |

Fail-fast review: **#1 not triggered** by design (golden test proves identity before merging; a mismatch stops the work). **#2** — the only other consumer of sizing code is the prompt's `regimeMultiplier` call, handled by re-import. **#3** — the extraction touches only the sizing helpers and the single block, no other code.

## Pure Function Contract

Input: `{ equity, buyingPower, price, riskPct, stopLossPct, kalmanSignal, regime, confidence, zScore, signalType, zOverrideEnabled? }` (the switch defaults to the module constant; the explicit field exists so tests can run both settings without module mocking).

Steps, identical to today's order:
1. `riskPerShare = price × stopLossPct`; if `0` → base 0.
2. `qty = floor(equity × riskPct / riskPerShare)` → `floor(qty × regimeMultiplier)` → halve with `floor` when the Kalman signal is missing or `NEUTRAL`.
3. `baseShares = max(0, min(qty, min(floor(0.95 × buyingPower / price), floor(MAX_POSITION_EQUITY_FRACTION × equity / price))))`.
4. `confidenceFactor = max(0.50, min(confidence, 1.0))`; `adjusted = round(baseShares × confidenceFactor)`.
5. If `zOverrideEnabled` and `zScore <= -2.0`: `adjusted = baseShares` (`zOverrideApplied = true`).
6. `setupFactor = 0.75` for `EMA_RECLAIM`, else `1`; `final = signalType === 'EMA_RECLAIM' ? round(adjusted × 0.75) : adjusted`.

Degenerate inputs are **not** sanitized: a non-finite `confidence` or price propagates exactly as it does today (for example a NaN confidence yields NaN, which fails the existing `qty > 0` check and places no order). The refactor must not "fix" that.

## Data Flow

1. Call site reads env and gathers inputs → `computeBuyQuantity`.
2. Returns `{ quantity, breakdown }`; `quantity` feeds `qty`, `requestedQty`, `buyQueueQty` and the order exactly as before.
3. `breakdown` feeds only the `[BUY SIZING]` log (so the line stays byte-identical); it is not stored anywhere.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| New pure module with one function and the constants | Testable without mocks, no Protected Zone growth, switch in one place | Moves two helpers out of the Protected file | **Chosen** |
| Keep the functions in `claude-agent.ts`, only add constants | Smallest diff | Not directly testable (private), no breakdown | Rejected |
| Constants in `config.ts` | Central | Protected Zone, the brief prefers the new module | Rejected |
| Read env inside the pure function | Fewer parameters | Not pure; hidden input | Rejected (env stays at the call site) |
| Persist the breakdown now | Useful for later analysis | Explicitly forbidden | Rejected |

## Test Strategy

- **Golden values from the old code, recorded first (NFR-01).** Two sources, both committed as test data before any refactor edit: (1) the stored `requestedQty` of the 13 reconstructed entries (MP ×2, SOFI, FCX, UUUU, CRWV ×2, INTC ×2, NVDA, TSLA, EWZ, NKE) — these are the old code's real outputs — with their stored inputs (equity from the agent-log snapshot, price, regime, Kalman signal, z, confidence, setup); (2) a **frozen verbatim copy of the old functions** inside the test, used for a differential check over a grid of inputs (all regimes, Kalman present/NEUTRAL/missing, z around −2.0, confidence 0 to 1 and edge values, EMA_RECLAIM or not, small and large equity and price, cap-binding and buying-power-binding cases).
- Buying power is not stored in the log; for the 13 trades it is set high enough not to bind (the STEP 0 reconstruction matched without it); the buying-power cap has its own synthetic cases.
- Switch **true**: all golden and grid cases identical. Switch **false**: z ≤ −2 with confidence 0.38 gives `round(cappedBase × 0.5)`; every other branch unchanged.
- Individual rules: regime multipliers, NEUTRAL halving, buying-power cap, EMA factor, the 0.5 minimum on confidence, the cap and zero risk per share.
- Ranking: the queued quantity is the one executed (a small test on the queue consumer is not possible without running the whole cycle; the code path is unchanged and is checked in review against the diff).
- Prompt: `regimeMultiplier` outputs unchanged for each regime and for null.

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| src/lib/position-sizing.ts | CREATE | `MAX_POSITION_EQUITY_FRACTION`, `Z_SIZING_OVERRIDE_ENABLED`, `regimeMultiplier`, `computeBuyQuantity`, breakdown type |
| src/lib/claude-agent.ts ⚠️ | MODIFY (Protected) | Remove `calculateBuyQuantity` and the inline sizing steps, import the module, keep env reading, log and queue handling |
| src/lib/__tests__/position-sizing.test.ts | CREATE | Golden and differential tests, switch true/false, rule tests |
| src/lib/__tests__/position-sizing-golden.json (or similar) | CREATE | Committed golden inputs and outputs |

## Protected Zone Impact

- ⚠️ `src/lib/claude-agent.ts` — sizing code only. Requires Amaury confirmation before implementation.
- `config.ts`: not touched. All other Protected Zone files: not touched.

## Database Changes

None.

## Open Questions

- **O-1 (golden values):** the brief asks for golden values "computed from the old code before the refactor". The sizing functions are private, so the plan above uses (1) the production `requestedQty` values and (2) a frozen verbatim copy of the old functions for a differential grid. Alternatively, before the refactor, the old code could be exercised directly by temporarily exporting it. Recommended: the two-source plan (no temporary edit of the Protected file). Confirm.
- **O-2 (breakdown fields):** the brief's field list does not contain `adjustedShares` (the value before the EMA factor), which the existing `[BUY SIZING]` log prints. To keep the log line unchanged, add `adjustedShares` to the breakdown (additive, not persisted). Recommended: yes.
- **O-3 (other literals):** name the remaining sizing literals inside the new module with the same values (`0.95` buying-power fraction, `-2.0` z threshold, `0.50` confidence floor, `0.75` EMA factor, the regime table) — module-internal, not exported. Recommended: yes; none of them changes a value.
- **O-4 ("ranking path calls it"):** there is one sizing call site; the ranking path reuses the queued quantity. Confirm this satisfies the brief (it does not add a second call).
- **O-5 (degenerate inputs):** confirm that non-finite inputs must keep propagating exactly as today (no new guards).
