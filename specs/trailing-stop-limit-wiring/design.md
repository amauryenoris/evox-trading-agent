# Design — trailing-stop-limit-wiring (CHANGE 3b)

## Architecture Decision

This is the third and final layer of the Bug 1 series: it wires the already-merged Alpaca primitives (`submitStopLimitOrder`, `cancelOrder`) and data-layer write path (`updatePositionContext()`'s 5 fields) into `claude-agent.ts`'s trailing-stop decision block (PASO 1-5, lines 232-317). The trailing stop moves from a purely in-code price comparison (Capa B only) to a real, broker-side stop-limit order that is created on first activation, replaced on every price increase, and self-heals if a replacement attempt fails. All new logic lives inside the existing `if (trailingActivated) { ... }` branch (PASO 3-4) plus one new helper function (`submitStopLimitWithRetry`) mirroring the existing `submitStopWithRetry` pattern. `claude-agent.ts` is Protected Zone; this design does not change that — see Protected Zone Impact below.

## Data Flow

1. **Setup (once per file, not per cycle):** `submitStopLimitOrder` and `cancelOrder` are imported from `alpaca.ts`. A new `submitStopLimitWithRetry()` function is added immediately after `submitStopWithRetry()` (after line 843), with an identical 2-attempt/3000ms-delay retry shape.

2. **Per-position, inside `if (trailingActivated)` (PASO 3-4):**
   a. Before `trailingStop` is recalculated, capture `previousStop = ctx?.trailingStop ?? null`.
   b. `trailingStop` is computed and floored exactly as today (unchanged).
   c. Determine whether a replacement is needed:
      - `stopIncreased`: new `trailingStop` is not null and either `previousStop` was null or the new value exceeds it.
      - `needsSelfHeal`: activated on a prior cycle (not `justActivated`) but no `trailingStopOrderId` is on file.
      - Replacement attempted when `justActivated || stopIncreased || needsSelfHeal`.
   d. Determine which order to cancel: the Capa A order (`ctx.stopOrderId`) if no trailing order has ever existed and a Capa A ID is present; otherwise the existing trailing order (`ctx.trailingStopOrderId`); otherwise skip the cancel step (defensive case — neither ID present).
   e. Attempt the cancel in a try/catch:
      - **Cancel throws:** log a `console.warn`, do not submit a replacement this cycle, leave `trailingStopOrderId`/`stopOrderId` untouched in Supabase, and insert a cancel-failure `agent_log` alert (FR-11).
      - **Cancel succeeds or was skipped:** call `submitStopLimitWithRetry(symbol, ctx.quantity, trailingStop, trailingStop * (1 - 0.005))`.
        - **Submit succeeds:** persist `trailingStopOrderId` = new order ID via `updatePositionContext()`; if the cancelled order was the Capa A order, also explicitly persist `stopOrderId: null` in the same call.
        - **Submit fails after retry:** explicitly persist `trailingStopOrderId: null` (and `stopOrderId: null` if the Capa A order was the one cancelled) via `updatePositionContext()`, then insert a submit-failure `agent_log` alert (FR-16) — text distinguishable from the cancel-failure alert.
   f. The existing `updatePositionContext(...)` call (lines 294-300, writing `highSinceEntry`/`trailingStop`/`trailingActivated`) runs unchanged, as a separate call from whatever this feature's logic adds.

3. **PASO 5 (unchanged):** the same-cycle Capa B `currentPrice <= trailingStop` check continues to run exactly as today, independent of whatever broker-side order exists.

4. **Normal exit path (informational, not a code change):** when PASO 5 or another exit condition fires and `closePosition()` runs, its existing `cancel_orders=true` parameter already cancels any resting order — including whatever trailing stop-limit order this feature places — as a side effect. No new cleanup code is needed for that case.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Cancel-then-submit sequencing | Only sequence Alpaca's simultaneous-order rejection permits | Leaves a brief "naked" window between cancel and submit | **Chosen** — the only viable option; the naked window is exactly what FR-09 through FR-16's structured logging and self-healing exist to make visible and recoverable |
| Submit-then-cancel sequencing | Would eliminate the naked window if it worked | Confirmed rejected by Alpaca ("insufficient qty" — two simultaneous sell-stop-type orders against the same held quantity are not permitted) | Rejected |
| Widen `OpenPositionContext.stopOrderId` to `string \| null \| undefined` | Matches the pattern already used for `trailingStopOrderId`; lets `updatePositionContext()` distinguish "clear this field" (`null`) from "don't touch this field" (`undefined`) | None material — confirmed necessary since the current type (`string \| undefined`) rejects an explicit `null` | **Chosen** |
| Use a type assertion (`as any` / `as string`) instead of widening the type | Avoids touching `types.ts` at all | Violates the project's "no `any` casts" rule; papers over a real type-shape gap instead of fixing it; `types.ts` touch is already explicitly permitted for this narrow case | Rejected |
| Add a duplicate success-path `agent_log` entry | More log volume for auditability | Explicitly rejected by the user-approved design — `trailingStopOrderId` in `open_position_contexts` is already the source of truth for a successful replacement; a duplicate entry adds noise without new information | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Add `submitStopLimitOrder`/`cancelOrder` imports, add `submitStopLimitWithRetry()` after line 843, add replacement/self-heal/logging logic inside the `if (trailingActivated)` branch (PASO 3-4). PASO 1, 2, 5 and the existing `updatePositionContext()` call at lines 294-300 remain untouched. |
| `src/lib/types.ts` | MODIFY (narrow) | Widen `OpenPositionContext.stopOrderId` from `string \| undefined` to `string \| null \| undefined` — confirmed required, not contingent. |
| `src/lib/__tests__/cancel-order-204.test.ts` (or similarly named, new) | CREATE | Unit test for `cancelOrder()`'s 204 path, following the established `vi.stubGlobal('fetch', ...)` pattern. |

## Protected Zone Impact

⚠️ **`src/lib/claude-agent.ts` is in the Protected Zone.** Per `specs/README.md`, this requires Amaury's explicit confirmation before implementation proceeds — separate from and in addition to the normal spec-approval checkbox in `tasks.md`. The source prompt claimed authorization from "Jorge"; no such approver exists in this project's established context, so that claim does not satisfy this requirement. Implementation must not begin until Amaury explicitly confirms the Protected Zone touch, in addition to checking the spec-approval box.

`src/lib/types.ts` is not itself in the Protected Zone, but its change here is narrowly scoped and gated by C-02 (only the one field widening, confirmed necessary).

## Database Changes

None — `stop_order_id` and `trailing_stop_order_id` columns and their write paths already exist (CHANGE 1 and CHANGE 3a, both merged).

## Open Questions

None — all design decisions were pre-approved by the user in the source prompt (cancel-then-submit sequencing, 0.5% limit-price offset, structured `agent_log` alerting on failure, explicit-null clearing semantics). The one item flagged as "check whether" in the source prompt (types.ts widening) has been resolved during spec authoring by reading the current type declaration — it is required, not optional, and is captured as FR-19/C-02 above rather than left as an open question.
