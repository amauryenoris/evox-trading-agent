# Design — Fix: IOC Order Fill Verification

## Architecture Decision

All changes live entirely inside `runAgentCycle()` in `src/lib/claude-agent.ts`. Two new small helper functions are added inside the same file (not exported to other modules), and the two existing post-order blocks (Path 1 at lines 1797-1818, Path 2 at lines 1960-1981) are restructured to gate all downstream actions on `filledQty > 0`.

No changes to `db.ts`, `alpaca.ts`, `learning.ts`, or any other module — the quantity flows through the existing `OpenPositionContext` object; only the value written into `ctx.quantity` changes (filled qty instead of requested qty).

## New Helper Functions (both private, inside claude-agent.ts)

### 1. String constants for greppable error labels

```ts
const IOC_NOT_FILLED   = 'IOC_NOT_FILLED'
const STOP_SUBMIT_FAILED = 'STOP_SUBMIT_FAILED'
```

Placed near the top of `runAgentCycle()`, before the per-symbol loop, alongside existing cycle-scoped constants.

### 2. `submitStopWithRetry(symbol, filledQty, stopPrice, retryDelayMs = 3000)`

A small private async helper that submits the GTC stop and retries once on failure:

```ts
async function submitStopWithRetry(
  symbol: string,
  filledQty: number,
  stopPrice: number,
  retryDelayMs = 3000
): Promise<{ stopOrderId: string | undefined; failureReason: string | undefined }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const stopOrder = await submitStopOrder(symbol, filledQty, stopPrice)
      return { stopOrderId: stopOrder.id, failureReason: undefined }
    } catch (err) {
      if (attempt === 0) {
        console.warn(`[STOP] First attempt failed for ${symbol} — retrying in ${retryDelayMs}ms:`, err)
        await new Promise(r => setTimeout(r, retryDelayMs))
      } else {
        const reason = (err as Error).message ?? String(err)
        console.error(`[STOP] Retry also failed for ${symbol} — position is NAKED:`, reason)
        return { stopOrderId: undefined, failureReason: reason }
      }
    }
  }
  return { stopOrderId: undefined, failureReason: 'unreachable' }
}
```

This helper is inside `claude-agent.ts` (module-scoped, not inside `runAgentCycle()`). It must be exported (or kept private and tested via a replicated inline copy in the test file) — see Testing section in tasks.md.

## Data Flow — Path 1 (immediate execution)

```
submitLimitOrder(symbol, qty, 'buy', limitPrice)  → order: AlpacaOrder
  │
  ├─ filledQty = parseInt(order.filled_qty, 10)
  │
  ├─ filledQty === 0?
  │     YES → log IOC_NOT_FILLED, set error, push decision with orderExecuted=false, continue
  │     NO  → proceed
  │
  ├─ [if filledQty < qty] log IOC_PARTIAL_FILL (informational only)
  │
  ├─ orderId = order.id
  ├─ orderExecuted = true
  ├─ decision.quantity = filledQty          ← was qty
  ├─ openPositionsCount++
  ├─ buysToday++
  │
  ├─ stopPrice = indicators.currentPrice × (1 - STOP_LOSS_PCT)   ← unchanged
  ├─ submitStopWithRetry(symbol, filledQty, stopPrice)             ← was submitStopOrder(symbol, qty, stopPrice)
  │     ├─ success → stopOrderId = result.stopOrderId
  │     └─ failure → error += STOP_SUBMIT_FAILED + reason
  │
  └─ saveOpenPositionContext({ ..., quantity: filledQty, stopOrderId })
       ← quantity was qty, now filledQty
```

Path 2 (ranking) follows the exact same logic, with `best.qty` as the requested qty and the same `filledQty`-derived quantity propagated through `best.decision.quantity`, `best.qty` for context save, and `submitStopWithRetry`.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Read `filled_qty` directly from `submitLimitOrder` response | No extra API call; IOC resolves synchronously; `AlpacaOrder.filled_qty` already typed | `filled_qty` is a string — must `parseInt`; team must know this is final | **Chosen** — confirmed by STEP 0 (Alpaca docs state IOC fills synchronously) |
| Re-fetch order via GET /v2/orders/{id} to confirm fill | More defensive | Adds latency (network round-trip after a time-sensitive execution); `filled_qty` on submit response is authoritative for IOC | Rejected |
| Extract entire Path-1 and Path-2 post-order blocks into a shared helper | Zero duplication | Refactor scope significantly broader than the fix; high risk of hidden side effects in the surrounding context variables | Rejected — targeted inline changes preferred per YAGNI |
| Reuse `callClaudeWithRetry` for stop retry | Single retry pattern | It gates on HTTP 429/529 status; stop failures may be 422/other; wrong abstraction level | Rejected |
| New module-level retry utility function | General-purpose | YAGNI; only one new use case today; `submitStopWithRetry` is specific enough | Simple private helper chosen instead |
| Persist partial-fill qty in `decision.quantity` but keep `openPositionsCount` as-is | Minimal change | `openPositionsCount` is already correct (real position opened, just partial) — no change needed there | Not applicable; decision.quantity is the only quantity field needing change |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Add `IOC_NOT_FILLED`/`STOP_SUBMIT_FAILED` constants; add `submitStopWithRetry()` helper; restructure Path 1 and Path 2 post-order blocks to gate on `filledQty > 0` and use `filledQty` throughout |
| `src/lib/__tests__/ioc-fill-verification.test.ts` | CREATE | Unit tests for `submitStopWithRetry` + integration-style tests (mocking `submitLimitOrder`, `submitStopOrder`, `saveOpenPositionContext`) for the fill-gating behavior in both paths |

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is in the Protected Zone.
The change is surgical — it restructures two existing ~20-line blocks and adds one ~15-line helper function. No gate condition, signal detection, sizing formula, or exit-rules logic is touched. Requires **Amaury confirmation before `/implement` runs**.

## Database Changes

None. `open_position_contexts.quantity` is an existing `integer` column; this fix changes the VALUE written there (filled qty vs. requested qty), not the schema.

## Open Questions

None — STEP 0 resolved all design unknowns:
- `filled_qty` is available on the submit response directly (no re-fetch needed)
- No generic retry helper exists (simple new private helper required)
- `qty` flows to `saveOpenPositionContext` via `ctx.quantity` (no db.ts change)
- No existing tests on this path (new test file required, will be first)
