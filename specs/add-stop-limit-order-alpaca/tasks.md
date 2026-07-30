# Tasks — Add submitStopLimitOrder() and cancelOrder() to alpaca.ts

## Pre-Implementation

- [ x] Amaury has reviewed and approved this spec
- [ x] Open Question acknowledged (design.md): `cancelOrder()`'s empty-body-response risk is accepted as a known, currently-inert issue (no call site in this spec) to be verified before CHANGE 3 actually calls it — not a blocker for this isolated addition, since both resolution paths in design.md produce the same code here.

## Implementation Checklist

### Phase 1 — `submitStopLimitOrder()`

- [x] T-01: In `src/lib/alpaca.ts`, immediately after `submitStopOrder()` (currently ending at line 253), add:
  ```ts
  export async function submitStopLimitOrder(
    symbol: string,
    qty: number,
    stopPrice: number,
    limitPrice: number
  ): Promise<AlpacaOrder> {
    return alpacaFetch<AlpacaOrder>(`${baseUrl()}/v2/orders`, {
      method: 'POST',
      body: JSON.stringify({
        symbol,
        qty: String(qty),
        side: 'sell',
        type: 'stop_limit',
        time_in_force: 'gtc',
        stop_price: stopPrice.toFixed(2),
        limit_price: limitPrice.toFixed(2),
      }),
    })
  }
  ```

### Phase 2 — `cancelOrder()`

- [x] T-02: In `src/lib/alpaca.ts`, immediately after `closePosition()` (currently ending at line 169), add:
  ```ts
  export async function cancelOrder(orderId: string): Promise<void> {
    await alpacaFetch<void>(`${baseUrl()}/v2/orders/${orderId}`, {
      method: 'DELETE',
    })
  }
  ```

### Phase 3 — Verification

- [x] T-03: Confirm `submitStopOrder()`, `submitStopWithRetry()` (in `claude-agent.ts`, untouched), `closePosition()`, and `getOrder()` are byte-for-byte unchanged. Confirmed via diff — only the two new blocks appear.
- [x] T-04: Confirm neither `submitStopLimitOrder()` nor `cancelOrder()` is called anywhere in the diff — both should be unused, by design. Confirmed — diff shows only the function definitions, no call sites.
- [x] T-05: Confirm `AlpacaOrder` in `types.ts` is unchanged (confirmed unnecessary in requirements.md STEP 0). Confirmed — `git diff` for `types.ts` produced no output.
- [x] T-06: Run `npx tsc --noEmit` — zero errors.
- [x] T-07: Run `npm run build` — zero errors. Confirmed: no unused-export lint/build warning appeared — assumption held.
- [x] T-08: Run the full existing test suite — report file/test counts. Confirmed: 29 files, 297 tests, all passed.
- [x] T-09: Report the final line count of `alpaca.ts` (was 373 before this change). Now 399 lines (+26).
- [x] T-10: Confirm via diff that only `alpaca.ts` changed, and that the change is exactly two additive function blocks with no reformatting elsewhere in the file. Confirmed via `git status --porcelain`: only `alpaca.ts` modified in tracked source; diff shows two clean additive hunks only.

## Post-Implementation

- [x] Run `/review add-stop-limit-order-alpaca` to verify implementation matches spec
- [x] Confirm Protected Zone unaffected (alpaca.ts isn't in it; no other Protected Zone file touched) — confirmed via T-03/T-05/T-10
- [x] Carry forward the empty-body-response verification for `cancelOrder()` as an explicit prerequisite note for CHANGE 3, so it isn't silently forgotten between specs — noted here and in design.md; CHANGE 3 must verify Alpaca's actual `DELETE /v2/orders/{order_id}` response behavior (via a paper-account test call or Alpaca's docs) before wiring in a real call to `cancelOrder()`

## Estimated Complexity

**Low** — Two small, additive, unused functions mirroring existing patterns exactly. The only nuance is the documented-but-inert `cancelOrder()` response-body risk, which doesn't block this spec but must travel forward to CHANGE 3.
