# Design — Fix: IOC Final-State Re-Fetch

## Architecture Decision

The change is confined to two layers: the Alpaca API client (`alpaca.ts` — new
`getOrder` helper) and the `runAgentCycle()` function in `claude-agent.ts`
(new `resolveIocFinalState` helper + two call-site substitutions). All
downstream IOC handling logic (zero-fill guard, partial-fill, stop submission,
context save, counters, agent_log entry) is untouched — only the `AlpacaOrder`
object fed into that logic is replaced with the resolved final state.

`resolveIocFinalState` is exported from `claude-agent.ts` (not `alpaca.ts`)
for the same reason `submitStopWithRetry` lives there: it contains business-
layer delay/retry logic that belongs above the raw API client.

---

## Step 0 Verification (read-only, completed before spec was written)

**1. `getOrder(orderId)` helper**
Does NOT exist in `alpaca.ts`. Present: `getOrders(status, limit)` (list,
`GET /v2/orders`). Missing: single-order fetch (`GET /v2/orders/{id}`). Must
be created.

**2. Current buy-path line numbers (post-6c83395)**

*Path 1 — immediate buy:*
```
1833  const order = await submitLimitOrder(symbol, qty, 'buy', limitPrice)
1834  const filledQty = parseInt(order.filled_qty, 10)
1835  console.log(`[ORDER] ${symbol} limit IOC BUY ... status: ${order.status} ...`)
1836
1837  if (filledQty === 0) {                            ← zero-fill guard
```
`order.status` is already logged but not used for flow control.

*Path 2 — ranking buy:*
```
2002  const order = await submitLimitOrder(best.symbol, best.qty, 'buy', rankingQuote.ask)
2003  const filledQty = parseInt(order.filled_qty, 10)
2004  console.log(`[ORDER] ${best.symbol} limit IOC BUY ... status: ${order.status} ...`)
2005
2006  if (filledQty === 0) {                            ← zero-fill guard
```

**3. Sleep / delay helper**
No exported helper. Existing pattern (inside `submitStopWithRetry`):
```ts
await new Promise(r => setTimeout(r, retryDelayMs))
```
Same pattern will be used inline inside `resolveIocFinalState`.

---

## Data Flow

**Current (sync-only):**
```
submitLimitOrder(symbol, qty, 'buy', limitPrice)
  → AlpacaOrder { filled_qty: "0", status: "???" }
  → filledQty = parseInt("0") = 0
  → zero-fill guard fires → IOC_NOT_FILLED
  [paper engine may fill the order asynchronously — ORPHAN]
```

**New (re-fetch on non-final sync response):**
```
submitLimitOrder(symbol, qty, 'buy', limitPrice)
  → syncOrder { filled_qty: "0", status: "new" | "canceled" | ... }
  ↓
resolveIocFinalState(syncOrder, 2000)
  ├─ IF syncOrder.status === 'filled' && parseInt(filled_qty) > 0
  │    → return syncOrder immediately  [fast path — no delay, no re-fetch]
  └─ ELSE
       → await 2000ms
       → getOrder(syncOrder.id)
       → resolvedOrder { filled_qty: "82", status: "filled" }  ← late fill case
         └─ parseInt(syncOrder.filled_qty) !== parseInt(resolvedOrder.filled_qty)
              → console.log('[ORDER] SYMBOL IOC_LATE_FILL: sync=0 final=82')
       → return resolvedOrder
  ↓
filledQty = parseInt(resolvedOrder.filled_qty)
  → [unchanged zero-fill / partial-fill / stop / context / counter logic]
```

**Re-fetch scenarios:**

| Sync status | Sync filled_qty | Re-fetch status | Re-fetch filled_qty | Outcome |
|---|---|---|---|---|
| `"filled"` | `"82"` | — (fast path) | — | proceed with 82 shares |
| `"new"` | `"0"` | `"filled"` | `"82"` | **IOC_LATE_FILL** → 82 shares |
| `"new"` | `"0"` | `"canceled"` | `"0"` | IOC_NOT_FILLED path (no change) |
| `"canceled"` | `"0"` | `"canceled"` | `"0"` | IOC_NOT_FILLED path (no change) |
| `"partially_filled"` | `"40"` | `"filled"` | `"82"` | partial→full, use 82 |
| `"new"` | `"0"` | `"new"` | `"0"` | IOC_STATE_UNRESOLVED log, use 0 → IOC_NOT_FILLED |

---

## resolveIocFinalState — pseudocode

```ts
export const IOC_LATE_FILL = 'IOC_LATE_FILL'

export async function resolveIocFinalState(
  syncOrder: AlpacaOrder,
  delayMs = 2000
): Promise<AlpacaOrder> {
  const syncFilled = parseInt(syncOrder.filled_qty, 10)
  if (syncOrder.status === 'filled' && syncFilled > 0) {
    return syncOrder  // definitively final — no re-fetch
  }

  await new Promise(r => setTimeout(r, delayMs))
  const resolved = await getOrder(syncOrder.id)
  const resolvedFilled = parseInt(resolved.filled_qty, 10)

  if (syncFilled === 0 && resolvedFilled > 0) {
    console.log(
      `[ORDER] ${resolved.symbol} ${IOC_LATE_FILL}: sync=0 final=${resolvedFilled}`
    )
  }

  if (resolved.status !== 'filled' && resolved.status !== 'canceled') {
    console.log(
      `[ORDER] ${resolved.symbol} IOC_STATE_UNRESOLVED: status=${resolved.status} filled=${resolvedFilled} after re-fetch`
    )
  }

  return resolved
}
```

## Call-site changes (both paths)

Before (Path 1, line 1833):
```ts
const order = await submitLimitOrder(symbol, qty, 'buy', limitPrice)
const filledQty = parseInt(order.filled_qty, 10)
```

After:
```ts
const syncOrder = await submitLimitOrder(symbol, qty, 'buy', limitPrice)
const order = await resolveIocFinalState(syncOrder)
const filledQty = parseInt(order.filled_qty, 10)
```

The existing console.log at line 1835 that already logs `order.status` will
now log the resolved status — no change needed to that line.

Identical substitution in Path 2 (lines 2002-2003). Variable names `syncOrder`
and `order` keep the diff minimal — all downstream references to `order.id`,
`order.filled_qty`, etc. automatically reference the resolved order.

---

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Re-fetch once after fixed delay (this design) | Simple, minimal added latency (~2s), sufficient for paper fill window | Does not catch fills that materialize >2s after submission (addressed by IOC_STATE_UNRESOLVED log) | **Chosen** |
| Poll with timeout (every 500ms, up to 3s) | Higher chance of catching fills | Adds up to 3s block; complexity; re-fetch count not bounded by simple logic | Rejected |
| Check `order.status !== 'canceled'` only (no delay) | No latency added | Status may be "new" at sync response time — would always trigger a re-fetch even when unnecessary | Rejected |
| Separate background job monitors positions and reconstructs orphans | Non-blocking, catches ALL orphans including old ones | Requires new DB table, scheduler, significant scope expansion | Rejected (out of scope for this fix) |

---

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/alpaca.ts` | MODIFY | Add `getOrder(orderId: string): Promise<AlpacaOrder>` export — one new function, 3 lines |
| `src/lib/claude-agent.ts` | MODIFY | Add `IOC_LATE_FILL` constant export + `resolveIocFinalState` function export; substitute call sites at lines 1833 and 2002 |
| `src/lib/__tests__/ioc-fill-verification.test.ts` | MODIFY | Add test suite for `resolveIocFinalState` (4 new tests covering FR-03, FR-04/FR-07, FR-04/no-late-fill, FR-08) |

---

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is in the Protected Zone.

Authorization source: parent spec `fix-ioc-fill-verification`, approved by
Amaury this session. This spec is a direct follow-up fix within the same
domain (IOC fill handling in `runAgentCycle`). **Authorization must be
explicitly reconfirmed by Amaury before `/implement`.**

`src/lib/alpaca.ts` is NOT in the Protected Zone.

---

## Database Changes

None.

---

## Open Questions

None — design is fully specified. Authorization reconfirmation (C-01) is a
pre-implementation gate, not an open design question.
